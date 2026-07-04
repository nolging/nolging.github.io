-- =============================================================
--  Nolging · 마이그레이션 v2
--  (연락처/생년월일, 가입요청 확장, 그룹 설정, 그룹내 멤버 설정, 프라이버시)
--  Supabase SQL Editor 에 붙여넣어 한 번 실행하세요. (기존 schema.sql 적용 이후)
-- =============================================================

-- ---- profiles: 연락처 / 생년월일 / pending 상태 --------------
alter table public.profiles add column if not exists contact   text;
alter table public.profiles add column if not exists birthdate date;

alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles add  constraint profiles_status_check
  check (status in ('active','disabled','pending'));

-- ---- groups: 유형 / 테마 / 공개 여부 -------------------------
alter table public.groups add column if not exists group_type    text not null default 'nolging';
alter table public.groups add column if not exists theme         text not null default 'solo';
alter table public.groups add column if not exists show_contact  boolean not null default false;
alter table public.groups add column if not exists show_birthdate boolean not null default false;

alter table public.groups drop constraint if exists groups_type_check;
alter table public.groups add  constraint groups_type_check
  check (group_type in ('nolging','ilhaging'));
alter table public.groups drop constraint if exists groups_theme_check;
alter table public.groups add  constraint groups_theme_check
  -- nolging: solo/friend/couple, ilhaging: solo/together
  check (theme in ('solo','friend','couple','together'));

-- ---- group_members: 그룹내 닉네임 / 프로필사진 / 공개 토글 ----
alter table public.group_members add column if not exists display_nickname text;
alter table public.group_members add column if not exists avatar_url       text;  -- data URI (정방형 → 원형 표시)
alter table public.group_members add column if not exists show_contact     boolean not null default false;
alter table public.group_members add column if not exists show_birthdate   boolean not null default false;

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

create or replace function public.update_my_profile(p_contact text, p_birthdate date)
returns public.profiles language plpgsql security definer set search_path = public as $$
declare r public.profiles;
begin
  update public.profiles
     set contact = p_contact, birthdate = p_birthdate
   where id = auth.uid()
  returning * into r;
  return r;
end;
$$;
grant execute on function public.update_my_profile(text, date) to authenticated;

-- ---- RPC: 그룹 멤버 카드 (프라이버시 규칙 적용) --------------
-- 그룹 설정 공개여부 AND 멤버 개인 공개여부가 모두 Y 일 때만 연락처/생년월일 노출
create or replace function public.group_member_cards(p_group_id uuid)
returns table (
  user_id uuid,
  login_id text,          -- 계정 아이디(닉네임 컬럼) = 폴백용
  display_nickname text,
  avatar_url text,
  role text,
  is_self boolean,
  contact text,
  birthdate date
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
      case when gm.user_id = auth.uid()
             or (g.show_contact and gm.show_contact) then p.contact else null end,
      case when gm.user_id = auth.uid()
             or (g.show_birthdate and gm.show_birthdate) then p.birthdate else null end
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
  already_member boolean
) language sql security definer stable set search_path = public as $$
  select g.id, g.name, g.description, g.group_type, g.theme,
         p.nickname as owner_nickname,
         g.show_contact, g.show_birthdate,
         public.is_group_member(g.id, auth.uid()) as already_member
  from public.groups g
  join public.profiles p on p.id = g.owner_id
  where g.invite_code = lower(trim(p_code));
$$;
grant execute on function public.preview_group(text) to authenticated;
