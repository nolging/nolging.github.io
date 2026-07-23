-- =============================================================
--  그룹별 위시 유형(카테고리) 편집
--  그룹 소유자가 위시 유형을 추가/삭제/이름·이모지·배지색 편집할 수 있도록
--  groups.wish_categories(JSONB) 에 [{name, emoji, bg, fg}, ...] 형태로 저장.
--  값이 없으면(null) 프론트에서 기본 6종(OTT/영화/게임/독서/운동/기타)을 사용.
--  쓰기 권한은 기존 groups_update RLS(소유자/관리자만)로 이미 제한됨 → 추가 정책 불필요.
--  적용: Supabase SQL Editor 에 그대로 실행. (schema-v2.sql 에도 반영해 둠)
-- =============================================================

alter table public.groups add column if not exists wish_categories jsonb;

comment on column public.groups.wish_categories is
  '그룹별 위시 유형 목록 [{name,emoji,bg,fg}]. null 이면 기본 6종 사용.';
