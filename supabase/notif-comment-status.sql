-- =============================================================
--  댓글 알림 {noun} 을 항목의 "현재 상태"로 반영: 위시(open)/약속(accepted)/추억(done)
--   · task_comment 알림만 해당. reply/mention 은 noun 미사용.
--   · 새 항목(new_task) 알림 동작은 변경 없음(위시로 올릴 때만 발송).
--  적용: notif-templates.sql 실행 후 이 파일을 Supabase SQL Editor 에 실행.
-- =============================================================

create or replace function public.tg_notify_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_group public.groups; v_task public.tasks; v_actor text; v_parent uuid;
  v_noun text; v_t text; v_b text;
begin
  select * into v_task  from public.tasks  where id = NEW.task_id;
  select * into v_group from public.groups where id = NEW.group_id;
  v_actor := public.notif_member_name(NEW.group_id, NEW.author_id);
  -- 항목의 현재 상태로 명칭 결정(위시 → 약속 → 추억)
  v_noun := case v_task.status when 'accepted' then '약속' when 'done' then '추억' else '위시' end;

  if NEW.parent_id is not null then
    select author_id into v_parent from public.task_comments where id = NEW.parent_id;
    if v_parent is not null and v_parent <> NEW.author_id then
      select r.title, r.body into v_t, v_b from public.notif_render('reply', jsonb_build_object('actor', v_actor, 'text', NEW.body)) r;
      insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id, comment_id)
      values (v_parent, NEW.author_id, 'reply',
              coalesce(v_t, '내 댓글에 답글이 달렸어요'),
              coalesce(v_b, v_actor || ': ' || NEW.body),
              NEW.group_id, NEW.task_id, NEW.id);
    end if;
    if v_task.created_by is not null and v_task.created_by <> NEW.author_id and v_task.created_by is distinct from v_parent then
      select r.title, r.body into v_t, v_b from public.notif_render('task_comment', jsonb_build_object('noun', v_noun, 'actor', v_actor, 'text', NEW.body)) r;
      insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id, comment_id)
      values (v_task.created_by, NEW.author_id, 'task_comment',
              coalesce(v_t, '내 ' || v_noun || '에 댓글이 달렸어요'),
              coalesce(v_b, v_actor || ': ' || NEW.body),
              NEW.group_id, NEW.task_id, NEW.id);
    end if;
  else
    if v_task.created_by is not null and v_task.created_by <> NEW.author_id then
      select r.title, r.body into v_t, v_b from public.notif_render('task_comment', jsonb_build_object('noun', v_noun, 'actor', v_actor, 'text', NEW.body)) r;
      insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id, comment_id)
      values (v_task.created_by, NEW.author_id, 'task_comment',
              coalesce(v_t, '내 ' || v_noun || '에 댓글이 달렸어요'),
              coalesce(v_b, v_actor || ': ' || NEW.body),
              NEW.group_id, NEW.task_id, NEW.id);
    end if;
  end if;

  if NEW.mentioned_ids is not null then
    select r.title, r.body into v_t, v_b from public.notif_render('mention', jsonb_build_object('actor', v_actor, 'text', NEW.body)) r;
    insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id, comment_id)
    select distinct u, NEW.author_id, 'mention',
           coalesce(v_t, v_actor || ' 님이 회원님을 언급했어요'),
           coalesce(v_b, v_actor || ': ' || NEW.body),
           NEW.group_id, NEW.task_id, NEW.id
    from unnest(NEW.mentioned_ids) as u
    where u <> NEW.author_id and public.is_group_member(NEW.group_id, u)
      and u is distinct from v_task.created_by and u is distinct from v_parent;
  end if;
  return NEW;
end $$;
drop trigger if exists trg_notify_comment on public.task_comments;
create trigger trg_notify_comment after insert on public.task_comments
  for each row execute function public.tg_notify_comment();
