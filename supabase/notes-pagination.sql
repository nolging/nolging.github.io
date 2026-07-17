-- =============================================================
--  쪽지 페이지네이션: list_received_notes 에 limit/offset 추가
--  - 화면에 ~9개 노출 → 최근 15개만 조회, 더 과거는 스크롤 시 추가 조회(egress 절감).
--  - 기존 무인자 시그니처를 limit/offset 기본값 버전으로 교체(익명 가림 로직 동일).
--  적용: Supabase SQL Editor 에 그대로 실행.
-- =============================================================

drop function if exists public.list_received_notes();
drop function if exists public.list_received_notes(integer, integer);

create or replace function public.list_received_notes(p_limit integer default 15, p_offset integer default 0)
returns table(
  id uuid, group_id uuid, sender_id uuid, recipient_id uuid,
  sender_name text, recipient_name text, sender_avatar text, recipient_avatar text,
  body text, kind text, is_read boolean, created_at timestamptz,
  item_id text, item_name text, claimed boolean, rejected boolean, media_url text, anonymous boolean, qty integer
) language sql security definer set search_path = public stable as $$
  select
    n.id, n.group_id,
    case when n.anonymous then null else n.sender_id end,
    n.recipient_id,
    case when n.anonymous then '익명' else n.sender_name end,
    n.recipient_name,
    case when n.anonymous then null else n.sender_avatar end,
    n.recipient_avatar,
    n.body, n.kind, n.is_read, n.created_at,
    n.item_id, n.item_name, n.claimed, n.rejected, n.media_url, n.anonymous, coalesce(n.qty, 1)
  from public.notes n
  where n.recipient_id = auth.uid()
  order by n.created_at desc
  limit greatest(1, least(coalesce(p_limit, 15), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;
grant execute on function public.list_received_notes(integer, integer) to authenticated;
