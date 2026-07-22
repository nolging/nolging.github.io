-- =============================================================
--  물풍선 쪽지 읽음 처리 보강
--  증상: 물풍선(타이머) 쪽지를 열어 읽어도 안 읽음 점(하단 탭/카드)이 사라지지 않음.
--  원인: 물풍선을 열 때 opened_at 기록(open_water_note)과 읽음 처리(mark_note_read)가
--        같은 notes 행에 '별도 요청'으로 동시에 발생 → 배포/타이밍 상황에 따라 읽음이
--        확정되지 않을 수 있음.
--  해법: 여는 동작 자체가 읽음 처리까지 '원자적으로' 수행하도록 open_water_note 를
--        opened_at 최초 1회 기록 + is_read=true 로 통합.
--  적용: Supabase SQL Editor 에 그대로 실행.
-- =============================================================

-- 1) open_water_note: 처음 연 시각(opened_at)은 최초 1회만(coalesce), 읽음은 항상 확정.
drop function if exists public.open_water_note(uuid);
create or replace function public.open_water_note(p_note_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.notes
     set opened_at = coalesce(opened_at, now()),
         is_read   = true
   where id = p_note_id
     and recipient_id = auth.uid()
     and timer_seconds is not null;
$$;
grant execute on function public.open_water_note(uuid) to authenticated;

-- 2) 백필: 이미 열어본(opened_at 존재) 물풍선 쪽지인데 안 읽음으로 남아있는 것들을 읽음 처리.
update public.notes
   set is_read = true
 where timer_seconds is not null
   and opened_at is not null
   and is_read = false;
