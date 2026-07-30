-- 비밀 게시판 이름 변경 (방장/관리자 · 프리미엄 그룹)
--  설정 페이지에서 게시판 이름을 수정할 때 사용. 권한은 board_can_manage(방장 또는 앱 관리자).
--  전제: board-item.sql(group_boards), secret-board.sql(board_can_manage) 먼저 적용돼 있어야 함.

create or replace function public.board_rename(p_group uuid, p_name text)
returns text language plpgsql security definer set search_path = public as $$
declare v_name text := btrim(coalesce(p_name, ''));
begin
  if not public.board_can_manage(p_group, auth.uid()) then raise exception '권한이 없습니다.'; end if;
  if v_name = '' then raise exception '게시판 이름을 입력해 주세요.'; end if;
  if char_length(v_name) > 20 then raise exception '게시판 이름은 20자까지예요.'; end if;
  if not exists (select 1 from public.group_boards where group_id = p_group) then
    raise exception '게시판이 없는 그룹이에요.'; end if;
  update public.group_boards set name = v_name where group_id = p_group;
  return v_name;
end $$;
grant execute on function public.board_rename(uuid, text) to authenticated;
