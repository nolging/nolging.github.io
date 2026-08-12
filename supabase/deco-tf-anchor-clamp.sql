-- =============================================================
--  프로필 꾸미기 위치 조정 범위: 아이템별 기준점(anchor) 인식 클램프로 교체
--  · deco-tf-range.sql(±60 고정폭)까지 적용했다면 이어서 실행.
--  · 문제: 고양이 리본처럼 기준점이 중앙(50,50)에서 오른쪽으로 많이 치우친
--    아이템은, 고정폭(±N) 오프셋을 기준점에 더하는 방식이라 오른쪽은 조금만
--    움직여도 사진 밖으로 한참 나가고, 왼쪽은 아무리 움직여도 사진 안에서만
--    맴돌아 "오른쪽으로 치우쳐 보이는" 비대칭이 생겼다.
--  · 해결: 오프셋이 아니라 "최종 위치"(기준점 + 오프셋)가 항상 같은 절대
--    범위([-30,130])에 들어오도록 클램프 — 기준점이 어디에 있든 좌우/상하로
--    사진 밖까지 비슷한 정도로 보낼 수 있다. 기준점 좌표는 AvatarDeco.jsx의
--    PREVIEW_VB 와 동일(둘 다 바뀌면 같이 갱신).
-- =============================================================

drop function if exists public.deco_tf_norm(jsonb);

create or replace function public.deco_anchor(p_item_id text)
returns numeric[] language sql immutable as $$
  select case p_item_id
    when 'deco-sprout'       then array[50, -5]
    when 'deco-jaguar'       then array[50, 6]
    when 'deco-wolf'         then array[50, 7]
    when 'deco-blush'        then array[50, 65]
    when 'deco-anger'        then array[81, 18]
    when 'deco-pixel-shades' then array[50, 46.5]
    when 'deco-alien-shades' then array[50, 46]
    when 'deco-bandage'      then array[82, 63]
    when 'deco-gum'          then array[50, 81]
    when 'deco-heart-shades' then array[50, 46.5]
    when 'deco-halo'         then array[50, 50]
    when 'deco-angel-ring'   then array[50, -1]
    when 'deco-bubble'       then array[50, 50]
    when 'deco-tomato'       then array[50, 2.5]
    when 'deco-bunny'        then array[50, -5.5]
    when 'deco-bear'         then array[50, 10.5]
    when 'deco-angel-wing'   then array[50, 61.5]
    when 'deco-devil-wing'   then array[50, 61.5]
    when 'deco-devil-horn'   then array[50, 8.5]
    when 'deco-kitty-ribbon' then array[76.5, 9]
    when 'deco-bow-tie'      then array[50, 101.5]
    when 'deco-party-hat'    then array[50, -5.5]
    when 'deco-chupa-chups'  then array[66.5, 88]
    when 'deco-cherry-cream' then array[49.5, -4.5]
    else array[50, 50]
  end::numeric[];
$$;

create or replace function public.deco_tf_norm(p_item_id text, p_tf jsonb)
returns jsonb language plpgsql immutable as $$
declare
  v_anchor numeric[] := public.deco_anchor(p_item_id);
  v_ax numeric := v_anchor[1];
  v_ay numeric := v_anchor[2];
begin
  if p_tf is null or jsonb_typeof(p_tf) <> 'object' then return null; end if;
  return jsonb_build_object(
    's', round(least(2.5, greatest(0.4, coalesce((p_tf->>'s')::numeric, 1)))::numeric, 3),
    'x', round(least(130 - v_ax, greatest(-30 - v_ax, coalesce((p_tf->>'x')::numeric, 0)))::numeric, 2),
    'y', round(least(130 - v_ay, greatest(-30 - v_ay, coalesce((p_tf->>'y')::numeric, 0)))::numeric, 2),
    'r', round(least(180, greatest(-180, coalesce((p_tf->>'r')::numeric, 0)))::numeric, 1)
  );
end;
$$;

create or replace function public.set_avatar_deco_tf(p_item_id text, p_group_id uuid, p_tf jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if public.deco_slot(p_item_id) is null then
    raise exception '프로필 꾸미기 아이템이 아니에요.'; end if;
  if not public.is_group_member(p_group_id, auth.uid()) then
    raise exception '그룹 멤버만 조정할 수 있어요.'; end if;

  select id into v_id from public.user_items
   where user_id = auth.uid() and item_id = p_item_id
     and status = 'used' and group_id = p_group_id
   order by used_at desc nulls last limit 1 for update;
  if v_id is null then raise exception '이 그룹에 장착 중인 아이템이 없어요.'; end if;

  update public.user_items set deco_tf = public.deco_tf_norm(p_item_id, p_tf) where id = v_id;
end;
$$;
grant execute on function public.set_avatar_deco_tf(text, uuid, jsonb) to authenticated;
