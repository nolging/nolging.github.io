-- =============================================================
--  약속별 참여자 (appointment_participants)
--  기존엔 참여자가 위시(task_participants) 전체에 공용이었다. 이제
--  "위시를 약속 상태로 처음 넘길 때 정한 참여자 풀"(task_participants)
--  은 그대로 유지하되, 그 풀 안에서 약속(appointment)마다 실제 참여자를
--  따로 고를 수 있게 한다. (multi-appointments.sql 이 먼저 적용되어
--  있어야 함)
-- =============================================================
create table if not exists public.appointment_participants (
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (appointment_id, user_id)
);
alter table public.appointment_participants enable row level security;

drop policy if exists ap_select on public.appointment_participants;
create policy ap_select on public.appointment_participants
  for select to authenticated
  using (
    public.is_group_member(
      (select t.group_id from public.tasks t
        join public.appointments a on a.task_id = t.id
       where a.id = appointment_id),
      auth.uid()
    )
    or public.is_admin(auth.uid())
  );

-- 기존 약속들(이 기능 배포 이전에 만들어진)은 풀 전체를 참여자로 백필
insert into public.appointment_participants(appointment_id, user_id)
select a.id, tp.user_id
from public.appointments a
join public.task_participants tp on tp.task_id = a.task_id
where not exists (select 1 from public.appointment_participants ap where ap.appointment_id = a.id);

-- ---- RPC 재작성: 약속 추가/수정에 참여자(풀의 부분집합) 반영 ------

drop function if exists public.add_appointment(uuid, timestamptz, boolean, text, date, int);
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

  -- 참여자는 위시 참여자 풀(task_participants)의 부분집합만 허용
  insert into public.appointment_participants(appointment_id, user_id)
    select r.id, x from unnest(coalesce(p_participants, array[]::uuid[])) as x
    where exists (select 1 from public.task_participants tp where tp.task_id = p_task_id and tp.user_id = x)
    on conflict do nothing;

  return r;
end;
$$;
grant execute on function public.add_appointment(uuid, timestamptz, boolean, text, date, int, uuid[]) to authenticated;

drop function if exists public.update_appointment(uuid, timestamptz, boolean, text, date, int);
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

  delete from public.appointment_participants where appointment_id = p_appointment_id;
  insert into public.appointment_participants(appointment_id, user_id)
    select p_appointment_id, x from unnest(coalesce(p_participants, array[]::uuid[])) as x
    where exists (select 1 from public.task_participants tp where tp.task_id = v_task_id and tp.user_id = x)
    on conflict do nothing;

  return r;
end;
$$;
grant execute on function public.update_appointment(uuid, timestamptz, boolean, text, date, int, uuid[]) to authenticated;

-- schedule_task: 첫 약속(appointments) 생성 시, 풀(task_participants) 과 동일하게
-- 그 약속의 참여자(appointment_participants)도 함께 채운다.
create or replace function public.schedule_task(
  p_task_id uuid, p_scheduled_at timestamptz, p_time_set boolean,
  p_repeat text, p_repeat_until date, p_remind int, p_participants uuid[]
) returns public.tasks language plpgsql security definer set search_path = public as $$
declare r public.tasks; v_gid uuid; v_remind_at timestamptz; v_appt_id uuid;
begin
  select group_id into v_gid from public.tasks where id = p_task_id;
  if v_gid is null then raise exception '존재하지 않는 항목입니다.'; end if;
  if not public.is_group_member(v_gid, auth.uid()) then
    raise exception '그룹 멤버만 신청할 수 있습니다.'; end if;

  update public.tasks
     set status='accepted', assignee_id=auth.uid(), accepted_at=now()
   where id=p_task_id and status='open' returning * into r;
  if r.id is null then raise exception '이미 신청되었거나 열려 있지 않은 항목입니다.'; end if;

  if p_remind is not null and p_scheduled_at is not null then
    v_remind_at := p_scheduled_at - make_interval(mins => p_remind);
  end if;
  insert into public.appointments(task_id, scheduled_at, scheduled_time_set, repeat_rule, repeat_until, remind_min, remind_at, reminded)
  values (p_task_id, p_scheduled_at, coalesce(p_time_set, true), p_repeat, p_repeat_until, p_remind, v_remind_at, false)
  returning id into v_appt_id;

  delete from public.task_participants where task_id=p_task_id;
  insert into public.task_participants(task_id, user_id)
    select p_task_id, x from unnest(coalesce(p_participants, array[]::uuid[])) as x
    where public.is_group_member(v_gid, x) on conflict do nothing;

  insert into public.appointment_participants(appointment_id, user_id)
    select v_appt_id, x from unnest(coalesce(p_participants, array[]::uuid[])) as x
    where public.is_group_member(v_gid, x) on conflict do nothing;

  -- 놀기 신청 알림: 약속 참여자에게만 (신청자 본인 제외)
  insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id)
  select tp.user_id, auth.uid(), 'accept',
         public.notif_member_name(v_gid, auth.uid()) || ' 님의 놀기 신청!',
         r.title, v_gid, p_task_id
  from public.task_participants tp
  where tp.task_id = p_task_id and tp.user_id <> auth.uid();

  select * into r from public.tasks where id = p_task_id; -- 캐시 동기화 후 재조회
  return r;
end;
$$;
grant execute on function public.schedule_task(uuid, timestamptz, boolean, text, date, int, uuid[]) to authenticated;

-- create_task_scheduled: 동일하게 첫 약속의 참여자도 함께 채운다.
create or replace function public.create_task_scheduled(
  p_group_id uuid, p_title text, p_description text, p_category text, p_media_info jsonb,
  p_done boolean,
  p_scheduled_at timestamptz, p_time_set boolean, p_repeat text, p_repeat_until date,
  p_remind int, p_participants uuid[]
) returns public.tasks
language plpgsql security definer set search_path = public as $$
declare v_task public.tasks; v_remind_at timestamptz; v_appt_id uuid;
begin
  if not public.is_group_member(p_group_id, auth.uid()) then
    raise exception '그룹 멤버만 등록할 수 있어요.';
  end if;

  -- 이 트랜잭션의 tasks INSERT 트리거가 새 항목 알림을 건너뛰게 함
  perform set_config('nolging.silent_task', 'on', true);

  insert into public.tasks(
    group_id, title, description, category, media_info, created_by,
    status, assignee_id, accepted_at, completed_at)
  values (
    p_group_id, p_title, coalesce(p_description, ''), p_category, p_media_info, auth.uid(),
    case when p_done then 'done' else 'accepted' end, auth.uid(), now(),
    case when p_done then now() else null end)
  returning * into v_task;

  if p_remind is not null and p_scheduled_at is not null then
    v_remind_at := p_scheduled_at - make_interval(mins => p_remind);
  end if;
  insert into public.appointments(task_id, scheduled_at, scheduled_time_set, repeat_rule, repeat_until, remind_min, remind_at, reminded)
  values (v_task.id, p_scheduled_at, coalesce(p_time_set, true), p_repeat, p_repeat_until, p_remind, v_remind_at, false)
  returning id into v_appt_id;

  insert into public.task_participants(task_id, user_id)
    select v_task.id, x from unnest(coalesce(p_participants, array[]::uuid[])) as x
    where public.is_group_member(p_group_id, x) on conflict do nothing;

  insert into public.appointment_participants(appointment_id, user_id)
    select v_appt_id, x from unnest(coalesce(p_participants, array[]::uuid[])) as x
    where public.is_group_member(p_group_id, x) on conflict do nothing;

  select * into v_task from public.tasks where id = v_task.id; -- 캐시 동기화 후 재조회
  return v_task;
end;
$$;
grant execute on function public.create_task_scheduled(uuid, text, text, text, jsonb, boolean, timestamptz, boolean, text, date, int, uuid[]) to authenticated;
