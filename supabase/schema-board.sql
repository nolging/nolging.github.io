-- =============================================================
--  schema-board.sql — 비밀 게시판(secret board) 기능 통합본
--
--  이 파일은 아래 6개의 개별(증분) SQL 파일에 흩어져 있던 내용을
--  저장소 정리(cleanup) 작업의 일환으로 하나로 합친 것입니다:
--    - secret-board.sql               (테이블 + 글/댓글/말머리 RPC 기본)
--    - secret-board-comments.sql      (댓글 소프트삭제 마이그레이션)
--    - board-item.sql                 (게시판 개설 아이템: group_boards)
--    - secret-board-admin-access.sql  (앱 관리자 조회 권한 확장)
--    - board-rename.sql               (게시판 이름 변경)
--    - board-notifs.sql               (게시판 알림 컬럼/템플릿, 알림 포함 RPC)
--
--  각 함수/테이블은 위 파일들에 걸쳐 여러 번 재정의된 것 중
--  "최종(가장 나중) 버전"만 모아 놓았습니다. 원본 6개 파일은 그대로
--  두고(삭제/수정하지 않음), 이 파일이 문서화·재해복구·새 환경
--  구축용 "최종 스냅샷" 역할을 합니다.
--
--  ⚠️ 이미 운영 DB에는 원본 6개 파일이 시점별로 각각 적용되어
--  있으므로, 이 파일을 운영 DB에 다시 실행할 필요는 없습니다.
--  새 환경(로컬/스테이징 등)을 처음부터 구축할 때 schema.sql +
--  schema-v2.sql 적용 후 이어서 실행하면 됩니다.
--
--  참고: board-notifs.sql 에 있던 praise_place() 함수와 'praise_new'
--  알림 템플릿은 칭찬 스티커(praise board) 기능이라 이 번들(비밀
--  게시판) 범위가 아니므로 포함하지 않았습니다 — 다른 도메인 번들
--  (praise 관련)에서 별도로 다뤄야 합니다.
-- =============================================================


-- =============================================================
--  1. 테이블
-- =============================================================

-- ── 말머리 ────────────────────────────────────────────────
create table if not exists public.board_prefixes (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  label      text not null,
  sort_order int  not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_board_prefixes_group on public.board_prefixes(group_id, sort_order);

-- ── 글 ────────────────────────────────────────────────────
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

-- ── 댓글 / 답글 ───────────────────────────────────────────
--  deleted_at: 소프트삭제 표식. 답글이 있는 부모 댓글을 지우면 자리표시자로 남기기 위함
--  (원래 secret-board.sql 에는 없었고 secret-board-comments.sql 에서 알터로 추가된 컬럼이지만,
--   최종 상태 기준으로 테이블 생성문에 바로 포함시켰다).
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

-- ── 게시판 개설 정보 ──────────────────────────────────────
--  프리미엄 그룹에 '이름'을 지정해 게시판을 개설한다. 그룹당 1개(pk = group_id).
--  개설되면 멤버 목록(데이트/멤버) 페이지에 그 이름으로 노출. 개설 시 secret-board 아이템 1개 소모.
create table if not exists public.group_boards (
  group_id   uuid primary key references public.groups(id) on delete cascade,
  name       text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ── 알림 딥링크용 컬럼(게시판 글/댓글) ─────────────────────
alter table public.notifications add column if not exists post_id uuid
  references public.board_posts(id) on delete cascade;
alter table public.notifications add column if not exists board_comment_id uuid
  references public.board_comments(id) on delete cascade;


-- =============================================================
--  2. RLS — 직접 접근은 전면 차단(RLS enable + 정책 없음).
--     모든 접근은 아래 security definer RPC 로만.
-- =============================================================
alter table public.board_prefixes enable row level security;
alter table public.board_posts    enable row level security;
alter table public.board_comments enable row level security;
alter table public.group_boards   enable row level security;


-- =============================================================
--  3. 알림 문구 템플릿(비밀 게시판 관련분)
--     (관리자 편집 가능. praise_new 는 칭찬 스티커 기능이라 제외)
-- =============================================================
insert into public.notif_templates (key, label, title, body, vars, emoji, sort_order) values
  ('board_post',    '비밀 게시판 새 글',       '비밀 게시판에 새 글이 올라왔어요', '{title}', '{title} = 글 제목',  '🤫', 97),
  ('board_comment', '비밀 게시판 내 글 댓글',   '내 글에 댓글이 달렸어요',          '{text}',  '{text} = 댓글 내용', '💬', 98),
  ('board_reply',   '비밀 게시판 내 댓글 답글', '내 댓글에 답글이 달렸어요',         '{text}',  '{text} = 답글 내용', '↩️', 99)
on conflict (key) do update set label = excluded.label, vars = excluded.vars, sort_order = excluded.sort_order;


-- =============================================================
--  4. 함수 — 권한 헬퍼
-- =============================================================

-- updated_at 자동 갱신(트리거용)
create or replace function public.board_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

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

-- 조회 권한: 멤버십 OR 관리자(+프리미엄 그룹). 앱 관리자는 본인이 속하지 않은 그룹의
-- 게시판도 조회할 수 있게(신고 대응 등). 삭제는 board_can_manage 로 이미 가능했음.
create or replace function public.board_can_view(p_group uuid, p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.board_access(p_group, p_uid)
     or (public.is_admin(p_uid) and (public.is_couple_group(p_group) or public.is_friend_group(p_group)));
$$;

-- 프론트가 글쓰기/댓글쓰기 UI 노출 여부를 판단하는 데 쓰는 순수 멤버십 체크(관리자 우회 없음).
create or replace function public.board_can_write(p_group uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.board_access(p_group, auth.uid());
$$;


-- =============================================================
--  5. 함수 — 말머리
-- =============================================================
create or replace function public.board_prefixes(p_group uuid)
returns table(id uuid, label text, sort_order int)
language sql stable security definer set search_path = public as $$
  select p.id, p.label, p.sort_order
  from public.board_prefixes p
  where p.group_id = p_group and public.board_can_view(p_group, auth.uid())
  order by p.sort_order, p.created_at;
$$;

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

create or replace function public.board_delete_prefix(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_group uuid;
begin
  select group_id into v_group from public.board_prefixes where id = p_id;
  if v_group is null then return; end if;
  if not public.board_can_manage_prefix(v_group, auth.uid()) then raise exception '권한이 없습니다.'; end if;
  delete from public.board_prefixes where id = p_id;   -- 글의 prefix_id 는 on delete set null
end $$;


-- =============================================================
--  6. 함수 — 글
-- =============================================================
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
  where po.group_id = p_group and public.board_can_view(p_group, auth.uid())
  order by po.created_at desc;
$$;

-- 글 작성: 말머리는 같은 그룹 것만 허용. 성공 시 그룹 멤버 전원(글쓴이 제외)에게 익명 알림.
create or replace function public.board_create_post(p_group uuid, p_prefix uuid, p_title text, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_title text; v_prefix uuid; v_t text; v_b text;
begin
  if not public.board_access(p_group, auth.uid()) then raise exception '이 게시판에 글을 쓸 수 없어요.'; end if;
  v_title := btrim(coalesce(p_title, ''));
  if v_title = '' then raise exception '제목을 입력해 주세요.'; end if;
  if char_length(v_title) > 100 then raise exception '제목은 100자 이내로 입력해 주세요.'; end if;
  if char_length(coalesce(p_body, '')) > 5000 then raise exception '본문이 너무 길어요.'; end if;
  if p_prefix is not null then
    select id into v_prefix from public.board_prefixes where id = p_prefix and group_id = p_group;
  end if;
  insert into public.board_posts(group_id, author_id, prefix_id, title, body)
    values (p_group, auth.uid(), v_prefix, v_title, coalesce(p_body, ''))
    returning id into v_id;
  -- 새 글 알림(익명): 그룹 멤버 전원(글쓴이 제외). 템플릿이 없거나 비활성이면 알림 자체를 건너뜀.
  select r.title, r.body into v_t, v_b from public.notif_render('board_post', jsonb_build_object('title', v_title)) r;
  if v_t is not null then
    insert into public.notifications(user_id, actor_id, type, title, body, group_id, post_id)
    select gm.user_id, null, 'board_post', v_t, coalesce(nullif(v_b, ''), v_title), p_group, v_id
    from public.group_members gm
    where gm.group_id = p_group and gm.user_id <> auth.uid();
  end if;
  return v_id;
end $$;

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


-- =============================================================
--  7. 함수 — 댓글 / 답글
-- =============================================================

-- 댓글 조회: deleted 플래그 포함(자리표시자 렌더용)
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
  where c.post_id = p_post and public.board_can_view(po.group_id, auth.uid())
  order by c.created_at;
$$;

-- 댓글/답글 작성. 답글은 1단계만: 부모가 또 답글이면 그 부모(최상위)에 붙인다.
-- 알림 대상: 최상위 댓글 → 글쓴이 / 답글 → 실제로 답글 단 원 댓글 작성자(익명, actor 미노출).
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
  if p_parent is not null then
    select parent_id, author_id into v_pparent, v_target_author from public.board_comments where id = p_parent and post_id = p_post;
    if v_target_author is null then raise exception '원 댓글을 찾을 수 없어요.'; end if;
    v_parent := p_parent;
    if v_pparent is not null then v_parent := v_pparent; end if;
  end if;
  insert into public.board_comments(post_id, group_id, author_id, parent_id, body)
    values (p_post, v_group, auth.uid(), v_parent, v_body)
    returning id into v_id;
  if p_parent is null then
    if v_post_author is not null and v_post_author <> auth.uid() then
      select r.title, r.body into v_t, v_b from public.notif_render('board_comment', jsonb_build_object('text', v_body)) r;
      if v_t is not null then
        insert into public.notifications(user_id, actor_id, type, title, body, group_id, post_id, board_comment_id)
          values (v_post_author, null, 'board_comment', v_t, coalesce(nullif(v_b, ''), v_body), v_group, p_post, v_id);
      end if;
    end if;
  else
    if v_target_author is not null and v_target_author <> auth.uid() then
      select r.title, r.body into v_t, v_b from public.notif_render('board_reply', jsonb_build_object('text', v_body)) r;
      if v_t is not null then
        insert into public.notifications(user_id, actor_id, type, title, body, group_id, post_id, board_comment_id)
          values (v_target_author, null, 'board_reply', v_t, coalesce(nullif(v_b, ''), v_body), v_group, p_post, v_id);
      end if;
    end if;
  end if;
  return v_id;
end $$;

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

-- 부모 댓글을 지워도 답글은 남긴다: 답글 있으면 자리표시자로 소프트삭제("삭제된 댓글입니다."),
-- 없으면 하드삭제. 소프트삭제된 부모의 마지막 답글이 지워지면 부모 자리표시자도 함께 정리.
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


-- =============================================================
--  8. 함수 — 게시판 개설(아이템 소모) / 이름 조회 / 이름 변경
-- =============================================================

-- 이 그룹의 게시판 이름(조회 권한: 멤버 또는 관리자 + 프리미엄 + 개설됨) → 이름 반환, 없으면 null
create or replace function public.group_board(p_group uuid)
returns text language sql stable security definer set search_path = public as $$
  select b.name from public.group_boards b
  where b.group_id = p_group and public.board_can_view(p_group, auth.uid());
$$;

-- 게시판을 개설할 수 있는 내 그룹(프리미엄 + 멤버 + 아직 미개설)
create or replace function public.board_eligible_groups()
returns table(id uuid, name text) language sql stable security definer set search_path = public as $$
  select g.id, g.name from public.groups g
  join public.group_members m on m.group_id = g.id and m.user_id = auth.uid()
  where (public.is_couple_group(g.id) or public.is_friend_group(g.id))
    and not exists (select 1 from public.group_boards b where b.group_id = g.id)
  order by g.name;
$$;

-- 개설: secret-board 아이템 1개 소모 + group_boards 삽입
create or replace function public.board_setup(p_group uuid, p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_item public.user_items; v_name text := btrim(coalesce(p_name, ''));
begin
  if not public.is_group_member(p_group, v_uid) then raise exception '그룹 멤버가 아니에요.'; end if;
  if not (public.is_couple_group(p_group) or public.is_friend_group(p_group)) then
    raise exception '프리미엄 그룹에서만 게시판을 만들 수 있어요.'; end if;
  if v_name = '' then raise exception '게시판 이름을 입력해 주세요.'; end if;
  if char_length(v_name) > 20 then raise exception '게시판 이름은 20자까지예요.'; end if;
  if exists (select 1 from public.group_boards where group_id = p_group) then
    raise exception '이미 게시판이 있는 그룹이에요.'; end if;

  select * into v_item from public.user_items
    where user_id = v_uid and item_id = 'secret-board' and status = 'active'
    order by created_at asc limit 1 for update;
  if v_item.id is null then raise exception '사용할 수 있는 익명 게시판 아이템이 없어요.'; end if;

  update public.user_items set status = 'used', used_at = now(), group_id = p_group where id = v_item.id;
  insert into public.group_boards(group_id, name, created_by) values (p_group, v_name, v_uid);
  return jsonb_build_object('group_id', p_group, 'name', v_name);
end $$;

-- 이름 변경(설정 페이지에서 사용). 권한: 방장 또는 앱 관리자.
create or replace function public.board_rename(p_group uuid, p_name text)
returns text language plpgsql security definer set search_path = public as $$
declare v_name text := btrim(coalesce(p_name, ''));
begin
  if not public.board_can_manage(p_group, auth.uid()) then raise exception '권한이 없습니다.'; end if;
  if v_name = '' then raise exception '게시판 이름을 입력해 주세요.'; end if;
  if char_length(v_name) > 20 then raise exception '게시판 이름은 20자까지예요.'; end if;
  if not exists (select 1 from public.group_boards where group_id = p_group) then
    raise exception '게시판이 없는 그룹이에요.'; end if;
  update public.group_boards set name = v_name where group_id = p_group;
  return v_name;
end $$;


-- =============================================================
--  9. 트리거 — updated_at 자동 갱신
-- =============================================================
drop trigger if exists trg_board_posts_touch on public.board_posts;
create trigger trg_board_posts_touch before update on public.board_posts
  for each row execute function public.board_touch();
drop trigger if exists trg_board_comments_touch on public.board_comments;
create trigger trg_board_comments_touch before update on public.board_comments
  for each row execute function public.board_touch();


-- =============================================================
--  10. 데이터 백필(선택) — 이미 글이 쌓여 있는 그룹은 '비밀 게시판'
--      이름으로 자동 개설해 기존 접근 유지(신선한 환경에서는 no-op)
-- =============================================================
insert into public.group_boards (group_id, name)
select distinct group_id, '비밀 게시판' from public.board_posts
on conflict (group_id) do nothing;


-- =============================================================
--  11. 권한 부여
-- =============================================================
grant execute on function public.board_prefixes(uuid) to authenticated;
grant execute on function public.board_add_prefix(uuid, text) to authenticated;
grant execute on function public.board_update_prefix(uuid, text) to authenticated;
grant execute on function public.board_delete_prefix(uuid) to authenticated;
grant execute on function public.board_posts(uuid) to authenticated;
grant execute on function public.board_create_post(uuid, uuid, text, text) to authenticated;
grant execute on function public.board_update_post(uuid, uuid, text, text) to authenticated;
grant execute on function public.board_delete_post(uuid) to authenticated;
grant execute on function public.board_comments(uuid) to authenticated;
grant execute on function public.board_add_comment(uuid, uuid, text) to authenticated;
grant execute on function public.board_update_comment(uuid, text) to authenticated;
grant execute on function public.board_delete_comment(uuid) to authenticated;
grant execute on function public.board_can_write(uuid) to authenticated;
grant execute on function public.group_board(uuid) to authenticated;
grant execute on function public.board_eligible_groups() to authenticated;
grant execute on function public.board_setup(uuid, text) to authenticated;
grant execute on function public.board_rename(uuid, text) to authenticated;
