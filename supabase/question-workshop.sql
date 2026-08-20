-- =============================================================
--  물음표 공방 — 상점에서 구매해 프리미엄 그룹에 사용하면 데이트/놀이터 페이지
--  (멍냥꽁냥/커뮤니티)에 "물음표 공방" 메뉴가 열리는 아이템.
--  상점 아이템(id: question-board)은 관리자 페이지에서 이미 만들어져 있어 여기서는
--  따로 insert 하지 않는다(비밀 게시판의 secret-board 아이템과 동일하게 관리자 UI로 생성).
--  개설 로직은 비밀 게시판(board-item.sql)과 완전히 같은 패턴: user_items 아이템
--  1개 소모 → 그룹당 1행짜리 unlock 테이블에 기록. 이번 단계는 "구매 → 그룹에
--  사용 → 메뉴 노출 → 페이지 진입"까지만 만든다. 실제 질문 콘텐츠는 다음 단계에서 추가.
--  적용: Supabase SQL Editor 에 그대로 실행.
-- =============================================================

-- 1) 그룹당 1행 = 개설됨(비밀 게시판의 group_boards 와 동일 패턴)
create table if not exists public.group_qworkshops (
  group_id   uuid primary key references public.groups(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.group_qworkshops enable row level security;   -- 직접 접근 차단, 아래 RPC 로만

-- 2) 개설 여부 조회 — 그룹 멤버만 확인 가능(데이트/놀이터 메뉴 노출 판단용)
create or replace function public.group_qworkshop(p_group uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.group_qworkshops q
    where q.group_id = p_group and public.is_group_member(p_group, auth.uid())
  );
$$;
grant execute on function public.group_qworkshop(uuid) to authenticated;

-- 3) 아이템을 사용할 수 있는(프리미엄 + 미개설) 내 그룹 목록
create or replace function public.qworkshop_eligible_groups()
returns table(id uuid, name text) language sql stable security definer set search_path = public as $$
  select g.id, g.name from public.groups g
  join public.group_members m on m.group_id = g.id and m.user_id = auth.uid()
  where (public.is_couple_group(g.id) or public.is_friend_group(g.id))
    and not exists (select 1 from public.group_qworkshops q where q.group_id = g.id)
  order by g.name;
$$;
grant execute on function public.qworkshop_eligible_groups() to authenticated;

-- 4) 개설: 아이템 1개 소모 → group_qworkshops 에 1행 추가
create or replace function public.qworkshop_setup(p_group uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_item public.user_items;
begin
  if not public.is_group_member(p_group, v_uid) then raise exception '그룹 멤버가 아니에요.'; end if;
  if not (public.is_couple_group(p_group) or public.is_friend_group(p_group)) then
    raise exception '프리미엄 그룹에서만 물음표 공방을 만들 수 있어요.'; end if;
  if exists (select 1 from public.group_qworkshops where group_id = p_group) then
    raise exception '이미 물음표 공방이 있는 그룹이에요.'; end if;

  select * into v_item from public.user_items
    where user_id = v_uid and item_id = 'question-board' and status = 'active'
    order by created_at asc limit 1 for update;
  if v_item.id is null then raise exception '사용할 수 있는 물음표 공방 아이템이 없어요.'; end if;

  update public.user_items set status = 'used', used_at = now(), group_id = p_group where id = v_item.id;
  insert into public.group_qworkshops(group_id, created_by) values (p_group, v_uid);
  return jsonb_build_object('group_id', p_group);
end $$;
grant execute on function public.qworkshop_setup(uuid) to authenticated;

notify pgrst, 'reload schema';
