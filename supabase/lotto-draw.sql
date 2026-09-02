-- 로또 자동 추첨: 매주 토요일 18:00(KST) 1~30 중 7개(본번호 6개 + 보너스 1개) 랜덤 추첨 +
-- "당첨 확인" 조회용 최신 발표 회차 읽기(클라이언트가 lotto_rounds 를 직접 SELECT하므로
-- 별도 RPC 불필요). Supabase SQL Editor 에서 실행. 최종본은 schema-minigames.sql 에도 반영됨.

-- 1) 보너스 번호 컬럼 추가(본번호 6개는 기존 winning_numbers, 보너스는 별도 컬럼).
alter table public.lotto_rounds add column if not exists bonus_number int;

-- 2) 자동 추첨(pg_cron 용). 아직 당첨 번호가 없는 가장 빠른(=유일한) 회차를 찾아 1~30 중
--    서로 다른 7개를 뽑아 앞 6개는 winning_numbers(오름차순), 나머지 1개는 bonus_number 로
--    채운다. 응모가 하나도 없어 열린 회차가 없으면 아무 것도 하지 않는다.
--    (submit_lotto_entry() 는 항상 winning_numbers 가 null 인 가장 빠른 회차 하나에만 응모를
--     붙이므로, 이 시점에 미추첨 회차는 있어도 최대 1개뿐이다.)
create or replace function public.draw_lotto_round()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_round_id bigint;
  v_nums int[];
begin
  select id into v_round_id from public.lotto_rounds
    where winning_numbers is null order by round_no asc limit 1
    for update skip locked;
  if v_round_id is null then return; end if;

  select array_agg(x) into v_nums
    from (select x from generate_series(1, 30) as x order by random() limit 7) s;

  update public.lotto_rounds
    set winning_numbers = (select array_agg(n order by n) from unnest(v_nums[1:6]) as n),
        bonus_number = v_nums[7],
        drawn_at = now()
    where id = v_round_id;
end $$;
-- authenticated 에게 grant 하지 않음(cron 전용 — dispatch_due_reminders() 와 동일 패턴)

-- 3) pg_cron 스케줄: 매주 토요일 18:00(KST) = 09:00(UTC).
create extension if not exists pg_cron;
do $$
begin
  perform cron.unschedule('nolging-lotto-draw');
exception when others then null;
end $$;
select cron.schedule('nolging-lotto-draw', '0 9 * * 6', $$select public.draw_lotto_round()$$);
