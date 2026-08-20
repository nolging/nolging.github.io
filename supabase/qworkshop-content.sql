-- =============================================================
--  물음표 공방 — 실제 콘텐츠(글/답변/댓글). 개설(구매→사용) 로직은
--  question-workshop.sql 에 이미 있고, 이 파일은 그 위에 얹는 후속 마이그레이션이다.
--
--  물음표(포스트) 유형 3종 — question(질문, 필수)/body(내용)는 공통, 나머지는 유형별:
--   · vs   : 선택지 정확히 2개. 상세 페이지에서 VS 형태로 하나를 고른다.
--   · poll : 선택지 2~10개(작성 시 2개로 시작, 최대 10개까지 추가). 투표.
--   · qna  : 선택지 없음. 자유 서술형 답변 인풋.
--
--  세 유형 모두 "내가 답하기/고르기 전에는 남의 답/선택을 볼 수 없다" — task_reviews
--  의 열람 게이팅(schema-v2.sql)과 완전히 같은 패턴: RLS 는 본인 것만 직접 조회
--  허용하고, 그 외 열람은 security definer RPC 가 행 단위로 gating 해서 내려준다.
--
--  댓글은 비밀 게시판(익명, 멘션 없음)과 달리 위시(task_comments)와 동일하게
--  실명 + 답글(1단계) + @멘션을 지원한다.
--  적용: Supabase SQL Editor 에 그대로 실행. question-workshop.sql 이후에 실행할 것.
-- =============================================================

-- ── 테이블 ────────────────────────────────────────────────
create table if not exists public.qworkshop_posts (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  type       text not null check (type in ('vs', 'poll', 'qna')),
  question   text not null,
  body       text not null default '',
  options    jsonb not null default '[]'::jsonb,   -- vs/poll: 선택지 문자열 배열(순서=인덱스). qna: 빈 배열.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_qworkshop_posts_group on public.qworkshop_posts(group_id, created_at desc);

-- 한 유저는 물음표 하나당 답 하나(선택지 변경/답변 수정은 upsert 로 허용)
create table if not exists public.qworkshop_answers (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.qworkshop_posts(id) on delete cascade,
  group_id    uuid not null references public.groups(id) on delete cascade,
  author_id   uuid not null references public.profiles(id) on delete cascade,
  option_idx  int,     -- vs/poll 전용(0-base). qna 는 null.
  answer_text text,    -- qna 전용. vs/poll 은 null.
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (post_id, author_id)
);
create index if not exists idx_qworkshop_answers_post on public.qworkshop_answers(post_id);

-- 댓글: task_comments 와 동일 패턴(실명 + 답글 1단계 + @멘션)
create table if not exists public.qworkshop_comments (
  id            uuid primary key default gen_random_uuid(),
  post_id       uuid not null references public.qworkshop_posts(id) on delete cascade,
  group_id      uuid not null references public.groups(id) on delete cascade,
  author_id     uuid not null references public.profiles(id) on delete cascade,
  parent_id     uuid references public.qworkshop_comments(id) on delete cascade,
  body          text not null,
  mentioned_ids uuid[],
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_qworkshop_comments_post on public.qworkshop_comments(post_id, created_at);

-- 직접 접근은 전면 차단(비밀 게시판과 동일한 강한 패턴) — 모든 접근은 아래 RPC 로만.
alter table public.qworkshop_posts    enable row level security;
alter table public.qworkshop_answers  enable row level security;
alter table public.qworkshop_comments enable row level security;

-- updated_at 자동 갱신(board_touch 재사용)
drop trigger if exists trg_qworkshop_posts_touch on public.qworkshop_posts;
create trigger trg_qworkshop_posts_touch before update on public.qworkshop_posts
  for each row execute function public.board_touch();
drop trigger if exists trg_qworkshop_answers_touch on public.qworkshop_answers;
create trigger trg_qworkshop_answers_touch before update on public.qworkshop_answers
  for each row execute function public.board_touch();
drop trigger if exists trg_qworkshop_comments_touch on public.qworkshop_comments;
create trigger trg_qworkshop_comments_touch before update on public.qworkshop_comments
  for each row execute function public.board_touch();

-- 알림이 물음표/댓글로 바로 이동할 수 있게 컬럼 추가(board_posts/board_comments 와 FK 대상만 다름)
alter table public.notifications add column if not exists qworkshop_post_id uuid
  references public.qworkshop_posts(id) on delete cascade;
alter table public.notifications add column if not exists qworkshop_comment_id uuid
  references public.qworkshop_comments(id) on delete cascade;

-- ── 권한 헬퍼(비밀 게시판의 board_access/board_can_manage 와 동일 패턴) ──
create or replace function public.qworkshop_access(p_group uuid, p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_group_member(p_group, p_uid)
     and (public.is_couple_group(p_group) or public.is_friend_group(p_group));
$$;
create or replace function public.qworkshop_can_manage(p_group uuid, p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_group_owner(p_group, p_uid) or public.is_admin(p_uid);
$$;

-- ── 글(물음표) ────────────────────────────────────────────
create or replace function public.qworkshop_posts(p_group uuid)
returns table(id uuid, type text, question text, body text, options jsonb,
              created_at timestamptz, updated_at timestamptz, edited boolean,
              author_id uuid, nickname text, avatar_url text,
              is_mine boolean, can_delete boolean, has_answered boolean,
              answer_count bigint, comment_count bigint)
language sql stable security definer set search_path = public as $$
  select po.id, po.type, po.question, po.body, po.options,
         po.created_at, po.updated_at, (po.updated_at > po.created_at) as edited,
         po.author_id, coalesce(nullif(gm.display_nickname, ''), '멤버') as nickname, gm.avatar_url,
         (po.author_id = auth.uid()) as is_mine,
         (po.author_id = auth.uid() or public.qworkshop_can_manage(po.group_id, auth.uid())) as can_delete,
         exists(select 1 from public.qworkshop_answers a where a.post_id = po.id and a.author_id = auth.uid()) as has_answered,
         (select count(*) from public.qworkshop_answers a2 where a2.post_id = po.id) as answer_count,
         (select count(*) from public.qworkshop_comments c where c.post_id = po.id) as comment_count
  from public.qworkshop_posts po
  left join public.group_members gm on gm.group_id = po.group_id and gm.user_id = po.author_id
  where po.group_id = p_group and public.qworkshop_access(p_group, auth.uid())
  order by po.created_at desc;
$$;
grant execute on function public.qworkshop_posts(uuid) to authenticated;

create or replace function public.qworkshop_create_post(p_group uuid, p_type text, p_question text, p_body text, p_options jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_q text; v_opts jsonb; v_n int;
begin
  if not public.qworkshop_access(p_group, auth.uid()) then raise exception '물음표를 쓸 수 없어요.'; end if;
  if p_type not in ('vs', 'poll', 'qna') then raise exception '유형이 올바르지 않아요.'; end if;
  v_q := btrim(coalesce(p_question, ''));
  if v_q = '' then raise exception '질문을 입력해 주세요.'; end if;
  if char_length(v_q) > 100 then raise exception '질문은 100자 이내로 입력해 주세요.'; end if;
  if char_length(coalesce(p_body, '')) > 2000 then raise exception '내용이 너무 길어요.'; end if;

  if p_type = 'qna' then
    v_opts := '[]'::jsonb;
  else
    if p_options is null or jsonb_typeof(p_options) <> 'array' then raise exception '선택지를 입력해 주세요.'; end if;
    select jsonb_agg(btrim(x)) filter (where btrim(x) <> '') into v_opts
      from jsonb_array_elements_text(p_options) x;
    v_opts := coalesce(v_opts, '[]'::jsonb);
    v_n := jsonb_array_length(v_opts);
    if p_type = 'vs' and v_n <> 2 then raise exception 'VS는 선택지 2개가 필요해요.'; end if;
    if p_type = 'poll' and (v_n < 2 or v_n > 10) then raise exception '고르기는 선택지 2~10개가 필요해요.'; end if;
  end if;

  insert into public.qworkshop_posts(group_id, author_id, type, question, body, options)
    values (p_group, auth.uid(), p_type, v_q, coalesce(p_body, ''), v_opts)
    returning id into v_id;
  return v_id;
end $$;
grant execute on function public.qworkshop_create_post(uuid, text, text, text, jsonb) to authenticated;

-- 수정: 질문/내용은 언제나 수정 가능. 선택지는 아직 아무도 답하지 않았을 때만(답 인덱스가 어긋나지 않게).
create or replace function public.qworkshop_update_post(p_id uuid, p_question text, p_body text, p_options jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_post public.qworkshop_posts; v_q text; v_opts jsonb; v_n int; v_answered boolean;
begin
  select * into v_post from public.qworkshop_posts where id = p_id;
  if v_post.id is null then raise exception '물음표를 찾을 수 없어요.'; end if;
  if v_post.author_id <> auth.uid() then raise exception '내가 쓴 물음표만 수정할 수 있어요.'; end if;
  v_q := btrim(coalesce(p_question, ''));
  if v_q = '' then raise exception '질문을 입력해 주세요.'; end if;
  if char_length(v_q) > 100 then raise exception '질문은 100자 이내로 입력해 주세요.'; end if;
  if char_length(coalesce(p_body, '')) > 2000 then raise exception '내용이 너무 길어요.'; end if;

  v_opts := v_post.options;
  if v_post.type <> 'qna' then
    v_answered := exists(select 1 from public.qworkshop_answers where post_id = p_id);
    if v_answered then
      raise exception '이미 답변이 달려서 선택지는 수정할 수 없어요. 질문/내용만 바꿀 수 있어요.';
    end if;
    if p_options is not null and jsonb_typeof(p_options) = 'array' then
      select jsonb_agg(btrim(x)) filter (where btrim(x) <> '') into v_opts
        from jsonb_array_elements_text(p_options) x;
      v_opts := coalesce(v_opts, '[]'::jsonb);
      v_n := jsonb_array_length(v_opts);
      if v_post.type = 'vs' and v_n <> 2 then raise exception 'VS는 선택지 2개가 필요해요.'; end if;
      if v_post.type = 'poll' and (v_n < 2 or v_n > 10) then raise exception '고르기는 선택지 2~10개가 필요해요.'; end if;
    end if;
  end if;

  update public.qworkshop_posts set question = v_q, body = coalesce(p_body, ''), options = v_opts where id = p_id;
end $$;
grant execute on function public.qworkshop_update_post(uuid, text, text, jsonb) to authenticated;

create or replace function public.qworkshop_delete_post(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_post public.qworkshop_posts;
begin
  select * into v_post from public.qworkshop_posts where id = p_id;
  if v_post.id is null then return; end if;
  if v_post.author_id <> auth.uid() and not public.qworkshop_can_manage(v_post.group_id, auth.uid()) then
    raise exception '삭제 권한이 없어요.'; end if;
  delete from public.qworkshop_posts where id = p_id;   -- 답변/댓글은 on delete cascade
end $$;
grant execute on function public.qworkshop_delete_post(uuid) to authenticated;

-- ── 답변/선택(게이팅) — task_reviews_view 와 완전히 같은 패턴 ──
-- 내가 답하기 전엔 남의 답을 null 로 가려서 내려준다. vs/poll 은 집계(counts)도 함께 가림.
create or replace function public.qworkshop_answers_view(p_post uuid)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare
  v_post public.qworkshop_posts;
  v_answered boolean;
  v_my jsonb;
  v_answers jsonb;
  v_counts jsonb;
begin
  select * into v_post from public.qworkshop_posts where id = p_post;
  if v_post.id is null then raise exception '물음표를 찾을 수 없어요.'; end if;
  if not public.qworkshop_access(v_post.group_id, auth.uid()) then raise exception '접근할 수 없어요.'; end if;

  v_answered := exists(select 1 from public.qworkshop_answers a where a.post_id = p_post and a.author_id = auth.uid());

  select jsonb_build_object('option_idx', a.option_idx, 'answer_text', a.answer_text)
    into v_my from public.qworkshop_answers a where a.post_id = p_post and a.author_id = auth.uid();

  select coalesce(jsonb_agg(jsonb_build_object(
      'author_id', a.author_id,
      'nickname', coalesce(nullif(gm.display_nickname, ''), '멤버'),
      'avatar_url', gm.avatar_url,
      'option_idx', case when v_answered then a.option_idx else null end,
      'answer_text', case when v_answered or a.author_id = auth.uid() then a.answer_text else null end,
      'is_self', a.author_id = auth.uid(),
      'created_at', a.created_at
    ) order by a.created_at), '[]'::jsonb)
    into v_answers
  from public.qworkshop_answers a
  left join public.group_members gm on gm.group_id = v_post.group_id and gm.user_id = a.author_id
  where a.post_id = p_post;

  if v_post.type in ('vs', 'poll') and v_answered then
    select coalesce(jsonb_agg(cnt order by idx), '[]'::jsonb) into v_counts
    from (
      select (ord - 1) as idx, count(a.id) as cnt
      from jsonb_array_elements(v_post.options) with ordinality as opt(val, ord)
      left join public.qworkshop_answers a on a.post_id = p_post and a.option_idx = ord - 1
      group by ord
    ) t;
  end if;

  return jsonb_build_object('has_answered', v_answered, 'my_answer', v_my, 'answers', v_answers, 'counts', v_counts);
end $$;
grant execute on function public.qworkshop_answers_view(uuid) to authenticated;

create or replace function public.qworkshop_answer_submit(p_post uuid, p_option_idx int, p_answer_text text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_post public.qworkshop_posts; v_opt_count int;
begin
  select * into v_post from public.qworkshop_posts where id = p_post;
  if v_post.id is null then raise exception '물음표를 찾을 수 없어요.'; end if;
  if not public.qworkshop_access(v_post.group_id, auth.uid()) then raise exception '접근할 수 없어요.'; end if;

  if v_post.type in ('vs', 'poll') then
    v_opt_count := jsonb_array_length(v_post.options);
    if p_option_idx is null or p_option_idx < 0 or p_option_idx >= v_opt_count then
      raise exception '선택지를 골라 주세요.'; end if;
    insert into public.qworkshop_answers(post_id, group_id, author_id, option_idx, answer_text)
      values (p_post, v_post.group_id, auth.uid(), p_option_idx, null)
    on conflict (post_id, author_id) do update set option_idx = excluded.option_idx, answer_text = null, updated_at = now();
  else
    if p_answer_text is null or btrim(p_answer_text) = '' then raise exception '답변을 입력해 주세요.'; end if;
    if char_length(p_answer_text) > 1000 then raise exception '답변은 1000자까지 입력할 수 있어요.'; end if;
    insert into public.qworkshop_answers(post_id, group_id, author_id, option_idx, answer_text)
      values (p_post, v_post.group_id, auth.uid(), null, btrim(p_answer_text))
    on conflict (post_id, author_id) do update set answer_text = excluded.answer_text, option_idx = null, updated_at = now();
  end if;

  return public.qworkshop_answers_view(p_post);
end $$;
grant execute on function public.qworkshop_answer_submit(uuid, int, text) to authenticated;

-- ── 댓글(실명 + 답글 1단계 + @멘션) ──────────────────────────
create or replace function public.qworkshop_comments(p_post uuid)
returns table(id uuid, parent_id uuid, body text, mentioned_ids uuid[],
              created_at timestamptz, updated_at timestamptz, edited boolean,
              author_id uuid, nickname text, avatar_url text,
              is_mine boolean, can_delete boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.parent_id, c.body, c.mentioned_ids, c.created_at, c.updated_at,
         (c.updated_at > c.created_at) as edited,
         c.author_id, coalesce(nullif(gm.display_nickname, ''), '멤버') as nickname, gm.avatar_url,
         (c.author_id = auth.uid()) as is_mine,
         (c.author_id = auth.uid() or public.qworkshop_can_manage(c.group_id, auth.uid())) as can_delete
  from public.qworkshop_comments c
  join public.qworkshop_posts po on po.id = c.post_id
  left join public.group_members gm on gm.group_id = c.group_id and gm.user_id = c.author_id
  where c.post_id = p_post and public.qworkshop_access(po.group_id, auth.uid())
  order by c.created_at;
$$;
grant execute on function public.qworkshop_comments(uuid) to authenticated;

create or replace function public.qworkshop_add_comment(p_post uuid, p_parent uuid, p_body text, p_mentioned_ids uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_group uuid; v_post_author uuid; v_id uuid; v_body text;
  v_parent uuid; v_pparent uuid; v_target_author uuid; v_actor text;
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
      insert into public.notifications(user_id, actor_id, type, title, body, group_id, qworkshop_post_id, qworkshop_comment_id)
        values (v_post_author, auth.uid(), 'qworkshop_comment', '내 물음표에 댓글이 달렸어요', v_actor || ': ' || v_body, v_group, p_post, v_id);
    end if;
  else
    if v_target_author is not null and v_target_author <> auth.uid() then
      insert into public.notifications(user_id, actor_id, type, title, body, group_id, qworkshop_post_id, qworkshop_comment_id)
        values (v_target_author, auth.uid(), 'qworkshop_reply', '내 댓글에 답글이 달렸어요', v_actor || ': ' || v_body, v_group, p_post, v_id);
    end if;
  end if;

  if p_mentioned_ids is not null then
    insert into public.notifications(user_id, actor_id, type, title, body, group_id, qworkshop_post_id, qworkshop_comment_id)
    select distinct u, auth.uid(), 'mention', v_actor || ' 님이 회원님을 언급했어요', v_actor || ': ' || v_body, v_group, p_post, v_id
    from unnest(p_mentioned_ids) as u
    where u <> auth.uid()
      and public.is_group_member(v_group, u)
      and u is distinct from v_post_author
      and u is distinct from v_target_author;
  end if;

  return v_id;
end $$;
grant execute on function public.qworkshop_add_comment(uuid, uuid, text, uuid[]) to authenticated;

create or replace function public.qworkshop_update_comment(p_id uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare v_c public.qworkshop_comments; v_body text;
begin
  select * into v_c from public.qworkshop_comments where id = p_id;
  if v_c.id is null then raise exception '댓글을 찾을 수 없어요.'; end if;
  if v_c.author_id <> auth.uid() then raise exception '내가 쓴 댓글만 수정할 수 있어요.'; end if;
  v_body := btrim(coalesce(p_body, ''));
  if v_body = '' then raise exception '내용을 입력해 주세요.'; end if;
  if char_length(v_body) > 2000 then raise exception '댓글이 너무 길어요.'; end if;
  update public.qworkshop_comments set body = v_body where id = p_id;
end $$;
grant execute on function public.qworkshop_update_comment(uuid, text) to authenticated;

create or replace function public.qworkshop_delete_comment(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_c public.qworkshop_comments;
begin
  select * into v_c from public.qworkshop_comments where id = p_id;
  if v_c.id is null then return; end if;
  if v_c.author_id <> auth.uid() and not public.qworkshop_can_manage(v_c.group_id, auth.uid()) then
    raise exception '삭제 권한이 없어요.'; end if;
  delete from public.qworkshop_comments where id = p_id;   -- 답글은 on delete cascade
end $$;
grant execute on function public.qworkshop_delete_comment(uuid) to authenticated;

notify pgrst, 'reload schema';
