-- =============================================================
--  칭찬 스티커 — 판 색(스티커 디자인) 선택 추가
--  · 포도판: 포도(grape) / 샤인머스캣(shine)  ·  사과나무: 빨간 사과(red) / 아오리 사과(aori)
--  · 사용 시 색을 고르고 적용. 이미 적용된 판이 있으면 새 판 적용 불가.
--  적용: praise-stickers.sql 실행 후 이 파일을 Supabase SQL Editor 에 실행.
-- =============================================================

alter table public.praise_boards add column if not exists color text;
-- 기존(색 없이 활성화된) 판은 기본색으로 백필
update public.praise_boards set color = case when variant = 'grape' then 'grape' else 'red' end where color is null;

-- 아이템 사용 → 색을 골라 내 칭찬판 활성(소모). 이미 판이 있으면 거부.
drop function if exists public.use_sticker_board(text);
create or replace function public.use_sticker_board(p_item_id text, p_color text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.user_items; v_variant text; v_color text;
begin
  v_variant := public._sticker_variant(p_item_id);
  if v_variant is null then raise exception '칭찬 스티커판 아이템이 아니에요.'; end if;
  if exists(select 1 from public.praise_boards where owner_id = auth.uid()) then
    raise exception '이미 적용 중인 스티커판이 있어요.'; end if;
  -- 색 검증(변형에 맞지 않으면 기본색)
  if v_variant = 'grape' then v_color := case when p_color in ('grape', 'shine') then p_color else 'grape' end;
  else                        v_color := case when p_color in ('red', 'aori')   then p_color else 'red'   end; end if;
  select * into v_item from public.user_items
    where user_id = auth.uid() and item_id = p_item_id and status = 'active'
    order by created_at asc limit 1 for update;
  if v_item.id is null then raise exception '사용할 수 있는 스티커판이 없어요.'; end if;
  update public.user_items set status = 'used', used_at = now() where id = v_item.id;
  insert into public.praise_boards(owner_id, variant, color) values (auth.uid(), v_variant, v_color);
end;
$$;
grant execute on function public.use_sticker_board(text, text) to authenticated;

-- 조회에 color 포함
create or replace function public.praise_get(p_group_id uuid)
returns jsonb language plpgsql security definer set search_path = public stable as $$
declare v_members jsonb; v_stickers jsonb;
begin
  if not public.is_couple_group(p_group_id) then raise exception '커플 그룹이 아니에요.'; end if;
  if not public.is_group_member(p_group_id, auth.uid()) then raise exception '그룹 멤버가 아니에요.'; end if;

  select jsonb_agg(m order by m->>'user_id') into v_members from (
    select jsonb_build_object(
      'user_id', gm.user_id, 'name', coalesce(gm.display_nickname, '멤버'),
      'variant', pb.variant, 'color', pb.color
    ) as m
    from public.group_members gm
    left join public.praise_boards pb on pb.owner_id = gm.user_id
    where gm.group_id = p_group_id
  ) t;

  select coalesce(jsonb_agg(jsonb_build_object(
    'owner_id', s.owner_id, 'slot', s.slot_index, 'reason', s.reason,
    'from_id', s.from_id, 'id', s.id, 'created_at', s.created_at
  )), '[]'::jsonb) into v_stickers
  from public.praise_stickers s where s.group_id = p_group_id;

  return jsonb_build_object('viewer', auth.uid(), 'members', coalesce(v_members, '[]'::jsonb), 'stickers', v_stickers);
end;
$$;
grant execute on function public.praise_get(uuid) to authenticated;
