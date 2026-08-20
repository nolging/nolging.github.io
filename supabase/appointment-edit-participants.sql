-- =============================================================
--  약속/추억 수정 화면에서 참여자도 자유롭게 바꿀 수 있게 한다.
--  기존 update_appointment/add_appointment 는 새 참여자를 "이미 참여자 풀
--  (task_participants)에 있는 사람"으로만 걸러서 받았다. 그래서 위시를 처음
--  약속으로 넘길 때 한 명만 참여자로 골랐던 경우, 수정 화면에서 나머지 멤버를
--  체크해서 저장해도 풀 밖이라 조용히 걸러져 참여자가 바뀌지 않았다.
--  이제 두 함수 모두: 넘어온 참여자(p_participants) 중 실제 그룹 멤버인 사람은
--  먼저 task_participants 풀에 없으면 채워 넣고(다른 약속의 참여자를 지우지
--  않기 위해 풀은 넓히기만 한다), 그다음 그 약속의 참여자를 정확히 그 목록으로
--  맞춘다.
--  적용: Supabase SQL Editor 에 그대로 실행. (appointment-participants.sql 이후)
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

  -- 참여자 풀(task_participants) 확장: 새로 고른 멤버가 풀에 없으면 추가한다.
  -- (풀은 이 위시의 여러 약속에 걸친 합집합이라, 여기서 빠진 사람을 지우진 않는다.)
  insert into public.task_participants(task_id, user_id)
    select v_task_id, x from unnest(coalesce(p_participants, array[]::uuid[])) as x
    where public.is_group_member(v_gid, x) on conflict do nothing;

  delete from public.appointment_participants where appointment_id = p_appointment_id;
  insert into public.appointment_participants(appointment_id, user_id)
    select p_appointment_id, x from unnest(coalesce(p_participants, array[]::uuid[])) as x
    where public.is_group_member(v_gid, x)
  on conflict do nothing;

  return r;
end;
$$;
grant execute on function public.update_appointment(uuid, timestamptz, boolean, text, date, int, uuid[]) to authenticated;

create or replace function public.add_appointment(
  p_task_id uuid, p_scheduled_at timestamptz, p_time_set boolean,
  p_repeat text, p_repeat_until date, p_remind int, p_participants uuid[]
) returns public.appointments language plpgsql security definer set search_path = public as $$
declare r public.appointments; v_gid uuid; v_status text; v_remind_at timestamptz;
begin
  select group_id, status into v_gid, v_status from public.tasks where id = p_task_id;
  if v_gid is null then raise exception '존재하지 않는 항목입니다.'; end if;
  if not public.is_group_member(v_gid, auth.uid()) then
    raise exception '그룹 멤버만 추가할 수 있습니다.'; end if;
  if v_status = 'open' then raise exception '약속 상태에서만 일정을 추가할 수 있습니다.'; end if;
  if p_remind is not null and p_scheduled_at is not null then
    v_remind_at := p_scheduled_at - make_interval(mins => p_remind);
  end if;
  insert into public.appointments(task_id, scheduled_at, scheduled_time_set, repeat_rule, repeat_until, remind_min, remind_at, reminded)
  values (p_task_id, p_scheduled_at, coalesce(p_time_set, true), p_repeat, p_repeat_until, p_remind, v_remind_at, false)
  returning * into r;

  -- 참여자 풀 확장(update_appointment 와 동일한 이유 — 풀 밖 멤버라도 그룹 멤버면 받는다)
  insert into public.task_participants(task_id, user_id)
    select p_task_id, x from unnest(coalesce(p_participants, array[]::uuid[])) as x
    where public.is_group_member(v_gid, x) on conflict do nothing;

  insert into public.appointment_participants(appointment_id, user_id)
    select r.id, x from unnest(coalesce(p_participants, array[]::uuid[])) as x
    where public.is_group_member(v_gid, x)
  on conflict do nothing;

  return r;
end;
$$;
grant execute on function public.add_appointment(uuid, timestamptz, boolean, text, date, int, uuid[]) to authenticated;

notify pgrst, 'reload schema';
