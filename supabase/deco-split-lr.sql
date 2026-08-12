-- =============================================================
--  프로필 꾸미기 좌우 분리 조정: 동물 귀(토깽이/재규어인 척/늑대인 척/곰돌이 한 마리)·
--  악마 뿔·부힛부힛·천사 날개·악마 날개처럼 좌우로 나뉜 아이템은 왼쪽/오른쪽을 따로
--  조정할 수 있다. 저장 형식은 기존 { s, x, y, r } 에 선택적으로 left/right 서브 값을 더한
--  것뿐이라 기존 아이템(좌우 분리 없음)은 완전히 그대로 동작한다.
--  · deco_tf_norm(옛 버전은 s/x/y/r 4개만 뽑아 jsonb_build_object 로 다시 만들었는데,
--    이러면 left/right 키가 저장 시점에 통째로 잘려나간다) 을 좌/우 기준점까지 아는
--    버전으로 교체.
--  · 좌/우 기준점은 AvatarDeco.jsx 의 SPLIT_ANCHOR 와 정확히 같은 값(둘 다 바뀌면 같이 갱신).
--  전제: deco-tf-anchor-clamp.sql 적용 후 실행.
--  적용: Supabase SQL Editor 에 그대로 실행.
-- =============================================================

create or replace function public.deco_split_anchor(p_item_id text, p_side text)
returns numeric[] language sql immutable as $$
  select case p_item_id || ':' || p_side
    when 'deco-jaguar:l'     then array[21.73, 6.06]
    when 'deco-jaguar:r'     then array[78.27, 6.06]
    when 'deco-wolf:l'       then array[21.68, 6.37]
    when 'deco-wolf:r'       then array[78.32, 6.37]
    when 'deco-bunny:l'      then array[44.34, -5.82]
    when 'deco-bunny:r'      then array[55.66, -5.82]
    when 'deco-bear:l'       then array[17.49, 9.97]
    when 'deco-bear:r'       then array[82.51, 9.97]
    when 'deco-devil-horn:l' then array[20.92, 8.74]
    when 'deco-devil-horn:r' then array[79.08, 8.74]
    when 'deco-blush:l'      then array[19, 64]
    when 'deco-blush:r'      then array[81, 64]
    when 'deco-angel-wing:l' then array[-5.19, 62.13]
    when 'deco-angel-wing:r' then array[105.19, 62.13]
    when 'deco-devil-wing:l' then array[-4.11, 61.75]
    when 'deco-devil-wing:r' then array[104.11, 61.75]
    else null
  end::numeric[];
$$;

-- 하나의 { s,x,y,r } 조각을 주어진 기준점(v_ax,v_ay) 기준으로 클램프.
create or replace function public.deco_tf_norm_at(p_tf jsonb, v_ax numeric, v_ay numeric)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    's', round(least(2.5, greatest(0.4, coalesce((p_tf->>'s')::numeric, 1)))::numeric, 3),
    'x', round(least(130 - v_ax, greatest(-30 - v_ax, coalesce((p_tf->>'x')::numeric, 0)))::numeric, 2),
    'y', round(least(130 - v_ay, greatest(-30 - v_ay, coalesce((p_tf->>'y')::numeric, 0)))::numeric, 2),
    'r', round(least(180, greatest(-180, coalesce((p_tf->>'r')::numeric, 0)))::numeric, 1)
  );
$$;

-- 좌/우 값이 항등값(s=1,x=0,y=0,r=0)이면 아예 안 실어 저장을 가볍게 유지.
create or replace function public.deco_tf_is_identity(p_tf jsonb)
returns boolean language sql immutable as $$
  select p_tf is null
     or (coalesce((p_tf->>'s')::numeric, 1) = 1
     and coalesce((p_tf->>'x')::numeric, 0) = 0
     and coalesce((p_tf->>'y')::numeric, 0) = 0
     and coalesce((p_tf->>'r')::numeric, 0) = 0);
$$;

create or replace function public.deco_tf_norm(p_item_id text, p_tf jsonb)
returns jsonb language plpgsql immutable as $$
declare
  v_anchor numeric[] := public.deco_anchor(p_item_id);
  v_l numeric[] := public.deco_split_anchor(p_item_id, 'l');
  v_r numeric[] := public.deco_split_anchor(p_item_id, 'r');
  v_out jsonb;
  v_left jsonb;
  v_right jsonb;
begin
  if p_tf is null or jsonb_typeof(p_tf) <> 'object' then return null; end if;
  v_out := public.deco_tf_norm_at(p_tf, v_anchor[1], v_anchor[2]);
  if v_l is not null then
    v_left := public.deco_tf_norm_at(p_tf->'left', v_l[1], v_l[2]);
    if not public.deco_tf_is_identity(v_left) then
      v_out := v_out || jsonb_build_object('left', v_left);
    end if;
  end if;
  if v_r is not null then
    v_right := public.deco_tf_norm_at(p_tf->'right', v_r[1], v_r[2]);
    if not public.deco_tf_is_identity(v_right) then
      v_out := v_out || jsonb_build_object('right', v_right);
    end if;
  end if;
  return v_out;
end;
$$;

-- 확인: 좌우 분리 대상 아이템들의 기준점이 잘 들어갔는지
select id, public.deco_split_anchor(id, 'l') as anchor_l, public.deco_split_anchor(id, 'r') as anchor_r
  from public.store_items
 where id in ('deco-jaguar','deco-wolf','deco-bunny','deco-bear','deco-devil-horn','deco-blush','deco-angel-wing','deco-devil-wing')
 order by id;
