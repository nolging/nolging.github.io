-- =============================================================
--  pg_cron 실행 로그(cron.job_run_details) 자동 정리
--  · nolging-reminders(매분)/nolging-system-notices(매분) 등 매분 도는 cron job이
--    실행될 때마다 cron.job_run_details 에 로그 한 줄씩 쌓인다. 서비스 데이터가
--    아니라 순수 실행 기록이라, 오래된 건 지워도 아무 영향 없다.
--  · 지우지 않으면 DB 용량(500MB 한도)을 이 로그가 가장 많이 잡아먹게 된다
--    (확인 시점 기준 18MB — 다른 앱 테이블 전부 합친 것보다 큼).
--  적용: Supabase SQL Editor 에 그대로 실행. 정리 함수 등록 + 매일 정리 cron 예약 +
--        지금까지 쌓인 로그 즉시 1회 정리까지 한 번에 처리된다.
-- =============================================================

create or replace function public.cleanup_cron_logs()
returns void language sql security definer set search_path = public as $$
  delete from cron.job_run_details where end_time < now() - interval '7 days';
$$;

-- 매일 새벽 3시, 7일 지난 실행 로그만 정리(이미 있으면 교체)
create extension if not exists pg_cron;
do $$
begin
  perform cron.unschedule('nolging-cleanup-cron-logs');
exception when others then null;
end $$;
select cron.schedule('nolging-cleanup-cron-logs', '0 3 * * *', $$select public.cleanup_cron_logs()$$);

-- 지금까지 쌓인 로그 즉시 1회 정리
select public.cleanup_cron_logs();

-- DELETE 만으로는 테이블 파일 크기가 바로 줄지 않는다(오토배큠이 나중에 회수).
-- 대시보드 용량 수치에 바로 반영되게 하려면 VACUUM 으로 즉시 회수.
vacuum cron.job_run_details;
