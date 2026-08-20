-- =============================================================
--  알림 발송을 notif_templates 에 전적으로 의존하도록 강화.
--   1) notif_render(): 템플릿이 없거나 active=false 면 title/body 를 null 로 반환
--      (지금까지는 존재 여부만 봤고 active 는 무시했다 — "비활성으로 꺼도 실제로는
--      계속 나간다"는 admin-notif-active.sql 의 알려진 한계를 여기서 없앤다).
--   2) notif_render 를 쓰는 모든 발송 지점에서 "템플릿 없으면 하드코딩 문구로 대체"를
--      없애고, title 이 null 이면(=템플릿 없음/비활성) 그 알림을 아예 보내지 않는다.
--  적용: Supabase SQL Editor 에 그대로 실행. (notif-templates.sql, admin-notif-active.sql,
--  notif-admin-catalog-fix.sql 이후)
-- =============================================================

-- ── 1) 템플릿 없음/비활성 → null (기존: 존재 여부만 확인) ──
create or replace function public.notif_render(p_key text, p_vars jsonb default '{}'::jsonb, out title text, out body text)
language plpgsql stable set search_path = public as $$
declare t public.notif_templates; k text; v text;
begin
  select * into t from public.notif_templates where key = p_key and active;
  if t.key is null then title := null; body := null; return; end if;
  title := t.title; body := t.body;
  for k, v in select key, value from jsonb_each_text(coalesce(p_vars, '{}'::jsonb)) loop
    title := replace(title, '{' || k || '}', coalesce(v, ''));
    body  := replace(body,  '{' || k || '}', coalesce(v, ''));
  end loop;
end $$;

-- ── 2) 이번에 새로 만든 4개 함수: 하드코딩 폴백 제거, 템플릿 없으면 발송 자체를 건너뜀 ──

create or replace function public.tg_notify_task_done()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_t text; v_b text;
begin
  select r.title, r.body into v_t, v_b from public.notif_render('new_memory', jsonb_build_object('title', NEW.title)) r;
  if v_t is null then return NEW; end if;
  insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id)
  select tp.user_id, auth.uid(), 'new_memory', v_t, v_b, NEW.group_id, NEW.id
  from public.task_participants tp
  where tp.task_id = NEW.id and tp.user_id <> auth.uid();
  return NEW;
end;
$$;
drop trigger if exists trg_notify_task_done on public.tasks;
create trigger trg_notify_task_done after update on public.tasks
  for each row when (OLD.status = 'accepted' and NEW.status = 'done')
  execute function public.tg_notify_task_done();

create or replace function public.create_task_scheduled(
  p_group_id uuid, p_title text, p_description text, p_category text, p_media_info jsonb,
  p_done boolean,
  p_scheduled_at timestamptz, p_time_set boolean, p_repeat text, p_repeat_until date,
  p_remind int, p_participants uuid[]
) returns public.tasks
language plpgsql security definer set search_path = public as $$
declare v_task public.tasks; v_remind_at timestamptz; v_t text; v_b text;
begin
  if not public.is_group_member(p_group_id, auth.uid()) then
    raise exception '그룹 멤버만 등록할 수 있어요.';
  end if;

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

  if p_done then
    select r.title, r.body into v_t, v_b from public.notif_render('new_memory', jsonb_build_object('title', v_task.title)) r;
    if v_t is not null then
      insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id)
      select tp.user_id, auth.uid(), 'new_memory', v_t, v_b, p_group_id, v_task.id
      from public.task_participants tp
      where tp.task_id = v_task.id and tp.user_id <> auth.uid();
    end if;
  end if;

  return v_task;
end; $$;
grant execute on function public.create_task_scheduled(uuid, text, text, text, jsonb, boolean, timestamptz, boolean, text, date, int, uuid[]) to authenticated;

create or replace function public.submit_review(p_task_id uuid, p_rating numeric, p_comment text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_gid uuid; v_status text; r public.task_reviews; v_rewarded boolean; v_balance integer;
  v_actor text; v_t text; v_b text;
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

  with ins as (
    insert into public.coin_ledger(user_id, delta, reason, ref_type, ref_id)
      values (auth.uid(), 1, '리뷰 작성 보상', 'review_reward', p_task_id)
    on conflict do nothing
    returning 1
  )
  select exists (select 1 from ins) into v_rewarded;

  select coalesce(sum(delta), 0)::integer into v_balance
    from public.coin_ledger where user_id = auth.uid();

  if v_rewarded then
    v_actor := coalesce(public.notif_member_name(v_gid, auth.uid()), '멤버');
    select r2.title, r2.body into v_t, v_b from public.notif_render('new_review', jsonb_build_object('actor', v_actor)) r2;
    if v_t is not null then
      insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id)
      select tp.user_id, auth.uid(), 'new_review', v_t, v_b, v_gid, p_task_id
      from public.task_participants tp
      where tp.task_id = p_task_id and tp.user_id <> auth.uid();
    end if;
  end if;

  return jsonb_build_object(
    'id', r.id, 'rating', r.rating, 'comment', r.comment,
    'rewarded', v_rewarded, 'balance', v_balance
  );
end;
$$;
grant execute on function public.submit_review(uuid, numeric, text) to authenticated;

create or replace function public.qworkshop_add_comment(p_post uuid, p_parent uuid, p_body text, p_mentioned_ids uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_group uuid; v_post_author uuid; v_id uuid; v_body text;
  v_parent uuid; v_pparent uuid; v_target_author uuid; v_actor text; v_t text; v_b text;
begin
  select group_id, author_id into v_group, v_post_author from public.qworkshop_posts where id = p_post;
  if v_group is null then raise exception '물음표를 찾을 수 없어요.'; end if;
  if not public.qworkshop_access(v_group, auth.uid()) then raise exception '댓글을 쓸 수 없어요.'; end if;
  v_body := btrim(coalesce(p_body, ''));
  if v_body = '' then raise exception '내용을 입력해 주세요.'; end if;
  if char_length(v_body) > 2000 then raise exception '댓글이 너무 길어요.'; end if;

  if p_parent is not null then
    select parent_id, author_id into v_pparent, v_target_author
      from public.qworkshop_comments where id = p_parent and post_id = p_post;
    if v_target_author is null then raise exception '원 댓글을 찾을 수 없어요.'; end if;
    v_parent := p_parent;
    if v_pparent is not null then v_parent := v_pparent; end if;
  end if;

  insert into public.qworkshop_comments(post_id, group_id, author_id, parent_id, body, mentioned_ids)
    values (p_post, v_group, auth.uid(), v_parent, v_body, p_mentioned_ids)
    returning id into v_id;

  v_actor := coalesce(public.notif_member_name(v_group, auth.uid()), '');

  if p_parent is null then
    if v_post_author is not null and v_post_author <> auth.uid() then
      select r.title, r.body into v_t, v_b from public.notif_render('qworkshop_comment', jsonb_build_object('actor', v_actor, 'text', v_body)) r;
      if v_t is not null then
        insert into public.notifications(user_id, actor_id, type, title, body, group_id, qworkshop_post_id, qworkshop_comment_id)
          values (v_post_author, auth.uid(), 'qworkshop_comment', v_t, v_b, v_group, p_post, v_id);
      end if;
    end if;
  else
    if v_target_author is not null and v_target_author <> auth.uid() then
      select r.title, r.body into v_t, v_b from public.notif_render('qworkshop_reply', jsonb_build_object('actor', v_actor, 'text', v_body)) r;
      if v_t is not null then
        insert into public.notifications(user_id, actor_id, type, title, body, group_id, qworkshop_post_id, qworkshop_comment_id)
          values (v_target_author, auth.uid(), 'qworkshop_reply', v_t, v_b, v_group, p_post, v_id);
      end if;
    end if;
  end if;

  if p_mentioned_ids is not null then
    select r.title, r.body into v_t, v_b from public.notif_render('mention', jsonb_build_object('actor', v_actor, 'text', v_body)) r;
    if v_t is not null then
      insert into public.notifications(user_id, actor_id, type, title, body, group_id, qworkshop_post_id, qworkshop_comment_id)
      select distinct u, auth.uid(), 'mention', v_t, v_b, v_group, p_post, v_id
      from unnest(p_mentioned_ids) as u
      where u <> auth.uid()
        and public.is_group_member(v_group, u)
        and u is distinct from v_post_author
        and u is distinct from v_target_author;
    end if;
  end if;

  return v_id;
end $$;
grant execute on function public.qworkshop_add_comment(uuid, uuid, text, uuid[]) to authenticated;

notify pgrst, 'reload schema';
