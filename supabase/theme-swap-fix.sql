-- 꾸미기 테마 교체 버그 수정
--  같은 그룹에 테마 A 가 적용된 상태에서 테마 B 를 같은 그룹에 적용하면
--  A 는 자동으로 미적용(active)으로 되돌아가야 함(그룹당 테마 1개).
--  기존에는 groups.deco_theme 만 B 로 덮어써서 A 아이템이 계속 '적용 중'으로 남았음.
--  (서로 다른 그룹에는 각각 다른 테마를 동시에 적용 가능 — 그 동작은 그대로 유지)

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
  -- 그룹당 테마 1개: 이 그룹에 적용돼 있던 '다른' 테마 아이템은 미적용(active)으로 되돌림
  update public.user_items
    set status = 'active', group_id = null
    where user_id = auth.uid() and status = 'used' and group_id = p_group_id
      and item_id like 'theme-%' and item_id <> ('theme-' || p_theme);
  update public.user_items set status = 'used', group_id = p_group_id, used_at = now() where id = v_item.id;
  update public.groups set deco_theme = p_theme where id = p_group_id;
end;
$$;
grant execute on function public.apply_group_theme(uuid, text) to authenticated;
