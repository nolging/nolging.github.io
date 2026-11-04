-- =============================================================
--  fix-schedule-task-appointments-regression.sql
--
--  증상: "놀기 신청"(또는 위시를 바로 약속으로 등록)으로 일정을 넣어 약속을 잡으면
--        약속 상세 화면엔 날짜가 보이는데, 상단 ⋮ 메뉴 > 수정 으로 들어간 수정
--        화면에서는 날짜 토글이 꺼져 있고 날짜가 통째로 비어 있다. 날짜 드롭다운
--        화살표도 뜨지 않는다.
--
--  원인: public.appointments 행이 아예 만들어지지 않았다.
--        schedule_task / create_task_scheduled / dispatch_due_reminders 세 함수가
--        schema-appointments.sql 과 schema-notifications.sql 양쪽에 중복 정의돼
--        있었고, 알림 문구 리팩터(notif-strict-templates-2.sql 계열)가 담긴 후자가
--        나중에 적용되면서 "appointments 를 모르는 옛 버전"이 올바른 버전을
--        덮어썼다. 옛 버전은 tasks 의 캐시 컬럼(scheduled_at 등)에만 날짜를 쓰고
--        appointments 행은 만들지 않는다 → 상세 화면(캐시를 읽음)엔 날짜가 보이고
--        수정 화면·날짜 드롭다운(appointments 를 읽음)엔 안 보인다.
--        (이 회귀는 과거에도 한 번 있었고 fix-appointments-regression.sql 로 고쳤는데,
--         schema-notifications.sql 에 옛 정의가 그대로 남아 있어 재발했다.
--         레포 쪽은 그 중복 정의를 삭제해 재발을 막았다.)
--
--  적용: Supabase SQL Editor 에서 이 파일 전체를 한 번 실행하면 된다(멱등).
--        1) 올바른 함수 3개를 다시 설치하고
--        2) 회귀 기간에 appointments 행 없이 만들어진 약속/추억을 백필한다.
-- =============================================================


-- -------------------------------------------------------------
--  1. 올바른 함수 재설치 (schema-appointments.sql 최종본과 동일)
-- -------------------------------------------------------------

create or replace function public.schedule_task(
  p_task_id uuid, p_scheduled_at timestamptz, p_time_set boolean,
  p_repeat text, p_repeat_until date, p_remind int, p_participants uuid[]
) returns public.tasks language plpgsql security definer set search_path = public as $$
declare r public.tasks; v_gid uuid; v_remind_at timestamptz; v_appt_id uuid; v_actor text; v_nt_t text; v_nt_b text;
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

  v_actor := public.notif_member_name(v_gid, auth.uid());
  select nr.title, nr.body into v_nt_t, v_nt_b from public.notif_render('accept', jsonb_build_object('actor', v_actor, 'title', r.title)) nr;
  if v_nt_t is not null then
    insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id)
    select tp.user_id, auth.uid(), 'accept', v_nt_t, v_nt_b, v_gid, p_task_id
    from public.task_participants tp
    where tp.task_id = p_task_id and tp.user_id <> auth.uid();
  end if;

  select * into r from public.tasks where id = p_task_id; -- appointments 트리거로 동기화된 캐시 재조회
  return r;
end; $$;


create or replace function public.create_task_scheduled(
  p_group_id uuid, p_title text, p_description text, p_category text, p_media_info jsonb,
  p_done boolean,
  p_scheduled_at timestamptz, p_time_set boolean, p_repeat text, p_repeat_until date,
  p_remind int, p_participants uuid[]
) returns public.tasks
language plpgsql security definer set search_path = public as $$
declare v_task public.tasks; v_remind_at timestamptz; v_appt_id uuid; v_t text; v_b text;
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

  if p_done then
    select r.title, r.body into v_t, v_b from public.notif_render('new_memory', jsonb_build_object('title', v_task.title)) r;
    if v_t is not null then
      insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id)
      select tp.user_id, auth.uid(), 'new_memory', v_t, v_b, p_group_id, v_task.id
      from public.task_participants tp
      where tp.task_id = v_task.id and tp.user_id <> auth.uid();
    end if;
  end if;

  select * into v_task from public.tasks where id = v_task.id; -- 캐시 동기화 후 재조회
  return v_task;
end;
$$;


create or replace function public.dispatch_due_reminders()
returns integer language plpgsql security definer set search_path = public as $$
declare a record; v_when text; v_nt_t text; v_nt_b text; n int := 0;
begin
  for a in
    select ap.*, t.title as t_title, t.group_id as t_group_id, t.assignee_id as t_assignee_id
    from public.appointments ap
    join public.tasks t on t.id = ap.task_id
    where ap.remind_at is not null and ap.reminded = false
      and ap.remind_at <= now() and t.status = 'accepted'
  loop
    v_when := to_char(a.scheduled_at at time zone 'Asia/Seoul', 'MM월 DD일 HH24:MI');
    select nr.title, nr.body into v_nt_t, v_nt_b from public.notif_render('reminder', jsonb_build_object('title', a.t_title, 'when', v_when)) nr;

    if v_nt_t is not null then
      insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id)
      select p.user_id, null::uuid, 'reminder', v_nt_t, v_nt_b, a.t_group_id, a.task_id
      from public.task_participants p where p.task_id = a.task_id;

      if not found and a.t_assignee_id is not null then
        insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id)
        values (a.t_assignee_id, null::uuid, 'reminder', v_nt_t, v_nt_b, a.t_group_id, a.task_id);
      end if;
    end if;

    update public.appointments set reminded = true where id = a.id;
    n := n + 1;
  end loop;
  return n;
end; $$;


grant execute on function public.schedule_task(uuid, timestamptz, boolean, text, date, int, uuid[]) to authenticated;
grant execute on function public.create_task_scheduled(uuid, text, text, text, jsonb, boolean, timestamptz, boolean, text, date, int, uuid[]) to authenticated;


-- -------------------------------------------------------------
--  2. 회귀 기간에 깨진 데이터 백필
--     tasks 캐시에만 남아 있는 약속/추억을 appointments 행으로 복원하고,
--     참여자 풀(task_participants)을 그 약속의 참여자로 채운다.
-- -------------------------------------------------------------

insert into public.appointments(task_id, scheduled_at, scheduled_time_set, repeat_rule, repeat_until, remind_min, remind_at, reminded)
select id, scheduled_at, scheduled_time_set, repeat_rule, repeat_until, remind_min, remind_at, reminded
from public.tasks t
where t.status in ('accepted', 'done')
  and not exists (select 1 from public.appointments a where a.task_id = t.id);

insert into public.appointment_participants(appointment_id, user_id)
select a.id, tp.user_id
from public.appointments a
join public.task_participants tp on tp.task_id = a.task_id
where not exists (select 1 from public.appointment_participants ap where ap.appointment_id = a.id);

-- 캐시를 "오늘 포함" 기준으로 즉시 재계산
do $do$
declare r record;
begin
  for r in select distinct task_id from public.appointments loop
    perform public.appt_sync_task_cache_for(r.task_id);
  end loop;
end $do$;

notify pgrst, 'reload schema';
