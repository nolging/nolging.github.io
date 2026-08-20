-- =============================================================
--  관리자 페이지 "알림 관리"에 신규 알림 4종 노출 + 문구를 관리자 편집 가능하게 전환
--
--  admin_list_notifs()/admin_set_notif() 은 public.notif_templates 를 그대로 노출/수정하는
--  RPC 라서, 실제 발송 코드가 어떤 type 을 insert 하든 notif_templates 에 그 key 행이
--  없으면 관리자 페이지 목록에 아예 안 뜬다(이번에 물어보신 새 추억/새 리뷰가 그 경우).
--  같은 이유로 물음표 공방 댓글/답글 알림도 등록이 빠져 있어서 함께 채운다.
--
--  또한 아래 세 함수(tg_notify_task_done/create_task_scheduled/submit_review)와
--  qworkshop_add_comment 는 문구를 코드에 직접 박아 넣었는데, 이러면 notif_templates
--  에 행을 추가해도 관리자가 제목/본문을 고쳐 봤자 실제 발송 문구는 안 바뀐다.
--  board_create_post/tg_notify_comment 등 기존 알림들과 동일하게 notif_render() 로
--  템플릿을 읽어 쓰도록(없으면 코드 기본 문구로 폴백) 다시 정의한다.
--
--  적용: Supabase SQL Editor 에 그대로 실행.
--  (memory-review-notifs.sql, qworkshop-content.sql, notif-templates.sql 이후)
-- =============================================================

insert into public.notif_templates (key, label, title, body, vars, emoji, sort_order) values
  ('new_memory',        '새 추억 생성',              '새로운 추억이 생겼어요',        '[{title}] 리뷰를 작성해 주세요', '{title} = 항목 제목', '📔', 110),
  ('new_review',        '새 리뷰 등록',              '{actor} 님이 리뷰를 작성했어요', '별이 몇 개나 떴을까요?',         '{actor} = 리뷰 작성자', '⭐', 111),
  ('qworkshop_comment', '물음표 공방 내 물음표 댓글', '내 물음표에 댓글이 달렸어요',    '{actor}: {text}', '{actor} = 작성자, {text} = 댓글 내용', '💬', 112),
  ('qworkshop_reply',   '물음표 공방 내 댓글 답글',   '내 댓글에 답글이 달렸어요',      '{actor}: {text}', '{actor} = 작성자, {text} = 답글 내용', '↩️', 113)
on conflict (key) do update set label = excluded.label, vars = excluded.vars, sort_order = excluded.sort_order;

-- ── 약속(accepted) → 추억(done) 전환 트리거: notif_render 사용 ──
create or replace function public.tg_notify_task_done()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_t text; v_b text;
begin
  select r.title, r.body into v_t, v_b from public.notif_render('new_memory', jsonb_build_object('title', NEW.title)) r;
  insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id)
  select tp.user_id, auth.uid(), 'new_memory',
         coalesce(v_t, '새로운 추억이 생겼어요'),
         coalesce(nullif(v_b, ''), '[' || NEW.title || '] 리뷰를 작성해 주세요'),
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

-- ── 신규 추억(done) 등록: notif_render 사용 ──
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
    select r.title, r.body into v_t, v_b from public.notif_render('new_memory', jsonb_build_object('title', v_task.title)) r;
    insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id)
    select tp.user_id, auth.uid(), 'new_memory',
           coalesce(v_t, '새로운 추억이 생겼어요'),
           coalesce(nullif(v_b, ''), '[' || v_task.title || '] 리뷰를 작성해 주세요'),
           p_group_id, v_task.id
    from public.task_participants tp
    where tp.task_id = v_task.id and tp.user_id <> auth.uid();
  end if;

  return v_task;
end; $$;
grant execute on function public.create_task_scheduled(uuid, text, text, text, jsonb, boolean, timestamptz, boolean, text, date, int, uuid[]) to authenticated;

-- ── 새 리뷰 등록: notif_render 사용 ──
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
    v_actor := coalesce(public.notif_member_name(v_gid, auth.uid()), '멤버');
    select r2.title, r2.body into v_t, v_b from public.notif_render('new_review', jsonb_build_object('actor', v_actor)) r2;
    insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id)
    select tp.user_id, auth.uid(), 'new_review',
           coalesce(v_t, v_actor || ' 님이 리뷰를 작성했어요'),
           coalesce(nullif(v_b, ''), '별이 몇 개나 떴을까요?'),
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

-- ── 물음표 공방 댓글/답글: notif_render 사용(멘션은 기존 'mention' 템플릿 재사용) ──
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

  -- 답글은 1단계만: 부모가 또 답글이면 그 부모(최상위)에 붙인다.
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
      insert into public.notifications(user_id, actor_id, type, title, body, group_id, qworkshop_post_id, qworkshop_comment_id)
        values (v_post_author, auth.uid(), 'qworkshop_comment',
                coalesce(v_t, '내 물음표에 댓글이 달렸어요'), coalesce(nullif(v_b, ''), v_actor || ': ' || v_body), v_group, p_post, v_id);
    end if;
  else
    if v_target_author is not null and v_target_author <> auth.uid() then
      select r.title, r.body into v_t, v_b from public.notif_render('qworkshop_reply', jsonb_build_object('actor', v_actor, 'text', v_body)) r;
      insert into public.notifications(user_id, actor_id, type, title, body, group_id, qworkshop_post_id, qworkshop_comment_id)
        values (v_target_author, auth.uid(), 'qworkshop_reply',
                coalesce(v_t, '내 댓글에 답글이 달렸어요'), coalesce(nullif(v_b, ''), v_actor || ': ' || v_body), v_group, p_post, v_id);
    end if;
  end if;

  if p_mentioned_ids is not null then
    select r.title, r.body into v_t, v_b from public.notif_render('mention', jsonb_build_object('actor', v_actor, 'text', v_body)) r;
    insert into public.notifications(user_id, actor_id, type, title, body, group_id, qworkshop_post_id, qworkshop_comment_id)
    select distinct u, auth.uid(), 'mention',
           coalesce(v_t, v_actor || ' 님이 회원님을 언급했어요'),
           coalesce(nullif(v_b, ''), v_actor || ': ' || v_body),
           v_group, p_post, v_id
    from unnest(p_mentioned_ids) as u
    where u <> auth.uid()
      and public.is_group_member(v_group, u)
      and u is distinct from v_post_author
      and u is distinct from v_target_author;
  end if;

  return v_id;
end $$;
grant execute on function public.qworkshop_add_comment(uuid, uuid, text, uuid[]) to authenticated;

notify pgrst, 'reload schema';
