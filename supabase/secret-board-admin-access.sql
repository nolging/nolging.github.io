-- =============================================================
--  비밀 게시판: 앱 관리자는 본인이 속하지 않은 그룹의 게시판도 볼 수 있게.
--   · 삭제(신고 대응 등)는 이미 가능했음 — board_can_manage() 가 is_admin() 이면
--     그룹 멤버가 아니어도 통과하도록 애초에 짜여 있었다(board_delete_post/board_delete_comment).
--   · 부족했던 건 "조회" 쪽 — board_access() 는 순수 멤버십만 보기 때문에, 관리자가
--     멤버가 아닌 그룹에 들어가면 게시판 진입점(group_board)부터 null 이 나와 버튼조차 안 뜨고,
--     설령 URL로 들어가도 글/댓글 목록이 비어 보였다.
--   · 새로 만드는 board_can_view() 는 "멤버십 OR 관리자(+프리미엄 그룹)" 로 조회만 허용한다.
--     글쓰기/댓글쓰기/수정(board_create_post, board_update_post, board_add_comment,
--     board_update_comment)은 여전히 board_access() 그대로 둬서 — 관리자도 비멤버 그룹에서는
--     쓰기·수정은 못 하고 조회 + (기존처럼) 삭제만 가능하다.
--  전제: secret-board.sql, secret-board-comments.sql, board-item.sql 적용 후 실행.
--  적용: Supabase SQL Editor 에 그대로 실행.
-- =============================================================

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
grant execute on function public.board_can_write(uuid) to authenticated;

-- 그룹 상세의 "비밀 게시판" 진입 버튼이 참조하는 개설 여부/이름
create or replace function public.group_board(p_group uuid)
returns text language sql stable security definer set search_path = public as $$
  select b.name from public.group_boards b
  where b.group_id = p_group and public.board_can_view(p_group, auth.uid());
$$;

create or replace function public.board_prefixes(p_group uuid)
returns table(id uuid, label text, sort_order int)
language sql stable security definer set search_path = public as $$
  select p.id, p.label, p.sort_order
  from public.board_prefixes p
  where p.group_id = p_group and public.board_can_view(p_group, auth.uid())
  order by p.sort_order, p.created_at;
$$;

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
