-- =============================================================
--  약속 상세의 날짜 드롭다운에서 개별 약속 하나만 삭제하는 RPC.
--  (multi-appointments.sql 이 먼저 적용되어 있어야 함)
-- =============================================================
create or replace function public.delete_appointment(p_appointment_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_task_id uuid; v_gid uuid; v_ok boolean;
begin
  select task_id into v_task_id from public.appointments where id = p_appointment_id;
  if v_task_id is null then raise exception '존재하지 않는 약속입니다.'; end if;
  select group_id into v_gid from public.tasks where id = v_task_id;
  v_ok := public.is_group_owner(v_gid, auth.uid())
       or exists (select 1 from public.tasks t where t.id = v_task_id and t.created_by = auth.uid())
       or exists (select 1 from public.task_participants tp where tp.task_id = v_task_id and tp.user_id = auth.uid());
  if not v_ok then raise exception '약속 참여자만 삭제할 수 있습니다.'; end if;

  delete from public.appointments where id = p_appointment_id;
end;
$$;
grant execute on function public.delete_appointment(uuid) to authenticated;
