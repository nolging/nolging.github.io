-- 하단 탭 "마이" 배지: 완료돼서 "받기" 가능한 퀘스트가 있는지 가벼운 boolean 으로 확인.
--   · get_quests() 는 슬롯 5칸 보장/무효 슬롯 교체(쓰기)까지 하는 무거운 함수라, 60초마다
--     전 페이지에서 폴링하는 배지 체크용으로는 부적합 — 쓰기 없는 순수 조회 함수를 새로 둔다.
--   · "받기" 버튼이 뜨는 조건과 정확히 같아야 한다: 데일리는 완료(_quest_done)했지만 그날
--     아직 claim 안 한 것, 랜덤 슬롯은 쿨다운이 끝났고(available_at<=now) 완료된 것.
--  전제: quests.sql, quests-v2.sql 적용됨.
--  적용: Supabase SQL Editor 에 그대로 실행.

create or replace function public.has_claimable_quest()
returns boolean language plpgsql security definer set search_path = public stable as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'Asia/Seoul')::date;
  v_day_start timestamptz := (v_day::timestamp at time zone 'Asia/Seoul');
begin
  if v_uid is null then return false; end if;

  if exists (
    select 1 from (values ('attend',1),('visit',2),('note',3)) as d(key, ord)
    where public._quest_done(d.key, v_day_start)
      and not exists (
        select 1 from public.quest_daily_claims c
        where c.user_id = v_uid and c.quest_key = d.key and c.day = v_day
      )
  ) then return true; end if;

  if exists (
    select 1 from public.quest_slots s
    where s.user_id = v_uid and s.available_at <= now()
      and public._quest_done(s.quest_key, s.assigned_at)
  ) then return true; end if;

  return false;
end;
$$;
grant execute on function public.has_claimable_quest() to authenticated;
