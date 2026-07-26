-- =============================================================
--  프리미엄 상점: "타임머신" · "명찰" 정식 오픈
--   · admin_only = false → 관리자 외 일반 사용자에게도 노출
--   · tier 는 그대로 유지: 명찰 = couple(커플 그룹만), 타임머신 = null(프리미엄 그룹 공통)
--  적용: Supabase SQL Editor 에 그대로 실행.
-- =============================================================

update public.store_items
   set admin_only = false,
       is_active  = true,
       premium    = true,
       tier       = 'couple'      -- 연인의 닉네임을 바꾸는 아이템이라 커플 그룹 전용
 where id = 'name-tag';

update public.store_items
   set admin_only = false,
       is_active  = true,
       premium    = true,
       tier       = null          -- 프리미엄 그룹이면 커플/우정 구분 없이 노출
 where id = 'time-machine';

-- 확인: 둘 다 admin_only = false 여야 한다
select id, name, price, premium, tier, admin_only, is_active, sort_order
  from public.store_items
 where id in ('name-tag', 'time-machine')
 order by sort_order;
