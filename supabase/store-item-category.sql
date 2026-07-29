-- 상점 아이템 카테고리를 관리자에서 직접 지정.
--  · category 값: 'special' | 'feature' | 'avatar' | 'theme' | 'etc' (null 이면 기존 ID 규칙 자동 분류)
--  · 정렬(sort_order)은 관리자 목록의 ▲▼ 로 섹션 내에서 조정(숫자 직접 입력 없음).
alter table public.store_items add column if not exists category text;
