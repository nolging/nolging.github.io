-- =============================================================
--  데일리 퀘스트 정의(관리자 CRUD): quest_daily_defs
--  · quests.sql, quests-v2.sql 적용 후 실행.
--  · key 는 완료 판정 키(_quest_done 의 case 키, claim_quest 의 p_key)와 반드시 일치해야
--    동작한다 — 새 key 를 추가해도 완료 판정은 코드로 구현해야 하므로, 이 테이블은
--    기존 3종(attend/visit/note)의 이모지·배경색·명칭·보상만 관리자가 바꾸는 용도다.
-- =============================================================

create table if not exists public.quest_daily_defs (
  key         text primary key,
  title       text not null,
  emoji       text not null default '✨',
  emoji_bg    text not null default '#eef0f2',
  reward      int  not null default 1 check (reward >= 0),
  sort_order  int  not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
-- 츄르 내역에 표시될 적립 사유(비워두면 퀘스트 제목으로 대체)
alter table public.quest_daily_defs add column if not exists reward_reason text;
alter table public.quest_daily_defs enable row level security;
drop policy if exists quest_daily_defs_select on public.quest_daily_defs;
create policy quest_daily_defs_select on public.quest_daily_defs for select to authenticated using (true);
drop policy if exists quest_daily_defs_write on public.quest_daily_defs;
create policy quest_daily_defs_write on public.quest_daily_defs for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- 기존 하드코딩 값 그대로 시드(MyProfile.jsx 의 QUEST_ICON 과 동일한 이모지/배경색)
insert into public.quest_daily_defs (key, title, emoji, emoji_bg, reward, sort_order) values
  ('attend', '출석하기', '🗓️', '#eef1fb', 1, 1),
  ('visit', '그룹 방문하기', '🚪', '#e8f4ec', 1, 2),
  ('note', '쪽지 보내기', '💌', '#fde8ee', 3, 3)
on conflict (key) do nothing;

-- get_quests(): 데일리 퀘스트를 하드코딩 VALUES 대신 quest_daily_defs 에서 읽고, emoji/emoji_bg 도 함께 반환
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

  select jsonb_agg(jsonb_build_object('key',d.key,'label',d.title,'reward',d.reward,
      'emoji', d.emoji, 'emoji_bg', d.emoji_bg,
      'done', public._quest_done(d.key, v_day_start),
      'claimed', exists(select 1 from public.quest_daily_claims c where c.user_id=v_uid and c.quest_key=d.key and c.day=v_day)) order by d.sort_order)
    into v_daily
  from public.quest_daily_defs d where d.active;

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

-- claim_quest(): 보상액을 하드코딩 CASE 대신 quest_daily_defs 에서 조회.
-- 츄르 내역 사유는 "데일리 퀘스트 - {reward_reason 또는 title}" 형식으로 남긴다.
create or replace function public.claim_quest(p_key text)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'Asia/Seoul')::date;
  v_day_start timestamptz := (v_day::timestamp at time zone 'Asia/Seoul');
  v_reward int; v_title text; v_reason text;
begin
  if p_key not in ('attend','visit','note') then raise exception '알 수 없는 퀘스트예요.'; end if;
  if exists(select 1 from public.quest_daily_claims where user_id=v_uid and quest_key=p_key and day=v_day) then
    raise exception '이미 수령한 퀘스트예요.'; end if;
  if not public._quest_done(p_key, v_day_start) then raise exception '아직 완료하지 않았어요.'; end if;
  select reward, title, reward_reason into v_reward, v_title, v_reason from public.quest_daily_defs where key = p_key;
  v_reward := coalesce(v_reward, 0);
  insert into public.quest_daily_claims(user_id, quest_key, day) values (v_uid, p_key, v_day);
  insert into public.coin_ledger(user_id, delta, reason, ref_type)
    values (v_uid, v_reward, '데일리 퀘스트 - ' || coalesce(nullif(btrim(v_reason), ''), v_title), 'quest');
  return (select coalesce(sum(delta),0) from public.coin_ledger where user_id = v_uid);
end $$;
grant execute on function public.claim_quest(text) to authenticated;
