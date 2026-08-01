-- 칭찬 스티커: 앱 관리자는 미가입 커플 그룹도 열람 가능(읽기 전용)
--  · praise_get 의 '그룹 멤버' 검사에 앱 관리자 허용 추가(group_member_cards 등과 동일).
--  · 스티커 붙이기(praise_place)/수정 등 쓰기 작업은 여전히 멤버만 → 관리자는 조회만.
--  본문은 praise-history.sql 의 praise_get(판+히스토리+색상 포함)과 동일하고 멤버 검사만 완화.
--  적용: Supabase SQL Editor 에 그대로 실행. (praise-history.sql 이후)

create or replace function public.praise_get(p_group_id uuid)
returns jsonb language plpgsql security definer set search_path = public stable as $$
declare v_members jsonb; v_stickers jsonb;
begin
  if not public.is_couple_group(p_group_id) then raise exception '커플 그룹이 아니에요.'; end if;
  -- 멤버 또는 앱 관리자(미가입 그룹 열람 허용)
  if not (public.is_group_member(p_group_id, auth.uid()) or public.is_admin(auth.uid())) then
    raise exception '그룹 멤버가 아니에요.'; end if;

  select jsonb_agg(m order by m->>'user_id') into v_members from (
    select jsonb_build_object(
      'user_id', gm.user_id,
      'name', coalesce(gm.display_nickname, '멤버'),
      'board', (
        select jsonb_build_object('board_id', b.id, 'variant', b.variant, 'color', b.color,
                                  'started_at', b.started_at, 'completed_at', b.completed_at, 'claimed_at', b.claimed_at)
        from public.praise_boards b
        where b.owner_id = gm.user_id and b.claimed_at is null
        order by b.started_at desc limit 1
      ),
      'history', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'board_id', b.id, 'variant', b.variant, 'color', b.color,
          'started_at', b.started_at, 'completed_at', b.completed_at) order by b.completed_at desc), '[]'::jsonb)
        from public.praise_boards b
        where b.owner_id = gm.user_id and b.claimed_at is not null
      )
    ) as m
    from public.group_members gm
    where gm.group_id = p_group_id
  ) t;

  select coalesce(jsonb_agg(jsonb_build_object(
    'owner_id', s.owner_id, 'slot', s.slot_index, 'reason', s.reason,
    'from_id', s.from_id, 'id', s.id, 'created_at', s.created_at
  )), '[]'::jsonb) into v_stickers
  from public.praise_stickers s
  join public.praise_boards b on b.id = s.board_id and b.claimed_at is null
  where s.group_id = p_group_id;

  return jsonb_build_object('viewer', auth.uid(), 'members', coalesce(v_members, '[]'::jsonb), 'stickers', v_stickers);
end;
$$;
grant execute on function public.praise_get(uuid) to authenticated;
