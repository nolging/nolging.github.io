-- =============================================================
--  칭찬 스티커 통합 스키마 (커플 전용)
--  이 파일은 예전에 schema-minigames.sql 에 함께 담겨 있던 칭찬 스티커 관련 SQL을
--  분리한 것입니다. 칭찬 스티커는 미니게임(타로/퍼즐)이 아니라서 별도 파일로 뺐습니다.
--  원래(더 예전) 개별 파일 이력:
--    - praise-stickers.sql      (기본 판/스티커 + RPC)
--    - praise-stickers-color.sql(판 색상 선택 추가)
--    - praise-history.sql       (소원권 직접 수령 + 완성판 히스토리)
--    - praise-admin-view.sql    (앱 관리자 열람 허용)
--  각 함수/테이블은 여러 파일에 걸쳐 반복 수정된 이력이 있으며, 이 파일에는 항상
--  "최종(가장 나중) 버전"만 담았습니다.
--
--  ⚠️ praise_place() 는 이 파일이 아니라 schema-notifications.sql 에 있습니다.
--  (notif_render 기반으로 다시 쓰였고 스티커 한 칸 붙일 때마다도 알림('praise_new')이
--  가니, notif 관련 묶음과 함께 두는 게 자연스러워서 그쪽이 canonical 버전 — praise/
--  praise_new notif_templates 시드 행도 schema-notifications.sql 에 있음.)
--
--  ⚠️ 이미 운영 중인(live) 프로덕션 DB에는 이 SQL이 (예전엔 schema-minigames.sql
--     경유로) 이미 적용되어 있으므로, 이 파일을 프로덕션에 다시 실행할 필요는 없습니다.
--  이 파일은 문서화 목적 및 재해복구/새 환경(fresh) 셋업용입니다.
--  실행 순서: supabase/schema.sql → supabase/schema-v2.sql → (다른 도메인 번들들,
--  schema-notifications.sql 포함 — praise_place() 가 거기 있으므로 먼저 적용) → 이 파일.
--  (praise_boards 관련 함수는 public.groups / public.group_members / public.notifications /
--   public.user_items / public.notes 등 base 스키마의 테이블을 참조하므로 반드시 schema.sql
--   계열이 먼저 적용돼 있어야 합니다.)
-- =============================================================


-- =============================================================
--  1. 테이블 (CREATE + 이후 ALTER 누적, 시간 순)
-- =============================================================

-- 판 2종: 포도 송이(grape) · 사과 나무(apple). 한 판 20칸.
-- 각자 본인 판을 상점(프리미엄·커플, 관리자 전용 노출)에서 구매→인벤토리에서 사용(소모).
-- 상대 판의 빈 칸에만 칭찬을 붙일 수 있고, 붙인 사람만 내용 수정 가능(삭제 불가).
-- 상점 아이템 관리자 전용 노출 플래그(다른 도메인에서도 추가될 수 있어 if not exists)
alter table public.store_items add column if not exists admin_only boolean not null default false;

-- 칭찬판. variant = grape|apple. 아이템 사용 시 생성/변경.
create table if not exists public.praise_boards (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  variant text not null check (variant in ('grape', 'apple')),
  created_at timestamptz not null default now()
);

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

-- 판 색(스티커 디자인) 컬럼 추가.
-- 포도판: 포도(grape) / 샤인머스캣(shine)  ·  사과나무: 빨간 사과(red) / 아오리 사과(aori)
alter table public.praise_boards add column if not exists color text;
-- 기존(색 없이 활성화된) 판은 기본색으로 백필
update public.praise_boards set color = case when variant = 'grape' then 'grape' else 'red' end where color is null;

-- 소원권 직접 수령 + 완성판 히스토리를 위한 라이프사이클 컬럼.
-- praise_boards 를 owner_id 1행 → 판별 다행(히스토리) 구조로 전환.
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

-- praise_stickers: board_id 연결(어느 판에 붙은 스티커인지)
alter table public.praise_stickers add column if not exists board_id uuid;
update public.praise_stickers s set board_id = b.id
  from public.praise_boards b
  where b.owner_id = s.owner_id and b.claimed_at is null and s.board_id is null;
-- (group_id, owner_id, slot) 유일 제약 → (board_id, slot) 로 교체(히스토리에서 슬롯 재사용 가능)
alter table public.praise_stickers drop constraint if exists praise_stickers_group_id_owner_id_slot_index_key;
create unique index if not exists praise_stickers_board_slot on public.praise_stickers(board_id, slot_index);

-- ── 알림 딥링크용 컬럼(어느 스티커가 이 알림을 유발했는지) — 스티커판에 도착하면 그 한 칸에
-- 후광 효과를 주기 위함. 스티커는 삭제되지 않지만(수정만 가능) 혹시 몰라 set null.
alter table public.notifications add column if not exists praise_sticker_id uuid
  references public.praise_stickers(id) on delete set null;


-- =============================================================
--  2. RLS 활성화 + 정책
-- =============================================================

alter table public.praise_boards enable row level security;
-- 직접 select 는 본인 것만(상대 것은 praise_get RPC). 쓰기는 함수(정의자)만.
drop policy if exists pb_self on public.praise_boards;
create policy pb_self on public.praise_boards for select to authenticated using (owner_id = auth.uid());

alter table public.praise_stickers enable row level security;
-- 직접 접근 차단(정책 없음) → 조회/쓰기는 전용 RPC(정의자)로만.


-- =============================================================
--  3. 함수 (헬퍼 → 의존 함수 순)
-- =============================================================

-- item_id → variant 판별
create or replace function public._sticker_variant(p_item_id text)
returns text language sql immutable as $$
  select case p_item_id when 'sticker-grape' then 'grape' when 'sticker-apple' then 'apple' else null end;
$$;

-- 아이템 사용 → 색을 골라 새 칭찬판 활성(소모). 미수령 판이 있으면 거부.(최종본: praise-history.sql)
drop function if exists public.use_sticker_board(text);
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

-- 칭찬판 조회(커플 그룹 멤버 또는 앱 관리자) — 각 멤버의 현재 판 + 히스토리 + 현재 판 스티커.
-- (최종본: praise-admin-view.sql. praise_get 은 praise-stickers.sql → praise-stickers-color.sql →
--  praise-history.sql → praise-admin-view.sql 순으로 재정의되어 왔고, 마지막 버전만 남김)
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

-- 소원권 수령: 완성된 내 판에서 → 인벤토리에 소원권 지급(보낸 사람=짝꿍). 수령하면 히스토리로 이동.
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

-- 특정(과거) 판 조회 — 커플 멤버/주인/짝꿍만
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


-- =============================================================
--  4. 시드 데이터
-- =============================================================

-- 칭찬 스티커 상점 아이템(프리미엄·커플, 관리자 전용 노출)
insert into public.store_items (id, name, price, emoji, description, premium, tier, admin_only, sort_order, is_active) values
  ('sticker-grape', '칭찬 포도판',   40, '🍇', E'짝꿍 판의 빈 칸에 칭찬 포도알을 붙여줘요\n20알을 다 모으면 소원권이 톡!', true, 'couple', true, 40, true),
  ('sticker-apple', '칭찬 사과나무', 40, '🍎', E'짝꿍 판의 빈 칸에 칭찬 사과를 붙여줘요\n20개를 다 모으면 소원권이 톡!', true, 'couple', true, 41, true)
on conflict (id) do update set
  name = excluded.name, price = excluded.price, emoji = excluded.emoji, description = excluded.description,
  premium = excluded.premium, tier = excluded.tier, admin_only = excluded.admin_only,
  sort_order = excluded.sort_order, is_active = excluded.is_active;


-- =============================================================
--  5. 권한(GRANT)
-- =============================================================

grant execute on function public.use_sticker_board(text, text) to authenticated;
grant execute on function public.praise_get(uuid) to authenticated;
grant execute on function public.praise_edit(uuid, text) to authenticated;
grant execute on function public.praise_claim(uuid) to authenticated;
grant execute on function public.praise_board_get(uuid) to authenticated;
-- praise_place() 의 grant 는 schema-notifications.sql 에 있음(함수 정의도 그쪽에 있어서).
