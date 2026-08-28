-- 지우개(익명)로 보낸 쪽지에 아이템을 동봉하면 받는 사람 화면에 "수령하기" 버튼이
-- 안 뜨던 버그 수정. Supabase SQL Editor 에서 실행. 최종본은 schema-notes.sql 에도 반영돼 있음.
--
-- 원인: note_items 의 RLS 가 notes 테이블을 서브쿼리로 참조하는데, 그 서브쿼리도 일반
-- role 로 실행되는 이상 notes 자신의 RLS(anonymous=true 면 받는 사람에게도 원본 행을
-- 숨김 — 발신자 식별 정보 보호 목적)를 그대로 타서, 익명 쪽지의 note_items 는 받는
-- 사람에게 결과가 항상 0건으로 나왔다(listNoteItems() 가 note_items 를 직접 SELECT).
-- 발신자 식별과 무관하게 "이 쪽지의 당사자인지"만 판정하는 정의자 함수로 우회한다.

create or replace function public._note_participant(p_note_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.notes where id = p_note_id and (sender_id = auth.uid() or recipient_id = auth.uid()));
$$;
grant execute on function public._note_participant(uuid) to authenticated;

drop policy if exists note_items_select on public.note_items;
create policy note_items_select on public.note_items for select to authenticated using (
  public._note_participant(note_id)
);
