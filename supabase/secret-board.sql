-- =============================================================
--  비밀 게시판 (secret board) — 프리미엄 그룹 익명 게시판
--   · 글/댓글/답글. 익명(작성자 이름 노출 안 함) → author_id 는 클라이언트로 보내지 않고,
--     RPC 가 is_mine/can_delete 만 계산해서 준다(RLS 로 직접 조회는 막고 RPC 로만 접근).
--   · 내 글/댓글만 수정·삭제. 그룹 방장/앱 관리자는 전체 삭제 가능.
--   · 말머리(prefix): 그룹 방장/앱 관리자가 추가·수정·삭제. 제목 앞에 [말머리] 로 표시.
--   · @ 멘션 없음(익명이라 불필요).
--  적용: Supabase SQL Editor 에 그대로 실행.
-- =============================================================

-- ── 테이블 ────────────────────────────────────────────────
create table if not exists public.board_prefixes (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  label      text not null,
  sort_order int  not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_board_prefixes_group on public.board_prefixes(group_id, sort_order);

create table if not exists public.board_posts (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  prefix_id  uuid references public.board_prefixes(id) on delete set null,   -- 말머리 삭제돼도 글은 유지
  title      text not null,
  body       text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_board_posts_group on public.board_posts(group_id, created_at desc);

create table if not exists public.board_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.board_posts(id) on delete cascade,
  group_id   uuid not null references public.groups(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  parent_id  uuid references public.board_comments(id) on delete cascade,    -- 답글(1단계)
  body       text not null,
  deleted_at timestamptz,                                                    -- 소프트삭제: 답글 있는 부모는 자리표시자로 남김
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_board_comments_post on public.board_comments(post_id, created_at);

-- 직접 접근은 전면 차단(RLS enable + 정책 없음). 모든 접근은 아래 security definer RPC 로만.
alter table public.board_prefixes enable row level security;
alter table public.board_posts    enable row level security;
alter table public.board_comments enable row level security;

-- updated_at 자동 갱신
create or replace function public.board_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists trg_board_posts_touch on public.board_posts;
create trigger trg_board_posts_touch before update on public.board_posts
  for each row execute function public.board_touch();
drop trigger if exists trg_board_comments_touch on public.board_comments;
create trigger trg_board_comments_touch before update on public.board_comments
  for each row execute function public.board_touch();

-- ── 권한 헬퍼 ─────────────────────────────────────────────
-- 접근 가능: 프리미엄 그룹(커플/우정)의 멤버
create or replace function public.board_access(p_group uuid, p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_group_member(p_group, p_uid)
     and (public.is_couple_group(p_group) or public.is_friend_group(p_group));
$$;
-- 관리(전체 삭제): 그룹 방장 또는 앱 관리자
create or replace function public.board_can_manage(p_group uuid, p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_group_owner(p_group, p_uid) or public.is_admin(p_uid);
$$;
-- 말머리 관리: 관리 권한 + 프리미엄 그룹(비프리미엄 그룹엔 게시판 자체가 없다)
create or replace function public.board_can_manage_prefix(p_group uuid, p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.board_can_manage(p_group, p_uid)
     and (public.is_couple_group(p_group) or public.is_friend_group(p_group));
$$;

-- ── 말머리 ────────────────────────────────────────────────
create or replace function public.board_prefixes(p_group uuid)
returns table(id uuid, label text, sort_order int)
language sql stable security definer set search_path = public as $$
  select p.id, p.label, p.sort_order
  from public.board_prefixes p
  where p.group_id = p_group and public.board_access(p_group, auth.uid())
  order by p.sort_order, p.created_at;
$$;
grant execute on function public.board_prefixes(uuid) to authenticated;

create or replace function public.board_add_prefix(p_group uuid, p_label text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_label text; v_ord int;
begin
  if not public.board_can_manage_prefix(p_group, auth.uid()) then raise exception '권한이 없습니다.'; end if;
  v_label := btrim(coalesce(p_label, ''));
  if v_label = '' then raise exception '말머리를 입력해 주세요.'; end if;
  if char_length(v_label) > 20 then raise exception '말머리는 20자 이내로 입력해 주세요.'; end if;
  select coalesce(max(sort_order), 0) + 1 into v_ord from public.board_prefixes where group_id = p_group;
  insert into public.board_prefixes(group_id, label, sort_order) values (p_group, v_label, v_ord) returning id into v_id;
  return v_id;
end $$;
grant execute on function public.board_add_prefix(uuid, text) to authenticated;

create or replace function public.board_update_prefix(p_id uuid, p_label text)
returns void language plpgsql security definer set search_path = public as $$
declare v_group uuid; v_label text;
begin
  select group_id into v_group from public.board_prefixes where id = p_id;
  if v_group is null then raise exception '말머리를 찾을 수 없어요.'; end if;
  if not public.board_can_manage_prefix(v_group, auth.uid()) then raise exception '권한이 없습니다.'; end if;
  v_label := btrim(coalesce(p_label, ''));
  if v_label = '' then raise exception '말머리를 입력해 주세요.'; end if;
  if char_length(v_label) > 20 then raise exception '말머리는 20자 이내로 입력해 주세요.'; end if;
  update public.board_prefixes set label = v_label where id = p_id;
end $$;
grant execute on function public.board_update_prefix(uuid, text) to authenticated;

create or replace function public.board_delete_prefix(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_group uuid;
begin
  select group_id into v_group from public.board_prefixes where id = p_id;
  if v_group is null then return; end if;
  if not public.board_can_manage_prefix(v_group, auth.uid()) then raise exception '권한이 없습니다.'; end if;
  delete from public.board_prefixes where id = p_id;   -- 글의 prefix_id 는 on delete set null
end $$;
grant execute on function public.board_delete_prefix(uuid) to authenticated;

-- ── 글 ────────────────────────────────────────────────────
create or replace function public.board_posts(p_group uuid)
returns table(id uuid, prefix_id uuid, prefix_label text, title text, body text,
              created_at timestamptz, updated_at timestamptz, edited boolean,
              is_mine boolean, can_delete boolean, comment_count bigint)
language sql stable security definer set search_path = public as $$
  select po.id, po.prefix_id, pr.label, po.title, po.body,
         po.created_at, po.updated_at, (po.updated_at > po.created_at) as edited,
         (po.author_id = auth.uid()) as is_mine,
         (po.author_id = auth.uid() or public.board_can_manage(po.group_id, auth.uid())) as can_delete,
         (select count(*) from public.board_comments c
           where c.post_id = po.id and c.deleted_at is null) as comment_count
  from public.board_posts po
  left join public.board_prefixes pr on pr.id = po.prefix_id
  where po.group_id = p_group and public.board_access(p_group, auth.uid())
  order by po.created_at desc;
$$;
grant execute on function public.board_posts(uuid) to authenticated;

create or replace function public.board_create_post(p_group uuid, p_prefix uuid, p_title text, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_title text; v_prefix uuid; v_t text; v_b text;
begin
  if not public.board_access(p_group, auth.uid()) then raise exception '이 게시판에 글을 쓸 수 없어요.'; end if;
  v_title := btrim(coalesce(p_title, ''));
  if v_title = '' then raise exception '제목을 입력해 주세요.'; end if;
  if char_length(v_title) > 100 then raise exception '제목은 100자 이내로 입력해 주세요.'; end if;
  if char_length(coalesce(p_body, '')) > 5000 then raise exception '본문이 너무 길어요.'; end if;
  -- 말머리는 같은 그룹 것만 허용
  if p_prefix is not null then
    select id into v_prefix from public.board_prefixes where id = p_prefix and group_id = p_group;
  end if;
  insert into public.board_posts(group_id, author_id, prefix_id, title, body)
    values (p_group, auth.uid(), v_prefix, v_title, coalesce(p_body, ''))
    returning id into v_id;
  -- 새 글 알림(익명): 그룹 멤버 전원(글쓴이 제외). 상세는 board-notifs.sql 참고.
  select r.title, r.body into v_t, v_b from public.notif_render('board_post', jsonb_build_object('title', v_title)) r;
  insert into public.notifications(user_id, actor_id, type, title, body, group_id, post_id)
  select gm.user_id, null, 'board_post',
         coalesce(v_t, '비밀 게시판에 새 글이 올라왔어요'), coalesce(nullif(v_b, ''), v_title), p_group, v_id
  from public.group_members gm
  where gm.group_id = p_group and gm.user_id <> auth.uid();
  return v_id;
end $$;
grant execute on function public.board_create_post(uuid, uuid, text, text) to authenticated;

create or replace function public.board_update_post(p_id uuid, p_prefix uuid, p_title text, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare v_post public.board_posts; v_title text; v_prefix uuid;
begin
  select * into v_post from public.board_posts where id = p_id;
  if v_post.id is null then raise exception '글을 찾을 수 없어요.'; end if;
  if v_post.author_id <> auth.uid() then raise exception '내가 쓴 글만 수정할 수 있어요.'; end if;
  v_title := btrim(coalesce(p_title, ''));
  if v_title = '' then raise exception '제목을 입력해 주세요.'; end if;
  if char_length(v_title) > 100 then raise exception '제목은 100자 이내로 입력해 주세요.'; end if;
  if char_length(coalesce(p_body, '')) > 5000 then raise exception '본문이 너무 길어요.'; end if;
  if p_prefix is not null then
    select id into v_prefix from public.board_prefixes where id = p_prefix and group_id = v_post.group_id;
  end if;
  update public.board_posts set prefix_id = v_prefix, title = v_title, body = coalesce(p_body, '') where id = p_id;
end $$;
grant execute on function public.board_update_post(uuid, uuid, text, text) to authenticated;

create or replace function public.board_delete_post(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_post public.board_posts;
begin
  select * into v_post from public.board_posts where id = p_id;
  if v_post.id is null then return; end if;
  if v_post.author_id <> auth.uid() and not public.board_can_manage(v_post.group_id, auth.uid()) then
    raise exception '삭제 권한이 없어요.'; end if;
  delete from public.board_posts where id = p_id;   -- 댓글은 on delete cascade
end $$;
grant execute on function public.board_delete_post(uuid) to authenticated;

-- ── 댓글 / 답글 ───────────────────────────────────────────
create or replace function public.board_comments(p_post uuid)
returns table(id uuid, parent_id uuid, body text, created_at timestamptz, updated_at timestamptz,
              edited boolean, is_mine boolean, can_delete boolean, deleted boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.parent_id,
         case when c.deleted_at is not null then '' else c.body end as body,
         c.created_at, c.updated_at,
         (c.deleted_at is null and c.updated_at > c.created_at) as edited,
         (c.deleted_at is null and c.author_id = auth.uid()) as is_mine,
         (c.deleted_at is null
            and (c.author_id = auth.uid() or public.board_can_manage(c.group_id, auth.uid()))) as can_delete,
         (c.deleted_at is not null) as deleted
  from public.board_comments c
  join public.board_posts po on po.id = c.post_id
  where c.post_id = p_post and public.board_access(po.group_id, auth.uid())
  order by c.created_at;
$$;
grant execute on function public.board_comments(uuid) to authenticated;

create or replace function public.board_add_comment(p_post uuid, p_parent uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_group uuid; v_id uuid; v_body text; v_parent uuid; v_pparent uuid;
        v_post_author uuid; v_target_author uuid; v_t text; v_b text;
begin
  select group_id, author_id into v_group, v_post_author from public.board_posts where id = p_post;
  if v_group is null then raise exception '글을 찾을 수 없어요.'; end if;
  if not public.board_access(v_group, auth.uid()) then raise exception '댓글을 쓸 수 없어요.'; end if;
  v_body := btrim(coalesce(p_body, ''));
  if v_body = '' then raise exception '내용을 입력해 주세요.'; end if;
  if char_length(v_body) > 2000 then raise exception '댓글이 너무 길어요.'; end if;
  -- 답글은 1단계만: 부모가 또 답글이면 그 부모(최상위)에 붙인다. 알림 대상은 실제로 답글 단 원 댓글 작성자.
  if p_parent is not null then
    select parent_id, author_id into v_pparent, v_target_author from public.board_comments where id = p_parent and post_id = p_post;
    if v_target_author is null then raise exception '원 댓글을 찾을 수 없어요.'; end if;
    v_parent := p_parent;
    if v_pparent is not null then v_parent := v_pparent; end if;
  end if;
  insert into public.board_comments(post_id, group_id, author_id, parent_id, body)
    values (p_post, v_group, auth.uid(), v_parent, v_body)
    returning id into v_id;
  -- 알림(익명: actor 미노출). 상세는 board-notifs.sql 참고.
  if p_parent is null then
    if v_post_author is not null and v_post_author <> auth.uid() then
      select r.title, r.body into v_t, v_b from public.notif_render('board_comment', jsonb_build_object('text', v_body)) r;
      insert into public.notifications(user_id, actor_id, type, title, body, group_id, post_id, board_comment_id)
        values (v_post_author, null, 'board_comment',
                coalesce(v_t, '내 글에 댓글이 달렸어요'), coalesce(nullif(v_b, ''), v_body), v_group, p_post, v_id);
    end if;
  else
    if v_target_author is not null and v_target_author <> auth.uid() then
      select r.title, r.body into v_t, v_b from public.notif_render('board_reply', jsonb_build_object('text', v_body)) r;
      insert into public.notifications(user_id, actor_id, type, title, body, group_id, post_id, board_comment_id)
        values (v_target_author, null, 'board_reply',
                coalesce(v_t, '내 댓글에 답글이 달렸어요'), coalesce(nullif(v_b, ''), v_body), v_group, p_post, v_id);
    end if;
  end if;
  return v_id;
end $$;
grant execute on function public.board_add_comment(uuid, uuid, text) to authenticated;

create or replace function public.board_update_comment(p_id uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare v_c public.board_comments; v_body text;
begin
  select * into v_c from public.board_comments where id = p_id;
  if v_c.id is null then raise exception '댓글을 찾을 수 없어요.'; end if;
  if v_c.author_id <> auth.uid() then raise exception '내가 쓴 댓글만 수정할 수 있어요.'; end if;
  v_body := btrim(coalesce(p_body, ''));
  if v_body = '' then raise exception '내용을 입력해 주세요.'; end if;
  if char_length(v_body) > 2000 then raise exception '댓글이 너무 길어요.'; end if;
  update public.board_comments set body = v_body where id = p_id;
end $$;
grant execute on function public.board_update_comment(uuid, text) to authenticated;

-- 부모 댓글을 지워도 답글은 남긴다: 답글 있으면 자리표시자로 소프트삭제, 없으면 하드삭제.
create or replace function public.board_delete_comment(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_c public.board_comments; v_kids int; v_parent uuid; v_pdel timestamptz; v_left int;
begin
  select * into v_c from public.board_comments where id = p_id;
  if v_c.id is null then return; end if;
  if v_c.author_id <> auth.uid() and not public.board_can_manage(v_c.group_id, auth.uid()) then
    raise exception '삭제 권한이 없어요.'; end if;
  if v_c.deleted_at is not null then return; end if;

  select count(*) into v_kids from public.board_comments where parent_id = p_id;
  if v_kids > 0 then
    update public.board_comments set deleted_at = now(), body = '' where id = p_id;   -- "삭제된 댓글입니다."
    return;
  end if;

  v_parent := v_c.parent_id;
  delete from public.board_comments where id = p_id;

  -- 소프트삭제된 부모의 마지막 답글이 지워졌으면 부모 자리표시자도 정리
  if v_parent is not null then
    select deleted_at into v_pdel from public.board_comments where id = v_parent;
    if v_pdel is not null then
      select count(*) into v_left from public.board_comments where parent_id = v_parent;
      if v_left = 0 then delete from public.board_comments where id = v_parent; end if;
    end if;
  end if;
end $$;
grant execute on function public.board_delete_comment(uuid) to authenticated;
