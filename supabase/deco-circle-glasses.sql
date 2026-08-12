-- =============================================================
--  프로필 꾸미기(안경 유형) 추가: 동그리 안경
--   · 동그란 알 두 개 + 브릿지, 테만 있고 알 속은 비어(투명) 사진이 그대로 비친다.
--   · 유형(슬롯) = '안경' — 기존 선글라스류(deco_slot='얼굴')와는 다른 슬롯이라 동시 장착 가능.
--   · 프리미엄 상점 · 관리자 전용(admin_only, 정식 오픈 전 테스트용) · 20 츄르
--  전제: deco-slot-column.sql(= store_items.deco_slot 컬럼) 적용 후 실행.
--  적용: Supabase SQL Editor 에 그대로 실행.
-- =============================================================

insert into public.store_items (id, name, price, emoji, description, premium, tier, admin_only, deco_slot, sort_order, is_active)
select 'deco-circle-glasses', '동그리 안경', 20, '👓', '책 좀 읽어본 사람의 안경',
       true, null, true, '안경',
       coalesce((select max(sort_order) from public.store_items), 0) + 1, true
where not exists (select 1 from public.store_items where id = 'deco-circle-glasses');

select id, name, price, emoji, premium, admin_only, deco_slot, sort_order
  from public.store_items where id = 'deco-circle-glasses';
