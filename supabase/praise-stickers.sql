-- =============================================================
--  칭찬 스티커 (커플 전용) — 서로에게 칭찬을 붙여주는 스티커판
--  · 판 2종: 포도 송이(grape) · 사과 나무(apple). 한 판 20칸.
--  · 각자 본인 판을 상점(프리미엄·커플, 관리자 전용 노출)에서 구매→인벤토리에서 사용(소모).
--  · 상대 판의 빈 칸에만 칭찬을 붙일 수 있고, 붙인 사람만 내용 수정 가능(삭제 불가).
--  · 20칸을 다 채우면 판 주인에게 소원권 쪽지 지급(보낸 사람=완성한 짝꿍, 내용="칭찬 스티커판 완성 🎉").
--  적용: Supabase SQL Editor 에 그대로 실행.
-- =============================================================

-- 상점 아이템(관리자 전용 노출 플래그는 avatar-decos.sql 에서 이미 추가됨)
alter table public.store_items add column if not exists admin_only boolean not null default false;
insert into public.store_items (id, name, price, emoji, description, premium, tier, admin_only, sort_order, is_active) values
  ('sticker-grape', '칭찬 포도판',   40, '🍇', E'짝꿍 판의 빈 칸에 칭찬 포도알을 붙여줘요\n20알을 다 모으면 소원권이 톡!', true, 'couple', true, 40, true),
  ('sticker-apple', '칭찬 사과나무', 40, '🍎', E'짝꿍 판의 빈 칸에 칭찬 사과를 붙여줘요\n20개를 다 모으면 소원권이 톡!', true, 'couple', true, 41, true)
on conflict (id) do update set
  name = excluded.name, price = excluded.price, emoji = excluded.emoji, description = excluded.description,
  premium = excluded.premium, tier = excluded.tier, admin_only = excluded.admin_only,
  sort_order = excluded.sort_order, is_active = excluded.is_active;

-- 칭찬판(사용자별 1개). variant = grape|apple. 아이템 사용 시 생성/변경.
create table if not exists public.praise_boards (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  variant text not null check (variant in ('grape', 'apple')),
  created_at timestamptz not null default now()
);
alter table public.praise_boards enable row level security;
-- 직접 select 는 본인 것만(상대 것은 praise_get RPC). 쓰기는 함수(정의자)만.
drop policy if exists pb_self on public.praise_boards;
create policy pb_self on public.praise_boards for select to authenticated using (owner_id = auth.uid());

-- 붙은 스티커(칸). (group_id, owner_id, slot_index) 유일. from_id = 붙여준 사람(짝꿍).
create table if not exists public.praise_stickers (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  owner_id uuid not null,
  slot_index int not null check (slot_index between 0 and 19),
  reason text not null,
  from_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, owner_id, slot_index)
);
alter table public.praise_stickers enable row level security;
-- 직접 접근 차단(정책 없음) → 조회/쓰기는 전용 RPC(정의자)로만.

-- variant 판별
create or replace function public._sticker_variant(p_item_id text)
returns text language sql immutable as $$
  select case p_item_id when 'sticker-grape' then 'grape' when 'sticker-apple' then 'apple' else null end;
$$;

-- 아이템 사용 → 내 칭찬판 활성(소모).
create or replace function public.use_sticker_board(p_item_id text)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.user_items; v_variant text;
begin
  v_variant := public._sticker_variant(p_item_id);
  if v_variant is null then raise exception '칭찬 스티커판 아이템이 아니에요.'; end if;
  select * into v_item from public.user_items
    where user_id = auth.uid() and item_id = p_item_id and status = 'active'
    order by created_at asc limit 1 for update;
  if v_item.id is null then raise exception '사용할 수 있는 스티커판이 없어요.'; end if;
  update public.user_items set status = 'used', used_at = now() where id = v_item.id;
  insert into public.praise_boards(owner_id, variant) values (auth.uid(), v_variant)
    on conflict (owner_id) do update set variant = excluded.variant, created_at = now();
end;
$$;
grant execute on function public.use_sticker_board(text) to authenticated;

-- 칭찬판 조회(커플 그룹 멤버만) — members(user_id 정렬) + variant + 붙은 스티커 전체.
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
      'variant', pb.variant
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

-- 스티커 붙이기(상대 판의 빈 칸에만). 20칸째면 소원권 쪽지 지급.
create or replace function public.praise_place(p_group_id uuid, p_owner_id uuid, p_slot int, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_count int; v_from text; v_to text; v_note uuid;
begin
  if not public.is_couple_group(p_group_id) then raise exception '커플 그룹이 아니에요.'; end if;
  if not public.is_group_member(p_group_id, v_uid) then raise exception '그룹 멤버가 아니에요.'; end if;
  if not public.is_group_member(p_group_id, p_owner_id) then raise exception '대상이 그룹 멤버가 아니에요.'; end if;
  if p_owner_id = v_uid then raise exception '내 칭찬판엔 붙일 수 없어요.'; end if;
  if not exists(select 1 from public.praise_boards where owner_id = p_owner_id) then
    raise exception '상대가 아직 스티커판을 준비하지 않았어요.'; end if;
  if p_slot < 0 or p_slot > 19 then raise exception '잘못된 칸이에요.'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception '칭찬 내용을 입력해 주세요.'; end if;

  insert into public.praise_stickers(group_id, owner_id, slot_index, reason, from_id)
    values (p_group_id, p_owner_id, p_slot, left(btrim(p_reason), 100), v_uid);

  select count(*) into v_count from public.praise_stickers where group_id = p_group_id and owner_id = p_owner_id;
  if v_count >= 20 then
    v_from := coalesce(public.notif_member_name(p_group_id, v_uid), '');
    v_to   := coalesce(public.notif_member_name(p_group_id, p_owner_id), '');
    insert into public.notes(group_id, sender_id, recipient_id, sender_name, recipient_name, sender_avatar, recipient_avatar, body, kind, item_id, item_name, qty, claimed, rejected, anonymous)
      values (p_group_id, v_uid, p_owner_id, v_from, v_to,
        (select avatar_url from public.group_members where group_id = p_group_id and user_id = v_uid),
        (select avatar_url from public.group_members where group_id = p_group_id and user_id = p_owner_id),
        '칭찬 스티커판 완성 🎉', 'gift', 'wish', '소원권', 1, false, false, false)
      returning id into v_note;
    insert into public.notifications(user_id, actor_id, type, title, body, group_id, note_id)
      values (p_owner_id, v_uid, 'gift', v_from || ' 님이 칭찬 스티커판을 완성했어요', '소원권 · 쪽지함에서 수령하세요 🎉', p_group_id, v_note);
  end if;
end;
$$;
grant execute on function public.praise_place(uuid, uuid, int, text) to authenticated;

-- 스티커 내용 수정(붙인 사람만, 삭제 불가)
create or replace function public.praise_edit(p_sticker_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare s public.praise_stickers;
begin
  select * into s from public.praise_stickers where id = p_sticker_id for update;
  if s.id is null then raise exception '스티커를 찾을 수 없어요.'; end if;
  if s.from_id <> auth.uid() then raise exception '내가 붙인 스티커만 수정할 수 있어요.'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception '칭찬 내용을 입력해 주세요.'; end if;
  update public.praise_stickers set reason = left(btrim(p_reason), 100), updated_at = now() where id = s.id;
end;
$$;
grant execute on function public.praise_edit(uuid, text) to authenticated;
