-- 꾸미기 테마: 같은 그룹에 '다른 멤버'가 새 테마를 적용하면 이전 멤버의 테마도 자동 해제
--  예) 멤버1이 A 적용 중 → 멤버2가 같은 그룹에 B 적용 → 멤버1의 A 아이템도 미적용(active)으로
--      되돌아가고, 멤버1 인벤토리에서 '적용 중'이 사라짐. (그룹당 테마는 1개)
--  이전 버전은 자기(auth.uid()) 것만 해제해서 다른 멤버의 테마가 '적용 중'으로 남던 버그 수정.

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
  -- 그룹당 테마 1개: 이 그룹에 적용돼 있던 '다른' 테마 아이템은 (누구 것이든) 미적용으로
  update public.user_items
    set status = 'active', group_id = null
    where status = 'used' and group_id = p_group_id
      and item_id like 'theme-%' and id <> v_item.id;
  update public.user_items set status = 'used', group_id = p_group_id, used_at = now() where id = v_item.id;
  update public.groups set deco_theme = p_theme where id = p_group_id;
end;
$$;
grant execute on function public.apply_group_theme(uuid, text) to authenticated;
