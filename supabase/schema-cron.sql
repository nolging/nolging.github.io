-- =============================================================
--  schema-cron.sql — 매분(1분 주기) pg_cron 작업 통합
--
--  원래 아래 4개가 각자 독립된 pg_cron 작업으로 "매분" 등록돼 있었다
--  (각각 schema-store-items.sql / schema-notifications.sql /
--   schema-account-system.sql 에서 cron.schedule 로 등록):
--    - nolging-nametag-revert    → dispatch_nametag_reverts()
--    - nolging-purin-mic-revert  → dispatch_purin_mic_reverts()
--    - nolging-reminders         → dispatch_due_reminders()
--    - nolging-system-notices    → dispatch_due_system_notices()
--  하루 4 × 1440 = 5,760번의 개별 DB 연결/쿼리가 발생해 Supabase
--  대시보드의 Postgres 로그(Log Ingestion 과금 항목) 비중이 유독 크게
--  나왔다 — 이 파일은 그 4개를 "하나의 pg_cron 작업"으로 합쳐서 DB
--  연결 횟수를 4분의 1로 줄인다(체크 주기·즉시성은 그대로 매분 유지).
--
--  그 대신 위 4개 파일에 있던 개별 cron.schedule 등록은 제거했다
--  (함수 정의 자체는 각 도메인 파일에 그대로 남아있고, 스케줄 등록만
--  이 파일로 옮김) — 각 파일 재실행 시 더 이상 개별 매분 작업을
--  만들지 않는다. 이 파일을 실행해야 실제로 "하나로 합쳐진" 스케줄이
--  적용된다.
--
--  적용 순서: schema-store-items.sql / schema-notifications.sql /
--  schema-account-system.sql (위 4개 함수가 정의된 파일들)이 먼저
--  적용돼 있어야 한다. 이 파일은 그 함수들을 호출만 할 뿐 재정의하지
--  않는다.
-- =============================================================

-- 넷 중 하나가 실패해도(예외) 나머지는 계속 실행되도록 각각 개별
-- begin/exception 으로 감싼다 — 예전에 4개의 독립된 cron 작업이던 때와
-- 동일하게, 한 기능의 오류가 다른 기능의 정시 처리를 막지 않게 한다.
-- 평소(성공 시)엔 아무 로그도 남기지 않고, 실패했을 때만 어떤 함수가
-- 실패했는지 RAISE WARNING 으로 남긴 뒤, 마지막에 실패가 하나라도
-- 있었으면 예외를 다시 던져 cron.job_run_details 에도 실패로 기록되게
-- 한다(그래야 넷 중 하나가 계속 실패해도 조용히 묻히지 않는다).
create or replace function public.dispatch_minutely()
returns void language plpgsql security definer set search_path = public as $$
declare v_failed boolean := false;
begin
  begin
    perform public.dispatch_nametag_reverts();
  exception when others then
    v_failed := true;
    raise warning 'dispatch_minutely: dispatch_nametag_reverts failed: %', sqlerrm;
  end;

  begin
    perform public.dispatch_purin_mic_reverts();
  exception when others then
    v_failed := true;
    raise warning 'dispatch_minutely: dispatch_purin_mic_reverts failed: %', sqlerrm;
  end;

  begin
    perform public.dispatch_due_reminders();
  exception when others then
    v_failed := true;
    raise warning 'dispatch_minutely: dispatch_due_reminders failed: %', sqlerrm;
  end;

  begin
    perform public.dispatch_due_system_notices();
  exception when others then
    v_failed := true;
    raise warning 'dispatch_minutely: dispatch_due_system_notices failed: %', sqlerrm;
  end;

  if v_failed then
    raise exception 'dispatch_minutely: one or more sub-dispatchers failed (see warnings above)';
  end if;
end;
$$;

create extension if not exists pg_cron;

-- 예전 4개의 개별 매분 작업은 모두 해제(이미 없어도 무해)
do $$ begin perform cron.unschedule('nolging-nametag-revert');   exception when others then null; end $$;
do $$ begin perform cron.unschedule('nolging-purin-mic-revert'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('nolging-reminders');        exception when others then null; end $$;
do $$ begin perform cron.unschedule('nolging-system-notices');   exception when others then null; end $$;

-- 하나로 합친 매분 작업 등록(이미 있으면 교체)
do $$
begin
  perform cron.unschedule('nolging-minutely-dispatch');
exception when others then null;
end $$;
select cron.schedule('nolging-minutely-dispatch', '* * * * *', $$select public.dispatch_minutely()$$);

-- 원래 4개 함수도 그랬듯 클라이언트에 노출할 필요 없는 내부 전용(cron 전용) 함수라
-- authenticated 에 execute grant 하지 않는다(cron 은 스케줄한 role 권한으로 실행됨).
