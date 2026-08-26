-- =============================================================
--  schema-appointments.sql — 약속/기념일(appointments) 도메인 통합본
--
--  아래 8개의 개별 증분 SQL 파일을 하나로 합친 것이다(적용 순서대로):
--    1. multi-appointments.sql            — appointments 자식 테이블 도입
--    2. appointment-participants.sql      — 약속별 참여자(appointment_participants)
--    3. appointment-cache-today.sql       — tasks 캐시 "오늘" 포함 계산으로 수정
--    4. appointment-delete-single.sql     — 약속 1건만 삭제하는 RPC
--    5. anniv-next-milestone.sql          — 커플 공간 "다음 기념일" 커스텀 지정
--    6. appointment-edit-participants.sql — 수정 화면에서 참여자 자유롭게 변경
--    7. fix-appointments-regression.sql   — schedule_task 등 회귀 수정
--    8. appointment-pool-shrink.sql       — 참여자 풀이 줄어들 수 있도록 수정
--
--  같은 함수가 여러 파일에서 반복 재정의된 경우 이 파일엔 "최종 버전"만
--  실었다(예: update_appointment/delete_appointment 는 appointment-pool-shrink.sql
--  버전, schedule_task/create_task_scheduled/dispatch_due_reminders 는
--  fix-appointments-regression.sql 버전). 이 저장소 정리 작업의 일환으로
--  생성되었으며, supabase/schema.sql + supabase/schema-v2.sql 을 먼저 적용한
--  뒤 새 환경에 그대로 실행하면 이 파일이 대체하는 8개 파일을 순서대로 적용한
--  것과 동일한 최종 상태가 된다.
--
--  이미 운영 중인 프로덕션 DB 에는 위 8개 파일이 이미 하나씩 적용되어 있으므로
--  이 통합본을 다시 실행할 필요는 없다 — 이 파일은 문서화 및 재해복구/새
--  환경 구성용으로 존재한다.
--
--  참고: schedule_task/create_task_scheduled/dispatch_due_reminders 는
--  notifications 도메인의 public.notif_render(), public.notif_member_name()
--  함수를 호출한다 — 두 함수는 이 파일 밖(알림 관련 통합본)에 정의되어 있으므로
--  이 파일만 단독으로 새 환경에 실행하기 전에 notifications 도메인 통합본도
--  함께 적용되어 있어야 한다.
--
--  2차 정리(schema-v2.sql 분리)로 tasks 의 약속 캐시 컬럼 7개와 task_participants
--  테이블(참여자 풀)도 이 파일로 이관했다 — 둘 다 원래 schema-v2.sql 에 있었고,
--  이 파일의 함수들이 이미 광범위하게 참조하고 있었는데 테이블 자체는 없었다.
--  reschedule_task() 는 schema-v2.sql 에 있었지만 이 파일 자체 주석에 "폐기(프론트는
--  update_appointment + set_task_participants 를 각각 호출)"라고 적혀 있어 죽은
--  함수로 판단, 이관하지 않았다.
-- =============================================================


-- =============================================================
--  1. 테이블
-- =============================================================

-- tasks: 약속 캐시 컬럼(schema-v2.sql 에서 이관). "가장 가까운 미래(없으면 가장 최근
-- 과거) 약속"을 비추는 캐시로, appointments 도입 이후에도 그대로 유지되며 트리거로
-- 자동 동기화된다(그룹 상세 카드 등 기존 조회 로직이 이 컬럼들을 그대로 쓰기 때문).
alter table public.tasks add column if not exists scheduled_at timestamptz;
alter table public.tasks add column if not exists repeat_rule  text;
alter table public.tasks add column if not exists scheduled_time_set boolean not null default true;
alter table public.tasks add column if not exists repeat_until date;
alter table public.tasks add column if not exists remind_min int;         -- 분(약속 시간 기준 전), null=없음, 0=정시
alter table public.tasks add column if not exists remind_at  timestamptz; -- 계산된 알림 시각
alter table public.tasks add column if not exists reminded   boolean not null default false;

-- 약속 참여 멤버 풀(schema-v2.sql 에서 이관). "위시를 약속 상태로 처음 넘길 때 정한
-- 참여자 풀" — 아래 appointments 도입 이후에도 폐기되지 않고, 그 풀 안에서 약속마다
-- (appointment_participants 로) 실제 참여자를 따로 고르는 구조로 계속 쓰인다.
create table if not exists public.task_participants (
  task_id    uuid not null references public.tasks(id)     on delete cascade,
  user_id    uuid not null references public.profiles(id)  on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);
alter table public.task_participants enable row level security;

-- 그룹 멤버는 참여자 목록 조회 가능(쓰기는 이 파일의 RPC 로만)
drop policy if exists tp_select on public.task_participants;
create policy tp_select on public.task_participants
  for select to authenticated
  using (
    public.is_group_member((select group_id from public.tasks where id = task_id), auth.uid())
    or public.is_admin(auth.uid())
  );

-- 약속(위시당 여러 개 가능). tasks 의 기존 scheduled_at/repeat_rule/... 컬럼은
-- "가장 가까운 미래(없으면 가장 최근 과거) 약속"을 비추는 캐시로 유지되며,
-- 트리거로 자동 동기화된다(그룹 상세 카드 등 기존 조회 로직 호환용).
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

-- 약속별 참여자. "위시를 약속 상태로 처음 넘길 때 정한 참여자 풀"
-- (task_participants) 은 그대로 유지하되, 그 풀 안에서 약속(appointment)마다
-- 실제 참여자를 따로 고를 수 있게 한다.
create table if not exists public.appointment_participants (
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (appointment_id, user_id)
);
alter table public.appointment_participants enable row level security;

-- 커플 공간: "다음 기념일" 커스텀 지정용 컬럼. 기본은 자동(다음 100일 단위
-- 또는 다음 N주년 중 더 가까운 쪽), 이 컬럼들로 그룹 멤버가 직접 지정 가능.
alter table public.groups add column if not exists next_anniv_kind text check (next_anniv_kind in ('days', 'years'));
alter table public.groups add column if not exists next_anniv_value integer check (next_anniv_value > 0);


-- =============================================================
--  2. RLS 정책
-- =============================================================

-- 조회: 그룹 멤버(또는 관리자). 쓰기는 아래 SECURITY DEFINER RPC 로만.
drop policy if exists appt_select on public.appointments;
create policy appt_select on public.appointments
  for select to authenticated
  using (
    public.is_group_member((select group_id from public.tasks where id = task_id), auth.uid())
    or public.is_admin(auth.uid())
  );

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


-- =============================================================
--  3. 함수
-- =============================================================

-- ---- tasks 캐시 동기화 -----------------------------------------
-- appointments 가 바뀔 때마다, 그 task 의 "다가오는 약속" 1건을 tasks 컬럼에
-- 반영한다. 시간 미설정(하루종일) 약속은 그 날이 끝날 때(다음날 자정)까지
-- "다가오는 약속"으로 보고, 시간이 입력된 약속은 그 시각이 지나기 전까지만
-- 다가오는 약속으로 취급한다(appointment-cache-today.sql 최종본).
create or replace function public.appt_sync_task_cache_for(p_task_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v public.appointments;
begin
  select * into v from public.appointments
   where task_id = p_task_id
   order by
     (scheduled_at is not null and
        (case when scheduled_time_set then scheduled_at
              else date_trunc('day', scheduled_at) + interval '1 day' end) > now()
     ) desc,
     case when scheduled_at is not null and
        (case when scheduled_time_set then scheduled_at
              else date_trunc('day', scheduled_at) + interval '1 day' end) > now()
       then scheduled_at end asc,
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

-- ---- RPC: 약속 추가(이미 약속/추억 상태인 위시에 일정 하나 더) ----
-- 참여자 목록(p_participants)에 있는 그룹 멤버는 먼저 위시 참여자 풀
-- (task_participants)에 없으면 채워 넣고(풀은 넓히기만 함), 그 다음 이
-- 약속의 참여자를 정확히 그 목록으로 맞춘다(appointment-edit-participants.sql 최종본).
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

-- ---- RPC: 특정 약속 하나 수정(여러 개 중 하나 선택 수정용) --------
-- 참여자를 바꾼 뒤, 위시 참여자 풀(task_participants)을 "이 위시의 모든
-- 약속(appointment_participants)에 걸친 합집합"으로 다시 계산한다 — 그
-- 위시의 어느 약속에도 더는 참여하지 않는 사람만 풀에서 빠진다(다른 약속에
-- 남아 있으면 그대로 유지). 약속이 하나뿐인 보통의 경우엔 풀이 정확히 그
-- 약속의 참여자와 같아진다(appointment-pool-shrink.sql 최종본).
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

-- ---- RPC: 약속 상세의 날짜 드롭다운에서 개별 약속 하나만 삭제 -----
-- 삭제 후에도 update_appointment 와 동일하게 참여자 풀을 재계산(축소)한다.
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

-- ---- RPC: 놀기 신청 확정(open→accepted) + 첫 약속 생성 + 참여자 저장 ----
-- appointments/appointment_participants 행을 함께 생성하고, 알림은
-- notif_render 기반(템플릿이 없거나 비활성이면 발송하지 않음)으로 보낸다
-- (fix-appointments-regression.sql 최종본 — notif-strict-templates 계열이
-- 이 함수를 예전(멀티 약속 도입 이전) 본문으로 되돌렸던 회귀를 수정).
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

-- ---- RPC: '약속/추억'으로 바로 등록: 항목 생성 + 첫 약속 + 참여자 -----
-- (fix-appointments-regression.sql 최종본)
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

-- reschedule_task 는 폐기(프론트는 update_appointment + set_task_participants 를 각각 호출)
drop function if exists public.reschedule_task(uuid, timestamptz, boolean, text, date, int, uuid[]);

-- ---- RPC: 약속 취소(참여자 누구나) → 위시(open) 로 복귀 -----------
-- 해당 위시의 약속을 모두 삭제.
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

-- ---- 마감 예정 미리 알림 발송(pg_cron 매분 호출) -------------------
-- appointments 단위로 순회하고, 알림 문구는 notif_render 로 템플릿이
-- 없거나 비활성이면 보내지 않는다(fix-appointments-regression.sql 최종본).
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

-- ---- RPC: 커플 공간 "다음 기념일" 커스텀 지정 ----------------------
-- 그룹 update 는 소유자만 가능하므로, 멤버 누구나 설정할 수 있게 RPC 로 제공.
-- p_kind = null 이면 자동으로 되돌림(커스텀 해제).
create or replace function public.set_group_next_anniv(p_group_id uuid, p_kind text, p_value integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_group_member(p_group_id, auth.uid()) then
    raise exception 'not authorized';
  end if;
  if p_kind is null then
    update public.groups set next_anniv_kind = null, next_anniv_value = null where id = p_group_id;
  else
    if p_kind not in ('days', 'years') then raise exception 'invalid kind'; end if;
    if p_value is null or p_value <= 0 then raise exception 'invalid value'; end if;
    update public.groups set next_anniv_kind = p_kind, next_anniv_value = p_value where id = p_group_id;
  end if;
end;
$$;


-- =============================================================
--  4. 트리거
-- =============================================================

-- appointments 가 바뀔 때마다 tasks 캐시를 재계산.
drop trigger if exists appt_sync_task_cache on public.appointments;
create trigger appt_sync_task_cache
  after insert or update or delete on public.appointments
  for each row execute function public.appt_sync_task_cache_trg();


-- =============================================================
--  5. 백필(기존 데이터 이관) — 모두 idempotent(not exists 가드)
-- =============================================================

-- 기존 단일 약속 데이터(tasks.scheduled_at 등)를 appointments 로 백필.
insert into public.appointments(task_id, scheduled_at, scheduled_time_set, repeat_rule, repeat_until, remind_min, remind_at, reminded)
select id, scheduled_at, scheduled_time_set, repeat_rule, repeat_until, remind_min, remind_at, reminded
from public.tasks t
where t.status in ('accepted', 'done')
  and not exists (select 1 from public.appointments a where a.task_id = t.id);

-- 이 기능 배포 이전에 만들어진 기존 약속들은 참여자 풀 전체를 참여자로 백필.
insert into public.appointment_participants(appointment_id, user_id)
select a.id, tp.user_id
from public.appointments a
join public.task_participants tp on tp.task_id = a.task_id
where not exists (select 1 from public.appointment_participants ap where ap.appointment_id = a.id);

-- 이미 저장된 tasks 캐시를 "오늘 포함" 기준으로 즉시 재계산.
do $$
declare r record;
begin
  for r in select distinct task_id from public.appointments loop
    perform public.appt_sync_task_cache_for(r.task_id);
  end loop;
end $$;

-- notif-strict-templates 계열이 schedule_task/create_task_scheduled 를 옛
-- 방식으로 되돌렸던 회귀 기간 동안 appointments 행 없이 만들어진 약속/추억을
-- 다시 백필: tasks 의 캐시 컬럼으로부터 appointments 행을 만들고,
-- task_participants 를 그대로 그 약속의 참여자로 채운다.
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


-- =============================================================
--  6. 권한(grant) — 최종 함수 시그니처 기준
-- =============================================================
grant execute on function public.add_appointment(uuid, timestamptz, boolean, text, date, int, uuid[]) to authenticated;
grant execute on function public.update_appointment(uuid, timestamptz, boolean, text, date, int, uuid[]) to authenticated;
grant execute on function public.delete_appointment(uuid) to authenticated;
grant execute on function public.set_task_participants(uuid, uuid[]) to authenticated;
grant execute on function public.schedule_task(uuid, timestamptz, boolean, text, date, int, uuid[]) to authenticated;
grant execute on function public.create_task_scheduled(uuid, text, text, text, jsonb, boolean, timestamptz, boolean, text, date, int, uuid[]) to authenticated;
grant execute on function public.cancel_appointment(uuid) to authenticated;
grant execute on function public.set_group_next_anniv(uuid, text, integer) to authenticated;

notify pgrst, 'reload schema';
