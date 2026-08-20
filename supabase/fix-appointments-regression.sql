-- =============================================================
--  회귀 수정: notif-strict-templates.sql / notif-strict-templates-2.sql 가
--  schedule_task / create_task_scheduled / dispatch_due_reminders 를 다시
--  정의하면서, 그 함수들을 작성할 때 참고한 "예전(멀티 약속·약속별 참여자
--  도입 이전) 버전" 본문을 그대로 가져다 썼다. 그 결과 세 함수 모두
--  multi-appointments.sql / appointment-participants.sql 이 추가한
--    · public.appointments 행 생성
--    · public.appointment_participants 행 생성
--    · dispatch_due_reminders 의 appointments 기준 순회
--  를 잃어버리고, tasks.scheduled_at/remind_at 을 직접 쓰는 옛 방식으로
--  되돌아가 있었다.
--
--  체감 증상: "놀기 신청"(schedule_task) 이나 "위시를 바로 약속/추억으로
--  등록"(create_task_scheduled) 으로 만든 약속은 appointments 행이 아예
--  없어서, 약속 수정 페이지가 그 약속을 못 찾고(참여자 체크가 풀린 채로
--  뜨거나 저장 시 "존재하지 않는 약속입니다") 백엔드에서 참여자를 다시
--  채워 넣어야 했다("+ 새 일정 추가"로 만든 약속은 이 함수들을 안 거치므로
--  영향 없음). 리마인더도 tasks.remind_at 을 더 이상 아무도 채우지 않아
--  실제로는 발송되지 않고 있었을 것이다(pg_cron 대상이 0건).
--
--  이 파일은 세 함수 모두 appointments/appointment_participants 를 다시
--  올바르게 채우도록 고치되, notif_render 기반(템플릿 없으면 발송 안 함)
--  알림 로직은 그대로 유지한다.
--  적용: Supabase SQL Editor 에 그대로 실행.
--  (appointment-participants.sql, notif-strict-templates-2.sql 이후)
-- =============================================================

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
grant execute on function public.schedule_task(uuid, timestamptz, boolean, text, date, int, uuid[]) to authenticated;

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
grant execute on function public.create_task_scheduled(uuid, text, text, text, jsonb, boolean, timestamptz, boolean, text, date, int, uuid[]) to authenticated;

-- dispatch_due_reminders 도 같은 사고로 tasks 기준(구 방식)으로 되돌아가 있었다.
-- appointments 기준으로 순회하도록 복원(참여자 없으면 담당자에게, 알림 문구는
-- notif_render 로 템플릿이 없거나 비활성이면 보내지 않음).
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

-- 이 함수들이 다시 규정된 이후 appointments 없이 만들어진(회귀 기간 동안 생성된)
-- 기존 약속/추억을 백필: tasks 의 캐시 컬럼으로부터 appointments 행을 만들고,
-- task_participants 를 그대로 그 약속의 참여자로 채운다(idempotent).
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

notify pgrst, 'reload schema';
