-- =============================================================
--  푸시 알림 메시지 템플릿 — 관리자 페이지에서 제목/본문 편집
--   · notif_templates(key) 에 제목/본문 템플릿 저장. {닉네임} 같은 치환자를 코드가 채움.
--   · notif_render(key, vars) 로 렌더 → 알림 트리거/함수가 사용(없으면 코드 폴백).
--   · 우선 "핵심" 알림(새 멤버/새 항목/댓글/답글/멘션)을 연결. 나머지는 요청 시 추가.
--  적용: Supabase SQL Editor 에 그대로 실행.
-- =============================================================

create table if not exists public.notif_templates (
  key        text primary key,
  label      text not null,            -- 관리자 목록에 보일 이름
  title      text not null,            -- 제목 템플릿
  body       text not null,            -- 본문 템플릿
  vars       text,                     -- 사용 가능한 치환자 안내(예: {actor}, {text})
  sort_order int  not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.notif_templates enable row level security;  -- 접근은 정의자/관리자 RPC 로만

-- 핵심 알림 시드(이미 있으면 라벨/치환자 안내만 갱신, 문구는 관리자 편집 보존)
insert into public.notif_templates (key, label, title, body, vars, sort_order) values
  ('new_member',   '새 멤버 가입',   '새 멤버가 가입했어요',        '{name} 님 입장!',           '{name} = 새 멤버 닉네임', 10),
  ('new_task',     '새 항목 등록',   '새 {noun}가 있어요',          '{title}',                   '{noun} = 위시/할 일/추억, {title} = 항목 제목', 20),
  ('task_comment', '내 항목에 댓글', '내 {noun}에 댓글이 달렸어요',  '{actor}: {text}',           '{noun} = 위시/할 일/추억, {actor} = 작성자, {text} = 댓글 내용', 30),
  ('reply',        '내 댓글에 답글', '내 댓글에 답글이 달렸어요',    '{actor}: {text}',           '{actor} = 작성자, {text} = 답글 내용', 40),
  ('mention',      '댓글 멘션',      '{actor} 님이 회원님을 언급했어요', '{actor}: {text}',        '{actor} = 작성자, {text} = 댓글 내용', 50)
on conflict (key) do update set label = excluded.label, vars = excluded.vars, sort_order = excluded.sort_order;

-- 렌더: 템플릿의 {키} 를 vars 값으로 치환. 없으면 title/body 를 null 로 반환(호출부 폴백).
create or replace function public.notif_render(p_key text, p_vars jsonb default '{}'::jsonb, out title text, out body text)
language plpgsql stable set search_path = public as $$
declare t public.notif_templates; k text; v text;
begin
  select * into t from public.notif_templates where key = p_key;
  if t.key is null then title := null; body := null; return; end if;
  title := t.title; body := t.body;
  for k, v in select key, value from jsonb_each_text(coalesce(p_vars, '{}'::jsonb)) loop
    title := replace(title, '{' || k || '}', coalesce(v, ''));
    body  := replace(body,  '{' || k || '}', coalesce(v, ''));
  end loop;
end $$;

-- 관리자 조회/수정 RPC
create or replace function public.admin_list_notifs()
returns setof public.notif_templates language plpgsql security definer set search_path = public stable as $$
begin
  if not public.is_admin(auth.uid()) then raise exception '권한이 없습니다.'; end if;
  return query select * from public.notif_templates order by sort_order, key;
end $$;
grant execute on function public.admin_list_notifs() to authenticated;

create or replace function public.admin_set_notif(p_key text, p_title text, p_body text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception '권한이 없습니다.'; end if;
  if p_title is null or btrim(p_title) = '' then raise exception '제목을 입력해 주세요.'; end if;
  if p_body  is null or btrim(p_body)  = '' then raise exception '본문을 입력해 주세요.'; end if;
  update public.notif_templates set title = p_title, body = p_body, updated_at = now() where key = p_key;
  if not found then raise exception '알림 템플릿을 찾을 수 없어요.'; end if;
end $$;
grant execute on function public.admin_set_notif(text, text, text) to authenticated;

-- ============ 핵심 알림 트리거 재연결(템플릿 사용, 폴백 포함) ============

-- 댓글/답글/멘션
create or replace function public.tg_notify_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_group public.groups; v_task public.tasks; v_actor text; v_parent uuid;
  v_noun text; v_t text; v_b text;
begin
  select * into v_task  from public.tasks  where id = NEW.task_id;
  select * into v_group from public.groups where id = NEW.group_id;
  v_actor := public.notif_member_name(NEW.group_id, NEW.author_id);
  v_noun  := public.notif_noun(v_group.group_type);

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

-- 새 항목(위시/할 일/추억)
create or replace function public.tg_notify_task_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_group public.groups; v_noun text; v_t text; v_b text;
begin
  if coalesce(current_setting('nolging.silent_task', true), '') = 'on' then return NEW; end if;
  select * into v_group from public.groups where id = NEW.group_id;
  v_noun := public.notif_noun(v_group.group_type);
  select r.title, r.body into v_t, v_b from public.notif_render('new_task', jsonb_build_object('noun', v_noun, 'title', NEW.title)) r;
  insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id)
  select gm.user_id, NEW.created_by, 'new_task',
         coalesce(v_t, '새 ' || v_noun || '가 있어요'),
         coalesce(v_b, NEW.title),
         NEW.group_id, NEW.id
  from public.group_members gm
  where gm.group_id = NEW.group_id and gm.user_id <> NEW.created_by;
  return NEW;
end $$;
drop trigger if exists trg_notify_task_insert on public.tasks;
create trigger trg_notify_task_insert after insert on public.tasks
  for each row execute function public.tg_notify_task_insert();

-- 새 멤버 가입
create or replace function public.tg_notify_member_join()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text; v_t text; v_b text;
begin
  v_name := coalesce(nullif(trim(NEW.display_nickname), ''), '새 멤버');
  select r.title, r.body into v_t, v_b from public.notif_render('new_member', jsonb_build_object('name', v_name)) r;
  insert into public.notifications(user_id, actor_id, type, title, body, group_id)
  select gm.user_id, NEW.user_id, 'new_member',
         coalesce(v_t, '새 멤버가 가입했어요'),
         coalesce(v_b, v_name || ' 님 입장!'),
         NEW.group_id
  from public.group_members gm
  where gm.group_id = NEW.group_id and gm.user_id <> NEW.user_id;
  return NEW;
end $$;
drop trigger if exists trg_notify_member_join on public.group_members;
create trigger trg_notify_member_join after insert on public.group_members
  for each row execute function public.tg_notify_member_join();
