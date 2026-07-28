-- =============================================================
--  비밀 게시판 알림 + 칭찬 스티커 도착 알림
--   1) 새 글        → 그룹 멤버 전원에게(글쓴이 제외). 클릭 시 글 상세.
--   2) 내 글 댓글    → 글쓴이에게. 클릭 시 댓글 상세 + 해당 댓글 포커스.
--   3) 내 댓글 답글  → 원 댓글 작성자에게. 클릭 시 댓글 상세 + 해당 답글 포커스.
--   4) 칭찬 스티커   → 내 판에 스티커가 붙을 때마다 판 주인에게(완성은 기존 praise 알림).
--  익명 유지: 게시판 알림은 actor_id 를 남기지 않고, 작성자 이름도 노출하지 않음.
--  적용: Supabase SQL Editor 에 실행. (secret-board.sql / notif-templates.sql / notif-couple.sql 이후)
-- =============================================================

-- ── 알림 딥링크용 컬럼(게시판 글/댓글) ─────────────────────
alter table public.notifications add column if not exists post_id uuid
  references public.board_posts(id) on delete cascade;
alter table public.notifications add column if not exists board_comment_id uuid
  references public.board_comments(id) on delete cascade;

-- ── 알림 문구 템플릿(관리자 편집 가능) ────────────────────
insert into public.notif_templates (key, label, title, body, vars, emoji, sort_order) values
  ('board_post',    '비밀 게시판 새 글',       '비밀 게시판에 새 글이 올라왔어요', '{title}', '{title} = 글 제목',  '🤫', 97),
  ('board_comment', '비밀 게시판 내 글 댓글',   '내 글에 댓글이 달렸어요',          '{text}',  '{text} = 댓글 내용', '💬', 98),
  ('board_reply',   '비밀 게시판 내 댓글 답글', '내 댓글에 답글이 달렸어요',         '{text}',  '{text} = 답글 내용', '↩️', 99),
  ('praise_new',    '칭찬 스티커 도착',         '{actor} 님이 칭찬 스티커를 붙였어요', '{reason}', '{actor} = 붙인 짝꿍, {reason} = 칭찬 내용', '🌟', 100)
on conflict (key) do update set label = excluded.label, vars = excluded.vars, sort_order = excluded.sort_order;

-- ── 글 작성: 그룹 멤버 전원에게 새 글 알림(익명) ───────────
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

  select r.title, r.body into v_t, v_b from public.notif_render('board_post', jsonb_build_object('title', v_title)) r;
  insert into public.notifications(user_id, actor_id, type, title, body, group_id, post_id)
  select gm.user_id, null, 'board_post',
         coalesce(v_t, '비밀 게시판에 새 글이 올라왔어요'), coalesce(nullif(v_b, ''), v_title), p_group, v_id
  from public.group_members gm
  where gm.group_id = p_group and gm.user_id <> auth.uid();

  return v_id;
end $$;
grant execute on function public.board_create_post(uuid, uuid, text, text) to authenticated;

-- ── 댓글/답글 작성: 글쓴이 / 원 댓글 작성자에게 알림(익명) ──
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

  if p_parent is null then
    -- 최상위 댓글 → 글쓴이
    if v_post_author is not null and v_post_author <> auth.uid() then
      select r.title, r.body into v_t, v_b from public.notif_render('board_comment', jsonb_build_object('text', v_body)) r;
      insert into public.notifications(user_id, actor_id, type, title, body, group_id, post_id, board_comment_id)
        values (v_post_author, null, 'board_comment',
                coalesce(v_t, '내 글에 댓글이 달렸어요'), coalesce(nullif(v_b, ''), v_body), v_group, p_post, v_id);
    end if;
  else
    -- 답글 → 원 댓글 작성자
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

-- ── 칭찬 스티커: 붙일 때마다 판 주인에게 알림(완성은 기존 praise 알림) ──
create or replace function public.praise_place(p_group_id uuid, p_owner_id uuid, p_slot int, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_board public.praise_boards; v_count int; v_pactor text; v_nt_t text; v_nt_b text; v_reason text;
begin
  if not public.is_couple_group(p_group_id) then raise exception '커플 그룹이 아니에요.'; end if;
  if not public.is_group_member(p_group_id, v_uid) then raise exception '그룹 멤버가 아니에요.'; end if;
  if not public.is_group_member(p_group_id, p_owner_id) then raise exception '대상이 그룹 멤버가 아니에요.'; end if;
  if p_owner_id = v_uid then raise exception '내 칭찬판엔 붙일 수 없어요.'; end if;
  if p_slot < 0 or p_slot > 19 then raise exception '잘못된 칸이에요.'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception '칭찬 내용을 입력해 주세요.'; end if;

  select * into v_board from public.praise_boards
    where owner_id = p_owner_id and claimed_at is null
    order by started_at desc limit 1 for update;
  if v_board.id is null then raise exception '상대가 아직 스티커판을 준비하지 않았어요.'; end if;
  if v_board.completed_at is not null then raise exception '이미 완성된 스티커판이에요.'; end if;

  v_reason := left(btrim(p_reason), 100);
  insert into public.praise_stickers(board_id, group_id, owner_id, slot_index, reason, from_id)
    values (v_board.id, p_group_id, p_owner_id, p_slot, v_reason, v_uid);

  v_pactor := coalesce(public.notif_member_name(p_group_id, v_uid), '');
  select count(*) into v_count from public.praise_stickers where board_id = v_board.id;
  if v_count >= 20 then
    update public.praise_boards
      set completed_at = now(), group_id = p_group_id, gifter_id = v_uid
      where id = v_board.id;
    select nr.title, nr.body into v_nt_t, v_nt_b from public.notif_render('praise', jsonb_build_object('actor', v_pactor)) nr;
    insert into public.notifications(user_id, actor_id, type, title, body, group_id)
      values (p_owner_id, v_uid, 'praise',
              coalesce(v_nt_t, v_pactor || ' 님이 칭찬 스티커판을 완성했어요'),
              coalesce(v_nt_b, '칭찬 스티커에서 소원권을 수령하세요 🎉'), p_group_id);
  else
    -- 아직 완성 전: 스티커 도착 알림
    select nr.title, nr.body into v_nt_t, v_nt_b from public.notif_render('praise_new', jsonb_build_object('actor', v_pactor, 'reason', v_reason)) nr;
    insert into public.notifications(user_id, actor_id, type, title, body, group_id)
      values (p_owner_id, v_uid, 'praise_new',
              coalesce(v_nt_t, v_pactor || ' 님이 칭찬 스티커를 붙였어요'),
              coalesce(nullif(v_nt_b, ''), v_reason), p_group_id);
  end if;
end $$;
grant execute on function public.praise_place(uuid, uuid, int, text) to authenticated;
