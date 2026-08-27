-- =============================================================
--  Nolging · schema-core.sql
--  (schema-v2.sql 정리 분리본 — 계정/그룹 핵심 정체성 & 프라이버시)
--
--  schema-v2.sql(2767줄)가 그 자체로 거대한 단일 파일이 되어,
--  기존에 122개 개별 마이그레이션을 13개 도메인 번들 파일로 정리한 것과
--  같은 취지로 schema-v2.sql 본체도 도메인별로 쪼갠다.
--  이 파일은 그중 "핵심 계정/그룹/그룹멤버 정체성 + 프라이버시" 도메인만 담는다
--  (연락처/생년월일/구독OTT, 그룹 유형·테마·공개설정, login_id 개명 마이그레이션,
--   그룹내 멤버 표시정보, 민감정보 숨김 RLS/GRANT, 본인 프로필 RPC, 관리자 조회 RPC,
--   가입 전 초대코드 미리보기 RPC, 커플/우정 프리미엄 그룹 판별 헬퍼,
--   그룹 꾸미기 테마 컬럼, 태스크 댓글 기반 테이블).
--
--  schema-v2.sql 에는 이후 다른 122개 마이그레이션을 거치며 더 발전된 "구버전"
--  함수/테이블이 섞여 있었는데, 그 최신본은 이미 13개 도메인 번들
--  (schema-account-system.sql 등)에 들어있으므로 이 파일에는 절대 포함하지 않는다.
--  (제외한 함수: group_member_cards, join_group, join_group_with_profile,
--   apply_group_theme 등 — 이 파일에는 이들이 의존하는 is_couple_group /
--   is_friend_group 헬퍼와 deco_theme 컬럼만 포함)
--
--  적용 순서: schema.sql 이후에 실행. 13개 도메인 번들과는 서로 독립적이며
--  (이 파일은 번들들에 의존하지 않음), 이미 운영 DB에는 반영되어 있으므로
--  실제 운영 DB에 다시 실행할 필요는 없다(코드 정리 목적의 분리본).
-- =============================================================

-- =============================================================
--  1. profiles 테이블: 연락처 / 생년월일 / 구독 OTT / 상태값
-- =============================================================
alter table public.profiles add column if not exists contact   text;
alter table public.profiles add column if not exists birthdate date;
alter table public.profiles add column if not exists subscribed_ott text[] not null default '{}';

alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles add  constraint profiles_status_check
  check (status in ('active','disabled','pending'));

-- =============================================================
--  2. groups 테이블: 유형 / 테마 / 공개 여부 / 이모지 / 위시 카테고리
-- =============================================================
alter table public.groups add column if not exists group_type    text not null default 'nolging';
alter table public.groups add column if not exists theme         text not null default 'default';
alter table public.groups add column if not exists show_contact  boolean not null default false;
alter table public.groups add column if not exists show_birthdate boolean not null default false;
alter table public.groups add column if not exists show_ott       boolean not null default false;
-- 그룹 대표 이모지 + 이모지 배경색
alter table public.groups add column if not exists emoji         text;
alter table public.groups add column if not exists emoji_bg      text;
-- 그룹별 위시 유형 목록 [{name,emoji,bg,fg}] (null=기본 6종). 쓰기는 groups_update(소유자)로 제한.
alter table public.groups add column if not exists wish_categories jsonb;

alter table public.groups drop constraint if exists groups_type_check;
alter table public.groups add  constraint groups_type_check
  check (group_type in ('nolging','ilhaging'));

-- 테마: 기본(default)/사랑(couple)/우정(friend). 과거 solo/together → default 로 이관.
alter table public.groups drop constraint if exists groups_theme_check;
update public.groups set theme = 'default' where theme in ('solo', 'together');
alter table public.groups alter column theme set default 'default';
alter table public.groups add  constraint groups_theme_check
  check (theme in ('default', 'couple', 'friend'));

-- =============================================================
--  3. 계정 아이디 컬럼 정리: profiles.nickname(=로그인 아이디) → login_id
-- =============================================================
-- '닉네임'은 그룹 전용 개념(group_members.display_nickname)이라 혼란 방지를 위해 rename.
-- 구버전 캐시 클라이언트/미갱신 함수 호환을 위해 nickname 을 동기화 그림자 컬럼으로 유지(무중단).
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='profiles' and column_name='nickname')
     and not exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='profiles' and column_name='login_id') then
    alter table public.profiles rename column nickname to login_id;
  end if;
end $$;
alter table public.profiles add column if not exists nickname text;   -- 그림자(동기화). 안정화 후 제거 가능.
create or replace function public.tg_sync_login_id()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.login_id is null and new.nickname is not null then new.login_id := new.nickname; end if;
  new.nickname := new.login_id;   -- login_id 를 진실로, nickname 은 항상 미러
  return new;
end $$;
drop trigger if exists trg_sync_login_id on public.profiles;
create trigger trg_sync_login_id before insert or update on public.profiles
  for each row execute function public.tg_sync_login_id();
update public.profiles set nickname = login_id where nickname is distinct from login_id;

-- =============================================================
--  4. group_members 테이블: 그룹내 닉네임 / 프로필사진 / 공개 토글
-- =============================================================
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

-- =============================================================
--  5. 프라이버시: 아이디(login_id)/역할/연락처/생년월일은 일반 조회에서 숨김
-- =============================================================
-- 아이디(login_id, 구 nickname)는 "본인에게만" 보여야 하므로 테이블 grant 에서 제외.
-- 남의 프로필 표시 이름은 그룹 컨텍스트 RPC(group_member_cards / preview_group 등)로만 노출.
-- 본인 프로필(아이디/role 포함)은 SECURITY DEFINER 인 my_profile() 로만 로드(열거 방지).
revoke select on public.profiles from anon, authenticated;
grant  select (id, status, created_at) on public.profiles to authenticated;

-- =============================================================
--  6. RPC: 내 프로필 조회/수정 (민감정보 포함, 본인만)
-- =============================================================
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

-- =============================================================
--  7. RPC: 관리자 - 사용자 상태/역할 조회용 (민감정보 포함)
-- =============================================================
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

-- =============================================================
--  8. RPC: 초대코드로 그룹 미리보기 (가입 전, 비멤버 조회)
-- =============================================================
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
  owner_avatar text,
  show_contact boolean,
  show_birthdate boolean,
  show_ott boolean,
  already_member boolean
) language sql security definer stable set search_path = public as $$
  -- 소유자 이름은 그룹 표시 닉네임(group_members.display_nickname)만 노출.
  -- profiles.nickname(=아이디)은 본인 외엔 절대 노출하지 않음 → 미설정 시 '방장'.
  select g.id, g.name, g.description, g.group_type, g.theme,
         g.emoji, g.emoji_bg,
         coalesce(nullif(gm.display_nickname, ''), '방장') as owner_nickname,
         gm.avatar_url as owner_avatar,
         g.show_contact, g.show_birthdate, g.show_ott,
         public.is_group_member(g.id, auth.uid()) as already_member
  from public.groups g
  left join public.group_members gm on gm.group_id = g.id and gm.user_id = g.owner_id
  where upper(g.invite_code) = upper(trim(p_code));
$$;
grant execute on function public.preview_group(text) to authenticated;

-- =============================================================
--  9. 초대 코드 재발급 (그룹 소유자만)
-- =============================================================
-- 새 유니크 코드로 교체하고 반환.
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

-- =============================================================
--  10. 커플/우정 프리미엄 그룹 판별 헬퍼
-- =============================================================
--  해당 그룹에 '적용된(used)' 커플 링 / 우정 링이 존재하는가.
--  (헤더 표현/초대 숨김/입장 차단/프리미엄 기능 게이팅 등에 공용으로 사용)
--  이 헬퍼들을 사용하는 실제 기능(join_group, apply_group_theme 등)의 최신본은
--  이미 다른 도메인 번들에 있으므로 여기서는 헬퍼 정의만 포함한다.
create or replace function public.is_couple_group(p_group_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.user_items
    where group_id = p_group_id and item_id = 'couple-ring' and status = 'used'
  );
$$;
grant execute on function public.is_couple_group(uuid) to authenticated;

create or replace function public.is_friend_group(p_group_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.user_items
                 where group_id = p_group_id and item_id = 'friend-ring' and status = 'used');
$$;
grant execute on function public.is_friend_group(uuid) to authenticated;

-- 내가 속한 우정 그룹(적용된 우정 링 존재) id 목록 (멤버 전원이 즉시 인식). schema-v2.sql 에서 이관.
create or replace function public.my_friend_group_ids()
returns setof uuid language sql security definer stable set search_path = public as $$
  select distinct gm.group_id
  from public.group_members gm
  where gm.user_id = auth.uid()
    and exists (select 1 from public.user_items ui
                where ui.group_id = gm.group_id and ui.item_id = 'friend-ring' and ui.status = 'used');
$$;
grant execute on function public.my_friend_group_ids() to authenticated;

-- =============================================================
--  11. 그룹 꾸미기 테마 컬럼
-- =============================================================
--  groups.deco_theme 에 테마 id 저장(null=없음). 테마 아이템 id = 'theme-'||deco_theme.
--  이 컬럼을 쓰는 apply_group_theme/unapply_group_theme 함수 자체는
--  schema-store-items.sql 에 최신본이 있으므로 여기서는 컬럼만 추가한다.
alter table public.groups add column if not exists deco_theme text;

-- =============================================================
--  12. task_comments: 태스크별 댓글 (기반 테이블)
-- =============================================================
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

-- 스레드형 답글 (parent_id): 최상위 댓글은 parent_id null, 답글은 부모 댓글 id 참조.
-- 부모 삭제 시 답글도 삭제.
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
