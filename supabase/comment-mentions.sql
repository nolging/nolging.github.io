-- 댓글 @멘션: 본문에서 @{닉네임} 으로 호출한 멤버에게 알림.
-- 호출된 멤버는 위시 작성자/약속 참여자가 아니어도 알림을 받는다.
-- 프런트에서 group_members.display_nickname 을 user_id 로 변환해 mentioned_ids 에 담아 insert 한다.

alter table public.task_comments
  add column if not exists mentioned_ids uuid[];

-- 댓글 알림 트리거 재정의: 기존(답글/위시작성자) + @멘션 알림 추가.
create or replace function public.tg_notify_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_group  public.groups;
  v_task   public.tasks;
  v_actor  text;
  v_parent uuid;
begin
  select * into v_task  from public.tasks  where id = NEW.task_id;
  select * into v_group from public.groups where id = NEW.group_id;
  v_actor := public.notif_member_name(NEW.group_id, NEW.author_id);

  if NEW.parent_id is not null then
    -- (1) 답글: 부모 댓글 작성자에게
    select author_id into v_parent from public.task_comments where id = NEW.parent_id;
    if v_parent is not null and v_parent <> NEW.author_id then
      insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id, comment_id)
      values (v_parent, NEW.author_id, 'reply',
              '내 댓글에 답글이 달렸어요',
              v_actor || ': ' || NEW.body,
              NEW.group_id, NEW.task_id, NEW.id);
    end if;
    -- (2) 대댓글이어도 위시 작성자에게 알림. 단, 부모 댓글 작성자와 같으면 (1)만 보냄
    if v_task.created_by is not null
       and v_task.created_by <> NEW.author_id
       and v_task.created_by is distinct from v_parent then
      insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id, comment_id)
      values (v_task.created_by, NEW.author_id, 'task_comment',
              '내 ' || public.notif_noun(v_group.group_type) || '에 댓글이 달렸어요',
              v_actor || ': ' || NEW.body,
              NEW.group_id, NEW.task_id, NEW.id);
    end if;
  else
    -- (2) 최상위 댓글: 위시 작성자에게
    if v_task.created_by is not null and v_task.created_by <> NEW.author_id then
      insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id, comment_id)
      values (v_task.created_by, NEW.author_id, 'task_comment',
              '내 ' || public.notif_noun(v_group.group_type) || '에 댓글이 달렸어요',
              v_actor || ': ' || NEW.body,
              NEW.group_id, NEW.task_id, NEW.id);
    end if;
  end if;

  -- (3) @멘션: 본문에서 호출된 멤버(작성자 제외, 그룹 멤버만).
  --     위시 작성자/부모 댓글 작성자에게는 위에서 이미 알림이 갔으므로 중복 방지로 제외.
  if NEW.mentioned_ids is not null then
    insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id, comment_id)
    select distinct u, NEW.author_id, 'mention',
           v_actor || ' 님이 회원님을 언급했어요',
           v_actor || ': ' || NEW.body,
           NEW.group_id, NEW.task_id, NEW.id
    from unnest(NEW.mentioned_ids) as u
    where u <> NEW.author_id
      and public.is_group_member(NEW.group_id, u)
      and u is distinct from v_task.created_by
      and u is distinct from v_parent;
  end if;

  return NEW;
end;
$$;
drop trigger if exists trg_notify_comment on public.task_comments;
create trigger trg_notify_comment after insert on public.task_comments
  for each row execute function public.tg_notify_comment();
