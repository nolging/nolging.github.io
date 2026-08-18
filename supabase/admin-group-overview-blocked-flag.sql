-- =============================================================
--  관리자: 그룹별 사용량 제어 목록에 "제어 중" 표시(카드 그라데이션 테두리)를 위한
--  has_blocked_features 컬럼 추가. admin_group_overview() 반환 컬럼이 늘어나
--  create or replace 로는 안 되므로 drop 후 재생성한다.
-- =============================================================
drop function if exists public.admin_group_overview();

create or replace function public.admin_group_overview()
returns table(
  group_id uuid, name text, emoji text, emoji_bg text,
  is_couple boolean, is_friend boolean, members jsonb,
  has_blocked_features boolean
) language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception '관리자만 사용할 수 있어요.'; end if;
  return query
    select g.id, g.name, g.emoji, g.emoji_bg,
      exists(select 1 from public.user_items ui where ui.group_id = g.id and ui.item_id = 'couple-ring' and ui.status = 'used'),
      exists(select 1 from public.user_items ui where ui.group_id = g.id and ui.item_id = 'friend-ring' and ui.status = 'used'),
      coalesce((
        select jsonb_agg(jsonb_build_object('user_id', gm.user_id, 'nickname', gm.display_nickname, 'avatar_url', gm.avatar_url) order by gm.joined_at)
        from public.group_members gm where gm.group_id = g.id and gm.left_at is null
      ), '[]'::jsonb) as members,
      exists(select 1 from public.group_feature_blocks gfb where gfb.group_id = g.id) as has_blocked_features
    from public.groups g
    order by g.created_at desc;
end;
$$;
grant execute on function public.admin_group_overview() to authenticated;
