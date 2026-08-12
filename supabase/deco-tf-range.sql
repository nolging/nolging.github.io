-- =============================================================
--  프로필 꾸미기 위치 조정 범위 확장(x/y: ±40 → ±60)
--  · deco-transform.sql 적용 후 실행.
--  · 고양이 리본처럼 기준점(anchor)이 중앙(50,50)에서 많이 벗어난 아이템은,
--    회전해서 반대쪽(좌측)으로 보내려면 ±40 만으로는 부족해 더 넓혀준다.
-- =============================================================

create or replace function public.deco_tf_norm(p_tf jsonb)
returns jsonb language sql immutable as $$
  select case when p_tf is null or jsonb_typeof(p_tf) <> 'object' then null else
    jsonb_build_object(
      's', round(least(2.5,  greatest(0.4,  coalesce((p_tf->>'s')::numeric, 1)))::numeric, 3),
      'x', round(least(60,   greatest(-60,  coalesce((p_tf->>'x')::numeric, 0)))::numeric, 2),
      'y', round(least(60,   greatest(-60,  coalesce((p_tf->>'y')::numeric, 0)))::numeric, 2),
      'r', round(least(180,  greatest(-180, coalesce((p_tf->>'r')::numeric, 0)))::numeric, 1)
    )
  end;
$$;
