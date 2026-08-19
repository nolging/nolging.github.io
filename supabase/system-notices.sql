-- =============================================================
--  시스템 공지: 관리자가 제목/본문/아이콘을 입력해 특정 대상(전체/등급/회원/그룹)에게
--  즉시 또는 예약 발송하는 푸시 알림. notifications 테이블 INSERT → 기존 웹훅(send-push)이
--  그대로 태워 실제 푸시까지 나간다(megaphone_send/dispatch_due_reminders 와 동일 패턴).
--  예약 발송은 pg_cron 이 매분 dispatch_due_system_notices() 를 호출해 처리한다.
-- =============================================================

-- notifications: 알림센터에 표시할 커스텀 아이콘(시스템 공지별로 다름 — notif_templates 는
-- type 당 하나뿐이라 재사용 불가). 없으면 프런트에서 기본 아이콘(📢)으로 대체.
alter table public.notifications add column if not exists emoji text;
alter table public.notifications add column if not exists emoji_bg text;

create table if not exists public.system_notices (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  body              text not null,
  emoji             text,
  emoji_bg          text,
  target_type       text not null check (target_type in ('all', 'premium', 'vvip', 'vip', 'users', 'groups')),
  target_user_ids   uuid[] not null default '{}',
  target_group_ids  uuid[] not null default '{}',
  scheduled_at      timestamptz,        -- null = 즉시 발송
  sent_at           timestamptz,        -- null = 아직 발송 전(예약 대기)
  sent_count        int not null default 0,
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_system_notices_pending
  on public.system_notices(scheduled_at) where sent_at is null and scheduled_at is not null;

alter table public.system_notices enable row level security;
-- 직접 테이블 접근은 막고(RLS 통과자 없음) 아래 SECURITY DEFINER RPC 로만 조회/변경한다.

-- 임의 유저의 등급(커플/우정 링 장착 여부) 판정 — _quest_user_grade() 는 auth.uid() 전용이라
-- 관리자가 다른 유저를 대상으로 판정하려면 별도 파라미터화 버전이 필요.
create or replace function public._quest_user_grade_for(p_user uuid)
returns text language sql security definer stable set search_path = public as $$
  select case
    when exists(select 1 from public.user_items where user_id = p_user and item_id = 'couple-ring' and status = 'used') then 'vvip'
    when exists(select 1 from public.user_items where user_id = p_user and item_id = 'friend-ring' and status = 'used') then 'vip'
    else 'normal' end;
$$;

-- 공지 한 건의 대상 유저 id 목록을 계산
create or replace function public._system_notice_targets(p_row public.system_notices)
returns setof uuid language plpgsql stable security definer set search_path = public as $$
begin
  if p_row.target_type = 'users' then
    return query select id from public.profiles where id = any(p_row.target_user_ids) and status = 'active';
  elsif p_row.target_type = 'groups' then
    return query select distinct gm.user_id from public.group_members gm
      join public.profiles p on p.id = gm.user_id
      where gm.group_id = any(p_row.target_group_ids) and p.status = 'active';
  elsif p_row.target_type = 'all' then
    return query select id from public.profiles where status = 'active';
  else
    -- premium/vvip/vip: 등급 판정(_quest_grade_ok 는 quests-v2.sql 에 이미 존재)
    return query select p.id from public.profiles p
      where p.status = 'active' and public._quest_grade_ok(p_row.target_type, public._quest_user_grade_for(p.id));
  end if;
end $$;

-- 실제 발송(notifications insert) — 즉시 발송/예약 발송(cron) 이 공유
create or replace function public._system_notice_dispatch(p_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_row public.system_notices; v_cnt int := 0;
begin
  select * into v_row from public.system_notices where id = p_id for update;
  if v_row.id is null then return 0; end if;
  if v_row.sent_at is not null then return v_row.sent_count; end if; -- 중복 발송 방지

  insert into public.notifications(user_id, actor_id, type, title, body, emoji, emoji_bg)
  select t, null::uuid, 'system_notice', v_row.title, v_row.body, v_row.emoji, v_row.emoji_bg
  from public._system_notice_targets(v_row) t;
  get diagnostics v_cnt = row_count;

  update public.system_notices set sent_at = now(), sent_count = v_cnt where id = p_id;
  return v_cnt;
end $$;

-- 관리자: 목록 조회
create or replace function public.admin_list_system_notices()
returns setof public.system_notices language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception '관리자만 조회할 수 있습니다.'; end if;
  return query select * from public.system_notices order by created_at desc;
end $$;
grant execute on function public.admin_list_system_notices() to authenticated;

-- 관리자: 신규 작성(즉시 발송 또는 예약)
create or replace function public.admin_create_system_notice(
  p_title text, p_body text, p_emoji text, p_emoji_bg text,
  p_target_type text, p_target_user_ids uuid[], p_target_group_ids uuid[], p_scheduled_at timestamptz
) returns public.system_notices language plpgsql security definer set search_path = public as $$
declare v_row public.system_notices;
begin
  if not public.is_admin(auth.uid()) then raise exception '관리자만 발송할 수 있습니다.'; end if;
  if btrim(coalesce(p_title, '')) = '' or btrim(coalesce(p_body, '')) = '' then
    raise exception '제목과 본문을 입력해 주세요.';
  end if;
  if p_target_type not in ('all', 'premium', 'vvip', 'vip', 'users', 'groups') then
    raise exception '수신 대상이 올바르지 않습니다.';
  end if;

  insert into public.system_notices(title, body, emoji, emoji_bg, target_type, target_user_ids, target_group_ids, scheduled_at, created_by)
  values (btrim(p_title), btrim(p_body), nullif(btrim(coalesce(p_emoji, '')), ''), nullif(btrim(coalesce(p_emoji_bg, '')), ''),
          p_target_type, coalesce(p_target_user_ids, '{}'), coalesce(p_target_group_ids, '{}'), p_scheduled_at, auth.uid())
  returning * into v_row;

  if v_row.scheduled_at is null or v_row.scheduled_at <= now() then
    perform public._system_notice_dispatch(v_row.id);
    select * into v_row from public.system_notices where id = v_row.id;
  end if;
  return v_row;
end $$;
grant execute on function public.admin_create_system_notice(text, text, text, text, text, uuid[], uuid[], timestamptz) to authenticated;

-- 관리자: 예약 대기 중인 공지 수정(발송 완료 후에는 수정 불가)
create or replace function public.admin_update_system_notice(
  p_id uuid, p_title text, p_body text, p_emoji text, p_emoji_bg text,
  p_target_type text, p_target_user_ids uuid[], p_target_group_ids uuid[], p_scheduled_at timestamptz
) returns public.system_notices language plpgsql security definer set search_path = public as $$
declare v_row public.system_notices;
begin
  if not public.is_admin(auth.uid()) then raise exception '관리자만 수정할 수 있습니다.'; end if;
  select * into v_row from public.system_notices where id = p_id for update;
  if v_row.id is null then raise exception '공지를 찾을 수 없습니다.'; end if;
  if v_row.sent_at is not null then raise exception '이미 발송된 공지는 수정할 수 없습니다.'; end if;
  if btrim(coalesce(p_title, '')) = '' or btrim(coalesce(p_body, '')) = '' then
    raise exception '제목과 본문을 입력해 주세요.';
  end if;
  if p_target_type not in ('all', 'premium', 'vvip', 'vip', 'users', 'groups') then
    raise exception '수신 대상이 올바르지 않습니다.';
  end if;

  update public.system_notices set
    title = btrim(p_title), body = btrim(p_body),
    emoji = nullif(btrim(coalesce(p_emoji, '')), ''), emoji_bg = nullif(btrim(coalesce(p_emoji_bg, '')), ''),
    target_type = p_target_type, target_user_ids = coalesce(p_target_user_ids, '{}'),
    target_group_ids = coalesce(p_target_group_ids, '{}'), scheduled_at = p_scheduled_at, updated_at = now()
  where id = p_id
  returning * into v_row;

  if v_row.scheduled_at is null or v_row.scheduled_at <= now() then
    perform public._system_notice_dispatch(v_row.id);
    select * into v_row from public.system_notices where id = v_row.id;
  end if;
  return v_row;
end $$;
grant execute on function public.admin_update_system_notice(uuid, text, text, text, text, text, uuid[], uuid[], timestamptz) to authenticated;

-- 예약 발송분 매분 체크
create or replace function public.dispatch_due_system_notices()
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in
    select id from public.system_notices
    where sent_at is null and scheduled_at is not null and scheduled_at <= now()
  loop
    perform public._system_notice_dispatch(r.id);
    n := n + 1;
  end loop;
  return n;
end $$;

create extension if not exists pg_cron;
do $$
begin
  perform cron.unschedule('nolging-system-notices');
exception when others then null;
end $$;
select cron.schedule('nolging-system-notices', '* * * * *', $$select public.dispatch_due_system_notices()$$);
