-- 상점 아이템 이미지 업로드/배경색 지원
-- store_items 에 이미지(SVG 문자열)와 배경색 컬럼 추가.
--  · image_svg : 업로드한 SVG 원본(문자열). 클라이언트는 <img src="data:image/svg+xml,..."> 로 렌더(스크립트 실행 안 됨).
--  · image_bg  : 썸네일 배경색(CSS color/gradient). 비어 있으면 기존 기본 배경 사용.
-- 관리자 화면(아이템 추가/수정)에서 파일을 올리면 파일명과 무관하게 아이템 ID 기준으로 이 컬럼에 저장된다.
-- 쓰기 권한은 기존 store_items RLS(관리자만)를 그대로 따른다. 새 정책 추가 불필요.

alter table public.store_items add column if not exists image_svg text;
alter table public.store_items add column if not exists image_bg  text;
