-- =============================================================
--  Nolging · 마이그레이션 v2
--  (연락처/생년월일, 가입요청 확장, 그룹 설정, 그룹내 멤버 설정, 프라이버시)
--  Supabase SQL Editor 에 붙여넣어 한 번 실행하세요. (기존 schema.sql 적용 이후)
-- =============================================================

-- ---- profiles: 연락처 / 생년월일 / 구독 OTT / pending 상태 -----
alter table public.profiles add column if not exists contact   text;
alter table public.profiles add column if not exists birthdate date;
alter table public.profiles add column if not exists subscribed_ott text[] not null default '{}';

alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles add  constraint profiles_status_check
  check (status in ('active','disabled','pending'));

-- ---- groups: 유형 / 테마 / 공개 여부 -------------------------
alter table public.groups add column if not exists group_type    text not null default 'nolging';
alter table public.groups add column if not exists theme         text not null default 'default';
alter table public.groups add column if not exists show_contact  boolean not null default false;
alter table public.groups add column if not exists show_birthdate boolean not null default false;
alter table public.groups add column if not exists show_ott       boolean not null default false;

alter table public.groups drop constraint if exists groups_type_check;
alter table public.groups add  constraint groups_type_check
  check (group_type in ('nolging','ilhaging'));

-- 테마: 기본(default)/사랑(couple)/우정(friend). 과거 solo/together → default 로 이관.
alter table public.groups drop constraint if exists groups_theme_check;
update public.groups set theme = 'default' where theme in ('solo', 'together');
alter table public.groups alter column theme set default 'default';
alter table public.groups add  constraint groups_theme_check
  check (theme in ('default', 'couple', 'friend'));

-- ---- group_members: 그룹내 닉네임 / 프로필사진 / 공개 토글 ----
alter table public.group_members add column if not exists display_nickname text;
alter table public.group_members add column if not exists avatar_url       text;  -- data URI (정방형 → 원형 표시)
alter table public.group_members add column if not exists show_contact     boolean not null default false;
alter table public.group_members add column if not exists show_birthdate   boolean not null default false;
alter table public.group_members add column if not exists show_ott         boolean not null default false;

-- 멤버가 자신의 그룹내 설정을 수정할 수 있도록 update 정책 추가
drop policy if exists gm_update on public.group_members;
create policy gm_update on public.group_members
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 그룹 생성 시 RETURNING 표현식이 groups_select(USING) 로도 평가되는데,
-- is_group_member() 는 STABLE 이라 같은 문장 내 트리거가 추가한 소유자 멤버십을 못 봄.
-- → 소유자 본인은 직접 predicate 로 즉시 조회 가능하도록 보강 (비관리자 그룹 생성 버그 수정)
drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups
  for select to authenticated
  using (
    owner_id = auth.uid()
    or public.is_group_member(id, auth.uid())
    or public.is_admin(auth.uid())
  );

-- ---- 프라이버시: 연락처/생년월일 컬럼은 일반 조회에서 숨김 ----
-- (닉네임/역할/상태 등은 그대로 조회 가능, 민감정보는 RPC 로만 조건부 노출)
revoke select on public.profiles from anon, authenticated;
grant  select (id, nickname, role, status, created_at) on public.profiles to anon, authenticated;

-- ---- RPC: 내 프로필 조회/수정 (민감정보 포함, 본인만) --------
create or replace function public.my_profile()
returns public.profiles language sql security definer stable set search_path = public as $$
  select * from public.profiles where id = auth.uid();
$$;
grant execute on function public.my_profile() to authenticated;

drop function if exists public.update_my_profile(text, date);
create or replace function public.update_my_profile(p_contact text, p_birthdate date, p_ott text[])
returns public.profiles language plpgsql security definer set search_path = public as $$
declare r public.profiles;
begin
  update public.profiles
     set contact = p_contact, birthdate = p_birthdate,
         subscribed_ott = coalesce(p_ott, '{}')
   where id = auth.uid()
  returning * into r;
  return r;
end;
$$;
grant execute on function public.update_my_profile(text, date, text[]) to authenticated;

-- ---- RPC: 그룹 멤버 카드 (프라이버시 규칙 적용) --------------
-- 그룹 설정 공개여부 AND 멤버 개인 공개여부가 모두 Y 일 때만 연락처/생년월일 노출.
-- (본인 정보라도 공개로 설정한 것만 노출 — 목록/상세 표시를 실제 공개 상태와 일치)
drop function if exists public.group_member_cards(uuid);
create or replace function public.group_member_cards(p_group_id uuid)
returns table (
  user_id uuid,
  login_id text,          -- 계정 아이디(닉네임 컬럼) = 폴백용
  display_nickname text,
  avatar_url text,
  role text,
  is_self boolean,
  contact text,
  birthdate date,
  subscribed_ott text[],
  joined_at timestamptz
) language plpgsql security definer stable set search_path = public as $$
declare g public.groups;
begin
  if not public.is_group_member(p_group_id, auth.uid()) then
    raise exception '그룹 멤버만 조회할 수 있습니다.';
  end if;
  select * into g from public.groups where id = p_group_id;

  return query
    select
      gm.user_id,
      p.nickname,
      coalesce(nullif(gm.display_nickname, ''), p.nickname),
      gm.avatar_url,
      gm.role,
      (gm.user_id = auth.uid()),
      case when (g.show_contact and gm.show_contact) then p.contact else null end,
      case when (g.show_birthdate and gm.show_birthdate) then p.birthdate else null end,
      case when (g.show_ott and gm.show_ott) then p.subscribed_ott else null end,
      gm.joined_at
    from public.group_members gm
    join public.profiles p on p.id = gm.user_id
    where gm.group_id = p_group_id
    order by gm.joined_at asc;
end;
$$;
grant execute on function public.group_member_cards(uuid) to authenticated;

-- ---- 관리자: 사용자 상태/역할 조회용 RPC (민감정보 포함) -----
-- 관리자 화면에서 연락처/생년월일까지 보기 위함
create or replace function public.admin_list_users()
returns setof public.profiles language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception '관리자만 조회할 수 있습니다.';
  end if;
  return query select * from public.profiles order by
    case status when 'pending' then 0 else 1 end, created_at desc;
end;
$$;
grant execute on function public.admin_list_users() to authenticated;

-- ---- RPC: 초대코드로 그룹 미리보기 (가입 전, 비멤버 조회) ------
-- 가입 전 그룹명/소유자/공개설정을 보여주기 위함. 가입은 시키지 않음.
drop function if exists public.preview_group(text);
create or replace function public.preview_group(p_code text)
returns table (
  id uuid,
  name text,
  description text,
  group_type text,
  theme text,
  owner_nickname text,
  show_contact boolean,
  show_birthdate boolean,
  show_ott boolean,
  already_member boolean
) language sql security definer stable set search_path = public as $$
  select g.id, g.name, g.description, g.group_type, g.theme,
         p.nickname as owner_nickname,
         g.show_contact, g.show_birthdate, g.show_ott,
         public.is_group_member(g.id, auth.uid()) as already_member
  from public.groups g
  join public.profiles p on p.id = g.owner_id
  where upper(g.invite_code) = upper(trim(p_code));
$$;
grant execute on function public.preview_group(text) to authenticated;

-- ---- tasks: 위시리스트(놀깅) 유형 -----------------------------
-- OTT/독서/영화/게임/운동/기타 등. 일반 태스크는 null.
alter table public.tasks add column if not exists category text;
-- 영화/OTT 위시의 TMDB 정보(OTT 제공처/장르/러닝타임/부작수 등). movie-lookup 함수가 채움.
alter table public.tasks add column if not exists media_info jsonb;

-- ---- task_comments: 태스크별 댓글 -----------------------------
create table if not exists public.task_comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks(id)  on delete cascade,
  group_id   uuid not null references public.groups(id) on delete cascade,
  author_id  uuid not null references public.profiles(id),
  body       text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_task_comments_task on public.task_comments(task_id);
alter table public.task_comments enable row level security;

-- ---- task_comments: 스레드형 답글 (parent_id) ------------------
-- 최상위 댓글은 parent_id null, 답글은 부모 댓글 id 참조. 부모 삭제 시 답글도 삭제.
alter table public.task_comments
  add column if not exists parent_id uuid references public.task_comments(id) on delete cascade;
create index if not exists idx_task_comments_parent on public.task_comments(parent_id);

drop policy if exists tc_select on public.task_comments;
create policy tc_select on public.task_comments
  for select to authenticated
  using (public.is_group_member(group_id, auth.uid()) or public.is_admin(auth.uid()));

drop policy if exists tc_insert on public.task_comments;
create policy tc_insert on public.task_comments
  for insert to authenticated
  with check (public.is_group_member(group_id, auth.uid()) and author_id = auth.uid());

drop policy if exists tc_update on public.task_comments;
create policy tc_update on public.task_comments
  for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

drop policy if exists tc_delete on public.task_comments;
create policy tc_delete on public.task_comments
  for delete to authenticated
  using (
    author_id = auth.uid()
    or public.is_group_owner(group_id, auth.uid())
    or public.is_admin(auth.uid())
  );

-- =============================================================
--  알림 (notifications)
--  아래 5가지 이벤트에서 DB 트리거로 알림을 생성한다.
--   1) 내 댓글에 답글        2) 내 태스크에 댓글
--   3) 새 태스크(작성자 제외) 4) 새 멤버 가입
--   5) 놀기 신청(수락)
-- =============================================================

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id)      on delete cascade, -- 수신자
  actor_id   uuid references public.profiles(id)               on delete set null, -- 행위자
  type       text not null,   -- reply | task_comment | new_task | new_member | accept
  title      text not null,
  body       text,
  group_id   uuid references public.groups(id)                 on delete cascade,
  task_id    uuid references public.tasks(id)                  on delete cascade,
  comment_id uuid references public.task_comments(id)          on delete cascade,
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_user
  on public.notifications(user_id, is_read, created_at desc);
alter table public.notifications enable row level security;

-- 본인 알림만 조회/읽음처리/삭제 가능. INSERT 는 아래 트리거(정의자 권한)만 수행.
drop policy if exists notif_select on public.notifications;
create policy notif_select on public.notifications
  for select to authenticated using (user_id = auth.uid());
drop policy if exists notif_update on public.notifications;
create policy notif_update on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists notif_delete on public.notifications;
create policy notif_delete on public.notifications
  for delete to authenticated using (user_id = auth.uid());

-- ---- 헬퍼: 유형별 명칭 / 수락 용어 / 그룹내 표시 닉네임 --------
create or replace function public.notif_noun(p_type text)
returns text language sql immutable as $$
  select case when p_type = 'ilhaging' then '태스크' else '위시' end;
$$;

create or replace function public.notif_accept_term(p_type text)
returns text language sql immutable as $$
  select case when p_type = 'ilhaging' then '일정 추가' else '놀기 신청' end;
$$;

create or replace function public.notif_member_name(p_group_id uuid, p_user_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(gm.display_nickname, ''), p.nickname)
  from public.group_members gm
  join public.profiles p on p.id = gm.user_id
  where gm.group_id = p_group_id and gm.user_id = p_user_id
  limit 1;
$$;

-- ---- 트리거 1·2: 댓글/답글 --------------------------------------
create or replace function public.tg_notify_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_group  public.groups;
  v_task   public.tasks;
  v_actor  text;
  v_parent uuid;
begin
  select * into v_task  from public.tasks  where id = NEW.task_id;
  select * into v_group from public.groups where id = NEW.group_id;
  v_actor := public.notif_member_name(NEW.group_id, NEW.author_id);

  if NEW.parent_id is not null then
    -- (1) 답글: 부모 댓글 작성자에게
    select author_id into v_parent from public.task_comments where id = NEW.parent_id;
    if v_parent is not null and v_parent <> NEW.author_id then
      insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id, comment_id)
      values (v_parent, NEW.author_id, 'reply',
              '내 댓글에 답글이 달렸어요',
              v_actor || ': ' || NEW.body,
              NEW.group_id, NEW.task_id, NEW.id);
    end if;
    -- (2) 대댓글이어도 위시 작성자에게 알림. 단, 부모 댓글 작성자와 같으면 (1)만 보냄
    if v_task.created_by is not null
       and v_task.created_by <> NEW.author_id
       and v_task.created_by is distinct from v_parent then
      insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id, comment_id)
      values (v_task.created_by, NEW.author_id, 'task_comment',
              '내 ' || public.notif_noun(v_group.group_type) || '에 댓글이 달렸어요',
              v_actor || ': ' || NEW.body,
              NEW.group_id, NEW.task_id, NEW.id);
    end if;
  else
    -- (2) 최상위 댓글: 위시 작성자에게
    if v_task.created_by is not null and v_task.created_by <> NEW.author_id then
      insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id, comment_id)
      values (v_task.created_by, NEW.author_id, 'task_comment',
              '내 ' || public.notif_noun(v_group.group_type) || '에 댓글이 달렸어요',
              v_actor || ': ' || NEW.body,
              NEW.group_id, NEW.task_id, NEW.id);
    end if;
  end if;
  return NEW;
end;
$$;
drop trigger if exists trg_notify_comment on public.task_comments;
create trigger trg_notify_comment after insert on public.task_comments
  for each row execute function public.tg_notify_comment();

-- ---- 트리거 3: 새 태스크(작성자 제외 그룹원 전체) ---------------
create or replace function public.tg_notify_task_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_group public.groups; v_noun text;
begin
  select * into v_group from public.groups where id = NEW.group_id;
  v_noun := public.notif_noun(v_group.group_type);
  insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id)
  select gm.user_id, NEW.created_by, 'new_task',
         '새 ' || v_noun || '가 있어요',
         NEW.title,
         NEW.group_id, NEW.id
  from public.group_members gm
  where gm.group_id = NEW.group_id and gm.user_id <> NEW.created_by;
  return NEW;
end;
$$;
drop trigger if exists trg_notify_task_insert on public.tasks;
create trigger trg_notify_task_insert after insert on public.tasks
  for each row execute function public.tg_notify_task_insert();

-- ---- 트리거 4: 새 멤버 가입(기존 멤버에게) ----------------------
create or replace function public.tg_notify_member_join()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_group public.groups; v_name text;
begin
  select * into v_group from public.groups where id = NEW.group_id;
  select coalesce(nullif(NEW.display_nickname, ''), p.nickname) into v_name
    from public.profiles p where p.id = NEW.user_id;
  insert into public.notifications(user_id, actor_id, type, title, body, group_id)
  select gm.user_id, NEW.user_id, 'new_member',
         '[' || v_group.name || ']에 ' || v_name || ' 님이 가입했어요',
         null,
         NEW.group_id
  from public.group_members gm
  where gm.group_id = NEW.group_id and gm.user_id <> NEW.user_id;
  return NEW;
end;
$$;
drop trigger if exists trg_notify_member_join on public.group_members;
create trigger trg_notify_member_join after insert on public.group_members
  for each row execute function public.tg_notify_member_join();

-- ---- 트리거 5: (폐기) 놀기 신청 알림은 참여자 확정 후 schedule_task 안에서 발송 ----
-- 트리거는 status 변경 시점에 실행되어 참여자(task_participants)가 아직 없으므로,
-- 참여자에게만 보내려면 참여자 INSERT 이후인 schedule_task 내부에서 발송해야 한다.
drop trigger if exists trg_notify_task_accept on public.tasks;
drop function if exists public.tg_notify_task_accept();

-- =============================================================
--  웹 푸시 (휴대폰 알림센터)
--  브라우저 푸시 구독 저장소. notifications INSERT → Database Webhook
--  → Edge Function(send-push) 가 이 구독들로 푸시를 전송한다.
-- =============================================================
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_push_subscriptions_user on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;

-- 본인 구독만 관리 (Edge Function 은 service_role 로 RLS 우회하여 전체 조회)
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

-- ---- 알림 카테고리별 푸시 설정 (OFF 여도 알림 행은 생성, 푸시만 생략) ----
create table if not exists public.notification_prefs (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  new_member boolean not null default true,
  new_task   boolean not null default true,
  accept     boolean not null default true,
  comment    boolean not null default true,  -- task_comment + reply
  reminder   boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.notification_prefs enable row level security;

-- 본인 설정만 관리 (Edge Function 은 service_role 로 RLS 우회하여 조회)
drop policy if exists np_select on public.notification_prefs;
create policy np_select on public.notification_prefs
  for select to authenticated using (user_id = auth.uid());
drop policy if exists np_insert on public.notification_prefs;
create policy np_insert on public.notification_prefs
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists np_update on public.notification_prefs;
create policy np_update on public.notification_prefs
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =============================================================
--  약속 잡기 (놀깅: 놀기 신청 → 날짜/시간/반복/참여멤버)
-- =============================================================
alter table public.tasks add column if not exists scheduled_at timestamptz;
alter table public.tasks add column if not exists repeat_rule  text;

-- 약속 참여 멤버
create table if not exists public.task_participants (
  task_id    uuid not null references public.tasks(id)     on delete cascade,
  user_id    uuid not null references public.profiles(id)  on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);
alter table public.task_participants enable row level security;

-- 그룹 멤버는 참여자 목록 조회 가능 (쓰기는 아래 RPC 로만)
drop policy if exists tp_select on public.task_participants;
create policy tp_select on public.task_participants
  for select to authenticated
  using (
    public.is_group_member((select group_id from public.tasks where id = task_id), auth.uid())
    or public.is_admin(auth.uid())
  );

-- ---- RPC: 약속 잡기 (놀기 신청 확정) --------------------------
-- 상태를 accepted 로 바꾸고(=놀기 신청 알림 트리거 발동), 일정/반복/참여자를 저장.
create or replace function public.schedule_task(
  p_task_id uuid,
  p_scheduled_at timestamptz,
  p_repeat text,
  p_participants uuid[]
)
returns public.tasks language plpgsql security definer set search_path = public as $$
declare r public.tasks; v_gid uuid;
begin
  select group_id into v_gid from public.tasks where id = p_task_id;
  if v_gid is null then raise exception '존재하지 않는 항목입니다.'; end if;
  if not public.is_group_member(v_gid, auth.uid()) then
    raise exception '그룹 멤버만 신청할 수 있습니다.';
  end if;

  update public.tasks
     set status = 'accepted', assignee_id = auth.uid(), accepted_at = now(),
         scheduled_at = p_scheduled_at, repeat_rule = p_repeat
   where id = p_task_id and status = 'open'
  returning * into r;
  if r.id is null then
    raise exception '이미 신청되었거나 열려 있지 않은 항목입니다.';
  end if;

  delete from public.task_participants where task_id = p_task_id;
  insert into public.task_participants(task_id, user_id)
    select p_task_id, x
    from unnest(coalesce(p_participants, array[]::uuid[])) as x
    where public.is_group_member(v_gid, x)
    on conflict do nothing;

  return r;
end;
$$;
grant execute on function public.schedule_task(uuid, timestamptz, text, uuid[]) to authenticated;

-- 약속 변경(재조정): 이미 accepted 인 약속의 일정/반복/참여자만 갱신
create or replace function public.reschedule_task(
  p_task_id uuid,
  p_scheduled_at timestamptz,
  p_repeat text,
  p_participants uuid[]
)
returns public.tasks language plpgsql security definer set search_path = public as $$
declare r public.tasks; v_gid uuid;
begin
  select group_id into v_gid from public.tasks where id = p_task_id;
  if v_gid is null then raise exception '존재하지 않는 항목입니다.'; end if;
  if not public.is_group_member(v_gid, auth.uid()) then
    raise exception '그룹 멤버만 수정할 수 있습니다.';
  end if;

  update public.tasks
     set scheduled_at = p_scheduled_at, repeat_rule = p_repeat
   where id = p_task_id
  returning * into r;

  delete from public.task_participants where task_id = p_task_id;
  insert into public.task_participants(task_id, user_id)
    select p_task_id, x
    from unnest(coalesce(p_participants, array[]::uuid[])) as x
    where public.is_group_member(v_gid, x)
    on conflict do nothing;

  return r;
end;
$$;
grant execute on function public.reschedule_task(uuid, timestamptz, text, uuid[]) to authenticated;

-- =============================================================
--  약속 v2: 날짜/시간 on-off, 반복 종료, 마감 예정 미리 알림
-- =============================================================
alter table public.tasks add column if not exists scheduled_time_set boolean not null default true;
alter table public.tasks add column if not exists repeat_until date;
alter table public.tasks add column if not exists remind_min int;         -- 분(약속 시간 기준 전), null=없음, 0=정시
alter table public.tasks add column if not exists remind_at  timestamptz; -- 계산된 알림 시각
alter table public.tasks add column if not exists reminded   boolean not null default false;

-- 기존 4-인자 RPC 는 신규 7-인자 버전으로 교체
drop function if exists public.schedule_task(uuid, timestamptz, text, uuid[]);
drop function if exists public.reschedule_task(uuid, timestamptz, text, uuid[]);

create or replace function public.schedule_task(
  p_task_id uuid, p_scheduled_at timestamptz, p_time_set boolean,
  p_repeat text, p_repeat_until date, p_remind int, p_participants uuid[]
) returns public.tasks language plpgsql security definer set search_path = public as $$
declare r public.tasks; v_gid uuid; v_remind_at timestamptz;
begin
  select group_id into v_gid from public.tasks where id = p_task_id;
  if v_gid is null then raise exception '존재하지 않는 항목입니다.'; end if;
  if not public.is_group_member(v_gid, auth.uid()) then
    raise exception '그룹 멤버만 신청할 수 있습니다.'; end if;
  if p_remind is not null and p_scheduled_at is not null then
    v_remind_at := p_scheduled_at - make_interval(mins => p_remind);
  end if;
  update public.tasks
     set status='accepted', assignee_id=auth.uid(), accepted_at=now(),
         scheduled_at=p_scheduled_at, scheduled_time_set=coalesce(p_time_set, true),
         repeat_rule=p_repeat, repeat_until=p_repeat_until,
         remind_min=p_remind, remind_at=v_remind_at, reminded=false
   where id=p_task_id and status='open' returning * into r;
  if r.id is null then raise exception '이미 신청되었거나 열려 있지 않은 항목입니다.'; end if;
  delete from public.task_participants where task_id=p_task_id;
  insert into public.task_participants(task_id, user_id)
    select p_task_id, x from unnest(coalesce(p_participants, array[]::uuid[])) as x
    where public.is_group_member(v_gid, x) on conflict do nothing;

  -- 놀기 신청 알림: 약속 참여자에게만 (신청자 본인 제외)
  insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id)
  select tp.user_id, auth.uid(), 'accept',
         public.notif_member_name(v_gid, auth.uid()) || ' 님의 '
           || public.notif_accept_term((select group_type from public.groups where id = v_gid))
           || '! [' || r.title || ']',
         null, v_gid, p_task_id
  from public.task_participants tp
  where tp.task_id = p_task_id and tp.user_id <> auth.uid();

  return r;
end; $$;
grant execute on function public.schedule_task(uuid, timestamptz, boolean, text, date, int, uuid[]) to authenticated;

create or replace function public.reschedule_task(
  p_task_id uuid, p_scheduled_at timestamptz, p_time_set boolean,
  p_repeat text, p_repeat_until date, p_remind int, p_participants uuid[]
) returns public.tasks language plpgsql security definer set search_path = public as $$
declare r public.tasks; v_gid uuid; v_remind_at timestamptz;
begin
  select group_id into v_gid from public.tasks where id = p_task_id;
  if v_gid is null then raise exception '존재하지 않는 항목입니다.'; end if;
  if not public.is_group_member(v_gid, auth.uid()) then
    raise exception '그룹 멤버만 수정할 수 있습니다.'; end if;
  if p_remind is not null and p_scheduled_at is not null then
    v_remind_at := p_scheduled_at - make_interval(mins => p_remind);
  end if;
  update public.tasks
     set scheduled_at=p_scheduled_at, scheduled_time_set=coalesce(p_time_set, true),
         repeat_rule=p_repeat, repeat_until=p_repeat_until,
         remind_min=p_remind, remind_at=v_remind_at, reminded=false
   where id=p_task_id returning * into r;
  delete from public.task_participants where task_id=p_task_id;
  insert into public.task_participants(task_id, user_id)
    select p_task_id, x from unnest(coalesce(p_participants, array[]::uuid[])) as x
    where public.is_group_member(v_gid, x) on conflict do nothing;
  return r;
end; $$;
grant execute on function public.reschedule_task(uuid, timestamptz, boolean, text, date, int, uuid[]) to authenticated;

-- ---- 마감 예정 미리 알림 발송 (pg_cron 이 매분 호출) -----------
-- remind_at 이 지난 약속의 참여자에게 notifications 행을 넣는다.
-- (그 INSERT 가 기존 웹훅/푸시 경로를 태워 휴대폰 알림까지 전달)
create or replace function public.dispatch_due_reminders()
returns integer language plpgsql security definer set search_path = public as $$
declare t record; v_title text; n int := 0;
begin
  for t in
    select * from public.tasks
    where remind_at is not null and reminded = false
      and remind_at <= now() and status = 'accepted'
  loop
    v_title := '[' || t.title || '] '
             || to_char(t.scheduled_at at time zone 'Asia/Seoul', 'MM월 DD일 HH24:MI');

    -- 참여자에게
    insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id)
    select p.user_id, null::uuid, 'reminder', v_title, '준비해 주세요', t.group_id, t.id
    from public.task_participants p where p.task_id = t.id;

    -- 참여자가 없으면 담당자에게라도
    if not found and t.assignee_id is not null then
      insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id)
      values (t.assignee_id, null::uuid, 'reminder', v_title, '준비해 주세요', t.group_id, t.id);
    end if;

    update public.tasks set reminded = true where id = t.id;
    n := n + 1;
  end loop;
  return n;
end; $$;

-- pg_cron 매분 스케줄 (이미 있으면 교체)
create extension if not exists pg_cron;
do $$
begin
  perform cron.unschedule('nolging-reminders');
exception when others then null;
end $$;
select cron.schedule('nolging-reminders', '* * * * *', $$select public.dispatch_due_reminders()$$);

-- ---- RPC: 약속 취소 (참여자 누구나) → 위시리스트(open) 로 복귀 ----
create or replace function public.cancel_appointment(p_task_id uuid)
returns public.tasks language plpgsql security definer set search_path = public as $$
declare r public.tasks; v_gid uuid; v_ok boolean;
begin
  select group_id into v_gid from public.tasks where id = p_task_id;
  if v_gid is null then raise exception '존재하지 않는 항목입니다.'; end if;
  v_ok := public.is_group_owner(v_gid, auth.uid())
       or exists (select 1 from public.tasks t where t.id = p_task_id and t.created_by = auth.uid())
       or exists (select 1 from public.task_participants tp where tp.task_id = p_task_id and tp.user_id = auth.uid());
  if not v_ok then raise exception '약속 참여자만 취소할 수 있습니다.'; end if;

  update public.tasks
     set status='open', assignee_id=null, accepted_at=null, completed_at=null,
         scheduled_at=null, scheduled_time_set=true, repeat_rule=null, repeat_until=null,
         remind_min=null, remind_at=null, reminded=false
   where id = p_task_id returning * into r;
  delete from public.task_participants where task_id = p_task_id;
  return r;
end; $$;
grant execute on function public.cancel_appointment(uuid) to authenticated;
