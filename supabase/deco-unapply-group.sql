-- =============================================================
--  동일 아이템을 2개 이상 보유하면 서로 다른 그룹에 동시 적용 가능하게.
--  · avatar-decos.sql, deco-face-slot-capacity.sql 적용 후 실행.
--  · apply_avatar_deco 는 이미 "미적용(active) 사본을 우선 사용"하므로 손댈 필요 없음
--    (여분 사본이 있으면 자동으로 그걸 새 그룹에 적용, 없으면 기존 것을 옮김).
--  · 문제는 unapply_avatar_deco 였다 — item_id 만으로 "가장 최근 장착한 것"을 찾다 보니,
--    같은 아이템이 두 그룹에 동시 적용돼 있을 때 "이 그룹 걸 해제"가 아니라 엉뚱한(더 최근에
--    장착한) 그룹의 것이 해제될 수 있었다. p_group_id 를 받아 정확히 그 그룹의 것만 해제하게 한다.
--    (그룹을 안 넘기면 기존과 동일하게 동작 — 기존 호출부 호환.)
-- =============================================================

drop function if exists public.unapply_avatar_deco(text);

create or replace function public.unapply_avatar_deco(p_item_id text, p_group_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.user_items;
begin
  select * into v_item from public.user_items
    where user_id = auth.uid() and item_id = p_item_id and status = 'used'
      and (p_group_id is null or group_id = p_group_id)
    order by used_at desc nulls last limit 1 for update;
  if v_item.id is null then raise exception '장착 중인 아이템이 없어요.'; end if;
  update public.user_items set status = 'active', group_id = null, used_at = null where id = v_item.id;
end;
$$;
grant execute on function public.unapply_avatar_deco(text, uuid) to authenticated;
