-- =============================================================
--  퀘스트 보상 지급 시 츄르 내역에 남는 사유를 관리자가 직접 정할 수 있게.
--   · quest_defs(랜덤)/quest_daily_defs(데일리) 에 reward_reason 컬럼 추가(비워두면 제목으로 대체).
--   · 완료 처리 시 coin_ledger.reason 을 "데일리 퀘스트 - {사유}" / "랜덤 퀘스트 - {사유}" 형식으로 기록.
--  quests.sql, quests-v2.sql, quest-daily-defs.sql 적용된 상태에서 실행.
-- =============================================================

alter table public.quest_defs add column if not exists reward_reason text;
alter table public.quest_daily_defs add column if not exists reward_reason text;

-- 데일리 퀘스트 보상 수령
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

-- 랜덤 퀘스트(슬롯) 보상 수령
create or replace function public.claim_slot_quest(p_slot int)
returns int language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_slot public.quest_slots; v_reward int; v_title text; v_reason text;
begin
  select * into v_slot from public.quest_slots where user_id=v_uid and slot=p_slot;
  if v_slot.user_id is null then raise exception '슬롯이 없어요.'; end if;
  if v_slot.available_at > now() then raise exception '아직 쿨다운 중이에요.'; end if;
  if not public._quest_done(v_slot.quest_key, v_slot.assigned_at) then raise exception '아직 완료하지 않았어요.'; end if;
  select reward, title, reward_reason into v_reward, v_title, v_reason from public.quest_defs where id=v_slot.quest_key and active;
  if coalesce(v_reward,0) <= 0 then raise exception '보상을 확인할 수 없어요.'; end if;
  insert into public.coin_ledger(user_id, delta, reason, ref_type)
    values (v_uid, v_reward, '랜덤 퀘스트 - ' || coalesce(nullif(btrim(v_reason), ''), v_title), 'quest');
  update public.quest_slots set
    quest_key = public._quest_pick(array(select quest_key from public.quest_slots where user_id=v_uid and slot<>p_slot)),
    assigned_at = now() + interval '30 minutes',
    available_at = now() + interval '30 minutes'
  where user_id=v_uid and slot=p_slot;
  return (select coalesce(sum(delta),0) from public.coin_ledger where user_id = v_uid);
end $$;
grant execute on function public.claim_slot_quest(int) to authenticated;
