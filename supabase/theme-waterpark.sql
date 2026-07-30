-- 프리미엄 상점 · 꾸미기 테마 "워터파크" 추가 (우선 관리자 전용 노출)
--  theme-waterpark : 위에서 내려다본 수영장 물(찰랑) 배경 + 튜브·비치볼이 둥둥 떠 흔들
--  프리미엄(premium=true, tier=null=아무 프리미엄 그룹), 관리자 전용(admin_only=true), 30 츄르
--  설명(description)은 관리자 모드에서 입력 → 기존 값 보존(덮어쓰지 않음)
--  카테고리='theme', 활성=true. sort_order 는 최초 삽입 시에만 지정(이후 정렬 보존)
--  전제 컬럼: premium/tier(schema-v2), admin_only(avatar-decos.sql), category(store-item-category.sql)
--  적용 로직은 apply_group_theme RPC(임의 테마값 허용) 그대로 사용 → 백엔드 추가 변경 불필요

insert into public.store_items
  (id, name, price, emoji, description, premium, tier, admin_only, category, sort_order, is_active)
values
  ('theme-waterpark', '워터파크', 30, '🛟', '', true, null, true, 'theme', 15, true)
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
from public.store_items where id = 'theme-waterpark';
