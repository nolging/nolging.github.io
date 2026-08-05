-- 프로필 꾸미기(머리 유형) 추가: 천사 링
--   · 머리 위로 금빛 링이 살짝 기울어진 채 둥실둥실 떠 있는 장식(후광과 달리 아바타
--     테두리가 아니라 독립된 링 오브젝트 — 앞 레이어, src/components/AvatarDeco.jsx 의
--     AngelRing).
--   · 유형(슬롯) = '머리' → 같은 머리 유형끼리만 배타, 얼굴/테두리 등과는 동시 장착.
--   · 프리미엄 상점 · 관리자 전용(admin_only, 테스트용) · 20 츄르
--  전제: deco-slot-column.sql 적용(store_items.deco_slot).
--  적용: Supabase SQL Editor 에 그대로 실행.

insert into public.store_items (id, name, price, emoji, description, premium, tier, admin_only, deco_slot, sort_order, is_active) values
  ('deco-angel-ring', '천사 링', 20, '😇', '머리 위로 빛나는 링이 둥실둥실', true, null, true, '머리', 41, true)
on conflict (id) do update set
  name = excluded.name, price = excluded.price, emoji = excluded.emoji,
  premium = excluded.premium, tier = excluded.tier, admin_only = excluded.admin_only,
  is_active = excluded.is_active;
  -- deco_slot, description, sort_order 는 관리자 편집 보존을 위해 갱신하지 않음

select id, name, price, emoji, premium, admin_only, deco_slot, public.deco_slot(id) as slot
  from public.store_items where id = 'deco-angel-ring';
