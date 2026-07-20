-- =============================================================
--  프로필 꾸미기(얼굴 장식) 추가: 픽셀 선글라스 / 왹져 선글라스
--  · 눈 위치에 그려지는 face 슬롯(기존 홍조/빠직과 동일 슬롯 → 상호 배타)
--  · 우선 관리자 전용 노출(admin_only = true)
--  적용: Supabase SQL Editor 에 그대로 실행.
-- =============================================================

-- 슬롯 구분: 선글라스도 face 로 인식(눈 위치). 그 외 deco-* 는 head.
create or replace function public.deco_slot(p_item_id text)
returns text language sql immutable as $$
  select case when p_item_id in ('deco-blush', 'deco-anger', 'deco-pixel-shades', 'deco-alien-shades') then 'face'
              when p_item_id like 'deco-%' then 'head' else null end;
$$;

-- 아이템 등록 (프리미엄 상점 · 아바타 꾸미기 · 우선 관리자 전용)
insert into public.store_items (id, name, price, emoji, description, premium, tier, admin_only, sort_order, is_active) values
  ('deco-pixel-shades', '픽셀 선글라스', 20, '🕶️', '시력 포기 간지 폭풍 썬구리', true, null, true, 35, true),
  ('deco-alien-shades', '왹져 선글라스', 20, '👽', '간지 포기 인싸 썬구리',       true, null, true, 36, true)
on conflict (id) do update set
  name = excluded.name, price = excluded.price, emoji = excluded.emoji, description = excluded.description,
  premium = excluded.premium, tier = excluded.tier, admin_only = excluded.admin_only,
  sort_order = excluded.sort_order, is_active = excluded.is_active;
