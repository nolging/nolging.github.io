-- =============================================================
--  알림(notifications) 자동 정리 — 30일 지난 알림은 자동으로 삭제.
--  유저가 직접 스와이프해서 지우지 않는 한 계속 쌓이기만 하던 테이블이라,
--  job_run_details 와 같은 방식(매일 정리 cron)으로 오래된 것부터 비운다.
--  적용: Supabase SQL Editor 에 그대로 실행. 정리 함수 등록 + 매일 정리 cron 예약 +
--        지금까지 쌓인 오래된 알림 즉시 1회 정리까지 한 번에 처리된다.
-- =============================================================

create or replace function public.cleanup_old_notifications()
returns void language sql security definer set search_path = public as $$
  delete from public.notifications where created_at < now() - interval '30 days';
$$;

-- 매일 새벽 3시 15분, 30일 지난 알림만 정리(이미 있으면 교체)
create extension if not exists pg_cron;
do $$
begin
  perform cron.unschedule('nolging-cleanup-notifications');
exception when others then null;
end $$;
select cron.schedule('nolging-cleanup-notifications', '15 3 * * *', $$select public.cleanup_old_notifications()$$);

-- 지금까지 쌓인 30일 지난 알림도 즉시 1회 정리
select public.cleanup_old_notifications();
