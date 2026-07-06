-- =============================================================
--  Nolging · 그룹 태스크 관리 앱 · 데이터베이스 스키마
--  Supabase SQL Editor 에 붙여넣어 한 번 실행하세요.
-- =============================================================

create extension if not exists pgcrypto;

-- 초대 코드: 대문자 알파벳+숫자 6자리 랜덤
create or replace function public.gen_invite_code()
returns text language sql volatile as $$
  select string_agg(
    substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 1 + floor(random() * 36)::int, 1), '')
  from generate_series(1, 6);
$$;

-- ----------------------------------------------------------------
-- 테이블
-- ----------------------------------------------------------------

-- 사용자 프로필 (auth.users 와 1:1). 닉네임 로그인용.
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  nickname   text unique not null,
  role       text not null default 'member' check (role in ('admin','member')),
  status     text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now()
);

-- 그룹
create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text not null default '',
  invite_code text unique not null default public.gen_invite_code(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- 그룹 멤버십
create table if not exists public.group_members (
  group_id  uuid references public.groups(id) on delete cascade,
  user_id   uuid references public.profiles(id) on delete cascade,
  role      text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- 태스크 (open → accepted → done)
create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups(id) on delete cascade,
  title        text not null,
  description  text not null default '',
  status       text not null default 'open' check (status in ('open','accepted','done')),
  created_by   uuid not null references public.profiles(id),
  assignee_id  uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  completed_at timestamptz
);

-- 가입 요청 (오픈 가입 대신 관리자 승인제)
create table if not exists public.access_requests (
  id         uuid primary key default gen_random_uuid(),
  nickname   text not null,
  note       text not null default '',
  status     text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);

create index if not exists idx_group_members_user on public.group_members(user_id);
create index if not exists idx_tasks_group on public.tasks(group_id);

-- ----------------------------------------------------------------
-- 헬퍼 함수 (RLS 재귀 방지를 위해 SECURITY DEFINER 사용)
-- ----------------------------------------------------------------

create or replace function public.is_group_member(gid uuid, uid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.group_members where group_id = gid and user_id = uid
  );
$$;

create or replace function public.is_group_owner(gid uuid, uid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.groups where id = gid and owner_id = uid
  );
$$;

create or replace function public.is_admin(uid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles where id = uid and role = 'admin'
  );
$$;

-- 초대 코드로 그룹 가입 (미가입자도 코드로만 가입 가능)
create or replace function public.join_group(p_code text)
returns public.groups language plpgsql security definer set search_path = public as $$
declare g public.groups;
begin
  select * into g from public.groups where upper(invite_code) = upper(trim(p_code));
  if g.id is null then
    raise exception '유효하지 않은 초대 코드입니다.';
  end if;
  insert into public.group_members(group_id, user_id, role)
    values (g.id, auth.uid(), 'member')
    on conflict (group_id, user_id) do nothing;
  return g;
end;
$$;
grant execute on function public.join_group(text) to authenticated;

-- 그룹 생성 시 소유자를 멤버로 자동 등록
create or replace function public.add_owner_as_member()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.group_members(group_id, user_id, role)
    values (new.id, new.owner_id, 'owner')
    on conflict (group_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_add_owner on public.groups;
create trigger trg_add_owner after insert on public.groups
  for each row execute function public.add_owner_as_member();

-- ----------------------------------------------------------------
-- RLS 활성화
-- ----------------------------------------------------------------

alter table public.profiles        enable row level security;
alter table public.groups          enable row level security;
alter table public.group_members   enable row level security;
alter table public.tasks           enable row level security;
alter table public.access_requests enable row level security;

-- profiles: 로그인 사용자는 모든 프로필을 읽을 수 있음(닉네임 표시용). 쓰기는 서버(Edge Function/service_role)만.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);

-- groups
drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups
  for select to authenticated
  using (
    owner_id = auth.uid()  -- 그룹 생성 직후 RETURNING 조회 보장(트리거 멤버십은 STABLE 스냅샷에 안 보임)
    or public.is_group_member(id, auth.uid())
    or public.is_admin(auth.uid())
  );

drop policy if exists groups_insert on public.groups;
create policy groups_insert on public.groups
  for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists groups_update on public.groups;
create policy groups_update on public.groups
  for update to authenticated
  using (owner_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists groups_delete on public.groups;
create policy groups_delete on public.groups
  for delete to authenticated
  using (owner_id = auth.uid() or public.is_admin(auth.uid()));

-- group_members
drop policy if exists gm_select on public.group_members;
create policy gm_select on public.group_members
  for select to authenticated
  using (public.is_group_member(group_id, auth.uid()) or public.is_admin(auth.uid()));

drop policy if exists gm_delete on public.group_members;
create policy gm_delete on public.group_members
  for delete to authenticated
  using (
    user_id = auth.uid()                              -- 본인 탈퇴
    or public.is_group_owner(group_id, auth.uid())    -- 소유자가 멤버 제거
    or public.is_admin(auth.uid())
  );

-- tasks
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select to authenticated
  using (public.is_group_member(group_id, auth.uid()) or public.is_admin(auth.uid()));

drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (public.is_group_member(group_id, auth.uid()) and created_by = auth.uid());

drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks
  for update to authenticated
  using (public.is_group_member(group_id, auth.uid()) or public.is_admin(auth.uid()));

drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks
  for delete to authenticated
  using (
    created_by = auth.uid()
    or public.is_group_owner(group_id, auth.uid())
    or public.is_admin(auth.uid())
  );

-- access_requests: 누구나(익명 포함) 가입 요청 제출 가능, 조회/변경은 관리자만
drop policy if exists ar_insert on public.access_requests;
create policy ar_insert on public.access_requests
  for insert to anon, authenticated
  with check (status = 'pending');

drop policy if exists ar_select on public.access_requests;
create policy ar_select on public.access_requests
  for select to authenticated
  using (public.is_admin(auth.uid()));

drop policy if exists ar_update on public.access_requests;
create policy ar_update on public.access_requests
  for update to authenticated
  using (public.is_admin(auth.uid()));

-- ----------------------------------------------------------------
-- 실시간(선택): 태스크/멤버 변경 실시간 반영
-- ----------------------------------------------------------------
-- alter publication supabase_realtime add table public.tasks;
-- alter publication supabase_realtime add table public.group_members;
