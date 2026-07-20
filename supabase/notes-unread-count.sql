-- =============================================================
--  받은 쪽지 안 읽음 개수 (익명 포함)
--  익명 쪽지는 notes_select RLS 상 수신자가 원본 행을 직접 조회할 수 없어
--  클라이언트의 select count 가 익명 쪽지를 세지 못한다(→ 하단 탭 '쪽지' 점 안 뜸,
--  읽어도 카운트 갱신 안 됨). 수신자 본인의 미확인 쪽지(익명 포함)를 세는
--  SECURITY DEFINER 함수로 처리한다.
--  적용: Supabase SQL Editor 에 그대로 실행.
-- =============================================================

create or replace function public.unread_note_count()
returns integer language sql security definer set search_path = public stable as $$
  select count(*)::int
    from public.notes
   where recipient_id = auth.uid() and is_read = false;
$$;
grant execute on function public.unread_note_count() to authenticated;
