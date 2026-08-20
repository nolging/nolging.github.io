-- =============================================================
--  물음표 공방(question-workshop) — 상점에서 구매해 프리미엄 그룹에 사용하면
--  데이트/놀이터 페이지(멍냥꽁냥/커뮤니티)에 "물음표 공방" 메뉴가 열리는 아이템.
--  비밀 게시판(board-item.sql)과 완전히 같은 패턴: user_items 아이템 1개 소모 →
--  그룹당 1행짜리 unlock 테이블에 기록. 이번 단계는 "구매 → 그룹에 사용 → 메뉴
--  노출 → 페이지 진입"까지만 만든다. 실제 질문 콘텐츠는 다음 단계에서 추가.
--  적용: Supabase SQL Editor 에 그대로 실행.
-- =============================================================

-- 1) 상점 아이템(admin_only 테스트 단계 — 준비되면 관리자 페이지에서 판매 On)
insert into public.store_items (id, name, price, emoji, description, premium, tier, admin_only, category, sort_order, is_active) values
  ('question-workshop', '물음표 공방', 30, '❓', '프리미엄 그룹에 서로에게 물어볼 질문 코너를 만들어요', true, null, true, 'feature', 46, true)
on conflict (id) do update set
  name = excluded.name, price = excluded.price, emoji = excluded.emoji,
  admin_only = excluded.admin_only, category = excluded.category, is_active = excluded.is_active;
  -- description, sort_order 는 관리자 편집 보존을 위해 갱신하지 않음

-- 2) 그룹당 1행 = 개설됨(비밀 게시판의 group_boards 와 동일 패턴)
create table if not exists public.group_qworkshops (
  group_id   uuid primary key references public.groups(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.group_qworkshops enable row level security;   -- 직접 접근 차단, 아래 RPC 로만

-- 3) 개설 여부 조회 — 그룹 멤버만 확인 가능(데이트/놀이터 메뉴 노출 판단용)
create or replace function public.group_qworkshop(p_group uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.group_qworkshops q
    where q.group_id = p_group and public.is_group_member(p_group, auth.uid())
  );
$$;
grant execute on function public.group_qworkshop(uuid) to authenticated;

-- 4) 아이템을 사용할 수 있는(프리미엄 + 미개설) 내 그룹 목록
create or replace function public.qworkshop_eligible_groups()
returns table(id uuid, name text) language sql stable security definer set search_path = public as $$
  select g.id, g.name from public.groups g
  join public.group_members m on m.group_id = g.id and m.user_id = auth.uid()
  where (public.is_couple_group(g.id) or public.is_friend_group(g.id))
    and not exists (select 1 from public.group_qworkshops q where q.group_id = g.id)
  order by g.name;
$$;
grant execute on function public.qworkshop_eligible_groups() to authenticated;

-- 5) 개설: 아이템 1개 소모 → group_qworkshops 에 1행 추가
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
    where user_id = v_uid and item_id = 'question-workshop' and status = 'active'
    order by created_at asc limit 1 for update;
  if v_item.id is null then raise exception '사용할 수 있는 물음표 공방 아이템이 없어요.'; end if;

  update public.user_items set status = 'used', used_at = now(), group_id = p_group where id = v_item.id;
  insert into public.group_qworkshops(group_id, created_by) values (p_group, v_uid);
  return jsonb_build_object('group_id', p_group);
end $$;
grant execute on function public.qworkshop_setup(uuid) to authenticated;

notify pgrst, 'reload schema';
