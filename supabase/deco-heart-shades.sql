-- =============================================================
--  프로필 꾸미기(얼굴 장식) 추가: 하트 선글라스
--   · 하트 모양 알 · 분홍 테 · 까만색이지만 살짝 투명한 렌즈(프로필 사진 비침). face 슬롯
--     (홍조·빠직·선글라스·반창고·풍선껌과 같은 슬롯 → 하나만 장착)
--   · 프리미엄 상점 · 우선 관리자 전용 노출(admin_only = true) · 20 츄르
--  적용: Supabase SQL Editor 에 그대로 실행. (deco-gum.sql 이후)
-- =============================================================

-- 슬롯 구분: 하트 선글라스도 face 로 인식. 그 외 deco-* 는 head.
create or replace function public.deco_slot(p_item_id text)
returns text language sql immutable as $$
  select case when p_item_id in ('deco-blush', 'deco-anger', 'deco-pixel-shades', 'deco-alien-shades',
                                 'deco-bandage', 'deco-gum', 'deco-heart-shades')
                then 'face'
              when p_item_id like 'deco-%' then 'head' else null end;
$$;

-- 아이템 등록 (프리미엄 상점 · 아바타 꾸미기 · 우선 관리자 전용 · 20 츄르)
insert into public.store_items (id, name, price, emoji, description, premium, tier, admin_only, sort_order, is_active) values
  ('deco-heart-shades', '하트 선글라스', 20, '😎', '', true, null, true, 39, true)
on conflict (id) do update set
  name = excluded.name, price = excluded.price, emoji = excluded.emoji,
  premium = excluded.premium, tier = excluded.tier, admin_only = excluded.admin_only,
  sort_order = excluded.sort_order, is_active = excluded.is_active;
  -- description 은 관리자 편집 보존을 위해 갱신하지 않음

-- 확인
select id, name, price, emoji, description, premium, tier, admin_only, sort_order,
       public.deco_slot(id) as slot
  from public.store_items where id = 'deco-heart-shades';
