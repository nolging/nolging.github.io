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
-- 그룹 대표 이모지 + 이모지 배경색
alter table public.groups add column if not exists emoji         text;
alter table public.groups add column if not exists emoji_bg      text;

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
  -- 그룹 멤버 또는 관리자(미가입 그룹 열람 허용)만 조회 가능
  if not (public.is_group_member(p_group_id, auth.uid()) or public.is_admin(auth.uid())) then
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
  emoji text,
  emoji_bg text,
  owner_nickname text,
  show_contact boolean,
  show_birthdate boolean,
  show_ott boolean,
  already_member boolean
) language sql security definer stable set search_path = public as $$
  select g.id, g.name, g.description, g.group_type, g.theme,
         g.emoji, g.emoji_bg,
         p.nickname as owner_nickname,
         g.show_contact, g.show_birthdate, g.show_ott,
         public.is_group_member(g.id, auth.uid()) as already_member
  from public.groups g
  join public.profiles p on p.id = g.owner_id
  where upper(g.invite_code) = upper(trim(p_code));
$$;
grant execute on function public.preview_group(text) to authenticated;

-- 초대 코드 새로 발급 (그룹 소유자만). 새 유니크 코드로 교체하고 반환.
drop function if exists public.regenerate_invite_code(uuid);
create or replace function public.regenerate_invite_code(p_group_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_tries int := 0;
begin
  if not public.is_group_owner(p_group_id, auth.uid()) then
    raise exception 'not authorized';
  end if;
  loop
    v_code := public.gen_invite_code();
    begin
      update public.groups set invite_code = v_code where id = p_group_id;
      return v_code;
    exception when unique_violation then
      v_tries := v_tries + 1;
      if v_tries > 10 then raise exception 'could not generate unique invite code'; end if;
    end;
  end loop;
end;
$$;
grant execute on function public.regenerate_invite_code(uuid) to authenticated;

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
  note_id    uuid,   -- 선물/커플 링 알림이 가리키는 쪽지(수령 여부로 이동 목적지 결정)
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);
-- 기존 설치 대상: 쪽지 연결 컬럼
alter table public.notifications add column if not exists note_id uuid;
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
         '새 멤버가 가입했어요',
         v_name || ' 님 입장!',
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

-- 기기(push endpoint)를 현재 로그인 사용자 소유로 (재)등록.
--  - endpoint 는 브라우저가 생성한 추측 불가능한 비밀 문자열 → 소지 = 관리 권한.
--  - 계정 전환 시 같은 기기의 구독을 이전 소유자에서 현재 사용자로 넘긴다.
--    (RLS update/insert 는 user_id=auth.uid() 만 허용하므로 정의자 함수로 우회)
create or replace function public.attach_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
  insert into public.push_subscriptions(user_id, endpoint, p256dh, auth)
    values (auth.uid(), p_endpoint, p_p256dh, p_auth);
end;
$$;
grant execute on function public.attach_push_subscription(text, text, text) to authenticated;

-- 기기 구독 제거(로그아웃/끄기). 이전 소유자 행이라도 endpoint 소지자면 정리 가능.
create or replace function public.detach_push_subscription(p_endpoint text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
end;
$$;
grant execute on function public.detach_push_subscription(text) to authenticated;

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
         public.notif_member_name(v_gid, auth.uid()) || ' 님의 놀기 신청!',
         r.title, v_gid, p_task_id
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

-- =============================================================
--  task_reviews : 추억(완료된 약속)에 대한 리뷰 (별점 + 코멘트)
--  - 약속 참여자(task_participants)만 작성 가능, 태스크당 1인 1리뷰
--  - 열람 게이팅: 본인이 리뷰를 작성한 참여자만 남의 코멘트를 볼 수 있음.
--    비참여자/미작성자에겐 코멘트를 서버에서 null 로 가려 전송(프론트 블러).
--  => 직접 SELECT 는 본인 것만 허용하고, 열람은 아래 RPC 로만.
-- =============================================================
create table if not exists public.task_reviews (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks(id)    on delete cascade,
  group_id   uuid not null references public.groups(id)   on delete cascade,
  author_id  uuid not null references public.profiles(id),
  rating     numeric(2,1) not null check (rating >= 0.5 and rating <= 5 and (rating * 2) = floor(rating * 2)), -- 0.5 단위
  comment    text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (task_id, author_id)
);
create index if not exists idx_task_reviews_task on public.task_reviews(task_id);
alter table public.task_reviews enable row level security;

-- 본인 리뷰만 직접 조회 가능(그 외 열람은 RPC 경유). 쓰기는 정의자 RPC 로만.
drop policy if exists trv_select on public.task_reviews;
create policy trv_select on public.task_reviews
  for select to authenticated
  using (author_id = auth.uid() or public.is_admin(auth.uid()));

-- 참여자 판정: task_participants 에 등록된 멤버만 (위시 작성자라도 미참여면 제외)
create or replace function public.is_task_participant(p_task_id uuid, p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.task_participants tp
    where tp.task_id = p_task_id and tp.user_id = p_uid
  );
$$;
grant execute on function public.is_task_participant(uuid, uuid) to authenticated;

-- 리뷰 작성/수정(업서트). 참여자 + 완료 상태에서만. 별점은 0.5 단위.
-- 최초 작성 시에만 1 츄르(coin) 적립(중복 지급 방지: 아래 uq_coin_review_reward).
-- 반환: { id, rating, comment, rewarded(이번에 지급됐나), balance(내 현재 잔액) }
drop function if exists public.submit_review(uuid, int, text);
drop function if exists public.submit_review(uuid, numeric, text);
create or replace function public.submit_review(p_task_id uuid, p_rating numeric, p_comment text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_gid uuid; v_status text; r public.task_reviews; v_rewarded boolean; v_balance integer;
begin
  select group_id, status into v_gid, v_status from public.tasks where id = p_task_id;
  if v_gid is null then raise exception '존재하지 않는 항목입니다.'; end if;
  if not public.is_group_member(v_gid, auth.uid()) then
    raise exception '그룹 멤버만 가능합니다.'; end if;
  if v_status <> 'done' then
    raise exception '완료된 추억에만 리뷰를 남길 수 있습니다.'; end if;
  if not public.is_task_participant(p_task_id, auth.uid()) then
    raise exception '약속에 참여한 멤버만 리뷰를 작성할 수 있습니다.'; end if;
  if p_rating is null or p_rating < 0.5 or p_rating > 5 or (p_rating * 2) <> floor(p_rating * 2) then
    raise exception '별점은 0.5~5 사이 0.5 단위여야 합니다.'; end if;

  insert into public.task_reviews(task_id, group_id, author_id, rating, comment)
    values (p_task_id, v_gid, auth.uid(), p_rating, coalesce(p_comment, ''))
  on conflict (task_id, author_id) do update
    set rating = excluded.rating, comment = excluded.comment, updated_at = now()
  returning * into r;

  -- 리뷰 작성 보상 1 츄르 (태스크당 1회, 수정 재작성해도 중복 지급 안 됨)
  with ins as (
    insert into public.coin_ledger(user_id, delta, reason, ref_type, ref_id)
      values (auth.uid(), 1, '리뷰 작성 보상', 'review_reward', p_task_id)
    on conflict do nothing
    returning 1
  )
  select exists (select 1 from ins) into v_rewarded;

  select coalesce(sum(delta), 0)::integer into v_balance
    from public.coin_ledger where user_id = auth.uid();

  return jsonb_build_object(
    'id', r.id, 'rating', r.rating, 'comment', r.comment,
    'rewarded', v_rewarded, 'balance', v_balance
  );
end;
$$;
grant execute on function public.submit_review(uuid, numeric, text) to authenticated;

-- 리뷰 열람(게이팅 적용). { is_participant, has_reviewed, reviews:[...] } 반환.
-- 코멘트는 (참여자 && 본인 작성) 또는 본인 리뷰일 때만 실제 값, 그 외엔 null.
create or replace function public.task_reviews_view(p_task_id uuid)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare v_gid uuid; v_part boolean; v_reviewed boolean; v_reveal boolean; v_revealed boolean; v_reviews jsonb;
begin
  select group_id into v_gid from public.tasks where id = p_task_id;
  if v_gid is null then raise exception '존재하지 않는 항목입니다.'; end if;
  if not public.is_group_member(v_gid, auth.uid()) then
    raise exception '그룹 멤버만 조회할 수 있습니다.'; end if;

  v_part     := public.is_task_participant(p_task_id, auth.uid());
  v_reviewed := exists (select 1 from public.task_reviews r
                        where r.task_id = p_task_id and r.author_id = auth.uid());
  -- 천체 망원경으로 열람 처리한 경우(review_reveals)에도 공개
  v_revealed := exists (select 1 from public.review_reveals rr
                        where rr.user_id = auth.uid() and rr.task_id = p_task_id);
  v_reveal   := (v_part and v_reviewed) or v_revealed;

  select coalesce(jsonb_agg(obj order by ord), '[]'::jsonb) into v_reviews
  from (
    select jsonb_build_object(
      'id', r.id,
      'author_id', r.author_id,
      'nickname',  coalesce(nullif(gm.display_nickname, ''), p.nickname),
      'avatar_url', gm.avatar_url,
      'rating', r.rating,
      'comment', case when v_reveal or r.author_id = auth.uid() then r.comment else null end,
      -- 가려진 경우 길이만(내용 미전송) → 프론트 로렘 블러. CJK 는 폭이 넓어 2배로 셈(표시폭 근사)
      'comment_len', char_length(r.comment) + char_length(regexp_replace(r.comment, '[^가-힣一-鿿ぁ-ゟァ-ヿ]', '', 'g')),
      'is_self', (r.author_id = auth.uid()),
      'created_at', r.created_at
    ) as obj, r.created_at as ord
    from public.task_reviews r
    join public.profiles p on p.id = r.author_id
    left join public.group_members gm on gm.group_id = v_gid and gm.user_id = r.author_id
    where r.task_id = p_task_id
  ) sub;

  return jsonb_build_object(
    'is_participant', v_part,
    'has_reviewed', v_reviewed,
    'revealed', v_revealed,
    'reviews', v_reviews
  );
end;
$$;
grant execute on function public.task_reviews_view(uuid) to authenticated;

-- 리뷰 삭제: 관리자만. (RLS 상 직접 삭제 불가 → 정의자 RPC 경유)
create or replace function public.delete_review(p_review_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception '관리자만 삭제할 수 있습니다.';
  end if;
  delete from public.task_reviews where id = p_review_id;
end;
$$;
grant execute on function public.delete_review(uuid) to authenticated;

-- 그룹 내 태스크별 리뷰 개수 (추억 '약속으로 되돌리기' 노출 여부 판단용).
-- task_reviews SELECT 는 본인/관리자만 허용되므로 정의자 RPC 로 집계. 그룹 멤버/관리자만.
create or replace function public.group_review_counts(p_group_id uuid)
returns table(task_id uuid, cnt integer)
language plpgsql security definer stable set search_path = public as $$
begin
  if not (public.is_group_member(p_group_id, auth.uid()) or public.is_admin(auth.uid())) then
    return;
  end if;
  return query
    select r.task_id, count(*)::int from public.task_reviews r
    where r.group_id = p_group_id group by r.task_id;
end;
$$;
grant execute on function public.group_review_counts(uuid) to authenticated;

-- 추억(완료된 약속)을 다시 약속(accepted)으로 되돌리기. 리뷰가 하나라도 있으면 불가.
create or replace function public.revert_to_appointment(p_task_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t public.tasks;
begin
  select * into t from public.tasks where id = p_task_id;
  if t.id is null then raise exception '존재하지 않는 항목입니다.'; end if;
  if not (public.is_group_member(t.group_id, auth.uid()) or public.is_admin(auth.uid())) then
    raise exception '권한이 없습니다.'; end if;
  if t.status <> 'done' then raise exception '추억만 약속으로 되돌릴 수 있습니다.'; end if;
  if exists (select 1 from public.task_reviews where task_id = p_task_id) then
    raise exception '리뷰가 있는 추억은 되돌릴 수 없어요.'; end if;
  update public.tasks set status = 'accepted', completed_at = null where id = p_task_id;
end;
$$;
grant execute on function public.revert_to_appointment(uuid) to authenticated;

-- =============================================================
--  coin(화폐) : UI 표기는 "츄르", 시스템 네이밍은 coin
--  - 원장(ledger) 기반: 모든 적립/사용은 coin_ledger 에 append.
--    잔액 = sum(delta). (적립 +, 사용 -)
--  - 지금은 개념/잔액 조회만. 적립·사용 기능은 이후 정의자 RPC 로 추가.
--  - 직접 쓰기 불가(RLS): 조회만 본인/관리자. 지급/차감은 SECURITY DEFINER 함수 경유.
-- =============================================================
create table if not exists public.coin_ledger (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  delta      integer not null,                              -- 적립 +, 사용 -
  reason     text not null default '',                       -- 사유(표시용)
  ref_type   text,                                           -- 연관 도메인(task/review/admin 등)
  ref_id     uuid,                                           -- 연관 레코드 id
  created_by uuid references public.profiles(id),            -- 지급/차감 주체(관리자/시스템)
  created_at timestamptz not null default now()
);
create index if not exists idx_coin_ledger_user on public.coin_ledger(user_id, created_at desc);
alter table public.coin_ledger enable row level security;

-- 본인(또는 관리자) 원장만 조회. 직접 insert/update/delete 정책은 없음 → 정의자 RPC 로만 기록.
drop policy if exists coin_ledger_select on public.coin_ledger;
create policy coin_ledger_select on public.coin_ledger
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid()));

-- 내 잔액(츄르) 조회. 원장이 없으면 0.
create or replace function public.my_coin_balance()
returns integer language sql security definer stable set search_path = public as $$
  select coalesce(sum(delta), 0)::integer
  from public.coin_ledger where user_id = auth.uid();
$$;
grant execute on function public.my_coin_balance() to authenticated;

-- 리뷰 작성 보상 중복 지급 방지: (사용자, 태스크)당 review_reward 1건만.
create unique index if not exists uq_coin_review_reward
  on public.coin_ledger(user_id, ref_id) where ref_type = 'review_reward';

-- ---- 관리자: 츄르 수동 지급/차감 ----------------------------
-- p_amount 양수=지급, 음수=차감. 사유(선택) 저장. 반환=대상의 새 잔액.
create or replace function public.admin_grant_coin(p_user_id uuid, p_amount integer, p_reason text)
returns integer language plpgsql security definer set search_path = public as $$
declare v_balance integer;
begin
  if not public.is_admin(auth.uid()) then
    raise exception '관리자만 지급할 수 있습니다.'; end if;
  if p_amount is null or p_amount = 0 then
    raise exception '지급/차감 수량을 입력해 주세요.'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception '존재하지 않는 사용자입니다.'; end if;

  insert into public.coin_ledger(user_id, delta, reason, ref_type, created_by)
    values (p_user_id, p_amount, coalesce(nullif(btrim(p_reason), ''), '관리자 지급'), 'admin_grant', auth.uid());

  select coalesce(sum(delta), 0)::integer into v_balance
    from public.coin_ledger where user_id = p_user_id;
  return v_balance;
end;
$$;
grant execute on function public.admin_grant_coin(uuid, integer, text) to authenticated;

-- ---- 관리자: 사용자별 잔액 목록 (사용자 목록/지급 화면용) -----
create or replace function public.admin_coin_balances()
returns table (user_id uuid, balance integer)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception '관리자만 조회할 수 있습니다.'; end if;
  return query
    select p.id, coalesce(sum(cl.delta), 0)::integer
    from public.profiles p
    left join public.coin_ledger cl on cl.user_id = p.id
    group by p.id;
end;
$$;
grant execute on function public.admin_coin_balances() to authenticated;

-- =============================================================
--  쪽지 (notes)
--  그룹 멤버끼리 주고받는 짧은 메모(최대 150자).
--  - 보낸/받는 사람의 "그룹 내 표시 닉네임"을 스냅샷으로 저장.
--  - 직접 INSERT 불가(RLS): send_note(정의자) 로만 기록.
--  - 조회는 본인이 보낸/받은 것만.
-- =============================================================
create table if not exists public.notes (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references public.groups(id)   on delete cascade,
  sender_id     uuid not null references public.profiles(id) on delete cascade,
  recipient_id  uuid not null references public.profiles(id) on delete cascade,
  sender_name   text not null,   -- 보낸 사람의 그룹 내 닉네임(스냅샷)
  recipient_name text not null,  -- 받는 사람의 그룹 내 닉네임(스냅샷)
  sender_avatar    text,         -- 보낸 사람의 그룹 내 아바타(스냅샷)
  recipient_avatar text,         -- 받는 사람의 그룹 내 아바타(스냅샷)
  body          text not null,
  kind          text not null default 'note',  -- note | wish (소원권 사용)
  is_read       boolean not null default false,
  created_at    timestamptz not null default now()
);
-- 기존 설치 대상 컬럼 추가
alter table public.notes add column if not exists sender_avatar    text;
alter table public.notes add column if not exists recipient_avatar text;
alter table public.notes add column if not exists kind             text not null default 'note';
-- 커플 링/선물(쪽지함 수령형): 대상 아이템 + 수령/거절 여부
alter table public.notes add column if not exists item_id          text;
alter table public.notes add column if not exists item_name        text;   -- 선물 아이템명 스냅샷
alter table public.notes add column if not exists claimed          boolean not null default false;
alter table public.notes add column if not exists rejected         boolean not null default false;
alter table public.notes add column if not exists media_url        text;   -- 카세트 테이프: 음악 링크(유튜브/사운드클라우드)
create index if not exists idx_notes_recipient on public.notes(recipient_id, created_at desc);
create index if not exists idx_notes_sender    on public.notes(sender_id, created_at desc);
alter table public.notes enable row level security;

-- 본인이 보내거나 받은 쪽지만 조회. INSERT 는 send_note(정의자)만.
drop policy if exists notes_select on public.notes;
create policy notes_select on public.notes
  for select to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid());
-- 받은 쪽지 읽음 처리(본인 수신분만)
drop policy if exists notes_update on public.notes;
create policy notes_update on public.notes
  for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

-- ---- RPC: 쪽지 보내기 ----------------------------------------
-- 같은 그룹의 다른 멤버에게만. 내용은 최대 150자. 표시 닉네임을 스냅샷 저장.
create or replace function public.send_note(p_group_id uuid, p_recipient_id uuid, p_body text)
returns public.notes language plpgsql security definer set search_path = public as $$
declare r public.notes; v_sender text; v_recipient text; v_sender_av text; v_recipient_av text;
begin
  if not public.is_group_member(p_group_id, auth.uid()) then
    raise exception '그룹 멤버만 보낼 수 있습니다.'; end if;
  if p_recipient_id = auth.uid() then
    raise exception '자기 자신에게는 보낼 수 없습니다.'; end if;
  if not public.is_group_member(p_group_id, p_recipient_id) then
    raise exception '받는 사람이 그룹 멤버가 아닙니다.'; end if;
  if p_body is null or btrim(p_body) = '' then
    raise exception '쪽지 내용을 입력해 주세요.'; end if;
  if char_length(p_body) > 150 then
    raise exception '쪽지는 최대 150자까지 작성할 수 있습니다.'; end if;

  v_sender    := public.notif_member_name(p_group_id, auth.uid());
  v_recipient := public.notif_member_name(p_group_id, p_recipient_id);
  select avatar_url into v_sender_av    from public.group_members where group_id = p_group_id and user_id = auth.uid();
  select avatar_url into v_recipient_av from public.group_members where group_id = p_group_id and user_id = p_recipient_id;

  insert into public.notes(group_id, sender_id, recipient_id, sender_name, recipient_name, sender_avatar, recipient_avatar, body)
    values (p_group_id, auth.uid(), p_recipient_id, v_sender, v_recipient, v_sender_av, v_recipient_av, btrim(p_body))
    returning * into r;
  return r;
end;
$$;
grant execute on function public.send_note(uuid, uuid, text) to authenticated;

-- =============================================================
--  상점 아이템 (store_items) — 단일 소스
--  이름/가격/이모지/설명/선물전용 을 DB 에서 관리. 프론트는 이 표를 조회.
--  조회는 로그인 사용자 전체, 편집(추가/수정/삭제)은 관리자만.
--  구매/선물 RPC 는 이 표에서 정가를 읽어 검증(클라이언트 값 신뢰 안 함).
-- =============================================================
create table if not exists public.store_items (
  id          text primary key,                 -- 'wish', 'couple-ring', ...
  name        text not null,
  price       integer not null check (price >= 0),
  emoji       text not null default '',          -- 임시 이미지(이모지). 추후 교체.
  description text not null default '',
  gift_only   boolean not null default false,    -- 구매 불가, 선물만 가능
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table public.store_items enable row level security;

drop policy if exists store_items_select on public.store_items;
create policy store_items_select on public.store_items
  for select to authenticated using (true);
-- 편집은 관리자만 (직접 편집/관리자 UI 대비)
drop policy if exists store_items_write on public.store_items;
create policy store_items_write on public.store_items
  for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- 초기 6종 시드. 이미 있으면 유지(관리자 편집 보존) → do nothing.
insert into public.store_items (id, name, price, emoji, description, gift_only, sort_order) values
  ('wish',        '소원권',      5,    '🎫', E'상대방이 소원을 적어서 나에게 보내면 무엇이든 들어줘야 해요\n*선물만 가능', true,  1),
  ('couple-ring', '커플 링',     5000, '💍', E'연인과 나눠 끼면 특별한 능력이 생겨요\n*프리미엄 기능 오픈',            false, 2),
  ('friend-ring', '우정 링',     3000, '🤝', E'친구들과 나눠 끼면 특별한 능력이 생겨요\n*프리미엄 기능 오픈',          false, 3),
  ('telescope',   '천체 망원경', 3,    '🔭', '블러 처리된 리뷰를 볼 수 있어요',                                      false, 4),
  ('eraser',      '지우개',      3,    '🧽', '내 이름을 지우고 쪽지를 보내 보세요',                                  false, 5),
  ('cassette',    '카세트 테이프', 5,  '📼', '쪽지와 함께 음악을 선물해 보세요',                                     false, 6),
  ('link',        '링크',        3,    '🔗', '쪽지에 클릭 가능한 링크를 붙여 보내요',                                false, 7),
  ('video',       '비디오 테이프', 10, '📹', '쪽지와 함께 영상을 선물해 보세요',                                     false, 8),
  ('ledboard',    '전광판',      50, '📟', E'커플만 쓸 수 있는 프리미엄 전광판\n*24시간 동안 노출',                 false, 9)
on conflict (id) do nothing;

-- 프리미엄관: premium(프리미엄 전용 아이템) + tier(요구 링: couple/friend/NULL=아무 프리미엄)
alter table public.store_items add column if not exists premium boolean not null default false;
alter table public.store_items add column if not exists tier text;   -- 'couple' | 'friend' | null
-- 전광판 = 커플 전용 프리미엄
update public.store_items set premium = true, tier = 'couple' where id = 'ledboard';

-- 냥피또(스크래치 복권): 5츄르에 구매 → 긁으면 랜덤 츄르 당첨(꽝 포함). 일반 상점.
insert into public.store_items (id, name, price, emoji, description, gift_only, sort_order) values
  ('nyangpito', '냥피또', 5, '🐱', E'동전으로 긁으면 츄르가 쏟아질지도?\n*긁어서 즉시 당첨 확인', false, 10)
on conflict (id) do nothing;

-- 그룹 테마(꾸미기): 프리미엄 그룹 전용. 적용하면 그룹 카드·상세에 테마 효과.
insert into public.store_items (id, name, price, emoji, description, gift_only, sort_order) values
  ('theme-heart', '하트 뿅뿅', 30, '💕', E'프리미엄 그룹에 적용하는 꾸미기 테마\n*그룹 카드·상세에 하트가 뿅뿅', false, 11)
on conflict (id) do nothing;
update public.store_items set premium = true, tier = null where id = 'theme-heart';

-- =============================================================
--  인벤토리 (user_items) — 내가 구매/선물받아 보유한 아이템
--  구매(purchase) 또는 선물(gift)로 획득. 선물은 준 사람 정보를 스냅샷.
--  직접 INSERT 불가(RLS): 구매/선물/사용 RPC(정의자)만 기록. 조회는 본인 것만.
-- =============================================================
create table if not exists public.user_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,  -- 소유자
  item_id      text not null,
  item_name    text not null,
  source       text not null check (source in ('purchase', 'gift')),
  from_user_id uuid references public.profiles(id) on delete set null,          -- 선물한 사람(구매는 null)
  from_name    text,                                                            -- 선물한 사람 표시명(스냅샷)
  from_avatar  text,                                                            -- 선물한 사람 아바타(스냅샷)
  group_id     uuid references public.groups(id) on delete set null,            -- 선물 맥락 그룹
  status       text not null default 'active' check (status in ('active', 'used', 'pending')),
  used_at      timestamptz,
  created_at   timestamptz not null default now()
);
-- 기존 설치 대상: 커플 링 '수락 대기(pending)' 상태 허용하도록 제약 갱신
alter table public.user_items drop constraint if exists user_items_status_check;
alter table public.user_items add  constraint user_items_status_check
  check (status in ('active', 'used', 'pending'));
create index if not exists idx_user_items_owner on public.user_items(user_id, status, created_at desc);
alter table public.user_items enable row level security;

drop policy if exists user_items_select on public.user_items;
create policy user_items_select on public.user_items
  for select to authenticated using (user_id = auth.uid());

-- 기존 선물 기록(item_gifts) → 인벤토리로 1회 이관 (재실행 안전)
insert into public.user_items (user_id, item_id, item_name, source, from_user_id, from_name, group_id, created_at)
  select g.recipient_id, g.item_id, g.item_name, 'gift', g.sender_id, g.sender_name, g.group_id, g.created_at
  from public.item_gifts g
  where not exists (
    select 1 from public.user_items ui
    where ui.user_id = g.recipient_id and ui.from_user_id = g.sender_id
      and ui.item_id = g.item_id and ui.created_at = g.created_at
  );

-- =============================================================
--  상점 구매 (츄르 차감)
--  정가/선물전용은 store_items 에서 읽어 검증. 성공 시 coin_ledger 에 -가격 기록.
-- =============================================================
drop function if exists public.purchase_item(text);
create or replace function public.purchase_item(p_item_id text, p_qty integer default 1)
returns integer language plpgsql security definer set search_path = public as $$
declare it public.store_items; v_balance integer; v_qty integer; v_total integer; i integer;
begin
  v_qty := greatest(1, coalesce(p_qty, 1));
  select * into it from public.store_items where id = p_item_id and is_active;
  if it.id is null then raise exception '존재하지 않는 아이템입니다.'; end if;
  if it.gift_only then raise exception '선물만 가능한 아이템입니다.'; end if;
  -- 커플 링은 1개만 보유 가능
  if p_item_id = 'couple-ring' then
    if v_qty > 1 then raise exception '커플 링은 한 개만 구매할 수 있어요.'; end if;
    if exists (select 1 from public.user_items where user_id = auth.uid() and item_id = 'couple-ring') then
      raise exception '이미 커플 링을 보유하고 있어요.'; end if;
  end if;
  -- 전광판은 커플 링을 장착한 커플만 구매 가능
  if p_item_id = 'ledboard' and not exists (
       select 1 from public.user_items where user_id = auth.uid() and item_id = 'couple-ring' and status = 'used') then
    raise exception '커플 링을 장착한 커플만 구매할 수 있어요.'; end if;

  v_total := it.price * v_qty;
  select coalesce(sum(delta), 0)::integer into v_balance
    from public.coin_ledger where user_id = auth.uid();
  if v_balance < v_total then raise exception '츄르가 부족해요.'; end if;

  insert into public.coin_ledger(user_id, delta, reason, ref_type)
    values (auth.uid(), -v_total, it.name || ' 구매' || case when v_qty > 1 then ' ×' || v_qty else '' end, 'purchase');
  -- 인벤토리에 수량만큼 추가
  for i in 1..v_qty loop
    insert into public.user_items(user_id, item_id, item_name, source)
      values (auth.uid(), it.id, it.name, 'purchase');
  end loop;

  return v_balance - v_total;
end;
$$;
grant execute on function public.purchase_item(text, integer) to authenticated;

-- =============================================================
--  상점 선물 (item_gifts)
--  같은 그룹의 다른 멤버에게 아이템을 선물. 값은 보내는 사람 츄르에서 차감.
--  선물 기록 저장 + 받는 사람에게 알림(→ 푸시). 소원권처럼 선물 전용도 허용.
-- =============================================================
create table if not exists public.item_gifts (
  id             uuid primary key default gen_random_uuid(),
  group_id       uuid not null references public.groups(id)   on delete cascade,
  sender_id      uuid not null references public.profiles(id) on delete cascade,
  recipient_id   uuid not null references public.profiles(id) on delete cascade,
  item_id        text not null,
  item_name      text not null,
  sender_name    text not null,   -- 보낸 사람의 그룹 내 닉네임(스냅샷)
  recipient_name text not null,   -- 받는 사람의 그룹 내 닉네임(스냅샷)
  created_at     timestamptz not null default now()
);
create index if not exists idx_item_gifts_recipient on public.item_gifts(recipient_id, created_at desc);
alter table public.item_gifts enable row level security;

-- 본인이 주고받은 선물만 조회. INSERT 는 gift_item(정의자)만.
drop policy if exists item_gifts_select on public.item_gifts;
create policy item_gifts_select on public.item_gifts
  for select to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid());

-- ---- RPC: 아이템 선물 ----------------------------------------
-- 정가는 서버에서 확정(구매와 동일). 보낸 즉시 츄르 차감(환불/거절 없음)하고,
-- 받는 사람 '쪽지함'으로 전송한다. 인벤토리에는 상대가 수령(claim_gift)해야 들어간다.
drop function if exists public.gift_item(text, uuid, uuid);
create or replace function public.gift_item(p_item_id text, p_group_id uuid, p_recipient_id uuid, p_qty integer default 1)
returns integer language plpgsql security definer set search_path = public as $$
declare it public.store_items; v_balance integer; v_sender text; v_recipient text; v_sender_av text; v_recipient_av text; v_note_id uuid; v_qty integer; v_total integer; i integer;
begin
  v_qty := greatest(1, coalesce(p_qty, 1));
  select * into it from public.store_items where id = p_item_id and is_active;
  if it.id is null then raise exception '존재하지 않는 아이템입니다.'; end if;

  if not public.is_group_member(p_group_id, auth.uid()) then
    raise exception '그룹 멤버만 선물할 수 있습니다.'; end if;
  if p_recipient_id = auth.uid() then
    raise exception '자기 자신에게는 선물할 수 없습니다.'; end if;
  if not public.is_group_member(p_group_id, p_recipient_id) then
    raise exception '받는 사람이 그룹 멤버가 아닙니다.'; end if;
  -- 커플 링은 한 개만 선물 가능하며, 상대가 이미 보유 중이면 선물 불가(1개만 보유 가능)
  if p_item_id = 'couple-ring' then
    if v_qty > 1 then raise exception '커플 링은 한 개만 선물할 수 있어요.'; end if;
    if exists (select 1 from public.user_items where user_id = p_recipient_id and item_id = 'couple-ring') then
      raise exception '상대가 이미 커플 링을 보유하고 있어요.'; end if;
  end if;
  -- 전광판은 커플(커플 링 장착)에게만 선물 가능
  if p_item_id = 'ledboard' and not exists (
       select 1 from public.user_items where user_id = p_recipient_id and item_id = 'couple-ring' and status = 'used') then
    raise exception '받는 사람이 커플이 아니에요. 전광판은 커플만 사용할 수 있어요.'; end if;

  v_total := it.price * v_qty;
  select coalesce(sum(delta), 0)::integer into v_balance
    from public.coin_ledger where user_id = auth.uid();
  if v_balance < v_total then
    raise exception '츄르가 부족해요.'; end if;

  v_sender    := public.notif_member_name(p_group_id, auth.uid());
  v_recipient := public.notif_member_name(p_group_id, p_recipient_id);
  select avatar_url into v_sender_av    from public.group_members where group_id = p_group_id and user_id = auth.uid();
  select avatar_url into v_recipient_av from public.group_members where group_id = p_group_id and user_id = p_recipient_id;

  insert into public.coin_ledger(user_id, delta, reason, ref_type)
    values (auth.uid(), -v_total, it.name || ' 선물' || case when v_qty > 1 then ' ×' || v_qty else '' end, 'gift');
  -- 수량만큼 선물 기록 + 쪽지 전송(각각 수령해야 인벤토리에 들어감). 알림은 한 번만.
  for i in 1..v_qty loop
    insert into public.item_gifts(group_id, sender_id, recipient_id, item_id, item_name, sender_name, recipient_name)
      values (p_group_id, auth.uid(), p_recipient_id, p_item_id, it.name, v_sender, v_recipient);
    insert into public.notes(group_id, sender_id, recipient_id, sender_name, recipient_name, sender_avatar, recipient_avatar, body, kind, item_id, item_name, claimed, rejected)
      values (p_group_id, auth.uid(), p_recipient_id, v_sender, v_recipient, v_sender_av, v_recipient_av, it.name, 'gift', it.id, it.name, false, false)
      returning id into v_note_id;
  end loop;
  -- 받는 사람에게 알림(→ Database Webhook → 푸시). 마지막 쪽지에 연결.
  insert into public.notifications(user_id, actor_id, type, title, body, group_id, note_id)
    values (p_recipient_id, auth.uid(), 'gift', v_sender || ' 님이 선물을 보냈어요',
            it.name || case when v_qty > 1 then ' ' || v_qty || '개' else '' end || ' · 쪽지함에서 수령하세요', p_group_id, v_note_id);

  return v_balance - v_total;
end;
$$;
grant execute on function public.gift_item(text, uuid, uuid, integer) to authenticated;

-- 선물 수령: 쪽지(kind=gift)를 claimed 처리 + 내 인벤토리에 아이템 생성. 거절은 없음.
create or replace function public.claim_gift(p_note_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare n public.notes; v_name text;
begin
  select * into n from public.notes where id = p_note_id;
  if n.id is null or n.recipient_id <> auth.uid() or n.kind <> 'gift' then
    raise exception '수령할 수 없는 선물입니다.'; end if;
  if n.claimed then raise exception '이미 수령했어요.'; end if;

  update public.notes set claimed = true, is_read = true where id = n.id;

  v_name := coalesce(n.item_name, (select name from public.store_items where id = n.item_id), '선물');
  insert into public.user_items(user_id, item_id, item_name, source, from_user_id, from_name, from_avatar, group_id, status)
    values (auth.uid(), n.item_id, v_name, 'gift', n.sender_id, n.sender_name, n.sender_avatar, n.group_id, 'active');
end;
$$;
grant execute on function public.claim_gift(uuid) to authenticated;

-- =============================================================
--  소원권 사용 (use_wish)
--  내가 보유한, 특정 사람이 준 소원권 1장을 사용(used) 처리하고,
--  그 사람에게 소원을 전달(알림 + 푸시). 소원권은 선물 전용이라 항상 준 사람이 있음.
-- =============================================================
create or replace function public.use_wish(p_from_user_id uuid, p_wish text)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.user_items; v_sender text; v_recipient text; v_sav text; v_rav text;
begin
  if p_wish is null or btrim(p_wish) = '' then
    raise exception '소원을 입력해 주세요.'; end if;
  if char_length(p_wish) > 300 then
    raise exception '소원이 너무 길어요.'; end if;

  -- 해당 사람이 준 활성 소원권 1장 (오래된 것부터)
  select * into v_item from public.user_items
   where user_id = auth.uid() and item_id = 'wish' and status = 'active'
     and from_user_id = p_from_user_id
   order by created_at asc limit 1;
  if v_item.id is null then
    raise exception '사용할 수 있는 소원권이 없습니다.'; end if;

  update public.user_items set status = 'used', used_at = now() where id = v_item.id;

  -- 소원을 쪽지(kind=wish)로 남김: 빈 사람=보낸이, 소원권 준 사람=받는이
  v_sender    := coalesce(public.notif_member_name(v_item.group_id, auth.uid()), '');
  v_recipient := coalesce(public.notif_member_name(v_item.group_id, p_from_user_id), '');
  select avatar_url into v_sav from public.group_members where group_id = v_item.group_id and user_id = auth.uid();
  select avatar_url into v_rav from public.group_members where group_id = v_item.group_id and user_id = p_from_user_id;

  insert into public.notes(group_id, sender_id, recipient_id, sender_name, recipient_name, sender_avatar, recipient_avatar, body, kind)
    values (v_item.group_id, auth.uid(), p_from_user_id, v_sender, v_recipient, v_sav, v_rav, btrim(p_wish), 'wish');

  -- 알림(→ 푸시)
  insert into public.notifications(user_id, actor_id, type, title, body, group_id)
    values (p_from_user_id, auth.uid(), 'wish',
            case when v_sender <> '' then v_sender || ' 님이 소원을 빌었어요' else '소원이 도착했어요' end,
            btrim(p_wish), v_item.group_id);
end;
$$;
grant execute on function public.use_wish(uuid, text) to authenticated;

-- =============================================================
--  카세트 테이프: 쪽지와 함께 음악 링크(유튜브/사운드클라우드) 보내기
--  카세트 1개 소모 → 상대 쪽지함에 kind=cassette + media_url 쪽지 생성
-- =============================================================
create or replace function public.use_cassette(p_group_id uuid, p_recipient_id uuid, p_message text, p_url text)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.user_items; v_sender text; v_recipient text; v_sav text; v_rav text; v_body text;
begin
  if p_url is null or btrim(p_url) = '' then raise exception '음악 링크를 입력해 주세요.'; end if;

  select * into v_item from public.user_items
   where user_id = auth.uid() and item_id = 'cassette' and status = 'active'
   order by created_at asc limit 1;
  if v_item.id is null then raise exception '사용할 수 있는 카세트 테이프가 없습니다.'; end if;

  if not public.is_group_member(p_group_id, auth.uid()) then raise exception '그룹 멤버만 사용할 수 있습니다.'; end if;
  if p_recipient_id = auth.uid() then raise exception '자기 자신에게는 보낼 수 없습니다.'; end if;
  if not public.is_group_member(p_group_id, p_recipient_id) then raise exception '받는 사람이 그룹 멤버가 아닙니다.'; end if;

  update public.user_items set status = 'used', used_at = now() where id = v_item.id;

  v_sender    := coalesce(public.notif_member_name(p_group_id, auth.uid()), '');
  v_recipient := coalesce(public.notif_member_name(p_group_id, p_recipient_id), '');
  select avatar_url into v_sav from public.group_members where group_id = p_group_id and user_id = auth.uid();
  select avatar_url into v_rav from public.group_members where group_id = p_group_id and user_id = p_recipient_id;
  v_body := coalesce(nullif(btrim(p_message), ''), '음악을 보냈어요 🎵');

  insert into public.notes(group_id, sender_id, recipient_id, sender_name, recipient_name, sender_avatar, recipient_avatar, body, kind, item_id, media_url)
    values (p_group_id, auth.uid(), p_recipient_id, v_sender, v_recipient, v_sav, v_rav, v_body, 'cassette', 'cassette', btrim(p_url));

  insert into public.notifications(user_id, actor_id, type, title, body, group_id)
    values (p_recipient_id, auth.uid(), 'cassette',
            case when v_sender <> '' then v_sender || ' 님이 음악을 보냈어요' else '음악이 도착했어요' end,
            '쪽지함에서 들어보세요 🎵', p_group_id);
end;
$$;
grant execute on function public.use_cassette(uuid, uuid, text, text) to authenticated;

-- =============================================================
--  링크: 쪽지에 클릭 가능한 링크(URL) 붙여 보내기. 링크 1개 소모.
-- =============================================================
--  p_label: 받는 사람에게 버튼으로 보여줄 텍스트(URL 은 숨김). item_name 에 저장.
drop function if exists public.use_link(uuid, uuid, text, text);
create or replace function public.use_link(p_group_id uuid, p_recipient_id uuid, p_message text, p_url text, p_label text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.user_items; v_sender text; v_recipient text; v_sav text; v_rav text; v_body text; v_label text;
begin
  if p_url is null or btrim(p_url) = '' then raise exception '링크를 입력해 주세요.'; end if;

  select * into v_item from public.user_items
   where user_id = auth.uid() and item_id = 'link' and status = 'active'
   order by created_at asc limit 1;
  if v_item.id is null then raise exception '사용할 수 있는 링크가 없습니다.'; end if;

  if not public.is_group_member(p_group_id, auth.uid()) then raise exception '그룹 멤버만 사용할 수 있습니다.'; end if;
  if p_recipient_id = auth.uid() then raise exception '자기 자신에게는 보낼 수 없습니다.'; end if;
  if not public.is_group_member(p_group_id, p_recipient_id) then raise exception '받는 사람이 그룹 멤버가 아닙니다.'; end if;

  update public.user_items set status = 'used', used_at = now() where id = v_item.id;

  v_sender    := coalesce(public.notif_member_name(p_group_id, auth.uid()), '');
  v_recipient := coalesce(public.notif_member_name(p_group_id, p_recipient_id), '');
  select avatar_url into v_sav from public.group_members where group_id = p_group_id and user_id = auth.uid();
  select avatar_url into v_rav from public.group_members where group_id = p_group_id and user_id = p_recipient_id;
  v_body  := coalesce(nullif(btrim(p_message), ''), '링크를 보냈어요 🔗');
  v_label := coalesce(nullif(btrim(p_label), ''), '링크 열기');

  insert into public.notes(group_id, sender_id, recipient_id, sender_name, recipient_name, sender_avatar, recipient_avatar, body, kind, item_id, item_name, media_url)
    values (p_group_id, auth.uid(), p_recipient_id, v_sender, v_recipient, v_sav, v_rav, v_body, 'link', 'link', v_label, btrim(p_url));

  insert into public.notifications(user_id, actor_id, type, title, body, group_id)
    values (p_recipient_id, auth.uid(), 'link',
            case when v_sender <> '' then v_sender || ' 님이 링크를 보냈어요' else '링크가 도착했어요' end,
            '쪽지함에서 확인하세요 🔗', p_group_id);
end;
$$;
grant execute on function public.use_link(uuid, uuid, text, text, text) to authenticated;

-- =============================================================
--  비디오 테이프: 쪽지와 함께 영상 링크(유튜브) 보내기. 비디오 1개 소모.
--  비디오 1개 소모 → 상대 쪽지함에 kind=video + media_url 쪽지 생성
-- =============================================================
create or replace function public.use_video(p_group_id uuid, p_recipient_id uuid, p_message text, p_url text)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.user_items; v_sender text; v_recipient text; v_sav text; v_rav text; v_body text;
begin
  if p_url is null or btrim(p_url) = '' then raise exception '영상 링크를 입력해 주세요.'; end if;

  select * into v_item from public.user_items
   where user_id = auth.uid() and item_id = 'video' and status = 'active'
   order by created_at asc limit 1;
  if v_item.id is null then raise exception '사용할 수 있는 비디오 테이프가 없습니다.'; end if;

  if not public.is_group_member(p_group_id, auth.uid()) then raise exception '그룹 멤버만 사용할 수 있습니다.'; end if;
  if p_recipient_id = auth.uid() then raise exception '자기 자신에게는 보낼 수 없습니다.'; end if;
  if not public.is_group_member(p_group_id, p_recipient_id) then raise exception '받는 사람이 그룹 멤버가 아닙니다.'; end if;

  update public.user_items set status = 'used', used_at = now() where id = v_item.id;

  v_sender    := coalesce(public.notif_member_name(p_group_id, auth.uid()), '');
  v_recipient := coalesce(public.notif_member_name(p_group_id, p_recipient_id), '');
  select avatar_url into v_sav from public.group_members where group_id = p_group_id and user_id = auth.uid();
  select avatar_url into v_rav from public.group_members where group_id = p_group_id and user_id = p_recipient_id;
  v_body := coalesce(nullif(btrim(p_message), ''), '영상을 보냈어요 📹');

  insert into public.notes(group_id, sender_id, recipient_id, sender_name, recipient_name, sender_avatar, recipient_avatar, body, kind, item_id, media_url)
    values (p_group_id, auth.uid(), p_recipient_id, v_sender, v_recipient, v_sav, v_rav, v_body, 'video', 'video', btrim(p_url));

  insert into public.notifications(user_id, actor_id, type, title, body, group_id)
    values (p_recipient_id, auth.uid(), 'video',
            case when v_sender <> '' then v_sender || ' 님이 영상을 보냈어요' else '영상이 도착했어요' end,
            '쪽지함에서 확인하세요 📹', p_group_id);
end;
$$;
grant execute on function public.use_video(uuid, uuid, text, text) to authenticated;

-- =============================================================
--  커플 링 나눠 끼기 (use_couple_ring / claim_couple_ring / reject_couple_ring)
--  - 멤버 2명 그룹에서만. 사용자는 링을 '수락 대기'(status=pending, group_id=그룹)로
--    잠그고 상대 쪽지함에 커플 링 선물(kind=couple_ring)을 함께 보낼 메시지와 함께 보낸다.
--  - 사용 시점에는 그룹에 적용되지 않고, 상대가 '나눠 끼기'로 수령해야 그때 적용된다.
--    · 수령: 보낸 사람 링 pending→used(장착), 받은 사람 인벤토리에도 장착 링 생성.
--    · 거절: 보낸 사람 링 pending→active(다시 사용 가능), 그룹 미적용.
--  - 장착(used)된 커플 링이 있는 그룹 = 프리미엄 그룹(내 그룹 상단 고정).
-- =============================================================
drop function if exists public.use_couple_ring(uuid, uuid);
create or replace function public.use_couple_ring(p_group_id uuid, p_recipient_id uuid, p_message text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.user_items; v_cnt int; v_sender text; v_recipient text; v_sav text; v_rav text; v_body text; v_note_id uuid;
begin
  select * into v_item from public.user_items
   where user_id = auth.uid() and item_id = 'couple-ring' and status = 'active'
   order by created_at asc limit 1;
  if v_item.id is null then raise exception '사용할 수 있는 커플 링이 없습니다.'; end if;

  if not public.is_group_member(p_group_id, auth.uid()) then
    raise exception '그룹 멤버만 사용할 수 있습니다.'; end if;
  select count(*) into v_cnt from public.group_members where group_id = p_group_id;
  if v_cnt <> 2 then raise exception '멤버가 2명인 그룹에서만 나눠 낄 수 있어요.'; end if;
  if p_recipient_id = auth.uid() or not public.is_group_member(p_group_id, p_recipient_id) then
    raise exception '상대를 찾을 수 없습니다.'; end if;
  if exists (select 1 from public.user_items
             where user_id = auth.uid() and item_id = 'couple-ring'
               and status in ('used', 'pending') and group_id = p_group_id) then
    raise exception '이미 이 그룹에 커플 링을 보냈거나 끼고 있어요.'; end if;

  -- 아직 그룹에 적용하지 않고 '수락 대기' 상태로만 잠근다(중복 사용 방지).
  update public.user_items set status = 'pending', group_id = p_group_id, used_at = null where id = v_item.id;

  v_sender    := coalesce(public.notif_member_name(p_group_id, auth.uid()), '');
  v_recipient := coalesce(public.notif_member_name(p_group_id, p_recipient_id), '');
  select avatar_url into v_sav from public.group_members where group_id = p_group_id and user_id = auth.uid();
  select avatar_url into v_rav from public.group_members where group_id = p_group_id and user_id = p_recipient_id;
  v_body := coalesce(nullif(btrim(p_message), ''), '커플 링을 함께 끼자고 보냈어요 💍');

  insert into public.notes(group_id, sender_id, recipient_id, sender_name, recipient_name, sender_avatar, recipient_avatar, body, kind, item_id, claimed, rejected)
    values (p_group_id, auth.uid(), p_recipient_id, v_sender, v_recipient, v_sav, v_rav, v_body, 'couple_ring', 'couple-ring', false, false)
    returning id into v_note_id;

  insert into public.notifications(user_id, actor_id, type, title, body, group_id, note_id)
    values (p_recipient_id, auth.uid(), 'couple_ring',
            case when v_sender <> '' then v_sender || ' 님이 커플 링을 보냈어요' else '커플 링이 도착했어요' end,
            '쪽지함에서 확인하세요', p_group_id, v_note_id);
end;
$$;
grant execute on function public.use_couple_ring(uuid, uuid, text) to authenticated;

-- 커플 링 수령(나눠 끼기): 보낸 사람 링을 장착 처리 + 내 인벤토리에도 장착 링 생성
create or replace function public.claim_couple_ring(p_note_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare n public.notes; v_actor text; v_leftover public.user_items; v_price integer;
begin
  select * into n from public.notes where id = p_note_id;
  if n.id is null or n.recipient_id <> auth.uid() or n.kind <> 'couple_ring' then
    raise exception '수령할 수 없는 선물입니다.'; end if;
  if n.claimed then raise exception '이미 수령했어요.'; end if;
  if n.rejected then raise exception '이미 거절한 선물입니다.'; end if;

  update public.notes set claimed = true, is_read = true where id = n.id;

  -- 보낸 사람의 '수락 대기' 링을 이제서야 그룹에 장착
  update public.user_items set status = 'used', used_at = now()
   where user_id = n.sender_id and item_id = 'couple-ring' and status = 'pending' and group_id = n.group_id;

  -- 받은 사람 인벤토리에도 장착된 커플 링 생성
  if not exists (select 1 from public.user_items
                 where user_id = auth.uid() and item_id = 'couple-ring' and status = 'used' and group_id = n.group_id) then
    insert into public.user_items(user_id, item_id, item_name, source, from_user_id, from_name, from_avatar, group_id, status, used_at)
      values (auth.uid(), 'couple-ring', '커플 링', 'gift', n.sender_id, n.sender_name, n.sender_avatar, n.group_id, 'used', now());
  end if;

  -- 받은 사람이 미사용(active)으로 보유하던 커플 링(구매/선물 모두)은 환불(인벤토리 제거 + 츄르 적립)
  for v_leftover in
    select * from public.user_items
     where user_id = auth.uid() and item_id = 'couple-ring' and status = 'active'
  loop
    select price into v_price from public.store_items where id = 'couple-ring';
    insert into public.coin_ledger(user_id, delta, reason, ref_type)
      values (auth.uid(), coalesce(v_price, 5000), '커플 링 환불', 'refund');
    delete from public.user_items where id = v_leftover.id;
  end loop;

  -- 보낸 사람에게 수락 알림(클릭 시 인벤토리로 이동하도록 note_id 연결)
  v_actor := coalesce(public.notif_member_name(n.group_id, auth.uid()), '');
  insert into public.notifications(user_id, actor_id, type, title, body, group_id, note_id)
    values (n.sender_id, auth.uid(), 'couple_ring',
            case when v_actor <> '' then v_actor || ' 님과 커플 링을 나눠 꼈어요' else '커플 링을 함께 끼게 됐어요' end,
            '이제 프리미엄 그룹이에요 💍', n.group_id, n.id);
end;
$$;
grant execute on function public.claim_couple_ring(uuid) to authenticated;

-- 커플 링 거절: 쪽지를 거절 처리 + 보낸 사람 링을 다시 사용 가능(active)으로 복구
create or replace function public.reject_couple_ring(p_note_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare n public.notes; v_actor text;
begin
  select * into n from public.notes where id = p_note_id;
  if n.id is null or n.recipient_id <> auth.uid() or n.kind <> 'couple_ring' then
    raise exception '처리할 수 없는 선물입니다.'; end if;
  if n.claimed then raise exception '이미 수령한 선물이라 거절할 수 없어요.'; end if;
  if n.rejected then raise exception '이미 거절했어요.'; end if;

  update public.notes set rejected = true, is_read = true where id = n.id;

  -- 보낸 사람의 '수락 대기' 링을 다시 사용 가능 상태로 복구
  update public.user_items set status = 'active', group_id = null, used_at = null
   where user_id = n.sender_id and item_id = 'couple-ring' and status = 'pending' and group_id = n.group_id;

  -- 보낸 사람에게 거절 알림(클릭 시 인벤토리로 이동하도록 note_id 연결)
  v_actor := coalesce(public.notif_member_name(n.group_id, auth.uid()), '');
  insert into public.notifications(user_id, actor_id, type, title, body, group_id, note_id)
    values (n.sender_id, auth.uid(), 'couple_ring',
            case when v_actor <> '' then v_actor || ' 님이 커플 링을 거절했어요' else '커플 링이 거절됐어요' end,
            '커플 링은 다시 사용할 수 있어요', n.group_id, n.id);
end;
$$;
grant execute on function public.reject_couple_ring(uuid) to authenticated;

-- =============================================================
--  커플 그룹 여부: 해당 그룹에 '적용된(used)' 커플 링이 존재하는가
--  (헤더 표현/초대 숨김/입장 차단에 공용으로 사용)
-- =============================================================
create or replace function public.is_couple_group(p_group_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.user_items
    where group_id = p_group_id and item_id = 'couple-ring' and status = 'used'
  );
$$;
grant execute on function public.is_couple_group(uuid) to authenticated;

-- =============================================================
--  초대 코드로 그룹 입장 (커플 그룹은 신규 입장 차단)
--  schema.sql 의 join_group 를 대체(커플 그룹 차단 규칙 추가).
-- =============================================================
create or replace function public.join_group(p_code text)
returns public.groups language plpgsql security definer set search_path = public as $$
declare g public.groups;
begin
  select * into g from public.groups where upper(invite_code) = upper(trim(p_code));
  if g.id is null then
    raise exception '유효하지 않은 초대 코드입니다.';
  end if;
  -- 이미 멤버면 그대로 통과(멱등). 새 입장은 커플 그룹이면 차단.
  if not public.is_group_member(g.id, auth.uid()) and public.is_couple_group(g.id) then
    raise exception '커플 그룹에는 입장할 수 없어요.';
  end if;
  insert into public.group_members(group_id, user_id, role)
    values (g.id, auth.uid(), 'member')
    on conflict (group_id, user_id) do nothing;
  return g;
end;
$$;
grant execute on function public.join_group(text) to authenticated;

-- =============================================================
--  전광판 (LED 배너) — 커플 전용 프리미엄. 24시간 동안 커플에게만 노출.
--  전광판 1개 소모 → led_banners 행 생성(그룹=장착한 커플 그룹).
-- =============================================================
create table if not exists public.led_banners (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id)   on delete cascade,
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  text       text not null,
  color      text not null default 'amber',
  active     boolean not null default true,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_led_banners_group_active on public.led_banners(group_id) where active;
alter table public.led_banners enable row level security;

-- 커플 그룹 멤버(둘)만 조회. 쓰기는 정의자 함수만.
drop policy if exists led_banners_select on public.led_banners;
create policy led_banners_select on public.led_banners
  for select to authenticated
  using (public.is_group_member(group_id, auth.uid()) or public.is_admin(auth.uid()));

-- 색상 검증 헬퍼
create or replace function public.led_color_ok(p_color text)
returns text language sql immutable as $$
  select case when lower(coalesce(nullif(btrim(p_color), ''), 'amber'))
                   in ('amber','red','green','blue','pink','cyan')
              then lower(btrim(p_color)) else 'amber' end;
$$;

-- 전광판 사용: 아이템 1개 소모 + 24시간 배너 게재
create or replace function public.use_ledboard(p_text text, p_color text)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.user_items; v_group uuid; v_color text;
begin
  if p_text is null or btrim(p_text) = '' then raise exception '문구를 입력해 주세요.'; end if;
  if char_length(btrim(p_text)) > 60 then raise exception '문구는 60자까지 입력할 수 있어요.'; end if;
  v_color := public.led_color_ok(p_color);

  -- 장착한 커플 링 그룹(= 커플 그룹)
  select group_id into v_group from public.user_items
   where user_id = auth.uid() and item_id = 'couple-ring' and status = 'used' and group_id is not null
   order by used_at desc nulls last limit 1;
  if v_group is null then raise exception '커플 링을 장착한 커플만 사용할 수 있어요.'; end if;

  if exists (select 1 from public.led_banners where group_id = v_group and active and expires_at > now()) then
    raise exception '이미 게재 중인 전광판이 있어요.'; end if;

  select * into v_item from public.user_items
   where user_id = auth.uid() and item_id = 'ledboard' and status = 'active'
   order by created_at asc limit 1;
  if v_item.id is null then raise exception '사용할 수 있는 전광판이 없습니다.'; end if;
  update public.user_items set status = 'used', used_at = now() where id = v_item.id;

  insert into public.led_banners(group_id, owner_id, text, color, active, started_at, expires_at)
    values (v_group, auth.uid(), btrim(p_text), v_color, true, now(), now() + interval '24 hours');
end;
$$;
grant execute on function public.use_ledboard(text, text) to authenticated;

-- 전광판 문구/색상 수정 (게재한 본인만)
create or replace function public.edit_led_banner(p_text text, p_color text)
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_color text;
begin
  if p_text is null or btrim(p_text) = '' then raise exception '문구를 입력해 주세요.'; end if;
  if char_length(btrim(p_text)) > 60 then raise exception '문구는 60자까지 입력할 수 있어요.'; end if;
  v_color := public.led_color_ok(p_color);
  select id into v_id from public.led_banners
   where owner_id = auth.uid() and active and expires_at > now()
   order by started_at desc limit 1;
  if v_id is null then raise exception '수정할 전광판이 없어요.'; end if;
  update public.led_banners set text = btrim(p_text), color = v_color where id = v_id;
end;
$$;
grant execute on function public.edit_led_banner(text, text) to authenticated;

-- 전광판 게재 중단 (게재한 본인만) — 24시간 전이라도 즉시 내림
create or replace function public.stop_led_banner()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.led_banners set active = false
   where owner_id = auth.uid() and active and expires_at > now();
end;
$$;
grant execute on function public.stop_led_banner() to authenticated;

-- 내(커플)에게 보이는 활성 전광판 1건 (양쪽 멤버 모두 조회 가능). is_owner=게재자 여부
create or replace function public.my_led_banner()
returns table (id uuid, group_id uuid, owner_id uuid, "text" text, color text, expires_at timestamptz, is_owner boolean)
language sql security definer stable set search_path = public as $$
  select b.id, b.group_id, b.owner_id, b.text, b.color, b.expires_at, (b.owner_id = auth.uid())
  from public.led_banners b
  where b.active and b.expires_at > now()
    and public.is_group_member(b.group_id, auth.uid())
  order by b.started_at desc
  limit 1;
$$;
grant execute on function public.my_led_banner() to authenticated;

-- =============================================================
--  천체 망원경: 블러 처리된(남이 작성한) 추억 리뷰를 열람. 아이템 1개 소모.
--  review_reveals 에 기록되면 task_reviews_view 에서 코멘트가 공개된다.
-- =============================================================
create table if not exists public.review_reveals (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  task_id    uuid not null references public.tasks(id)    on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, task_id)
);
alter table public.review_reveals enable row level security;
drop policy if exists rr_select on public.review_reveals;
create policy rr_select on public.review_reveals
  for select to authenticated using (user_id = auth.uid());

create or replace function public.use_telescope(p_task_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.user_items; v_gid uuid;
begin
  select group_id into v_gid from public.tasks where id = p_task_id;
  if v_gid is null then raise exception '존재하지 않는 항목입니다.'; end if;
  if not public.is_group_member(v_gid, auth.uid()) then raise exception '그룹 멤버만 사용할 수 있습니다.'; end if;

  -- 이미 볼 수 있으면 소모 방지
  if exists (select 1 from public.review_reveals where user_id = auth.uid() and task_id = p_task_id) then
    raise exception '이미 리뷰를 볼 수 있어요.'; end if;
  if public.is_task_participant(p_task_id, auth.uid())
     and exists (select 1 from public.task_reviews where task_id = p_task_id and author_id = auth.uid()) then
    raise exception '이미 리뷰를 볼 수 있어요.'; end if;
  -- 남이 작성한 리뷰가 있어야 사용 가능
  if not exists (select 1 from public.task_reviews where task_id = p_task_id and author_id <> auth.uid()) then
    raise exception '아직 볼 수 있는 리뷰가 없어요.'; end if;

  select * into v_item from public.user_items
   where user_id = auth.uid() and item_id = 'telescope' and status = 'active'
   order by created_at asc limit 1;
  if v_item.id is null then raise exception '사용할 수 있는 천체 망원경이 없습니다.'; end if;
  update public.user_items set status = 'used', used_at = now() where id = v_item.id;

  insert into public.review_reveals(user_id, task_id) values (auth.uid(), p_task_id)
    on conflict do nothing;
end;
$$;
grant execute on function public.use_telescope(uuid) to authenticated;

-- =============================================================
--  우정 링 (VIP) : 2명 이상 그룹에 즉시 적용(수락 불필요, 거절 불가).
--  - 사용 즉시 사용자의 링이 그룹에 장착(used, group_id)되고 그룹이 우정 그룹이 됨.
--  - 나를 제외한 모든 멤버에게 쪽지(kind=friend_ring)+알림 발송. 수령하면 각자 장착 링 생성.
--  - 한 사람이 여러 그룹에 낄 수 있어 구매/보유 제한 없음.
-- =============================================================
create or replace function public.is_friend_group(p_group_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.user_items
                 where group_id = p_group_id and item_id = 'friend-ring' and status = 'used');
$$;
grant execute on function public.is_friend_group(uuid) to authenticated;

-- 내가 속한 우정 그룹(적용된 우정 링 존재) id 목록 (멤버 전원이 즉시 인식)
create or replace function public.my_friend_group_ids()
returns setof uuid language sql security definer stable set search_path = public as $$
  select distinct gm.group_id
  from public.group_members gm
  where gm.user_id = auth.uid()
    and exists (select 1 from public.user_items ui
                where ui.group_id = gm.group_id and ui.item_id = 'friend-ring' and ui.status = 'used');
$$;
grant execute on function public.my_friend_group_ids() to authenticated;

create or replace function public.use_friend_ring(p_group_id uuid, p_message text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.user_items; v_cnt int; v_sender text; v_sav text; v_body text;
        m record; v_rname text; v_rav text; v_note_id uuid;
begin
  select * into v_item from public.user_items
   where user_id = auth.uid() and item_id = 'friend-ring' and status = 'active'
   order by created_at asc limit 1;
  if v_item.id is null then raise exception '사용할 수 있는 우정 링이 없습니다.'; end if;

  if not public.is_group_member(p_group_id, auth.uid()) then raise exception '그룹 멤버만 사용할 수 있습니다.'; end if;
  select count(*) into v_cnt from public.group_members where group_id = p_group_id;
  if v_cnt < 2 then raise exception '멤버가 2명 이상인 그룹에서만 사용할 수 있어요.'; end if;
  if public.is_friend_group(p_group_id) then raise exception '이미 우정 링이 적용된 그룹이에요.'; end if;

  -- 즉시 그룹에 적용(장착). 수락 불필요.
  update public.user_items set status = 'used', group_id = p_group_id, used_at = now() where id = v_item.id;

  v_sender := coalesce(public.notif_member_name(p_group_id, auth.uid()), '');
  select avatar_url into v_sav from public.group_members where group_id = p_group_id and user_id = auth.uid();
  v_body := coalesce(nullif(btrim(p_message), ''), '우정 링을 함께 끼자고 보냈어요 🤝');

  for m in select user_id from public.group_members where group_id = p_group_id and user_id <> auth.uid()
  loop
    v_rname := coalesce(public.notif_member_name(p_group_id, m.user_id), '');
    select avatar_url into v_rav from public.group_members where group_id = p_group_id and user_id = m.user_id;
    insert into public.notes(group_id, sender_id, recipient_id, sender_name, recipient_name, sender_avatar, recipient_avatar, body, kind, item_id, claimed, rejected)
      values (p_group_id, auth.uid(), m.user_id, v_sender, v_rname, v_sav, v_rav, v_body, 'friend_ring', 'friend-ring', false, false)
      returning id into v_note_id;
    insert into public.notifications(user_id, actor_id, type, title, body, group_id, note_id)
      values (m.user_id, auth.uid(), 'friend_ring',
              case when v_sender <> '' then v_sender || ' 님이 우정 링을 보냈어요' else '우정 링이 도착했어요' end,
              '쪽지함에서 확인하세요 🤝', p_group_id, v_note_id);
  end loop;
end;
$$;
grant execute on function public.use_friend_ring(uuid, text) to authenticated;

-- 우정 링 수령: 쪽지 claimed 처리 + 내 인벤토리에 장착(used) 우정 링 생성. 거절 없음.
create or replace function public.claim_friend_ring(p_note_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare n public.notes;
begin
  select * into n from public.notes where id = p_note_id;
  if n.id is null or n.recipient_id <> auth.uid() or n.kind <> 'friend_ring' then
    raise exception '수령할 수 없는 선물입니다.'; end if;
  if n.claimed then raise exception '이미 수령했어요.'; end if;

  update public.notes set claimed = true, is_read = true where id = n.id;

  if not exists (select 1 from public.user_items
                 where user_id = auth.uid() and item_id = 'friend-ring' and status = 'used' and group_id = n.group_id) then
    insert into public.user_items(user_id, item_id, item_name, source, from_user_id, from_name, from_avatar, group_id, status, used_at)
      values (auth.uid(), 'friend-ring', '우정 링', 'gift', n.sender_id, n.sender_name, n.sender_avatar, n.group_id, 'used', now());
  end if;
end;
$$;
grant execute on function public.claim_friend_ring(uuid) to authenticated;

-- =============================================================
--  콕 찌르기 (poke) — 프리미엄 그룹(커플/우정 링)에서만.
--  멤버 상세에서 대상 멤버에게 알림 생성(정의자 권한).
--  본문: "{보내는 사람의 그룹 내 닉네임} 님이 콕 찔렀어요!"
-- =============================================================
create or replace function public.poke_member(p_group_id uuid, p_target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if not (public.is_couple_group(p_group_id) or public.is_friend_group(p_group_id)) then
    raise exception '콕 찌르기는 프리미엄 그룹에서만 가능해요.';
  end if;
  if not public.is_group_member(p_group_id, auth.uid()) then
    raise exception '그룹 멤버만 사용할 수 있어요.';
  end if;
  if p_target = auth.uid() then
    raise exception '자기 자신은 찌를 수 없어요.';
  end if;
  if not public.is_group_member(p_group_id, p_target) then
    raise exception '대상이 그룹 멤버가 아니에요.';
  end if;
  v_name := public.notif_member_name(p_group_id, auth.uid());
  insert into public.notifications(user_id, actor_id, type, title, group_id)
    values (p_target, auth.uid(), 'poke', coalesce(nullif(v_name, ''), '누군가') || ' 님이 콕 찔렀어요!', p_group_id);
end;
$$;
grant execute on function public.poke_member(uuid, uuid) to authenticated;

-- =============================================================
--  냥피또 (스크래치 복권) — 결과는 서버가 결정(조작 방지).
--  활성 냥피또 1개 소모 + 가중 상품표로 랜덤 츄르 당첨(0=꽝) → 원장 적립.
--  반환값 = 당첨 츄르(0이면 꽝).
--  상품표(합100): 꽝40 / 3츄르28 / 5츄르18 / 10츄르9 / 30츄르4 / 100츄르1
--  기대값 ≈ 4.84츄르 (가격 5츄르 대비 약한 하우스 엣지)
-- =============================================================
create or replace function public.scratch_nyangpito()
returns integer language plpgsql security definer set search_path = public as $$
declare v_item public.user_items; v_roll integer; v_prize integer;
begin
  select * into v_item from public.user_items
    where user_id = auth.uid() and item_id = 'nyangpito' and status = 'active'
    order by created_at asc limit 1 for update;
  if v_item.id is null then raise exception '사용할 수 있는 냥피또가 없어요.'; end if;

  update public.user_items set status = 'used', used_at = now() where id = v_item.id;

  v_roll := floor(random() * 100)::int;  -- 0..99
  v_prize := case
    when v_roll < 40 then 0
    when v_roll < 68 then 3
    when v_roll < 86 then 5
    when v_roll < 95 then 10
    when v_roll < 99 then 30
    else 100
  end;

  if v_prize > 0 then
    insert into public.coin_ledger(user_id, delta, reason, ref_type)
      values (auth.uid(), v_prize, '냥피또 당첨', 'nyangpito');
  end if;

  return v_prize;
end;
$$;
grant execute on function public.scratch_nyangpito() to authenticated;

-- =============================================================
--  그룹 꾸미기 테마 — 프리미엄 그룹(커플/우정)에만 적용.
--  테마 아이템은 소모되지 않고 "장착(적용)" 개념: user_items.status='used' +
--  group_id = 적용한 그룹. 적용 해제하면 status='active', group_id=null 로 복귀.
--  groups.deco_theme 에 테마 id 저장(null=없음). 테마 아이템 id = 'theme-'||deco_theme.
-- =============================================================
alter table public.groups add column if not exists deco_theme text;

-- 적용/그룹 변경(소모하지 않음). 이미 다른 그룹에 적용돼 있으면 옮김.
create or replace function public.apply_group_theme(p_group_id uuid, p_theme text)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.user_items; v_old uuid;
begin
  if not (public.is_couple_group(p_group_id) or public.is_friend_group(p_group_id)) then
    raise exception '프리미엄 그룹에만 테마를 적용할 수 있어요.'; end if;
  if not public.is_group_member(p_group_id, auth.uid()) then
    raise exception '그룹 멤버만 적용할 수 있어요.'; end if;
  -- 내 테마 아이템 하나 선택(미적용=active 우선, 없으면 적용중=used 를 옮김)
  select * into v_item from public.user_items
    where user_id = auth.uid() and item_id = 'theme-' || p_theme and status in ('active', 'used')
    order by (status = 'active') desc, created_at asc limit 1 for update;
  if v_item.id is null then raise exception '보유한 테마가 없어요.'; end if;
  v_old := v_item.group_id;
  -- 이전 그룹에서 이 테마 해제(다른 그룹으로 옮기는 경우)
  if v_item.status = 'used' and v_old is not null and v_old <> p_group_id then
    update public.groups set deco_theme = null where id = v_old and deco_theme = p_theme;
  end if;
  update public.user_items set status = 'used', group_id = p_group_id, used_at = now() where id = v_item.id;
  update public.groups set deco_theme = p_theme where id = p_group_id;
end;
$$;
grant execute on function public.apply_group_theme(uuid, text) to authenticated;

-- 적용 해제: 아이템을 다시 미적용(active)으로 되돌리고 그룹 테마 제거.
create or replace function public.unapply_group_theme(p_theme text)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.user_items;
begin
  select * into v_item from public.user_items
    where user_id = auth.uid() and item_id = 'theme-' || p_theme and status = 'used'
    order by used_at desc nulls last limit 1 for update;
  if v_item.id is null then raise exception '적용 중인 테마가 없어요.'; end if;
  update public.user_items set status = 'active', group_id = null where id = v_item.id;
  if v_item.group_id is not null then
    update public.groups set deco_theme = null where id = v_item.group_id and deco_theme = p_theme;
  end if;
end;
$$;
grant execute on function public.unapply_group_theme(text) to authenticated;
