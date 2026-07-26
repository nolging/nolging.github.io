-- =============================================================
--  프리미엄 상점 · 프로필 꾸미기: "풍선껌" 정식 오픈
--  · admin_only = false → 관리자 외 일반 사용자에게도 노출
--  · "반창고"(deco-bandage), "왹져 선글라스"(deco-alien-shades)는 계속 관리자 전용
--  적용: Supabase SQL Editor 에 그대로 실행.
--       (deco-gum.sql 로 아이템을 먼저 등록한 뒤 실행)
-- =============================================================

update public.store_items
   set admin_only = false,
       is_active  = true,
       premium    = true,
       tier       = null        -- 프리미엄 그룹이면 커플/우정 구분 없이 노출
 where id = 'deco-gum';

-- 확인: gum = admin_only false / bandage·alien = true 여야 한다
select id, name, price, premium, tier, admin_only, is_active, sort_order
  from public.store_items
 where id in ('deco-gum', 'deco-bandage', 'deco-alien-shades')
 order by sort_order;
