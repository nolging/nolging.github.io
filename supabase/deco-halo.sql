-- 프로필 꾸미기(테두리 유형) 추가: 후광
--   · 아바타 원형 테두리를 금빛(노란색 은은한 그라데이션)으로 감싸고 반짝이는 후광.
--     그룹 카드의 흰 테두리를 대체하고, 흰 테두리가 없던 곳에도 표시됨(프론트에서 처리).
--   · 유형(슬롯) = '테두리' → 같은 테두리 유형끼리만 배타, 머리/얼굴 등과는 동시 장착.
--   · 프리미엄 상점 · 관리자 전용(admin_only) · 20 츄르
--  전제: deco-slot-column.sql 적용(store_items.deco_slot).
--  적용: Supabase SQL Editor 에 그대로 실행.

insert into public.store_items (id, name, price, emoji, description, premium, tier, admin_only, deco_slot, sort_order, is_active) values
  ('deco-halo', '후광', 20, '😇', '', true, null, true, '테두리', 40, true)
on conflict (id) do update set
  name = excluded.name, price = excluded.price, emoji = excluded.emoji,
  premium = excluded.premium, tier = excluded.tier, admin_only = excluded.admin_only,
  is_active = excluded.is_active;
  -- deco_slot, description, sort_order 는 관리자 편집 보존을 위해 갱신하지 않음

select id, name, price, emoji, premium, admin_only, deco_slot, public.deco_slot(id) as slot
  from public.store_items where id = 'deco-halo';
