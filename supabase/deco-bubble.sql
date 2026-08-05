-- 프로필 꾸미기(테두리 유형) 추가: 비눗방울
--   · 아바타 전체를 무지갯빛 비눗방울 막으로 감싼다. 가운데는 거의 투명해 프로필 사진이
--     그대로 보이고, 테두리 쪽에만 은은한 색 번짐 + 하이라이트 + 반짝임(src/components/
--     AvatarDeco.jsx 의 Bubble). 후광과 달리 항상 다른 모든 꾸미기보다 앞(맨 위)에 그려짐.
--   · 유형(슬롯) = '테두리' → 후광과 같은 테두리 유형끼리만 배타, 머리/얼굴 등과는 동시 장착.
--   · 프리미엄 상점 · 관리자 전용(admin_only) · 30 츄르
--  전제: deco-slot-column.sql 적용(store_items.deco_slot).
--  적용: Supabase SQL Editor 에 그대로 실행.

insert into public.store_items (id, name, price, emoji, description, premium, tier, admin_only, deco_slot, sort_order, is_active) values
  ('deco-bubble', '비눗방울', 30, '🫧', '무지갯빛 비눗방울 속에 둥실', true, null, true, '테두리', 42, true)
on conflict (id) do update set
  name = excluded.name, price = excluded.price, emoji = excluded.emoji,
  premium = excluded.premium, tier = excluded.tier, admin_only = excluded.admin_only,
  is_active = excluded.is_active;
  -- deco_slot, description, sort_order 는 관리자 편집 보존을 위해 갱신하지 않음

select id, name, price, emoji, premium, admin_only, deco_slot, public.deco_slot(id) as slot
  from public.store_items where id = 'deco-bubble';
