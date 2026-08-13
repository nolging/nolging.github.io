-- =============================================================
--  알림 관리 목록 정렬 순서 변경 RPC
--   · notif_templates 는 RLS 상 직접 쓰기가 막혀 있어(정의자/관리자 RPC 전용),
--     퀘스트/상점 관리처럼 이모지 아이콘을 잡고 드래그로 순서를 바꾸려면
--     관리자 전용 RPC 가 필요하다.
--   · p_items: [{"key":"...", "sortOrder": n}, ...]
--  전제: notif-templates.sql 적용됨.
--  적용: Supabase SQL Editor 에 그대로 실행.
-- =============================================================
create or replace function public.admin_reorder_notifs(p_items jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_it jsonb;
begin
  if not public.is_admin(auth.uid()) then raise exception '권한이 없습니다.'; end if;
  for v_it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    update public.notif_templates
       set sort_order = coalesce((v_it->>'sortOrder')::int, sort_order)
     where key = v_it->>'key';
  end loop;
end $$;
grant execute on function public.admin_reorder_notifs(jsonb) to authenticated;
