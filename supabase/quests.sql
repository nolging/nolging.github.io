-- =============================================================
--  퀘스트 (츄르 적립) — 마이 페이지
--  · 데일리 퀘스트: 매일 동일(출석/그룹방문/쪽지). KST 기준 자정 리셋.
--  · 랜덤 퀘스트: 사용자당 1개 활성. 완료+수령 시 다음 랜덤 퀘스트로 교체.
--    1츄르로 교체(reroll) 가능. 프리미엄 전용 퀘스트는 커플/우정 링 보유자만.
--  · 완료 판정은 기존 데이터(coin_ledger/notes/tasks/notifications) 조회로 처리.
-- =============================================================

-- 데일리 '그룹 방문' 판정용: 마지막 그룹 방문 시각
alter table public.profiles add column if not exists last_group_visit_at timestamptz;

-- profiles 쓰기는 정의자 함수로만 (그룹 상세 진입 시 호출)
create or replace function public.touch_group_visit()
returns void language sql security definer set search_path = public as $$
  update public.profiles set last_group_visit_at = now() where id = auth.uid();
$$;
grant execute on function public.touch_group_visit() to authenticated;

-- 데일리 퀘스트 수령 기록(중복 수령 방지). day = KST 날짜.
create table if not exists public.quest_daily_claims (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  quest_key  text not null,
  day        date not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, quest_key, day)
);
alter table public.quest_daily_claims enable row level security;
drop policy if exists qdc_self on public.quest_daily_claims;
create policy qdc_self on public.quest_daily_claims for select to authenticated using (user_id = auth.uid());

-- 랜덤 퀘스트 현재 상태(사용자당 1개)
create table if not exists public.quest_random (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  quest_key   text not null,
  assigned_at timestamptz not null default now()
);
alter table public.quest_random enable row level security;
drop policy if exists qr_self on public.quest_random;
create policy qr_self on public.quest_random for select to authenticated using (user_id = auth.uid());

-- 프리미엄 여부(커플/우정 링 장착)
create or replace function public._quest_is_premium()
returns boolean language sql security definer set search_path = public as $$
  select exists(select 1 from public.user_items
    where user_id = auth.uid() and item_id in ('couple-ring','friend-ring') and status = 'used');
$$;

-- 퀘스트 완료 판정. p_since 이후의 행동을 기준으로 판단.
create or replace function public._quest_done(p_key text, p_since timestamptz)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  return case p_key
    when 'attend'      then true
    when 'visit'       then exists(select 1 from public.profiles where id = v_uid and last_group_visit_at >= p_since)
    when 'note'        then exists(select 1 from public.notes where sender_id = v_uid and created_at >= p_since)
    when 'r_wish'      then exists(select 1 from public.tasks where created_by = v_uid and created_at >= p_since)
    when 'r_item_note' then exists(select 1 from public.notes where sender_id = v_uid and created_at >= p_since
                                     and (item_id is not null or kind in ('cassette','video','bluray','link','gift')))
    when 'r_nyangpito' then exists(select 1 from public.coin_ledger where user_id = v_uid and ref_type = 'nyangpito' and created_at >= p_since)
    when 'r_buy'       then exists(select 1 from public.coin_ledger where user_id = v_uid and ref_type = 'purchase' and created_at >= p_since)
    when 'r_spend10'   then coalesce((select -sum(delta) from public.coin_ledger
                                        where user_id = v_uid and delta < 0 and created_at >= p_since), 0) >= 10
    when 'r_game_win'  then exists(select 1 from public.coin_ledger where user_id = v_uid and delta > 0
                                     and ref_type in ('omok','catchmind','rps') and created_at >= p_since)
    when 'r_poke'      then exists(select 1 from public.notifications where actor_id = v_uid and type = 'poke' and created_at >= p_since)
    else false end;
end $$;

-- 랜덤 퀘스트 풀에서 하나 뽑기(프리미엄 아니면 프리미엄 전용 제외, p_exclude 는 제외)
create or replace function public._quest_pick_random(p_exclude text)
returns text language plpgsql security definer set search_path = public as $$
declare v_prem boolean := public._quest_is_premium(); v_key text;
begin
  select p.key into v_key from (values
    ('r_wish', false), ('r_item_note', false), ('r_nyangpito', false),
    ('r_buy', false), ('r_spend10', false), ('r_game_win', true), ('r_poke', true)
  ) as p(key, premium_only)
  where (v_prem or not p.premium_only) and p.key is distinct from p_exclude
  order by random() limit 1;
  return v_key;
end $$;

-- 랜덤 퀘스트 메타(라벨/보상/프리미엄전용)
drop function if exists public._quest_meta(text);
create function public._quest_meta(p_key text)
returns table(label text, reward int, premium_only boolean) language sql immutable as $$
  select m.label::text, m.reward::int, m.premium_only::boolean from (values
    ('r_wish','위시 작성하기',2,false),
    ('r_item_note','아이템 넣어 쪽지 보내기',3,false),
    ('r_nyangpito','냥피또 긁기',2,false),
    ('r_buy','상점에서 아이템 구매하기',2,false),
    ('r_spend10','10츄르 이상 사용하기',3,false),
    ('r_game_win','게임에서 승리하기',3,true),
    ('r_poke','콕 찌르기',1,true)
  ) as m(key,label,reward,premium_only) where m.key = p_key;
$$;

-- 마이 페이지 퀘스트 상태 조회 (+ 잔액/등급). 랜덤 퀘스트 없으면 배정.
create or replace function public.get_quests()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'Asia/Seoul')::date;
  v_day_start timestamptz := (v_day::timestamp at time zone 'Asia/Seoul');
  v_bal int; v_grade text; v_rand public.quest_random; v_daily jsonb; v_random jsonb; v_meta record;
begin
  select coalesce(sum(delta),0) into v_bal from public.coin_ledger where user_id = v_uid;
  v_grade := case
    when exists(select 1 from public.user_items where user_id=v_uid and item_id='couple-ring' and status='used') then 'vvip'
    when exists(select 1 from public.user_items where user_id=v_uid and item_id='friend-ring' and status='used') then 'vip'
    else 'normal' end;

  select jsonb_agg(jsonb_build_object(
      'key', d.key, 'label', d.label, 'reward', d.reward,
      'done', public._quest_done(d.key, v_day_start),
      'claimed', exists(select 1 from public.quest_daily_claims c where c.user_id=v_uid and c.quest_key=d.key and c.day=v_day)
    ) order by d.ord)
    into v_daily
  from (values ('attend','출석하기',1,1),('visit','그룹 방문하기',1,2),('note','쪽지 보내기',3,3)) as d(key,label,reward,ord);

  select * into v_rand from public.quest_random where user_id = v_uid;
  if v_rand.user_id is null then
    insert into public.quest_random(user_id, quest_key) values (v_uid, public._quest_pick_random(null))
      on conflict (user_id) do nothing;
    select * into v_rand from public.quest_random where user_id = v_uid;
  end if;
  select * into v_meta from public._quest_meta(v_rand.quest_key);
  v_random := jsonb_build_object(
    'key', v_rand.quest_key, 'label', v_meta.label, 'reward', v_meta.reward, 'premium_only', v_meta.premium_only,
    'done', public._quest_done(v_rand.quest_key, v_rand.assigned_at));

  return jsonb_build_object('balance', v_bal, 'grade', v_grade, 'daily', coalesce(v_daily,'[]'::jsonb), 'random', v_random);
end $$;
grant execute on function public.get_quests() to authenticated;

-- 퀘스트 보상 수령. 데일리는 당일 1회, 랜덤은 완료 시 다음 퀘스트로 교체. 반환=새 잔액.
create or replace function public.claim_quest(p_key text)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'Asia/Seoul')::date;
  v_day_start timestamptz := (v_day::timestamp at time zone 'Asia/Seoul');
  v_rand public.quest_random; v_since timestamptz; v_daily boolean; v_reward int;
begin
  v_daily := p_key in ('attend','visit','note');
  if v_daily then
    v_since := v_day_start;
    if exists(select 1 from public.quest_daily_claims where user_id=v_uid and quest_key=p_key and day=v_day) then
      raise exception '이미 수령한 퀘스트예요.'; end if;
    v_reward := case p_key when 'attend' then 1 when 'visit' then 1 when 'note' then 3 else 0 end;
  else
    select * into v_rand from public.quest_random where user_id = v_uid;
    if v_rand.quest_key is distinct from p_key then raise exception '현재 퀘스트가 아니에요.'; end if;
    v_since := v_rand.assigned_at;
    select reward into v_reward from public._quest_meta(p_key);
  end if;

  if coalesce(v_reward,0) <= 0 then raise exception '알 수 없는 퀘스트예요.'; end if;
  if not public._quest_done(p_key, v_since) then raise exception '아직 완료하지 않았어요.'; end if;

  if v_daily then
    insert into public.quest_daily_claims(user_id, quest_key, day) values (v_uid, p_key, v_day);
  else
    update public.quest_random set quest_key = public._quest_pick_random(p_key), assigned_at = now() where user_id = v_uid;
  end if;

  insert into public.coin_ledger(user_id, delta, reason, ref_type) values (v_uid, v_reward, '퀘스트 보상', 'quest');
  return (select coalesce(sum(delta),0) from public.coin_ledger where user_id = v_uid);
end $$;
grant execute on function public.claim_quest(text) to authenticated;

-- 랜덤 퀘스트 교체(1츄르 소모). 반환=갱신된 get_quests().
create or replace function public.reroll_random_quest()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_bal int; v_cur text;
begin
  select coalesce(sum(delta),0) into v_bal from public.coin_ledger where user_id = v_uid;
  if v_bal < 1 then raise exception '츄르가 부족해요.'; end if;
  select quest_key into v_cur from public.quest_random where user_id = v_uid;
  insert into public.coin_ledger(user_id, delta, reason, ref_type) values (v_uid, -1, '랜덤 퀘스트 교체', 'quest_reroll');
  insert into public.quest_random(user_id, quest_key, assigned_at) values (v_uid, public._quest_pick_random(v_cur), now())
    on conflict (user_id) do update set quest_key = public._quest_pick_random(v_cur), assigned_at = now();
  return public.get_quests();
end $$;
grant execute on function public.reroll_random_quest() to authenticated;
