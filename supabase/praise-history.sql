-- =============================================================
--  칭찬 스티커 — 소원권 직접 수령 + 완성판 히스토리
--  변경점:
--   · 20칸을 다 채우면 소원권 쪽지를 자동 발송하지 않고, 판을 "완성(completed)" 상태로만 표시.
--   · 판 주인이 자기 탭에서 직접 소원권을 수령(claim) → 인벤토리에 소원권 지급(보낸 사람=짝꿍).
--   · 수령하면 그 판은 히스토리로 넘어가고, 새 스티커판을 다시 적용할 수 있음.
--   · praise_boards 를 owner_id 1행 → 판별 다행(히스토리) 구조로 전환.
--  적용: praise-stickers.sql, praise-stickers-color.sql 실행 후 이 파일을 Supabase SQL Editor 에 실행.
-- =============================================================

-- 1) praise_boards: id PK + 라이프사이클 컬럼 -------------------------------
alter table public.praise_boards add column if not exists id uuid default gen_random_uuid();
alter table public.praise_boards add column if not exists started_at   timestamptz;
alter table public.praise_boards add column if not exists completed_at timestamptz;
alter table public.praise_boards add column if not exists claimed_at   timestamptz;
alter table public.praise_boards add column if not exists group_id     uuid;
alter table public.praise_boards add column if not exists gifter_id    uuid;
update public.praise_boards set id = gen_random_uuid() where id is null;
update public.praise_boards set started_at = coalesce(started_at, created_at, now());

-- PK 를 owner_id → id 로 교체(판별 다행 허용)
alter table public.praise_boards drop constraint if exists praise_boards_pkey;
alter table public.praise_boards add primary key (id);
-- 미수령(claimed_at is null) 판은 소유자당 1개만
create unique index if not exists praise_boards_one_active on public.praise_boards(owner_id) where claimed_at is null;

-- 2) praise_stickers: board_id 연결 --------------------------------------
alter table public.praise_stickers add column if not exists board_id uuid;
update public.praise_stickers s set board_id = b.id
  from public.praise_boards b
  where b.owner_id = s.owner_id and b.claimed_at is null and s.board_id is null;
-- (group_id, owner_id, slot) 유일 제약 → (board_id, slot) 로 교체(히스토리에서 슬롯 재사용 가능)
alter table public.praise_stickers drop constraint if exists praise_stickers_group_id_owner_id_slot_index_key;
create unique index if not exists praise_stickers_board_slot on public.praise_stickers(board_id, slot_index);

-- 3) 아이템 사용 → 색을 골라 새 칭찬판 활성(소모). 미수령 판이 있으면 거부 --------
drop function if exists public.use_sticker_board(text, text);
create or replace function public.use_sticker_board(p_item_id text, p_color text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.user_items; v_variant text; v_color text;
begin
  v_variant := public._sticker_variant(p_item_id);
  if v_variant is null then raise exception '칭찬 스티커판 아이템이 아니에요.'; end if;
  if exists(select 1 from public.praise_boards where owner_id = auth.uid() and claimed_at is null) then
    raise exception '이미 적용 중인 스티커판이 있어요.'; end if;
  if v_variant = 'grape' then v_color := case when p_color in ('grape', 'shine') then p_color else 'grape' end;
  else                        v_color := case when p_color in ('red', 'aori')   then p_color else 'red'   end; end if;
  select * into v_item from public.user_items
    where user_id = auth.uid() and item_id = p_item_id and status = 'active'
    order by created_at asc limit 1 for update;
  if v_item.id is null then raise exception '사용할 수 있는 스티커판이 없어요.'; end if;
  update public.user_items set status = 'used', used_at = now() where id = v_item.id;
  insert into public.praise_boards(owner_id, variant, color, started_at) values (auth.uid(), v_variant, v_color, now());
end;
$$;
grant execute on function public.use_sticker_board(text, text) to authenticated;

-- 4) 조회: 각 멤버의 현재 판 + 히스토리 + 현재 판 스티커 ---------------------
create or replace function public.praise_get(p_group_id uuid)
returns jsonb language plpgsql security definer set search_path = public stable as $$
declare v_members jsonb; v_stickers jsonb;
begin
  if not public.is_couple_group(p_group_id) then raise exception '커플 그룹이 아니에요.'; end if;
  if not public.is_group_member(p_group_id, auth.uid()) then raise exception '그룹 멤버가 아니에요.'; end if;

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

-- 5) 스티커 붙이기: 현재(미완성) 판에. 20칸째면 판을 완성 처리(쪽지 발송 없음) --------
create or replace function public.praise_place(p_group_id uuid, p_owner_id uuid, p_slot int, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_board public.praise_boards; v_count int;
begin
  if not public.is_couple_group(p_group_id) then raise exception '커플 그룹이 아니에요.'; end if;
  if not public.is_group_member(p_group_id, v_uid) then raise exception '그룹 멤버가 아니에요.'; end if;
  if not public.is_group_member(p_group_id, p_owner_id) then raise exception '대상이 그룹 멤버가 아니에요.'; end if;
  if p_owner_id = v_uid then raise exception '내 칭찬판엔 붙일 수 없어요.'; end if;
  if p_slot < 0 or p_slot > 19 then raise exception '잘못된 칸이에요.'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception '칭찬 내용을 입력해 주세요.'; end if;

  select * into v_board from public.praise_boards
    where owner_id = p_owner_id and claimed_at is null
    order by started_at desc limit 1 for update;
  if v_board.id is null then raise exception '상대가 아직 스티커판을 준비하지 않았어요.'; end if;
  if v_board.completed_at is not null then raise exception '이미 완성된 스티커판이에요.'; end if;

  insert into public.praise_stickers(board_id, group_id, owner_id, slot_index, reason, from_id)
    values (v_board.id, p_group_id, p_owner_id, p_slot, left(btrim(p_reason), 100), v_uid);

  select count(*) into v_count from public.praise_stickers where board_id = v_board.id;
  if v_count >= 20 then
    update public.praise_boards
      set completed_at = now(), group_id = p_group_id, gifter_id = v_uid
      where id = v_board.id;
    -- 완성 알림(→ 푸시). 소원권은 주인이 직접 수령.
    insert into public.notifications(user_id, actor_id, type, title, body, group_id)
      values (p_owner_id, v_uid, 'gift',
              coalesce(public.notif_member_name(p_group_id, v_uid), '') || ' 님이 칭찬 스티커판을 완성했어요',
              '칭찬 스티커에서 소원권을 수령하세요 🎉', p_group_id);
  end if;
end;
$$;
grant execute on function public.praise_place(uuid, uuid, int, text) to authenticated;

-- 6) 소원권 수령: 완성된 내 판에서 → 인벤토리에 소원권(보낸 사람=짝꿍) -------------
create or replace function public.praise_claim(p_board_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_board public.praise_boards; v_from_name text; v_from_av text;
begin
  select * into v_board from public.praise_boards where id = p_board_id for update;
  if v_board.id is null then raise exception '스티커판을 찾을 수 없어요.'; end if;
  if v_board.owner_id <> auth.uid() then raise exception '본인 스티커판만 수령할 수 있어요.'; end if;
  if v_board.completed_at is null then raise exception '아직 완성되지 않았어요.'; end if;
  if v_board.claimed_at is not null then raise exception '이미 수령했어요.'; end if;

  select coalesce(display_nickname, '멤버'), avatar_url into v_from_name, v_from_av
    from public.group_members where group_id = v_board.group_id and user_id = v_board.gifter_id;

  insert into public.user_items(user_id, item_id, item_name, source, from_user_id, from_name, from_avatar, group_id, status)
    values (auth.uid(), 'wish', '소원권', 'gift', v_board.gifter_id, v_from_name, v_from_av, v_board.group_id, 'active');

  update public.praise_boards set claimed_at = now() where id = v_board.id;
end;
$$;
grant execute on function public.praise_claim(uuid) to authenticated;

-- 7) 특정(과거) 판 조회 — 커플 멤버/주인/짝꿍만 -----------------------------
create or replace function public.praise_board_get(p_board_id uuid)
returns jsonb language plpgsql security definer set search_path = public stable as $$
declare v_board public.praise_boards; v_stickers jsonb;
begin
  select * into v_board from public.praise_boards where id = p_board_id;
  if v_board.id is null then raise exception '스티커판을 찾을 수 없어요.'; end if;
  if not (v_board.owner_id = auth.uid() or v_board.gifter_id = auth.uid()
          or (v_board.group_id is not null and public.is_group_member(v_board.group_id, auth.uid()))) then
    raise exception '접근 권한이 없어요.'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'owner_id', s.owner_id, 'slot', s.slot_index, 'reason', s.reason,
    'from_id', s.from_id, 'id', s.id, 'created_at', s.created_at
  )), '[]'::jsonb) into v_stickers
  from public.praise_stickers s where s.board_id = v_board.id;

  return jsonb_build_object(
    'board_id', v_board.id, 'owner_id', v_board.owner_id, 'variant', v_board.variant, 'color', v_board.color,
    'started_at', v_board.started_at, 'completed_at', v_board.completed_at, 'stickers', v_stickers);
end;
$$;
grant execute on function public.praise_board_get(uuid) to authenticated;
