-- =============================================================
--  약속(위시당 여러 개) — appointments 자식 테이블 도입
--  기존엔 tasks 에 scheduled_at/repeat_rule/... 을 직접 저장해 위시당
--  약속을 1개만 표현할 수 있었다. 이제 appointments 테이블로 분리해
--  위시 하나에 약속을 여러 개 만들 수 있게 하고, tasks 의 기존 컬럼들은
--  "가장 가까운 미래(없으면 가장 최근 과거) 약속"을 비추는 캐시로 유지한다.
--  (그룹 상세 카드·기존 조회 로직이 tasks.scheduled_at 등을 그대로 읽어도
--   동작하도록 하기 위함 — 캐시는 트리거로 자동 동기화된다.)
-- =============================================================

create table if not exists public.appointments (
  id                 uuid primary key default gen_random_uuid(),
  task_id            uuid not null references public.tasks(id) on delete cascade,
  scheduled_at       timestamptz,
  scheduled_time_set boolean not null default true,
  repeat_rule        text,
  repeat_until       date,
  remind_min         int,
  remind_at          timestamptz,
  reminded           boolean not null default false,
  created_at         timestamptz not null default now()
);
create index if not exists appointments_task_id_idx on public.appointments(task_id);
alter table public.appointments enable row level security;

-- 조회: 그룹 멤버(또는 관리자). 쓰기는 아래 SECURITY DEFINER RPC 로만.
drop policy if exists appt_select on public.appointments;
create policy appt_select on public.appointments
  for select to authenticated
  using (
    public.is_group_member((select group_id from public.tasks where id = task_id), auth.uid())
    or public.is_admin(auth.uid())
  );

-- ---- tasks 캐시 동기화 트리거 ----------------------------------
-- appointments 가 바뀔 때마다, 그 task 의 "가장 가까운 미래(없으면 가장
-- 최근 과거, 그마저 없으면 날짜 미정) 약속" 1건을 tasks 컬럼에 반영한다.
create or replace function public.appt_sync_task_cache_for(p_task_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v public.appointments;
begin
  select * into v from public.appointments
   where task_id = p_task_id
   order by
     (scheduled_at is not null and scheduled_at >= now()) desc,
     case when scheduled_at is not null and scheduled_at >= now() then scheduled_at end asc,
     scheduled_at desc nulls last
   limit 1;

  if v.id is null then
    update public.tasks
       set scheduled_at=null, scheduled_time_set=true, repeat_rule=null, repeat_until=null,
           remind_min=null, remind_at=null, reminded=false
     where id = p_task_id;
  else
    update public.tasks
       set scheduled_at=v.scheduled_at, scheduled_time_set=v.scheduled_time_set,
           repeat_rule=v.repeat_rule, repeat_until=v.repeat_until,
           remind_min=v.remind_min, remind_at=v.remind_at, reminded=v.reminded
     where id = p_task_id;
  end if;
end;
$$;

create or replace function public.appt_sync_task_cache_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.appt_sync_task_cache_for(coalesce(new.task_id, old.task_id));
  return null;
end;
$$;

drop trigger if exists appt_sync_task_cache on public.appointments;
create trigger appt_sync_task_cache
  after insert or update or delete on public.appointments
  for each row execute function public.appt_sync_task_cache_trg();

-- ---- 기존 단일 약속 데이터 백필 (idempotent) --------------------
insert into public.appointments(task_id, scheduled_at, scheduled_time_set, repeat_rule, repeat_until, remind_min, remind_at, reminded)
select id, scheduled_at, scheduled_time_set, repeat_rule, repeat_until, remind_min, remind_at, reminded
from public.tasks t
where t.status in ('accepted', 'done')
  and not exists (select 1 from public.appointments a where a.task_id = t.id);

-- ---- RPC: 약속 추가(이미 약속/추억 상태인 위시에 일정 하나 더) ----
create or replace function public.add_appointment(
  p_task_id uuid, p_scheduled_at timestamptz, p_time_set boolean,
  p_repeat text, p_repeat_until date, p_remind int
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
  return r;
end;
$$;
grant execute on function public.add_appointment(uuid, timestamptz, boolean, text, date, int) to authenticated;

-- ---- RPC: 특정 약속 하나 수정(여러 개 중 하나 선택 수정용) --------
create or replace function public.update_appointment(
  p_appointment_id uuid, p_scheduled_at timestamptz, p_time_set boolean,
  p_repeat text, p_repeat_until date, p_remind int
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
  return r;
end;
$$;
grant execute on function public.update_appointment(uuid, timestamptz, boolean, text, date, int) to authenticated;

-- ---- RPC: 위시 참여자 갱신(약속 잡기/수정 화면에서 분리 호출) ------
create or replace function public.set_task_participants(p_task_id uuid, p_participants uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare v_gid uuid;
begin
  select group_id into v_gid from public.tasks where id = p_task_id;
  if v_gid is null then raise exception '존재하지 않는 항목입니다.'; end if;
  if not public.is_group_member(v_gid, auth.uid()) then
    raise exception '그룹 멤버만 수정할 수 있습니다.'; end if;
  delete from public.task_participants where task_id = p_task_id;
  insert into public.task_participants(task_id, user_id)
    select p_task_id, x from unnest(coalesce(p_participants, array[]::uuid[])) as x
    where public.is_group_member(v_gid, x) on conflict do nothing;
end;
$$;
grant execute on function public.set_task_participants(uuid, uuid[]) to authenticated;

-- ---- 기존 RPC 재작성: appointments 를 소스로 사용하게 변경 --------

-- 놀기 신청 확정(open→accepted) + 첫 약속(appointments) 생성 + 참여자 저장
create or replace function public.schedule_task(
  p_task_id uuid, p_scheduled_at timestamptz, p_time_set boolean,
  p_repeat text, p_repeat_until date, p_remind int, p_participants uuid[]
) returns public.tasks language plpgsql security definer set search_path = public as $$
declare r public.tasks; v_gid uuid; v_remind_at timestamptz;
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
  values (p_task_id, p_scheduled_at, coalesce(p_time_set, true), p_repeat, p_repeat_until, p_remind, v_remind_at, false);

  delete from public.task_participants where task_id=p_task_id;
  insert into public.task_participants(task_id, user_id)
    select p_task_id, x from unnest(coalesce(p_participants, array[]::uuid[])) as x
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

-- '약속/추억'으로 바로 등록: 항목 생성 + 첫 약속(appointments) + 참여자
create or replace function public.create_task_scheduled(
  p_group_id uuid, p_title text, p_description text, p_category text, p_media_info jsonb,
  p_done boolean,
  p_scheduled_at timestamptz, p_time_set boolean, p_repeat text, p_repeat_until date,
  p_remind int, p_participants uuid[]
) returns public.tasks
language plpgsql security definer set search_path = public as $$
declare v_task public.tasks; v_remind_at timestamptz;
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
  values (v_task.id, p_scheduled_at, coalesce(p_time_set, true), p_repeat, p_repeat_until, p_remind, v_remind_at, false);

  insert into public.task_participants(task_id, user_id)
    select v_task.id, x from unnest(coalesce(p_participants, array[]::uuid[])) as x
    where public.is_group_member(p_group_id, x) on conflict do nothing;

  select * into v_task from public.tasks where id = v_task.id; -- 캐시 동기화 후 재조회
  return v_task;
end;
$$;
grant execute on function public.create_task_scheduled(uuid, text, text, text, jsonb, boolean, timestamptz, boolean, text, date, int, uuid[]) to authenticated;

-- reschedule_task 는 폐기(프론트는 update_appointment + set_task_participants 를 각각 호출)
drop function if exists public.reschedule_task(uuid, timestamptz, boolean, text, date, int, uuid[]);

-- 약속 취소(참여자 누구나) → 위시(open) 로 복귀. 해당 위시의 약속을 모두 삭제.
create or replace function public.cancel_appointment(p_task_id uuid)
returns public.tasks language plpgsql security definer set search_path = public as $$
declare r public.tasks; v_gid uuid; v_ok boolean;
begin
  select group_id into v_gid from public.tasks where id = p_task_id;
  if v_gid is null then raise exception '존재하지 않는 항목입니다.'; end if;
  v_ok := public.is_group_owner(v_gid, auth.uid())
       or exists (select 1 from public.tasks t where t.id = p_task_id and t.created_by = auth.uid())
       or exists (select 1 from public.task_participants tp where tp.task_id = p_task_id and tp.user_id = auth.uid());
  if not v_ok then raise exception '약속 참여자만 취소할 수 있습니다.'; end if;

  delete from public.appointments where task_id = p_task_id;
  update public.tasks
     set status='open', assignee_id=null, accepted_at=null, completed_at=null
   where id = p_task_id returning * into r;
  delete from public.task_participants where task_id = p_task_id;
  return r;
end;
$$;
grant execute on function public.cancel_appointment(uuid) to authenticated;

-- 마감 예정 미리 알림 발송(pg_cron 매분 호출) — 이제 appointments 단위로 순회
create or replace function public.dispatch_due_reminders()
returns integer language plpgsql security definer set search_path = public as $$
declare a record; v_title text; n int := 0;
begin
  for a in
    select ap.*, t.title as t_title, t.group_id as t_group_id, t.assignee_id as t_assignee_id
    from public.appointments ap
    join public.tasks t on t.id = ap.task_id
    where ap.remind_at is not null and ap.reminded = false
      and ap.remind_at <= now() and t.status = 'accepted'
  loop
    v_title := '[' || a.t_title || '] '
             || to_char(a.scheduled_at at time zone 'Asia/Seoul', 'MM월 DD일 HH24:MI');

    -- 참여자에게
    insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id)
    select p.user_id, null::uuid, 'reminder', v_title, '준비해 주세요', a.t_group_id, a.task_id
    from public.task_participants p where p.task_id = a.task_id;

    -- 참여자가 없으면 담당자에게라도
    if not found and a.t_assignee_id is not null then
      insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id)
      values (a.t_assignee_id, null::uuid, 'reminder', v_title, '준비해 주세요', a.t_group_id, a.task_id);
    end if;

    update public.appointments set reminded = true where id = a.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;
