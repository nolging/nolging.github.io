-- =============================================================
--  tasks 캐시(가장 가까운 약속) 계산 시 "오늘"을 포함하도록 수정.
--  기존엔 시간 미설정(하루종일) 약속을 자정(00:00) 시각과 그대로
--  비교해 당일 자정이 지나자마자 "지난 약속"으로 취급됐다. 이제
--  시간 미설정 약속은 그 날이 끝날 때(다음날 자정)까지 "다가오는
--  약속"으로 본다. 시간이 입력된 약속은 그 시각이 지나기 전까지만
--  다가오는 약속으로 취급(기존과 동일).
--  (multi-appointments.sql 이 먼저 적용되어 있어야 함)
-- =============================================================
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

-- 이미 저장된 tasks 캐시를 새 기준으로 즉시 재계산(백필)
do $$
declare r record;
begin
  for r in select distinct task_id from public.appointments loop
    perform public.appt_sync_task_cache_for(r.task_id);
  end loop;
end $$;
