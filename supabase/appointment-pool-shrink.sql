-- =============================================================
--  참여자 풀(task_participants) 이 넓히기만 하고 줄어들진 않던 문제.
--  update_appointment 는 새로 체크한 멤버를 풀에 넣기만 하고, 체크 해제한
--  멤버를 풀에서 빼진 않았다(다른 약속의 참여자일 수 있어 안전하게 그렇게
--  뒀었다). 그런데 그룹 상세의 약속 카드/약속 상세 페이지는 정확히 이
--  풀(task_participants)로 참여자를 표시하기 때문에, 수정 화면에서 "나"를
--  참여자에서 빼고 저장해도 그 두 화면엔 여전히 남아 보였다.
--
--  이제 update_appointment/delete_appointment 는 참여자를 바꾼 뒤, 풀을
--  "이 위시의 모든 약속(appointment_participants)에 걸친 합집합"으로
--  다시 계산한다 — 즉 그 위시의 어느 약속에도 더는 참여하지 않는 사람만
--  풀에서 빠진다(다른 약속에 남아 있으면 그대로 유지). 약속이 하나뿐인
--  보통의 경우엔 풀이 정확히 그 약속의 참여자와 같아진다.
--  적용: Supabase SQL Editor 에 그대로 실행.
--  (appointment-edit-participants.sql, appointment-delete-single.sql 이후)
-- =============================================================

create or replace function public.update_appointment(
  p_appointment_id uuid, p_scheduled_at timestamptz, p_time_set boolean,
  p_repeat text, p_repeat_until date, p_remind int, p_participants uuid[]
) returns public.appointments language plpgsql security definer set search_path = public as $$
declare r public.appointments; v_task_id uuid; v_gid uuid; v_remind_at timestamptz;
begin
  select task_id into v_task_id from public.appointments where id = p_appointment_id;
  if v_task_id is null then raise exception '존재하지 않는 약속입니다.'; end if;
  select group_id into v_gid from public.tasks where id = v_task_id;
  if not public.is_group_member(v_gid, auth.uid()) then
    raise exception '그룹 멤버만 수정할 수 있습니다.'; end if;
  if p_remind is not null and p_scheduled_at is not null then
    v_remind_at := p_scheduled_at - make_interval(mins => p_remind);
  end if;
  update public.appointments
     set scheduled_at=p_scheduled_at, scheduled_time_set=coalesce(p_time_set, true),
         repeat_rule=p_repeat, repeat_until=p_repeat_until,
         remind_min=p_remind, remind_at=v_remind_at, reminded=false
   where id = p_appointment_id
  returning * into r;

  -- 참여자 풀(task_participants) 확장: 새로 고른 멤버가 풀에 없으면 먼저 추가한다.
  insert into public.task_participants(task_id, user_id)
    select v_task_id, x from unnest(coalesce(p_participants, array[]::uuid[])) as x
    where public.is_group_member(v_gid, x) on conflict do nothing;

  delete from public.appointment_participants where appointment_id = p_appointment_id;
  insert into public.appointment_participants(appointment_id, user_id)
    select p_appointment_id, x from unnest(coalesce(p_participants, array[]::uuid[])) as x
    where public.is_group_member(v_gid, x)
  on conflict do nothing;

  -- 풀 재계산(축소): 이 위시의 어느 약속에도 더는 참여하지 않는 사람만 풀에서 뺀다.
  delete from public.task_participants tp
   where tp.task_id = v_task_id
     and not exists (
       select 1 from public.appointment_participants ap
       join public.appointments a on a.id = ap.appointment_id
       where a.task_id = v_task_id and ap.user_id = tp.user_id
     );

  return r;
end;
$$;
grant execute on function public.update_appointment(uuid, timestamptz, boolean, text, date, int, uuid[]) to authenticated;

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

  -- 풀 재계산(축소): 삭제된 약속에만 있던 참여자는 남은 약속들의 합집합에서 빠지면 제외.
  delete from public.task_participants tp
   where tp.task_id = v_task_id
     and not exists (
       select 1 from public.appointment_participants ap
       join public.appointments a on a.id = ap.appointment_id
       where a.task_id = v_task_id and ap.user_id = tp.user_id
     );
end;
$$;
grant execute on function public.delete_appointment(uuid) to authenticated;

notify pgrst, 'reload schema';
