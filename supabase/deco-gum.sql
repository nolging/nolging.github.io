-- =============================================================
--  프로필 꾸미기(얼굴 장식) 추가: 풍선껌
--   · 입 위치에서 껌이 부풀었다 작아지는 애니메이션. face 슬롯
--     (홍조·빠직·선글라스·반창고와 같은 슬롯 → 하나만 장착)
--   · 우선 관리자 전용 노출(admin_only = true)
--  적용: Supabase SQL Editor 에 그대로 실행. (deco-bandage.sql 이후)
-- =============================================================

-- 슬롯 구분: 풍선껌도 face 로 인식. 그 외 deco-* 는 head.
create or replace function public.deco_slot(p_item_id text)
returns text language sql immutable as $$
  select case when p_item_id in ('deco-blush', 'deco-anger', 'deco-pixel-shades', 'deco-alien-shades',
                                 'deco-bandage', 'deco-gum')
                then 'face'
              when p_item_id like 'deco-%' then 'head' else null end;
$$;

-- 아이템 등록 (프리미엄 상점 · 아바타 꾸미기 · 우선 관리자 전용)
insert into public.store_items (id, name, price, emoji, description, premium, tier, admin_only, sort_order, is_active) values
  ('deco-gum', '풍선껌', 20, '🩷', '와우', true, null, true, 38, true)
on conflict (id) do update set
  name = excluded.name, price = excluded.price, emoji = excluded.emoji, description = excluded.description,
  premium = excluded.premium, tier = excluded.tier, admin_only = excluded.admin_only,
  sort_order = excluded.sort_order, is_active = excluded.is_active;

-- 확인
select id, name, price, emoji, description, premium, tier, admin_only, sort_order,
       public.deco_slot(id) as slot
  from public.store_items where id in ('deco-bandage', 'deco-gum') order by sort_order;
