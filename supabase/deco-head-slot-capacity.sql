-- =============================================================
--  머리(head/머리) 슬롯도 얼굴 슬롯과 동일하게 한 그룹에 최대 2개까지 동시
--  장착 가능하게. deco_slot_capacity() 하나만 손보면 apply_avatar_deco() 의
--  "정원 넘기면 가장 오래 장착한 것부터 해제" 로직이 그대로 적용된다.
--  적용: Supabase SQL Editor 에 그대로 실행. (deco-face-slot-capacity.sql 이후)
-- =============================================================

create or replace function public.deco_slot_capacity(p_slot text)
returns int language sql immutable as $$
  select case when p_slot in ('face', '얼굴', 'head', '머리') then 2 else 1 end;
$$;

notify pgrst, 'reload schema';
