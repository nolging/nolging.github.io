-- 익명 게시판 아이템(secret-board): 프리미엄 그룹에 '이름'을 지정해 게시판을 개설한다.
--  · group_boards: 그룹당 1개(pk = group_id). 개설되면 멤버 목록(데이트/멤버) 페이지에 그 이름으로 노출.
--  · 글 접근 권한(board_access)은 기존과 동일(프리미엄 그룹 멤버). 여기서는 "개설 여부 + 이름"만 관리.
--  · 개설 시 secret-board 아이템 1개 소모.

create table if not exists public.group_boards (
  group_id   uuid primary key references public.groups(id) on delete cascade,
  name       text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.group_boards enable row level security;   -- 직접 접근 차단, 아래 RPC 로만

-- 이 그룹의 게시판 이름(멤버 + 프리미엄 + 개설됨) → 이름 반환, 없으면 null
create or replace function public.group_board(p_group uuid)
returns text language sql stable security definer set search_path = public as $$
  select b.name from public.group_boards b
  where b.group_id = p_group
    and public.is_group_member(p_group, auth.uid())
    and (public.is_couple_group(p_group) or public.is_friend_group(p_group));
$$;
grant execute on function public.group_board(uuid) to authenticated;

-- 게시판을 개설할 수 있는 내 그룹(프리미엄 + 멤버 + 아직 미개설)
create or replace function public.board_eligible_groups()
returns table(id uuid, name text) language sql stable security definer set search_path = public as $$
  select g.id, g.name from public.groups g
  join public.group_members m on m.group_id = g.id and m.user_id = auth.uid()
  where (public.is_couple_group(g.id) or public.is_friend_group(g.id))
    and not exists (select 1 from public.group_boards b where b.group_id = g.id)
  order by g.name;
$$;
grant execute on function public.board_eligible_groups() to authenticated;

-- 개설: secret-board 아이템 1개 소모 + group_boards 삽입
create or replace function public.board_setup(p_group uuid, p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_item public.user_items; v_name text := btrim(coalesce(p_name, ''));
begin
  if not public.is_group_member(p_group, v_uid) then raise exception '그룹 멤버가 아니에요.'; end if;
  if not (public.is_couple_group(p_group) or public.is_friend_group(p_group)) then
    raise exception '프리미엄 그룹에서만 게시판을 만들 수 있어요.'; end if;
  if v_name = '' then raise exception '게시판 이름을 입력해 주세요.'; end if;
  if char_length(v_name) > 20 then raise exception '게시판 이름은 20자까지예요.'; end if;
  if exists (select 1 from public.group_boards where group_id = p_group) then
    raise exception '이미 게시판이 있는 그룹이에요.'; end if;

  select * into v_item from public.user_items
    where user_id = v_uid and item_id = 'secret-board' and status = 'active'
    order by created_at asc limit 1 for update;
  if v_item.id is null then raise exception '사용할 수 있는 익명 게시판 아이템이 없어요.'; end if;

  update public.user_items set status = 'used', used_at = now(), group_id = p_group where id = v_item.id;
  insert into public.group_boards(group_id, name, created_by) values (p_group, v_name, v_uid);
  return jsonb_build_object('group_id', p_group, 'name', v_name);
end $$;
grant execute on function public.board_setup(uuid, text) to authenticated;

-- (선택) 이미 글이 쌓여 있는 그룹은 '비밀 게시판' 이름으로 자동 개설해 기존 접근 유지
insert into public.group_boards (group_id, name)
select distinct group_id, '비밀 게시판' from public.board_posts
on conflict (group_id) do nothing;
