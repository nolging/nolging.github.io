-- =============================================================
--  아바타 꾸미기 (deco-*) — 프리미엄 그룹의 내 아바타에 적용
--  · 상점에 등록하되 우선 관리자만 노출(admin_only)
--  · head 슬롯(새싹/고양이 귀/강아지 귀)은 상호 배타, face 슬롯(홍조)은 별도 → 동시 1+1 가능
--  · user_items(status='used' + group_id)로 "특정 그룹에 장착" 표현 (테마와 동일 패턴)
-- =============================================================

-- 상점: 관리자 전용 노출 플래그
alter table public.store_items add column if not exists admin_only boolean not null default false;

-- 아이템 등록 (프리미엄 상점 · 아바타 꾸미기 카테고리는 id 접두사 deco- 로 분류)
insert into public.store_items (id, name, price, emoji, description, premium, tier, admin_only, sort_order, is_active) values
  ('deco-sprout', '자라나는 새싹',        20, '🌱', '머리 위로 새싹이 뿅',                                              true, null, true, 30, true),
  ('deco-jaguar', '고양이인데 재규어인 척', 30, '🐆', E'놀라지 마세요\n재규어 같아 보이지만 사실 고양이예요',              true, null, true, 31, true),
  ('deco-wolf',   '강아지인데 늑대인 척',  30, '🐺', E'늑대인 척하지만 사실 강아지예요\n본인은 정말 늑대인 줄 알아요',    true, null, true, 32, true),
  ('deco-blush',  '부힛부힛',             20, '☺️', '부힛부힛 사rrrrr',                                               true, null, true, 33, true)
on conflict (id) do update set
  name = excluded.name, price = excluded.price, emoji = excluded.emoji, description = excluded.description,
  premium = excluded.premium, tier = excluded.tier, admin_only = excluded.admin_only,
  sort_order = excluded.sort_order, is_active = excluded.is_active;

-- 슬롯 구분: 얼굴(blush) 외 deco-* 는 머리 슬롯
create or replace function public.deco_slot(p_item_id text)
returns text language sql immutable as $$
  select case when p_item_id = 'deco-blush' then 'face'
              when p_item_id like 'deco-%' then 'head' else null end;
$$;

-- 적용/변경: 프리미엄 그룹의 내 아바타에 데코 장착(같은 슬롯 다른 데코는 그 그룹에서 자동 해제)
create or replace function public.apply_avatar_deco(p_item_id text, p_group_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.user_items; v_slot text;
begin
  v_slot := public.deco_slot(p_item_id);
  if v_slot is null then raise exception '아바타 꾸미기 아이템이 아니에요.'; end if;
  if not (public.is_couple_group(p_group_id) or public.is_friend_group(p_group_id)) then
    raise exception '프리미엄 그룹에만 적용할 수 있어요.'; end if;
  if not public.is_group_member(p_group_id, auth.uid()) then
    raise exception '그룹 멤버만 적용할 수 있어요.'; end if;

  -- 내 해당 아이템 하나 선택(미적용=active 우선, 없으면 적용중=used 를 옮김)
  select * into v_item from public.user_items
    where user_id = auth.uid() and item_id = p_item_id and status in ('active', 'used')
    order by (status = 'active') desc, created_at asc limit 1 for update;
  if v_item.id is null then raise exception '보유한 아이템이 없어요.'; end if;

  -- 같은 그룹에서 같은 슬롯(머리/얼굴)에 이미 장착 중인 다른 데코는 해제(active 로)
  update public.user_items
     set status = 'active', group_id = null, used_at = null
   where user_id = auth.uid() and status = 'used' and group_id = p_group_id
     and id <> v_item.id and public.deco_slot(item_id) = v_slot;

  update public.user_items set status = 'used', group_id = p_group_id, used_at = now() where id = v_item.id;
end;
$$;
grant execute on function public.apply_avatar_deco(text, uuid) to authenticated;

-- 장착 해제: 적용 중인 이 데코를 미적용(active)으로 되돌림
create or replace function public.unapply_avatar_deco(p_item_id text)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.user_items;
begin
  select * into v_item from public.user_items
    where user_id = auth.uid() and item_id = p_item_id and status = 'used'
    order by used_at desc nulls last limit 1 for update;
  if v_item.id is null then raise exception '장착 중인 아이템이 없어요.'; end if;
  update public.user_items set status = 'active', group_id = null, used_at = null where id = v_item.id;
end;
$$;
grant execute on function public.unapply_avatar_deco(text) to authenticated;

-- 그룹 멤버들의 장착 데코 조회(그룹 멤버만). (user_id, item_id) 목록.
create or replace function public.list_group_avatar_decos(p_group_id uuid)
returns table(user_id uuid, item_id text)
language sql security definer set search_path = public stable as $$
  select ui.user_id, ui.item_id
  from public.user_items ui
  where ui.group_id = p_group_id and ui.status = 'used' and ui.item_id like 'deco-%'
    and public.is_group_member(p_group_id, auth.uid());
$$;
grant execute on function public.list_group_avatar_decos(uuid) to authenticated;
