-- 프리미엄 상점 · 꾸미기 테마 2종 추가 (관리자 전용 노출)
--  · theme-bubble   버블버블   : 소라색+연보라 그라데이션 배경 + 비눗방울이 솟아올라 톡 터짐
--  · theme-firework 폭죽 팡팡  : 다크 밤하늘 + 반짝이는 별 + 폭죽(커플 기념일 폭죽 재사용)
--  · 둘 다 프리미엄(premium=true, tier=null=아무 프리미엄 그룹), 관리자 전용(admin_only=true), 30 츄르
--  · 설명(description)은 관리자 모드에서 나중에 입력 → 기존 값 보존(덮어쓰지 않음)
--  · 카테고리='theme', 활성=true. sort_order 는 최초 삽입 시에만 지정(이후 ▲▼/드래그 정렬 보존)
-- 전제: 아래 컬럼들이 이미 존재해야 함
--   premium/tier(schema-v2), admin_only(avatar-decos.sql), category(store-item-category.sql)

insert into public.store_items
  (id, name, price, emoji, description, premium, tier, admin_only, category, sort_order, is_active)
values
  ('theme-bubble',   '버블버블',  30, '🫧', '', true, null, true, 'theme', 13, true),
  ('theme-firework', '폭죽 팡팡', 30, '🎆', '', true, null, true, 'theme', 14, true)
on conflict (id) do update set
  name       = excluded.name,
  price      = excluded.price,
  emoji      = excluded.emoji,
  premium    = excluded.premium,
  tier       = excluded.tier,
  admin_only = excluded.admin_only,
  category   = excluded.category,
  is_active  = excluded.is_active;
  -- description, sort_order 는 관리자 편집 보존을 위해 갱신하지 않음

select id, name, price, emoji, premium, tier, admin_only, category, sort_order, is_active
from public.store_items where id in ('theme-bubble', 'theme-firework');
