-- =============================================================
--  관리자: 그룹별 사용량 제어 (기능 차단)
--  group_feature_blocks 에 행이 있으면 그 기능은 해당 그룹에서 차단(Off).
--  기본은 모두 허용(행 없음 = On).
-- =============================================================
create table if not exists public.group_feature_blocks (
  group_id   uuid not null references public.groups(id) on delete cascade,
  feature    text not null check (feature in ('touch', 'draw', 'catchmind', 'davinci', 'puzzle', 'rps', 'omok')),
  created_at timestamptz not null default now(),
  primary key (group_id, feature)
);
alter table public.group_feature_blocks enable row level security;

-- 조회: 그룹 멤버(버튼 비활성화 판단용) + 관리자
drop policy if exists gfb_select on public.group_feature_blocks;
create policy gfb_select on public.group_feature_blocks
  for select to authenticated
  using (public.is_group_member(group_id, auth.uid()) or public.is_admin(auth.uid()));

-- ---- RPC: 관리자 — 기능 차단/해제 -------------------------------
create or replace function public.admin_set_group_feature(p_group_id uuid, p_feature text, p_blocked boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception '관리자만 사용할 수 있어요.'; end if;
  if p_blocked then
    insert into public.group_feature_blocks(group_id, feature) values (p_group_id, p_feature)
    on conflict do nothing;
  else
    delete from public.group_feature_blocks where group_id = p_group_id and feature = p_feature;
  end if;
end;
$$;
grant execute on function public.admin_set_group_feature(uuid, text, boolean) to authenticated;

-- ---- RPC: 관리자 — 전체 그룹 개요(그룹별 사용량 제어 목록용) -------
-- 이름/이모지/커플·우정 여부/멤버(닉네임·아바타) 를 한 번에 반환.
create or replace function public.admin_group_overview()
returns table(
  group_id uuid, name text, emoji text, emoji_bg text,
  is_couple boolean, is_friend boolean, members jsonb
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
      ), '[]'::jsonb) as members
    from public.groups g
    order by g.created_at desc;
end;
$$;
grant execute on function public.admin_group_overview() to authenticated;
