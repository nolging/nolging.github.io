-- =============================================================
--  랜덤 퀘스트 v2: 5칸 + 칸별 30분 쿨다운 + 관리자 CRUD(quest_defs)
--  · quests.sql(데일리/판정 함수) 적용 후 실행.
--  · 완료 판정은 여전히 _quest_done(id, since) 의 CASE 로 처리(신규 퀘스트는 코드 추가 필요).
-- =============================================================

-- 1) 랜덤 퀘스트 정의(관리자 CRUD). id = 완료 판정 키(_quest_done 의 case 키).
create table if not exists public.quest_defs (
  id          text primary key,
  title       text not null,
  body        text not null default '',
  emoji       text not null default '✨',    -- 마이 페이지 랜덤 퀘스트 카드 아이콘
  reward      int  not null default 1 check (reward >= 0),
  grade       text not null default 'all',   -- all | premium | vvip | vip
  active      boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
-- 기존 배포에 emoji 컬럼 추가(이미 있으면 무시)
alter table public.quest_defs add column if not exists emoji text not null default '✨';
alter table public.quest_defs enable row level security;
drop policy if exists quest_defs_select on public.quest_defs;
create policy quest_defs_select on public.quest_defs for select to authenticated using (true);
drop policy if exists quest_defs_write on public.quest_defs;
create policy quest_defs_write on public.quest_defs for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- 기존 7종 시드
insert into public.quest_defs (id, title, body, emoji, reward, grade, active, sort_order) values
  ('r_wish','위시 작성하기','아무 그룹에나 위시를 하나 작성해요.','⭐',2,'all',true,1),
  ('r_item_note','아이템 넣어 쪽지 보내기','선물 상자·카세트·비디오 등 아이템을 담아 쪽지를 보내요.','💌',3,'all',true,2),
  ('r_nyangpito','냥피또 긁기','냥피또를 한 번 긁어요.','🐾',2,'all',true,3),
  ('r_buy','상점에서 아이템 구매하기','상점에서 아이템을 하나 구매해요.','🛍️',2,'all',true,4),
  ('r_spend10','10츄르 이상 사용하기','10츄르 이상을 사용해요.','🪙',3,'all',true,5),
  ('r_game_win','게임에서 승리하기','미니 게임에서 승리해요.','🎮',3,'premium',true,6),
  ('r_poke','콕 찌르기','상대를 콕 찔러요.','👉',1,'premium',true,7)
on conflict (id) do nothing;

-- 2) 5칸 슬롯(단일 랜덤 퀘스트 폐기)
drop function if exists public.reroll_random_quest();
drop table if exists public.quest_random;
create table if not exists public.quest_slots (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  slot         int not null check (slot between 1 and 5),
  quest_key    text not null,
  assigned_at  timestamptz not null default now(),   -- 노출 시각(완료 판정 기준)
  available_at timestamptz not null default now(),   -- 이 시각부터 노출(쿨다운 종료)
  primary key (user_id, slot)
);
alter table public.quest_slots enable row level security;
drop policy if exists qs_self on public.quest_slots;
create policy qs_self on public.quest_slots for select to authenticated using (user_id = auth.uid());

-- 사용자 등급
create or replace function public._quest_user_grade()
returns text language sql security definer set search_path = public as $$
  select case
    when exists(select 1 from public.user_items where user_id=auth.uid() and item_id='couple-ring' and status='used') then 'vvip'
    when exists(select 1 from public.user_items where user_id=auth.uid() and item_id='friend-ring' and status='used') then 'vip'
    else 'normal' end;
$$;

-- 등급 노출 판정
create or replace function public._quest_grade_ok(p_qgrade text, p_ugrade text)
returns boolean language sql immutable as $$
  select case p_qgrade
    when 'all' then true
    when 'premium' then p_ugrade in ('vvip','vip')
    when 'vvip' then p_ugrade = 'vvip'
    when 'vip' then p_ugrade = 'vip'
    else false end;
$$;

-- 활성 + 등급 충족 퀘스트 중 p_exclude 제외하고 랜덤 하나(없으면 제외 무시)
create or replace function public._quest_pick(p_exclude text[])
returns text language plpgsql security definer set search_path = public as $$
declare v_g text := public._quest_user_grade(); v_key text;
begin
  select d.id into v_key from public.quest_defs d
  where d.active and public._quest_grade_ok(d.grade, v_g)
    and not (d.id = any(coalesce(p_exclude, array[]::text[])))
  order by random() limit 1;
  if v_key is null then
    select d.id into v_key from public.quest_defs d
    where d.active and public._quest_grade_ok(d.grade, v_g)
    order by random() limit 1;
  end if;
  return v_key;
end $$;

-- 마이 페이지 퀘스트 상태(+잔액/등급). 슬롯 5칸 보장 + 무효 슬롯 교체.
create or replace function public.get_quests()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'Asia/Seoul')::date;
  v_day_start timestamptz := (v_day::timestamp at time zone 'Asia/Seoul');
  v_bal int; v_grade text; v_daily jsonb; v_slots jsonb; i int;
begin
  select coalesce(sum(delta),0) into v_bal from public.coin_ledger where user_id = v_uid;
  v_grade := public._quest_user_grade();

  select jsonb_agg(jsonb_build_object('key',d.key,'label',d.label,'reward',d.reward,
      'done', public._quest_done(d.key, v_day_start),
      'claimed', exists(select 1 from public.quest_daily_claims c where c.user_id=v_uid and c.quest_key=d.key and c.day=v_day)) order by d.ord)
    into v_daily
  from (values ('attend','출석하기',1,1),('visit','그룹 방문하기',1,2),('note','쪽지 보내기',3,3)) as d(key,label,reward,ord);

  -- 슬롯 보장 + 노출 상태 슬롯의 무효 퀘스트(비활성/삭제/등급불일치) 교체
  for i in 1..5 loop
    if not exists (select 1 from public.quest_slots where user_id=v_uid and slot=i) then
      insert into public.quest_slots(user_id, slot, quest_key, assigned_at, available_at)
        values (v_uid, i, public._quest_pick(array(select quest_key from public.quest_slots where user_id=v_uid)), now(), now())
        on conflict do nothing;
    else
      update public.quest_slots s set
        quest_key = public._quest_pick(array(select quest_key from public.quest_slots where user_id=v_uid and slot<>i)),
        assigned_at = now(), available_at = now()
      where s.user_id=v_uid and s.slot=i and s.available_at <= now()
        and not exists (select 1 from public.quest_defs d
                        where d.id=s.quest_key and d.active and public._quest_grade_ok(d.grade, v_grade));
    end if;
  end loop;

  -- 쿨다운 중에도 '다음 퀘스트' 내용은 노출(진행은 available_at 이후 가능)
  select jsonb_agg(jsonb_build_object(
      'slot', s.slot,
      'cooldown_until', case when s.available_at > now() then s.available_at else null end,
      'assigned_at', s.assigned_at,
      'key',    s.quest_key,
      'title',  dq.title,
      'body',   dq.body,
      'emoji',  dq.emoji,
      'reward', dq.reward,
      'done',   case when s.available_at <= now() then public._quest_done(s.quest_key, s.assigned_at) else false end
    ) order by s.slot)
    into v_slots
  from public.quest_slots s left join public.quest_defs dq on dq.id = s.quest_key
  where s.user_id = v_uid;

  return jsonb_build_object('balance',v_bal,'grade',v_grade,'daily',coalesce(v_daily,'[]'::jsonb),'slots',coalesce(v_slots,'[]'::jsonb));
end $$;
grant execute on function public.get_quests() to authenticated;

-- 데일리 전용으로 축소(랜덤은 claim_slot_quest 사용). quest_random 참조 제거.
create or replace function public.claim_quest(p_key text)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'Asia/Seoul')::date;
  v_day_start timestamptz := (v_day::timestamp at time zone 'Asia/Seoul');
  v_reward int;
begin
  if p_key not in ('attend','visit','note') then raise exception '알 수 없는 퀘스트예요.'; end if;
  if exists(select 1 from public.quest_daily_claims where user_id=v_uid and quest_key=p_key and day=v_day) then
    raise exception '이미 수령한 퀘스트예요.'; end if;
  if not public._quest_done(p_key, v_day_start) then raise exception '아직 완료하지 않았어요.'; end if;
  v_reward := case p_key when 'attend' then 1 when 'visit' then 1 when 'note' then 3 else 0 end;
  insert into public.quest_daily_claims(user_id, quest_key, day) values (v_uid, p_key, v_day);
  insert into public.coin_ledger(user_id, delta, reason, ref_type) values (v_uid, v_reward, '퀘스트 보상', 'quest');
  return (select coalesce(sum(delta),0) from public.coin_ledger where user_id = v_uid);
end $$;
grant execute on function public.claim_quest(text) to authenticated;

-- 랜덤 슬롯 보상 수령 → 30분 후 다음 퀘스트. 반환=새 잔액.
create or replace function public.claim_slot_quest(p_slot int)
returns int language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_slot public.quest_slots; v_reward int;
begin
  select * into v_slot from public.quest_slots where user_id=v_uid and slot=p_slot;
  if v_slot.user_id is null then raise exception '슬롯이 없어요.'; end if;
  if v_slot.available_at > now() then raise exception '아직 쿨다운 중이에요.'; end if;
  if not public._quest_done(v_slot.quest_key, v_slot.assigned_at) then raise exception '아직 완료하지 않았어요.'; end if;
  select reward into v_reward from public.quest_defs where id=v_slot.quest_key and active;
  if coalesce(v_reward,0) <= 0 then raise exception '보상을 확인할 수 없어요.'; end if;
  insert into public.coin_ledger(user_id, delta, reason, ref_type) values (v_uid, v_reward, '퀘스트 보상', 'quest');
  update public.quest_slots set
    quest_key = public._quest_pick(array(select quest_key from public.quest_slots where user_id=v_uid and slot<>p_slot)),
    assigned_at = now() + interval '30 minutes',
    available_at = now() + interval '30 minutes'
  where user_id=v_uid and slot=p_slot;
  return (select coalesce(sum(delta),0) from public.coin_ledger where user_id = v_uid);
end $$;
grant execute on function public.claim_slot_quest(int) to authenticated;

-- 랜덤 슬롯 교체(1츄르, 노출 중인 슬롯만). 반환=갱신된 get_quests().
create or replace function public.reroll_slot_quest(p_slot int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_slot public.quest_slots; v_bal int;
begin
  select * into v_slot from public.quest_slots where user_id=v_uid and slot=p_slot;
  if v_slot.user_id is null then raise exception '슬롯이 없어요.'; end if;
  if v_slot.available_at > now() then raise exception '쿨다운 중에는 바꿀 수 없어요.'; end if;
  select coalesce(sum(delta),0) into v_bal from public.coin_ledger where user_id=v_uid;
  if v_bal < 1 then raise exception '츄르가 부족해요.'; end if;
  insert into public.coin_ledger(user_id, delta, reason, ref_type) values (v_uid, -1, '랜덤 퀘스트 교체', 'quest_reroll');
  update public.quest_slots set
    quest_key = public._quest_pick(array(select quest_key from public.quest_slots where user_id=v_uid and slot<>p_slot) || array[v_slot.quest_key]),
    assigned_at = now(), available_at = now()
  where user_id=v_uid and slot=p_slot;
  return public.get_quests();
end $$;
grant execute on function public.reroll_slot_quest(int) to authenticated;
