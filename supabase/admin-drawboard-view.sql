-- 관리자 미가입 그룹 낙서장(DrawBoard) 열람 허용
--   · gd_select RLS 에 is_admin 바이패스 추가 → 실시간 접속자가 없어도
--     기존에 저장된 그림(listDrawingStrokes)이 관리자에게 보이게 한다.
--   · 프론트(DrawBoard.jsx)는 isMember=false 일 때 접속자 없으면 아바타를
--     아예 안 그리도록 별도 수정(빈 배열 폴백 조건).
-- 적용: Supabase SQL Editor 에 그대로 실행.

drop policy if exists gd_select on public.group_drawings;
create policy gd_select on public.group_drawings for select
  using (public.is_group_member(group_id, auth.uid()) or public.is_admin(auth.uid()));
