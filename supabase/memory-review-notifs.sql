-- =============================================================
--  새 알림 2종: 새 추억 생성 / 새 리뷰 등록
--
--  1) 새 추억 생성(new_memory): 약속(accepted) 상태였던 위시가 추억(done)으로 바뀌거나,
--     처음부터 추억 상태로 새로 등록됐을 때 — 그 위시의 참여자(작성자/완료 처리한 사람 제외)에게.
--     · 기존 약속→추억 전환은 completeTask()(순수 update, RPC 아님)라서 UPDATE 트리거로 처리.
--     · 신규로 추억 상태 등록은 create_task_scheduled RPC 안에서 직접 처리(참여자 INSERT 이후).
--       이 함수는 트랜잭션 내내 'nolging.silent_task' 를 켜서 "new_task" 알림(트리거)을 죽이므로,
--       new_memory 는 그 트리거가 아니라 함수 본문에서 직접 insert 한다.
--  2) 새 리뷰 등록(new_review): submit_review 로 처음 리뷰를 남겼을 때(수정 재저장은 제외) —
--     같은 추억의 다른 참여자에게.
--
--  적용: Supabase SQL Editor 에 그대로 실행. schema-v2.sql 이후에 실행할 것.
-- =============================================================

-- ── 1) 약속(accepted) → 추억(done) 전환: UPDATE 트리거 ──────────────
create or replace function public.tg_notify_task_done()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id)
  select tp.user_id, auth.uid(), 'new_memory',
         '새로운 추억이 생겼어요',
         '[' || NEW.title || '] 리뷰를 작성해 주세요',
         NEW.group_id, NEW.id
  from public.task_participants tp
  where tp.task_id = NEW.id and tp.user_id <> auth.uid();
  return NEW;
end;
$$;
drop trigger if exists trg_notify_task_done on public.tasks;
create trigger trg_notify_task_done after update on public.tasks
  for each row when (OLD.status = 'accepted' and NEW.status = 'done')
  execute function public.tg_notify_task_done();

-- ── 2) 신규 추억(done) 등록: create_task_scheduled 본문에 직접 삽입 ──
-- (전체를 다시 정의: 기존 로직은 그대로, 참여자 저장 뒤 p_done 일 때만 알림 추가)
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

  if p_remind is not null and p_scheduled_at is not null then
    v_remind_at := p_scheduled_at - make_interval(mins => p_remind);
  end if;

  insert into public.tasks(
    group_id, title, description, category, media_info, created_by,
    status, assignee_id, accepted_at, completed_at,
    scheduled_at, scheduled_time_set, repeat_rule, repeat_until,
    remind_min, remind_at, reminded)
  values (
    p_group_id, p_title, coalesce(p_description, ''), p_category, p_media_info, auth.uid(),
    case when p_done then 'done' else 'accepted' end, auth.uid(), now(),
    case when p_done then now() else null end,
    p_scheduled_at, coalesce(p_time_set, true), p_repeat, p_repeat_until,
    p_remind, v_remind_at, false)
  returning * into v_task;

  insert into public.task_participants(task_id, user_id)
    select v_task.id, x from unnest(coalesce(p_participants, array[]::uuid[])) as x
    where public.is_group_member(p_group_id, x) on conflict do nothing;

  -- 처음부터 추억(done) 상태로 등록한 경우 → 참여자(작성자 제외)에게 '새 추억' 알림
  if p_done then
    insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id)
    select tp.user_id, auth.uid(), 'new_memory',
           '새로운 추억이 생겼어요',
           '[' || v_task.title || '] 리뷰를 작성해 주세요',
           p_group_id, v_task.id
    from public.task_participants tp
    where tp.task_id = v_task.id and tp.user_id <> auth.uid();
  end if;

  return v_task;
end; $$;
grant execute on function public.create_task_scheduled(uuid, text, text, text, jsonb, boolean, timestamptz, boolean, text, date, int, uuid[]) to authenticated;

-- ── 3) 새 리뷰 등록: submit_review 본문에 직접 삽입 ──
-- (전체를 다시 정의: 기존 로직은 그대로, v_rewarded — 이번이 첫 작성일 때만 — 알림 추가)
create or replace function public.submit_review(p_task_id uuid, p_rating numeric, p_comment text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_gid uuid; v_status text; r public.task_reviews; v_rewarded boolean; v_balance integer;
begin
  select group_id, status into v_gid, v_status from public.tasks where id = p_task_id;
  if v_gid is null then raise exception '존재하지 않는 항목입니다.'; end if;
  if not public.is_group_member(v_gid, auth.uid()) then
    raise exception '그룹 멤버만 가능합니다.'; end if;
  if v_status <> 'done' then
    raise exception '완료된 추억에만 리뷰를 남길 수 있습니다.'; end if;
  if not public.is_task_participant(p_task_id, auth.uid()) then
    raise exception '약속에 참여한 멤버만 리뷰를 작성할 수 있습니다.'; end if;
  if p_rating is null or p_rating < 0.5 or p_rating > 5 or (p_rating * 2) <> floor(p_rating * 2) then
    raise exception '별점은 0.5~5 사이 0.5 단위여야 합니다.'; end if;

  insert into public.task_reviews(task_id, group_id, author_id, rating, comment)
    values (p_task_id, v_gid, auth.uid(), p_rating, coalesce(p_comment, ''))
  on conflict (task_id, author_id) do update
    set rating = excluded.rating, comment = excluded.comment, updated_at = now()
  returning * into r;

  -- 리뷰 작성 보상 1 츄르 (태스크당 1회, 수정 재작성해도 중복 지급 안 됨)
  with ins as (
    insert into public.coin_ledger(user_id, delta, reason, ref_type, ref_id)
      values (auth.uid(), 1, '리뷰 작성 보상', 'review_reward', p_task_id)
    on conflict do nothing
    returning 1
  )
  select exists (select 1 from ins) into v_rewarded;

  select coalesce(sum(delta), 0)::integer into v_balance
    from public.coin_ledger where user_id = auth.uid();

  -- 첫 리뷰 작성일 때만(수정 재저장 시 중복 알림 방지) 다른 참여자에게 알림
  if v_rewarded then
    insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id)
    select tp.user_id, auth.uid(), 'new_review',
           coalesce(public.notif_member_name(v_gid, auth.uid()), '멤버') || ' 님이 리뷰를 작성했어요',
           '별이 몇 개나 떴을까요?',
           v_gid, p_task_id
    from public.task_participants tp
    where tp.task_id = p_task_id and tp.user_id <> auth.uid();
  end if;

  return jsonb_build_object(
    'id', r.id, 'rating', r.rating, 'comment', r.comment,
    'rewarded', v_rewarded, 'balance', v_balance
  );
end;
$$;
grant execute on function public.submit_review(uuid, numeric, text) to authenticated;

notify pgrst, 'reload schema';
