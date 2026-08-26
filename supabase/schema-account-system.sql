-- =============================================================
--  schema-account-system.sql — 계정/시스템 유지보수 통합
--
--  아래 6개 파일을 하나로 합친 것 (저장소 정리 작업의 일부로 생성):
--   · cleanup-deleted-accounts.sql  — 이미 "삭제"했지만 그룹에 남아 있는 계정 정리(1회성 운영 쿼리)
--   · cron-log-cleanup.sql          — pg_cron 실행 로그(cron.job_run_details) 자동 정리
--   · member-soft-leave.sql         — 탈퇴 시 콘텐츠 보존(소프트 탈퇴), 탈퇴자 제외 로직
--   · push-multi-account.sql        — 한 기기로 여러 계정 푸시 동시 수신
--   · system-notices.sql            — 관리자 시스템 공지(즉시/예약 발송) 푸시 알림
--   · user-delete-cleanup.sql       — 계정 삭제 시 그룹 소유권 이전 + 소프트 탈퇴 처리
--
--  push_subscriptions 테이블(브라우저 푸시 구독 저장소) 자체는 schema-v2.sql 에 있던 것을
--  2차 리포 정리로 이관(attach/detach RPC 가 이 파일에 있으니 테이블도 여기가 제자리).
--
--  적용 순서: supabase/schema.sql → supabase/schema-v2.sql → (다른 도메인 번들들) → 이 파일.
--  이 파일은 이미 운영 DB에 개별 파일들로 순차 적용되어 있으므로, 운영 DB에 다시 실행할
--  필요는 없습니다. 문서화 / 재해복구 / 새 환경(스테이징 등) 구축용으로 존재합니다.
--
--  외부 의존(다른 도메인 번들/스키마에 정의됨, 이 파일에서는 사용만 함):
--   is_admin(), is_couple_group(), is_friend_group(), grant_friend_ring_on_join(),
--   notif_render(), notif_member_name(), notif_noun(), _quest_grade_ok()
-- =============================================================


-- ═══════════════════════════════════════════════════════════
--  1. 테이블 (CREATE + ALTER, 시간순)
-- ═══════════════════════════════════════════════════════════

-- ── group_members: 소프트 탈퇴용 컬럼 (member-soft-leave.sql) ──────────────
-- 탈퇴해도 행은 남기고 left_at 만 기록 → 그 멤버가 쓴 위시/리뷰/댓글/쪽지는 삭제되지 않고,
-- 닉네임·프로필도 계속 표시됨. 재가입하면 left_at 해제.
alter table public.group_members add column if not exists left_at timestamptz;

-- ── push_subscriptions: 브라우저 푸시 구독 저장소 (schema-v2.sql 에서 이관) ────────
-- notifications INSERT → Database Webhook → Edge Function(send-push) 이 이 구독들로
-- 푸시를 전송한다. attach/detach RPC(아래 3.)는 이 테이블을 다룬다.
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_push_subscriptions_user on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;

drop policy if exists ps_select on public.push_subscriptions;
create policy ps_select on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());
drop policy if exists ps_insert on public.push_subscriptions;
create policy ps_insert on public.push_subscriptions
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists ps_update on public.push_subscriptions;
create policy ps_update on public.push_subscriptions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists ps_delete on public.push_subscriptions;
create policy ps_delete on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());

-- ── push_subscriptions: (user_id, endpoint) 복합 UNIQUE로 교체 (push-multi-account.sql) ──
-- 기존: endpoint 단독 UNIQUE → 계정 전환 시 이전 계정 구독이 삭제됨.
-- 변경: 같은 기기(endpoint)를 여러 계정이 각각 구독 가능하도록.
alter table public.push_subscriptions drop constraint if exists push_subscriptions_endpoint_key;
-- (이름이 다른 환경 방어) endpoint 한 컬럼짜리 unique 제약이 있으면 모두 제거
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.push_subscriptions'::regclass and contype = 'u'
      and array_length(conkey, 1) = 1
      and conkey[1] = (select attnum from pg_attribute
                        where attrelid = 'public.push_subscriptions'::regclass and attname = 'endpoint')
  loop execute format('alter table public.push_subscriptions drop constraint %I', c); end loop;
end $$;
alter table public.push_subscriptions
  add constraint push_subscriptions_user_endpoint_key unique (user_id, endpoint);
-- 조회 성능(같은 endpoint 정리 등)
create index if not exists idx_push_subscriptions_endpoint on public.push_subscriptions(endpoint);

-- ── notifications: 시스템 공지 전용 커스텀 아이콘 (system-notices.sql) ─────────
-- notif_templates 는 type 당 아이콘 하나뿐이라 재사용 불가 → 공지별 emoji 컬럼 추가.
-- 없으면 프런트에서 기본 아이콘(📢)으로 대체.
alter table public.notifications add column if not exists emoji text;
alter table public.notifications add column if not exists emoji_bg text;

-- ── system_notices: 시스템 공지 원본 (system-notices.sql) ──────────────────
-- 관리자가 제목/본문/아이콘을 입력해 특정 대상(전체/등급/회원/그룹)에게 즉시 또는 예약
-- 발송하는 푸시 알림. notifications 테이블 INSERT → 기존 웹훅(send-push)이 그대로 태워
-- 실제 푸시까지 나간다(megaphone_send/dispatch_due_reminders 와 동일 패턴).
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


-- ═══════════════════════════════════════════════════════════
--  2. 함수 (헬퍼 → 의존 함수 순)
-- ═══════════════════════════════════════════════════════════

-- ---------------------------------------------------------------
--  2-1. 소프트 탈퇴 (member-soft-leave.sql)
-- ---------------------------------------------------------------

-- 활성 멤버만 멤버로 인정 (탈퇴자 = left_at 있는 행 제외)
create or replace function public.is_group_member(gid uuid, uid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.group_members where group_id = gid and user_id = uid and left_at is null
  );
$$;

-- 소프트 탈퇴/내보내기: 행 유지 + left_at 기록. 남의 강제 퇴장은 소유자만.
create or replace function public.leave_group(p_group_id uuid, p_user_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_target uuid := coalesce(p_user_id, auth.uid()); v_owner uuid;
begin
  if v_target <> auth.uid() then
    select owner_id into v_owner from public.groups where id = p_group_id;
    if v_owner is distinct from auth.uid() then raise exception '내보낼 권한이 없어요.'; end if;
  end if;
  update public.group_members set left_at = now()
    where group_id = p_group_id and user_id = v_target and left_at is null;
end $$;

-- 재가입: 남아 있던 행 재활성화(left_at 해제)
create or replace function public.join_group(p_code text)
returns public.groups language plpgsql security definer set search_path = public as $$
declare g public.groups;
begin
  select * into g from public.groups where upper(invite_code) = upper(trim(p_code));
  if g.id is null then raise exception '유효하지 않은 초대 코드입니다.'; end if;
  if not public.is_group_member(g.id, auth.uid()) and public.is_couple_group(g.id) then
    raise exception '커플 그룹에는 입장할 수 없어요.';
  end if;
  insert into public.group_members(group_id, user_id, role)
    values (g.id, auth.uid(), 'member')
    on conflict (group_id, user_id) do update set left_at = null;
  perform public.grant_friend_ring_on_join(g.id);
  return g;
end;
$$;

create or replace function public.join_group_with_profile(
  p_code text, p_display_nickname text, p_avatar_url text,
  p_show_contact boolean, p_show_birthdate boolean, p_show_ott boolean
) returns public.groups language plpgsql security definer set search_path = public as $$
declare g public.groups;
begin
  select * into g from public.groups where upper(invite_code) = upper(trim(p_code));
  if g.id is null then raise exception '유효하지 않은 초대 코드입니다.'; end if;
  if not public.is_group_member(g.id, auth.uid()) and public.is_couple_group(g.id) then
    raise exception '커플 그룹에는 입장할 수 없어요.';
  end if;
  insert into public.group_members(group_id, user_id, role, display_nickname, avatar_url, show_contact, show_birthdate, show_ott)
    values (g.id, auth.uid(), 'member',
            nullif(trim(coalesce(p_display_nickname, '')), ''), nullif(p_avatar_url, ''),
            coalesce(p_show_contact, false), coalesce(p_show_birthdate, false), coalesce(p_show_ott, false))
  on conflict (group_id, user_id) do update
    set display_nickname = excluded.display_nickname,
        avatar_url       = excluded.avatar_url,
        show_contact     = excluded.show_contact,
        show_birthdate   = excluded.show_birthdate,
        show_ott         = excluded.show_ott,
        left_at          = null;
  perform public.grant_friend_ring_on_join(g.id);
  return g;
end;
$$;

-- 멤버 카드: 탈퇴자도 반환(is_left=true), 개인정보는 가림. 목록은 프런트에서 is_left 로 필터.
drop function if exists public.group_member_cards(uuid);
create or replace function public.group_member_cards(p_group_id uuid)
returns table (
  user_id uuid, login_id text, display_nickname text, avatar_url text, role text, is_self boolean,
  contact text, birthdate date, subscribed_ott text[], joined_at timestamptz, is_left boolean
) language plpgsql security definer stable set search_path = public as $$
declare g public.groups;
begin
  if not (public.is_group_member(p_group_id, auth.uid()) or public.is_admin(auth.uid())) then
    raise exception '그룹 멤버만 조회할 수 있습니다.';
  end if;
  select * into g from public.groups where id = p_group_id;
  return query
    select
      gm.user_id,
      case when gm.user_id = auth.uid() then p.nickname else null end,
      coalesce(nullif(gm.display_nickname, ''), '멤버'),
      gm.avatar_url,
      gm.role,
      (gm.user_id = auth.uid()),
      case when gm.left_at is null and g.show_contact   and gm.show_contact   then p.contact       else null end,
      case when gm.left_at is null and g.show_birthdate and gm.show_birthdate then p.birthdate     else null end,
      case when gm.left_at is null and g.show_ott       and gm.show_ott       then p.subscribed_ott else null end,
      gm.joined_at,
      (gm.left_at is not null)
    from public.group_members gm
    join public.profiles p on p.id = gm.user_id
    where gm.group_id = p_group_id
    order by (gm.left_at is not null), gm.joined_at asc;
end;
$$;

-- 받은 쪽지: sender_active(보낸 사람이 아직 그룹 멤버인지) 추가 → 답장 가능 여부 판단.
-- 기존 시그니처가 어떤 형태든(오버로드 포함) 모두 제거 후 재생성.
do $$
declare r record;
begin
  for r in select oid::regprocedure::text as sig from pg_proc
    where proname = 'list_received_notes' and pronamespace = 'public'::regnamespace
  loop execute 'drop function ' || r.sig; end loop;
end $$;
create function public.list_received_notes(p_limit integer default 15, p_offset integer default 0)
returns table(
  id uuid, group_id uuid, sender_id uuid, recipient_id uuid,
  sender_name text, recipient_name text, sender_avatar text, recipient_avatar text,
  body text, kind text, is_read boolean, created_at timestamptz,
  item_id text, item_name text, claimed boolean, rejected boolean, media_url text, anonymous boolean, qty integer,
  timer_seconds integer, opened_at timestamptz, sender_active boolean
) language sql security definer set search_path = public stable as $$
  select
    n.id, n.group_id,
    case when n.anonymous then null else n.sender_id end,
    n.recipient_id,
    case when n.anonymous then '익명' else n.sender_name end,
    n.recipient_name,
    case when n.anonymous then null else n.sender_avatar end,
    n.recipient_avatar,
    n.body, n.kind, n.is_read, n.created_at,
    n.item_id, n.item_name, n.claimed, n.rejected, n.media_url, n.anonymous, coalesce(n.qty, 1),
    n.timer_seconds, n.opened_at,
    public.is_group_member(n.group_id, n.sender_id)
  from public.notes n
  where n.recipient_id = auth.uid()
  order by n.created_at desc
  limit greatest(1, least(coalesce(p_limit, 15), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;

-- 커플 링: 멤버 2명 판정/발송 대상에서 탈퇴자 제외
create or replace function public.use_couple_ring(p_group_id uuid, p_recipient_id uuid, p_message text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.user_items; v_cnt int; v_sender text; v_recipient text; v_sav text; v_rav text; v_body text; v_note_id uuid; v_nt_t text; v_nt_b text;
begin
  select * into v_item from public.user_items
   where user_id = auth.uid() and item_id = 'couple-ring' and status = 'active'
   order by created_at asc limit 1;
  if v_item.id is null then raise exception '사용할 수 있는 커플 링이 없습니다.'; end if;
  if not public.is_group_member(p_group_id, auth.uid()) then raise exception '그룹 멤버만 사용할 수 있습니다.'; end if;
  select count(*) into v_cnt from public.group_members where group_id = p_group_id and left_at is null;
  if v_cnt <> 2 then raise exception '멤버가 2명인 그룹에서만 나눠 낄 수 있어요.'; end if;
  if p_recipient_id = auth.uid() or not public.is_group_member(p_group_id, p_recipient_id) then
    raise exception '상대를 찾을 수 없습니다.'; end if;
  if exists (select 1 from public.user_items
             where user_id = auth.uid() and item_id = 'couple-ring'
               and status in ('used', 'pending') and group_id = p_group_id) then
    raise exception '이미 이 그룹에 커플 링을 보냈거나 끼고 있어요.'; end if;
  update public.user_items set status = 'pending', group_id = p_group_id, used_at = null where id = v_item.id;
  v_sender    := coalesce(public.notif_member_name(p_group_id, auth.uid()), '');
  v_recipient := coalesce(public.notif_member_name(p_group_id, p_recipient_id), '');
  select avatar_url into v_sav from public.group_members where group_id = p_group_id and user_id = auth.uid();
  select avatar_url into v_rav from public.group_members where group_id = p_group_id and user_id = p_recipient_id;
  v_body := coalesce(nullif(btrim(p_message), ''), '커플 링을 함께 끼자고 보냈어요 💍');
  insert into public.notes(group_id, sender_id, recipient_id, sender_name, recipient_name, sender_avatar, recipient_avatar, body, kind, item_id, claimed, rejected)
    values (p_group_id, auth.uid(), p_recipient_id, v_sender, v_recipient, v_sav, v_rav, v_body, 'couple_ring', 'couple-ring', false, false)
    returning id into v_note_id;
  select nr.title, nr.body into v_nt_t, v_nt_b from public.notif_render('couple_ring', jsonb_build_object('actor', v_sender)) nr;
  insert into public.notifications(user_id, actor_id, type, title, body, group_id, note_id)
    values (p_recipient_id, auth.uid(), 'couple_ring',
            coalesce(v_nt_t, case when v_sender <> '' then v_sender || ' 님이 커플 링을 보냈어요' else '커플 링이 도착했어요' end),
            coalesce(v_nt_b, '쪽지함에서 확인하세요'), p_group_id, v_note_id);
end;
$$;

-- 우정 링: 멤버 수 판정/발송 대상에서 탈퇴자 제외
create or replace function public.use_friend_ring(p_group_id uuid, p_message text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.user_items; v_cnt int; v_sender text; v_sav text; v_body text;
        m record; v_rname text; v_rav text; v_note_id uuid; v_nt_t text; v_nt_b text;
begin
  select * into v_item from public.user_items
   where user_id = auth.uid() and item_id = 'friend-ring' and status = 'active'
   order by created_at asc limit 1;
  if v_item.id is null then raise exception '사용할 수 있는 우정 링이 없습니다.'; end if;
  if not public.is_group_member(p_group_id, auth.uid()) then raise exception '그룹 멤버만 사용할 수 있습니다.'; end if;
  select count(*) into v_cnt from public.group_members where group_id = p_group_id and left_at is null;
  if v_cnt < 2 then raise exception '멤버가 2명 이상인 그룹에서만 사용할 수 있어요.'; end if;
  if public.is_friend_group(p_group_id) then raise exception '이미 우정 링이 적용된 그룹이에요.'; end if;
  update public.user_items set status = 'used', group_id = p_group_id, used_at = now() where id = v_item.id;
  v_sender := coalesce(public.notif_member_name(p_group_id, auth.uid()), '');
  select avatar_url into v_sav from public.group_members where group_id = p_group_id and user_id = auth.uid();
  v_body := coalesce(nullif(btrim(p_message), ''), '우정 링을 함께 끼자고 보냈어요 🤝');
  select nr.title, nr.body into v_nt_t, v_nt_b from public.notif_render('friend_ring', jsonb_build_object('actor', v_sender)) nr;
  for m in select user_id from public.group_members where group_id = p_group_id and user_id <> auth.uid() and left_at is null
  loop
    v_rname := coalesce(public.notif_member_name(p_group_id, m.user_id), '');
    select avatar_url into v_rav from public.group_members where group_id = p_group_id and user_id = m.user_id;
    insert into public.notes(group_id, sender_id, recipient_id, sender_name, recipient_name, sender_avatar, recipient_avatar, body, kind, item_id, claimed, rejected)
      values (p_group_id, auth.uid(), m.user_id, v_sender, v_rname, v_sav, v_rav, v_body, 'friend_ring', 'friend-ring', false, false)
      returning id into v_note_id;
    insert into public.notifications(user_id, actor_id, type, title, body, group_id, note_id)
      values (m.user_id, auth.uid(), 'friend_ring',
              coalesce(v_nt_t, case when v_sender <> '' then v_sender || ' 님이 우정 링을 보냈어요' else '우정 링이 도착했어요' end),
              coalesce(v_nt_b, '쪽지함에서 확인하세요 🤝'), p_group_id, v_note_id);
  end loop;
end;
$$;

-- 새 항목 알림: 탈퇴자에게는 발송 안 함
create or replace function public.tg_notify_task_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_group public.groups; v_noun text; v_t text; v_b text;
begin
  if coalesce(current_setting('nolging.silent_task', true), '') = 'on' then return NEW; end if;
  select * into v_group from public.groups where id = NEW.group_id;
  v_noun := public.notif_noun(v_group.group_type);
  select r.title, r.body into v_t, v_b from public.notif_render('new_task', jsonb_build_object('noun', v_noun, 'title', NEW.title)) r;
  insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id)
  select gm.user_id, NEW.created_by, 'new_task',
         coalesce(v_t, '새 ' || v_noun || '가 있어요'),
         coalesce(v_b, NEW.title),
         NEW.group_id, NEW.id
  from public.group_members gm
  where gm.group_id = NEW.group_id and gm.user_id <> NEW.created_by and gm.left_at is null;
  return NEW;
end $$;
drop trigger if exists trg_notify_task_insert on public.tasks;
create trigger trg_notify_task_insert after insert on public.tasks
  for each row execute function public.tg_notify_task_insert();

-- 새 멤버 알림: 탈퇴자에게는 발송 안 함
create or replace function public.tg_notify_member_join()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text; v_t text; v_b text;
begin
  v_name := coalesce(nullif(trim(NEW.display_nickname), ''), '새 멤버');
  select r.title, r.body into v_t, v_b from public.notif_render('new_member', jsonb_build_object('name', v_name)) r;
  insert into public.notifications(user_id, actor_id, type, title, body, group_id)
  select gm.user_id, NEW.user_id, 'new_member',
         coalesce(v_t, '새 멤버가 가입했어요'),
         coalesce(v_b, v_name || ' 님 입장!'),
         NEW.group_id
  from public.group_members gm
  where gm.group_id = NEW.group_id and gm.user_id <> NEW.user_id and gm.left_at is null;
  return NEW;
end $$;
drop trigger if exists trg_notify_member_join on public.group_members;
create trigger trg_notify_member_join after insert on public.group_members
  for each row execute function public.tg_notify_member_join();

-- ---------------------------------------------------------------
--  2-2. 멀티 계정 푸시 (push-multi-account.sql)
-- ---------------------------------------------------------------

-- attach: 현재 사용자 구독만 upsert. 다른 계정의 같은 기기 구독은 건드리지 않는다.
create or replace function public.attach_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  insert into public.push_subscriptions(user_id, endpoint, p256dh, auth)
    values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (user_id, endpoint) do update
    set p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;

-- detach: 로그아웃/끄기 시 현재 사용자의 이 기기 구독만 제거(다른 계정 구독은 유지).
create or replace function public.detach_push_subscription(p_endpoint text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------
--  2-3. pg_cron 실행 로그 정리 (cron-log-cleanup.sql)
-- ---------------------------------------------------------------

-- nolging-reminders(매분)/nolging-system-notices(매분) 등 매분 도는 cron job이 실행될 때마다
-- cron.job_run_details 에 로그 한 줄씩 쌓인다. 서비스 데이터가 아니라 순수 실행 기록이라,
-- 오래된 건 지워도 아무 영향 없다. 지우지 않으면 DB 용량(500MB 한도)을 이 로그가 가장 많이
-- 잡아먹는다.
create or replace function public.cleanup_cron_logs()
returns void language sql security definer set search_path = public as $$
  delete from cron.job_run_details where end_time < now() - interval '7 days';
$$;

-- ---------------------------------------------------------------
--  2-4. 계정 삭제 시 그룹/쪽지 정리 (user-delete-cleanup.sql)
-- ---------------------------------------------------------------

-- 요구사항:
--  1) 계정이 삭제되면 가입돼 있던 모든 그룹에서 자동 탈퇴
--  2) 그룹 소유자였다면 '다음 가입자(최초 가입 순)'에게 소유권 이전, 남은 멤버가 없으면 그룹 삭제
--  3) 이미 주고받은 쪽지에서도 답장 불가 → 탈퇴하면 is_group_member 가 false 라 모든 쪽지 RPC
--     (send_note, use_cassette/link/video/bluray, send_note_with_gifts, *_ring 등)가 자동 차단.
--  4) 탈퇴해도 그 사람이 쓴 위시/댓글/리뷰의 '닉네임·프로필 사진'은 계속 표시(하드 삭제 금지).
--
-- 주의: groups.owner_id 는 profiles(id) ON DELETE CASCADE 라, 소유자 프로필을 그냥 지우면
--       그룹 전체가 사라진다. 그래서 프로필/계정 삭제 '전에' 이 함수로 소유권을 먼저 이전한다.
--
-- 호출: Edge Function admin-create-user(action:'delete')에서 프로필/계정 삭제 직전에 호출.
--       관리자 검증은 Edge Function 이 수행하고, 이 함수는 service_role 로만 실행 가능.
create or replace function public.admin_purge_user_memberships(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare g record; v_next uuid;
begin
  if p_user is null then return; end if;

  -- 1) 이 사용자가 소유한 그룹: 다음 '활성' 가입자에게 소유권 이전(없으면 그룹 삭제)
  for g in select id from public.groups where owner_id = p_user loop
    select gm.user_id into v_next
      from public.group_members gm
      where gm.group_id = g.id and gm.user_id <> p_user and gm.left_at is null
      order by gm.joined_at asc, gm.user_id asc   -- 가장 먼저 가입한 다른 활성 멤버
      limit 1;
    if v_next is null then
      delete from public.groups where id = g.id;  -- 남은 활성 멤버 없음 → 그룹 삭제
    else
      update public.groups set owner_id = v_next where id = g.id;
      update public.group_members set role = 'owner' where group_id = g.id and user_id = v_next;
    end if;
  end loop;

  -- 2) 소프트 탈퇴: 행은 남기고 left_at 만 기록 → 쪽지/목록/권한에선 빠지되,
  --    작성한 글·댓글의 닉네임·프로필은 group_member_cards 로 계속 표시된다.
  update public.group_members set left_at = now()
    where user_id = p_user and left_at is null;
end $$;

-- ---------------------------------------------------------------
--  2-5. 시스템 공지 (system-notices.sql)
-- ---------------------------------------------------------------

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


-- ═══════════════════════════════════════════════════════════
--  3. pg_cron 스케줄
-- ═══════════════════════════════════════════════════════════

create extension if not exists pg_cron;

-- 매일 새벽 3시, 7일 지난 pg_cron 실행 로그 정리(이미 있으면 교체)
do $$
begin
  perform cron.unschedule('nolging-cleanup-cron-logs');
exception when others then null;
end $$;
select cron.schedule('nolging-cleanup-cron-logs', '0 3 * * *', $$select public.cleanup_cron_logs()$$);

-- 예약 발송 대기 중인 시스템 공지를 매분 체크(이미 있으면 교체)
do $$
begin
  perform cron.unschedule('nolging-system-notices');
exception when others then null;
end $$;
select cron.schedule('nolging-system-notices', '* * * * *', $$select public.dispatch_due_system_notices()$$);


-- ═══════════════════════════════════════════════════════════
--  4. 권한(GRANT/REVOKE)
-- ═══════════════════════════════════════════════════════════

grant execute on function public.leave_group(uuid, uuid) to authenticated;
grant execute on function public.join_group(text) to authenticated;
grant execute on function public.join_group_with_profile(text, text, text, boolean, boolean, boolean) to authenticated;
grant execute on function public.group_member_cards(uuid) to authenticated;
grant execute on function public.list_received_notes(integer, integer) to authenticated;
grant execute on function public.use_couple_ring(uuid, uuid, text) to authenticated;
grant execute on function public.use_friend_ring(uuid, text) to authenticated;

grant execute on function public.attach_push_subscription(text, text, text) to authenticated;
grant execute on function public.detach_push_subscription(text) to authenticated;

-- admin_purge_user_memberships 는 Edge Function(service_role)에서만 호출. 클라이언트 직접 호출 차단.
revoke all on function public.admin_purge_user_memberships(uuid) from public;
revoke all on function public.admin_purge_user_memberships(uuid) from authenticated;
grant execute on function public.admin_purge_user_memberships(uuid) to service_role;

grant execute on function public.admin_list_system_notices() to authenticated;
grant execute on function public.admin_create_system_notice(text, text, text, text, text, uuid[], uuid[], timestamptz) to authenticated;
grant execute on function public.admin_update_system_notice(uuid, text, text, text, text, text, uuid[], uuid[], timestamptz) to authenticated;

notify pgrst, 'reload schema';


-- ═══════════════════════════════════════════════════════════
--  부록: 계정 정리 운영 스크립트 (원본: cleanup-deleted-accounts.sql)
-- ═══════════════════════════════════════════════════════════
--
-- 이미 "삭제"했지만 그룹에 그대로 남아 있는 계정 정리(1회성 운영 쿼리, 자동 실행 아님).
--
--  배경: 구버전 삭제는 프로필/계정 행만 지우려다 콘텐츠 FK(tasks.created_by 등 RESTRICT)로
--        조용히 실패해서, 계정이 그룹 멤버·쪽지 수신자로 그대로 남아 있었음(삭제됐다는 표시가
--        DB에 따로 없으므로, 아래 [1]에서 닉네임으로 대상 계정을 직접 확인해 [2]에서 정리한다).
--
--  전제: 위 섹션의 admin_purge_user_memberships() 가 먼저 적용돼 있어야 함.
--        (SQL Editor 는 관리자 권한으로 실행되므로 함수 호출 가능)
--
--  효과(콘텐츠·닉네임·프로필 보존):
--   · 소유 그룹은 '다음 가입자(최초 가입 순)'에게 소유권 이전(없으면 그룹 삭제)
--   · 모든 그룹에서 '소프트 탈퇴'(left_at 기록) → 목록/권한/쪽지에서 빠지되, 작성한 위시/댓글/
--     리뷰의 닉네임·프로필 사진은 계속 표시됨(group_member_cards 가 탈퇴자도 반환)
--   · status='disabled' 로 로그인 차단(작성했던 위시/댓글/쪽지 내용도 그대로 남음)

-- ── [1] 대상 확인: 현재 그룹에 속한 멤버 목록(닉네임/역할/소속 그룹) ─────────────
--    여기서 '삭제하려던' 계정의 nickname 을 확인한다.
-- select p.id as user_id, p.nickname, p.role, p.status,
--        count(*)                                   as group_count,
--        string_agg(g.name, ', ' order by g.name)   as groups
-- from public.group_members gm
-- join public.groups g        on g.id = gm.group_id
-- left join public.profiles p on p.id = gm.user_id
-- group by p.id, p.nickname, p.role, p.status
-- order by p.nickname;

-- ── [2] 정리 실행: 정리할 아이디(nickname)들을 배열에 넣고 한 번에 처리 ──────────
--    ↓ 'delete-me1','delete-me2' 자리에 실제 정리할 계정 아이디를 나열해서 실행.
-- do $$
-- declare u uuid;
-- begin
--   for u in
--     select id from public.profiles
--     where nickname = any (array[
--       'delete-me1', 'delete-me2'     -- ← 정리할 계정 아이디(닉네임)로 교체
--     ])
--   loop
--     perform public.admin_purge_user_memberships(u);      -- 그룹 탈퇴 + 소유권 이전
--     update public.profiles set status = 'disabled' where id = u;  -- 로그인 차단(콘텐츠 보존)
--   end loop;
-- end $$;

-- ── [3] 확인: [1] 을 다시 실행해 해당 계정들이 그룹 목록에서 빠졌는지 확인 ────────
