-- =============================================================
--  악마 뿔(deco-devil-horn) 크기 2배 확대에 맞춰 위치 조정 기준점(anchor) 갱신.
--  · AvatarDeco.jsx 의 PREVIEW_VB['deco-devil-horn'] 을 '16 2 68 13' → '16 -3 68 15' 로
--    바꿨고(모양이 커지며 위로 더 솟아 뷰박스 상단을 확장), deco_anchor 는 그 중심점과
--    같아야 한다(deco-tf-anchor-clamp.sql 의 주석 참고). 새 중심 = (16+34, -3+7.5) = (50, 4.5).
--  적용: Supabase SQL Editor 에 그대로 실행(deco-tf-anchor-clamp.sql 이후 아무 때나).
-- =============================================================

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
    when 'deco-devil-horn'   then array[50, 4.5]
    when 'deco-kitty-ribbon' then array[76.5, 9]
    when 'deco-bow-tie'      then array[50, 101.5]
    when 'deco-party-hat'    then array[50, -5.5]
    when 'deco-chupa-chups'  then array[66.5, 88]
    when 'deco-cherry-cream' then array[49.5, -4.5]
    else array[50, 50]
  end::numeric[];
$$;
