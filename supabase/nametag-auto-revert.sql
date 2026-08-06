-- 명찰(nametag) 24시간 만료 자동 원복
--   · 기존엔 nametag_state(p_group_id) 안에서만 만료된 잠금을 원복했는데, 이 함수가
--     MemberDetail/Inventory 명찰 모달을 열 때만 호출돼 — 아무도 그 페이지를 안 들어가면
--     24시간이 지나도 닉네임이 그대로 남아 있었다(본인이 수정 페이지에 들어가야만 풀림).
--   · pg_cron 이 이미 dispatch_due_reminders() 에 쓰이고 있는 패턴 그대로, 매분 전체
--     group_members 를 훑어 만료된 잠금을 원복한다 — 어떤 페이지도 방문할 필요 없음.
--  적용: Supabase SQL Editor 에 그대로 실행.

create or replace function public.dispatch_nametag_reverts()
returns integer language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.group_members
     set display_nickname = coalesce(nullif(nick_original, ''), display_nickname),
         nick_original = null, nick_locked_by = null, nick_locked_until = null
   where nick_locked_until is not null and nick_locked_until <= now();
  get diagnostics n = row_count;
  return n;
end;
$$;

-- pg_cron 매분 스케줄 (이미 있으면 교체)
create extension if not exists pg_cron;
do $$
begin
  perform cron.unschedule('nolging-nametag-revert');
exception when others then null;
end $$;
select cron.schedule('nolging-nametag-revert', '* * * * *', $$select public.dispatch_nametag_reverts()$$);
