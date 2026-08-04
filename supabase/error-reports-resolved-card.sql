-- 오류 리포트 카드: 처리 완료 시간 노출용
--  list_received_notes 에 report_resolved_at 추가(프론트가 처리 완료 카드의
--  미리보기/시간 표시를 "마지막 메시지" 대신 "처리 완료 시각" 기준으로 바꾸는 데 사용).
-- 전제: error-reports.sql, error-reports-chat.sql, error-reports-push.sql 적용됨.
-- 적용: Supabase SQL Editor 에 그대로 실행.

drop function if exists public.list_received_notes(integer, integer);
create function public.list_received_notes(p_limit integer default 15, p_offset integer default 0)
returns table(
  id uuid, group_id uuid, sender_id uuid, recipient_id uuid,
  sender_name text, recipient_name text, sender_avatar text, recipient_avatar text,
  body text, kind text, is_read boolean, created_at timestamptz,
  item_id text, item_name text, claimed boolean, rejected boolean, media_url text, anonymous boolean, qty integer,
  timer_seconds integer, opened_at timestamptz, sender_active boolean,
  report_id uuid, report_resolved boolean, report_resolved_at timestamptz
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
    n.item_id, n.item_name, n.claimed, n.rejected, n.media_url, n.anonymous, coalesce(n.qty, 1),
    n.timer_seconds, n.opened_at,
    public.is_group_member(n.group_id, n.sender_id),
    n.report_id,
    (select er.resolved from public.error_reports er where er.id = n.report_id),
    (select er.resolved_at from public.error_reports er where er.id = n.report_id)
  from public.notes n
  where n.recipient_id = auth.uid()
    and not (n.kind = 'system' and (
          coalesce(n.is_anchor, false) = false
          or coalesce((select er.user_hidden from public.error_reports er where er.id = n.report_id), false)
        ))
  order by n.created_at desc
  limit greatest(1, least(coalesce(p_limit, 15), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;
grant execute on function public.list_received_notes(integer, integer) to authenticated;

notify pgrst, 'reload schema';
