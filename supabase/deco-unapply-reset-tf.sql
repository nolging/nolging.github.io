-- =============================================================
--  프로필 꾸미기 장착 해제 시 위치·크기·각도 조정값(deco_tf)도 함께 초기화.
--  · 문제: unapply_avatar_deco 는 status/group_id/used_at 만 되돌리고 deco_tf 는
--    그대로 둬서, 예전에 조정했던 값이 재장착할 때(심지어 다른 그룹에 장착할 때도)
--    계속 남아있었다 — "초기화 버튼을 눌러야 원하는 기본 위치가 나온다"는 혼란의 원인.
--  · apply_avatar_deco 가 슬롯 정원 초과로 다른 아이템을 자동 해제할 때도 같은 문제라
--    같이 고친다.
--  전제: deco-unapply-group.sql, deco-face-slot-capacity.sql 적용 후 실행.
--  적용: Supabase SQL Editor 에 그대로 실행.
-- =============================================================

create or replace function public.unapply_avatar_deco(p_item_id text, p_group_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.user_items;
begin
  select * into v_item from public.user_items
    where user_id = auth.uid() and item_id = p_item_id and status = 'used'
      and (p_group_id is null or group_id = p_group_id)
    order by used_at desc nulls last limit 1 for update;
  if v_item.id is null then raise exception '장착 중인 아이템이 없어요.'; end if;
  update public.user_items set status = 'active', group_id = null, used_at = null, deco_tf = null where id = v_item.id;
end;
$$;
grant execute on function public.unapply_avatar_deco(text, uuid) to authenticated;

create or replace function public.apply_avatar_deco(p_item_id text, p_group_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.user_items; v_slot text; v_cap int;
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

  v_cap := public.deco_slot_capacity(v_slot);

  -- 같은 그룹·같은 슬롯에 정원(capacity)을 넘겨 장착 중이면, 가장 오래 장착한 것부터
  -- 해제해 자리를 만든다(최근 것 (capacity-1)개는 유지) — 정원 이내면 아무것도 안 건드림.
  update public.user_items
     set status = 'active', group_id = null, used_at = null, deco_tf = null
   where id in (
     select id from public.user_items
      where user_id = auth.uid() and status = 'used' and group_id = p_group_id
        and id <> v_item.id and public.deco_slot(item_id) = v_slot
      order by used_at desc nulls last
      offset greatest(v_cap - 1, 0)
   );

  update public.user_items set status = 'used', group_id = p_group_id, used_at = now() where id = v_item.id;
end;
$$;
grant execute on function public.apply_avatar_deco(text, uuid) to authenticated;
