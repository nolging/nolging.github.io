-- =============================================================
--  비밀 게시판 댓글: 소프트 삭제(대댓글 보존) 마이그레이션
--   · 부모 댓글을 지워도 답글은 남긴다.
--     - 답글이 있는 댓글 삭제 → 자리표시자로 남김("삭제된 댓글입니다.")
--     - 답글이 없는 댓글 삭제 → 완전히 제거(안 보이게)
--     - 소프트삭제된 부모의 마지막 답글이 지워지면 부모 자리표시자도 정리
--   · 이미 secret-board.sql 을 적용한 그룹에서 이어서 실행하면 됨.
--  적용: Supabase SQL Editor 에 그대로 실행.
-- =============================================================

-- 소프트 삭제 표식
alter table public.board_comments add column if not exists deleted_at timestamptz;

-- ── 댓글 조회: deleted 플래그 추가(자리표시자 렌더용) ─────────
-- 반환 컬럼이 바뀌므로 먼저 drop
drop function if exists public.board_comments(uuid);
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

-- ── 댓글 삭제: 답글 있으면 소프트삭제, 없으면 하드삭제 + 부모 정리 ──
create or replace function public.board_delete_comment(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_c public.board_comments; v_kids int; v_parent uuid; v_pdel timestamptz; v_left int;
begin
  select * into v_c from public.board_comments where id = p_id;
  if v_c.id is null then return; end if;
  if v_c.author_id <> auth.uid() and not public.board_can_manage(v_c.group_id, auth.uid()) then
    raise exception '삭제 권한이 없어요.'; end if;
  -- 이미 소프트삭제된 자리표시자면 아무 것도 안 함(버튼도 안 나오지만 방어적으로)
  if v_c.deleted_at is not null then return; end if;

  -- 답글이 남아 있으면 자리표시자로 남긴다
  select count(*) into v_kids from public.board_comments where parent_id = p_id;
  if v_kids > 0 then
    update public.board_comments set deleted_at = now(), body = '' where id = p_id;
    return;
  end if;

  -- 답글이 없으면 완전히 삭제
  v_parent := v_c.parent_id;
  delete from public.board_comments where id = p_id;

  -- 이 댓글이 소프트삭제된 부모의 마지막 답글이었다면 부모 자리표시자도 정리
  if v_parent is not null then
    select deleted_at into v_pdel from public.board_comments where id = v_parent;
    if v_pdel is not null then
      select count(*) into v_left from public.board_comments where parent_id = v_parent;
      if v_left = 0 then delete from public.board_comments where id = v_parent; end if;
    end if;
  end if;
end $$;
grant execute on function public.board_delete_comment(uuid) to authenticated;

-- ── 글 목록: 댓글 수는 삭제(자리표시자) 제외 ─────────────────
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
