-- =============================================================
--  쪽지 페이지네이션: list_received_notes 에 limit/offset 추가
--  - 화면에 ~9개 노출 → 최근 15개만 조회, 더 과거는 스크롤 시 추가 조회(egress 절감).
--  - 남아 있을 수 있는 모든 오버로드를 제거한 뒤 limit/offset 버전 하나만 생성.
--  - 마지막에 PostgREST 스키마 캐시 리로드까지 트리거.
--  적용: Supabase SQL Editor 에 그대로 실행.
-- =============================================================

-- 1) list_received_notes 의 모든 오버로드(무인자/구버전 포함) 제거
do $$
declare r record;
begin
  for r in
    select oid::regprocedure::text as sig
    from pg_proc where proname = 'list_received_notes' and pronamespace = 'public'::regnamespace
  loop
    execute 'drop function ' || r.sig;
  end loop;
end $$;

-- 2) limit/offset 버전 생성(익명 가림 로직 동일)
create function public.list_received_notes(p_limit integer default 15, p_offset integer default 0)
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

-- 3) PostgREST 스키마 캐시 즉시 리로드
notify pgrst, 'reload schema';

-- 4) (진단) 현재 남아 있는 오버로드와 본문에 limit 포함 여부 확인 — 결과 1행, body_has_limit=true 여야 정상
select oid::regprocedure::text as signature, (prosrc ilike '%limit%') as body_has_limit
from pg_proc where proname = 'list_received_notes' and pronamespace = 'public'::regnamespace;
