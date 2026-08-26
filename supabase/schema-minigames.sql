-- =============================================================
--  미니게임 통합 스키마 (lotto / tarot / puzzle / praise stickers)
--  이 파일은 예전에 아래 8개의 개별 파일로 나뉘어 있던 SQL 을 하나로 합친 것입니다.
--    - lotto.sql                (냥피또 로또: 회차 + 응모)
--    - tarot-cards.sql          (타로 카페: 카드 22장 데이터 + RLS)
--    - puzzle-elapsed.sql       (퍼즐: 누적 진행 시간 컬럼)
--    - puzzle-storage.sql       (퍼즐: 이미지 스토리지 정책)
--    - praise-stickers.sql      (칭찬 스티커: 기본 판/스티커 + RPC)
--    - praise-stickers-color.sql(칭찬 스티커: 판 색상 선택 추가)
--    - praise-history.sql       (칭찬 스티커: 소원권 직접 수령 + 완성판 히스토리)
--    - praise-admin-view.sql    (칭찬 스티커: 앱 관리자 열람 허용)
--  각 함수/테이블은 여러 파일에 걸쳐 반복 수정된 이력이 있으며, 이 파일에는 항상
--  "최종(가장 나중) 버전"만 담았습니다. 저장소 정리 작업의 일환으로 생성되었습니다.
--
--  ⚠️ 이미 운영 중인(live) 프로덕션 DB에는 원본 8개 파일이 각각 순서대로 이미 적용되어
--     있으므로, 이 파일을 프로덕션에 다시 실행할 필요는 없습니다.
--  이 파일은 문서화 목적 및 재해복구/새 환경(fresh) 셋업용입니다.
--  실행 순서: supabase/schema.sql → supabase/schema-v2.sql → (다른 도메인 번들들) → 이 파일.
--  (lotto_entries 는 public.user_items, praise_boards 관련 함수는 public.groups /
--   public.group_members / public.notifications / public.user_items / public.notes 등
--   base 스키마의 테이블을 참조하므로 반드시 schema.sql 계열이 먼저 적용돼 있어야 합니다.)
-- =============================================================


-- =============================================================
--  1. 테이블 (CREATE + 이후 ALTER 누적, 시간 순)
-- =============================================================

-- ---------- 로또(냥피또): 회차(round) + 응모 용지(entry) ----------
-- 로또 상점 아이템(store_items.id='lotto')은 관리자가 이미 등록해 둔 상태라는 전제.
create table if not exists public.lotto_rounds (
  id              bigserial primary key,
  round_no        integer not null unique,
  winning_numbers int[],                 -- 당첨 번호(추후 발표 기능에서 채움) — null = 아직 미발표
  drawn_at        timestamptz,
  created_at      timestamptz not null default now()
);

-- round_no 를 응모 행에도 그대로 저장(비정규화) — 클라이언트가 "이번 회차 제출 번호" 조회 시
-- lotto_rounds 와 조인할 필요 없이 바로 필터링할 수 있게.
create table if not exists public.lotto_entries (
  id           uuid primary key default gen_random_uuid(),
  round_id     bigint not null references public.lotto_rounds(id) on delete cascade,
  round_no     integer not null,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  numbers      int[] not null,
  user_item_id uuid references public.user_items(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_lotto_entries_user_round on public.lotto_entries(user_id, round_no, created_at);

-- ---------- 타로 카페: 카드 데이터 ----------
-- image_url: 나중에 카드 그림을 이미지 파일로 올려서 쓰기 위한 칸(지금은 null → 이모지 폴백).
-- sort_order: 덱 인덱스(0~21). 양쪽 기기가 같은 순서로 불러와야 궁합 인덱스가 맞다.
create table if not exists public.tarot_cards (
  id          text primary key,                 -- 'major-0' ... 'major-21' (안정적 키)
  sort_order  int  not null,                     -- 덱 인덱스(0~21)
  rank        text not null,                     -- '0','I',... (카드 번호 표기)
  name        text not null,                     -- 한국어 이름
  name_en     text,
  emoji       text,                              -- 그림(이모지) — 이미지 없을 때 폴백
  image_url   text,                              -- 카드 그림 이미지 URL(선택, 나중에 업로드)
  element     text not null check (element in ('fire', 'earth', 'air', 'water')),
  love        int  not null check (love between 0 and 10),
  meaning_up  text not null,                     -- 정방향 해설
  meaning_rev text not null,                     -- 역방향 해설
  is_active   boolean not null default true,
  updated_at  timestamptz not null default now()
);
create index if not exists idx_tarot_cards_order on public.tarot_cards(sort_order);

-- ---------- 퍼즐: 누적 진행 시간 컬럼 ----------
-- elapsed_ms: 퍼즐판에 사람이 있는 동안만 누적되는 진행 시간(ms).
-- 접속자 중 대표 1명이 주기적으로 갱신하고, 모두 나가면 갱신이 멈춰 시간도 멈춘다.
-- (재입장하면 저장된 값부터 이어서 흐름)
-- positions 의 각 조각에는 m:1(누가 옮긴 조각) 플래그가 추가로 들어간다 → 정렬 시
-- 건드린 조각은 그대로 두고, 안 건드린 조각만 빈 공간에 정리하기 위함. (스키마 변경 없음)
alter table public.group_puzzles add column if not exists elapsed_ms bigint not null default 0;
comment on column public.group_puzzles.elapsed_ms is
  '퍼즐판에 사람이 있는 동안만 누적되는 진행 시간(ms). 모두 나가면 멈춤.';

-- ---------- 칭찬 스티커(커플 전용) ----------
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


-- =============================================================
--  2. RLS 활성화 + 정책
-- =============================================================

alter table public.lotto_rounds enable row level security;
drop policy if exists lotto_rounds_select on public.lotto_rounds;
create policy lotto_rounds_select on public.lotto_rounds
  for select to authenticated using (true);

alter table public.lotto_entries enable row level security;
drop policy if exists lotto_entries_select on public.lotto_entries;
create policy lotto_entries_select on public.lotto_entries
  for select to authenticated using (user_id = auth.uid());
-- 직접 INSERT 불가(RLS): 응모는 submit_lotto_entry RPC(정의자)만 기록

alter table public.tarot_cards enable row level security;
-- 조회: 로그인 사용자 누구나
drop policy if exists tarot_cards_select on public.tarot_cards;
create policy tarot_cards_select on public.tarot_cards for select to authenticated using (true);
-- 쓰기(추가/수정/삭제): 관리자만
drop policy if exists tarot_cards_admin on public.tarot_cards;
create policy tarot_cards_admin on public.tarot_cards for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

alter table public.praise_boards enable row level security;
-- 직접 select 는 본인 것만(상대 것은 praise_get RPC). 쓰기는 함수(정의자)만.
drop policy if exists pb_self on public.praise_boards;
create policy pb_self on public.praise_boards for select to authenticated using (owner_id = auth.uid());

alter table public.praise_stickers enable row level security;
-- 직접 접근 차단(정책 없음) → 조회/쓰기는 전용 RPC(정의자)로만.

-- ---------- 퍼즐 이미지 스토리지 정책(avatars 버킷) ----------
-- 퍼즐은 그룹 단위 → 같은 그룹 멤버는 누가 초기화하든 이미지를 삭제할 수 있어야 함.
-- 그래서 퍼즐 이미지는 puzzles/{groupId}/{timestamp}.jpg 경로에 저장하고,
-- 그 폴더에 대해 "그룹 멤버 쓰기/삭제"를 허용한다.
-- 기존 아바타 정책(본인 폴더)은 그대로 두고 아래 정책을 추가(정책은 OR 로 합쳐짐).
-- group_id 비교는 uuid 캐스팅 오류 방지를 위해 text 로 비교(아바타 경로에서도 안전).

-- 업로드: 그룹 멤버는 puzzles/{groupId}/ 아래에 넣을 수 있음
drop policy if exists "puzzle images: group members write" on storage.objects;
create policy "puzzle images: group members write"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = 'puzzles'
  and exists (
    select 1 from public.group_members gm
    where gm.group_id::text = (storage.foldername(name))[2]
      and gm.user_id = auth.uid()
  )
);

-- 삭제: 그룹 멤버는 puzzles/{groupId}/ 아래 파일을 지울 수 있음(누가 초기화하든 정리)
drop policy if exists "puzzle images: group members delete" on storage.objects;
create policy "puzzle images: group members delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = 'puzzles'
  and exists (
    select 1 from public.group_members gm
    where gm.group_id::text = (storage.foldername(name))[2]
      and gm.user_id = auth.uid()
  )
);


-- =============================================================
--  3. 함수 (헬퍼 → 의존 함수 순)
-- =============================================================

-- updated_at 자동 갱신(타로 카드)
create or replace function public.tarot_cards_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- 로또 응모: 보유한 로또 아이템 1개를 잠그고 소모한 뒤, 아직 당첨 번호가 발표되지 않은 가장
-- 빠른 회차(없으면 새로 생성)에 번호를 기록한다. 여러 사용자가 동시에 새 회차를 만들지
-- 않도록 advisory lock 으로 "회차 찾기/만들기" 구간만 직렬화한다.
create or replace function public.submit_lotto_entry(p_numbers int[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_item public.user_items;
  v_round_id bigint;
  v_round_no integer;
  v_nums int[];
  v_n int;
begin
  if p_numbers is null or array_length(p_numbers, 1) is distinct from 6 then
    raise exception '번호를 6개 선택해 주세요.';
  end if;
  select array_agg(distinct x order by x) into v_nums from unnest(p_numbers) as x;
  if array_length(v_nums, 1) is distinct from 6 then
    raise exception '중복되지 않는 번호 6개를 선택해 주세요.';
  end if;
  foreach v_n in array v_nums loop
    if v_n < 1 or v_n > 30 then
      raise exception '번호는 1~30 사이여야 해요.';
    end if;
  end loop;

  select * into v_item from public.user_items
    where user_id = auth.uid() and item_id = 'lotto' and status = 'active'
    order by created_at asc limit 1 for update;
  if v_item.id is null then
    raise exception '사용할 수 있는 로또가 없어요.';
  end if;
  update public.user_items set status = 'used', used_at = now() where id = v_item.id;

  perform pg_advisory_xact_lock(872634981);
  select id, round_no into v_round_id, v_round_no
    from public.lotto_rounds
    where winning_numbers is null
    order by round_no asc limit 1;
  if v_round_id is null then
    select coalesce(max(round_no), 0) + 1 into v_round_no from public.lotto_rounds;
    insert into public.lotto_rounds(round_no) values (v_round_no) returning id into v_round_id;
  end if;

  insert into public.lotto_entries(round_id, round_no, user_id, numbers, user_item_id)
    values (v_round_id, v_round_no, auth.uid(), v_nums, v_item.id);

  return jsonb_build_object(
    'roundNo', v_round_no,
    'remaining', (select count(*) from public.user_items where user_id = auth.uid() and item_id = 'lotto' and status = 'active')
  );
end;
$$;

-- 칭찬 스티커: item_id → variant 판별
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

-- 스티커 붙이기: 현재(미완성) 판에. 20칸째면 판을 완성 처리(쪽지 자동 발송 없음, 알림만).
-- (최종본: praise-history.sql — 최초 버전은 20칸 완성 시 소원권 쪽지를 바로 발송했으나,
--  이후 "판 주인이 직접 수령" 방식으로 바뀌면서 praise_claim 함수가 대신 담당)
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
--  4. 트리거
-- =============================================================

drop trigger if exists trg_tarot_cards_touch on public.tarot_cards;
create trigger trg_tarot_cards_touch before update on public.tarot_cards
  for each row execute function public.tarot_cards_touch();


-- =============================================================
--  5. 시드 데이터
-- =============================================================

-- 칭찬 스티커 상점 아이템(프리미엄·커플, 관리자 전용 노출)
insert into public.store_items (id, name, price, emoji, description, premium, tier, admin_only, sort_order, is_active) values
  ('sticker-grape', '칭찬 포도판',   40, '🍇', E'짝꿍 판의 빈 칸에 칭찬 포도알을 붙여줘요\n20알을 다 모으면 소원권이 톡!', true, 'couple', true, 40, true),
  ('sticker-apple', '칭찬 사과나무', 40, '🍎', E'짝꿍 판의 빈 칸에 칭찬 사과를 붙여줘요\n20개를 다 모으면 소원권이 톡!', true, 'couple', true, 41, true)
on conflict (id) do update set
  name = excluded.name, price = excluded.price, emoji = excluded.emoji, description = excluded.description,
  premium = excluded.premium, tier = excluded.tier, admin_only = excluded.admin_only,
  sort_order = excluded.sort_order, is_active = excluded.is_active;

-- 타로 카드 22장. 재실행 시 이름/해설/원소/점수는 갱신하되, 관리자가 올린 image_url 은 보존.
insert into public.tarot_cards
  (id, sort_order, rank, name, name_en, emoji, image_url, element, love, meaning_up, meaning_rev, is_active)
values
  ('major-0', 0, '0', '바보', 'The Fool', '🃏', null, 'air', 6, '겁내지 않고 첫걸음을 떼는 날. 재고 따지기보다 마음이 가는 대로 움직여도 좋아요.', '설레는 마음이 앞서 준비가 덜 됐어요. 한 박자만 늦춰도 훨씬 편해집니다.', true),
  ('major-1', 1, 'I', '마법사', 'The Magician', '✨', null, 'air', 7, '마음먹은 걸 이룰 재료가 이미 손에 있어요. 먼저 말을 꺼내는 쪽이 흐름을 잡습니다.', '말과 마음이 조금 어긋나요. 꾸미지 않은 한 문장이 제일 잘 통합니다.', true),
  ('major-2', 2, 'II', '여사제', 'The High Priestess', '🌙', null, 'water', 5, '말보다 눈치로 아는 날. 조용히 곁에 있어 주는 것만으로 충분해요.', '혼자 삼키고 있는 말이 있죠. 감춘 만큼 오해도 같이 자랍니다.', true),
  ('major-3', 3, 'III', '여황제', 'The Empress', '🌷', null, 'earth', 9, '넉넉하게 품어 주는 시기. 챙겨 주는 마음이 그대로 되돌아옵니다.', '아끼는 마음이 지나쳐 참견이 될 수 있어요. 조금은 내버려 두세요.', true),
  ('major-4', 4, 'IV', '황제', 'The Emperor', '👑', null, 'fire', 6, '기준을 세우면 편해지는 날. 약속을 정해 두면 다툴 일이 줄어요.', '내 방식만 옳다고 밀어붙이는 중. 한 발 물러서면 상대가 다가옵니다.', true),
  ('major-5', 5, 'V', '교황', 'The Hierophant', '🕊️', null, 'earth', 7, '둘만의 규칙이 단단해지는 시기. 오래 가는 관계는 이런 데서 만들어져요.', '늘 하던 대로가 답답해졌어요. 익숙한 코스를 한 번 벗어나 보세요.', true),
  ('major-6', 6, 'VI', '연인', 'The Lovers', '💞', null, 'air', 10, '서로를 고르는 날. 망설이던 마음에 확신이 서고, 함께 있는 게 답이 됩니다.', '둘 중 하나는 결정을 미루고 있어요. 미룬 만큼 마음이 식습니다.', true),
  ('major-7', 7, 'VII', '전차', 'The Chariot', '🏇', null, 'water', 6, '같은 방향으로 힘껏 나아가는 날. 미뤄 둔 계획을 오늘 밀어붙여도 좋아요.', '각자 다른 데를 보고 달리는 중. 속도를 맞추는 게 먼저입니다.', true),
  ('major-8', 8, 'VIII', '힘', 'Strength', '🦁', null, 'fire', 8, '부드럽게 이기는 날. 큰 소리 대신 다정함이 상대를 움직입니다.', '참다 참다 터질 것 같아요. 작게 자주 말하는 편이 낫습니다.', true),
  ('major-9', 9, 'IX', '은둔자', 'The Hermit', '🕯️', null, 'earth', 3, '혼자 정리할 시간이 필요해요. 거리를 두는 게 멀어지는 건 아닙니다.', '너무 오래 혼자 있었어요. 먼저 연락하는 쪽이 훨씬 가벼워집니다.', true),
  ('major-10', 10, 'X', '운명의 수레바퀴', 'Wheel of Fortune', '🎡', null, 'fire', 7, '흐름이 바뀌는 날. 뜻밖의 연락이나 우연이 관계를 한 칸 옮겨 놓습니다.', '같은 자리를 도는 느낌. 반복되는 패턴 하나만 바꿔 보세요.', true),
  ('major-11', 11, 'XI', '정의', 'Justice', '⚖️', null, 'air', 6, '공평하게 나누면 풀리는 날. 미뤄 둔 이야기를 담담하게 꺼내 보세요.', '한쪽만 애쓰고 있어요. 기울어진 걸 알아채는 게 시작입니다.', true),
  ('major-12', 12, 'XII', '매달린 사람', 'The Hanged Man', '🙃', null, 'water', 4, '멈춰서 다르게 보는 날. 서둘러 답을 내지 않아도 괜찮아요.', '괜한 고집으로 시간을 쓰고 있어요. 놓아 주면 바로 편해집니다.', true),
  ('major-13', 13, 'XIII', '죽음', 'Death', '🦋', null, 'water', 4, '끝나는 게 아니라 바뀌는 거예요. 낡은 방식 하나를 오늘 정리해 보세요.', '끝난 걸 붙잡고 있어요. 미련은 미련일 뿐, 새 계절이 기다립니다.', true),
  ('major-14', 14, 'XIV', '절제', 'Temperance', '🍶', null, 'fire', 8, '적당한 온도가 오래 갑니다. 서로의 속도를 섞어 딱 좋은 지점을 찾는 날.', '한쪽으로 쏠렸어요. 너무 뜨겁거나 너무 미지근합니다.', true),
  ('major-15', 15, 'XV', '악마', 'The Devil', '😈', null, 'earth', 4, '끊기 어려운 끌림. 달콤하지만 어디까지인지 선은 정해 두세요.', '묶여 있던 데서 벗어나는 중. 놓는 순간 숨이 트입니다.', true),
  ('major-16', 16, 'XVI', '탑', 'The Tower', '🗼', null, 'fire', 2, '갑작스러운 흔들림. 무너지는 건 대체로 무너져야 했던 것들입니다.', '터질 뻔한 걸 겨우 넘겼어요. 미룬 문제는 아직 그대로 있습니다.', true),
  ('major-17', 17, 'XVII', '별', 'The Star', '⭐', null, 'air', 9, '조용히 희망이 차오르는 날. 바라던 말이 오늘 들려올 수 있어요.', '기대가 커서 실망도 커졌어요. 눈높이를 조금 낮추면 다시 반짝입니다.', true),
  ('major-18', 18, 'XVIII', '달', 'The Moon', '🌕', null, 'water', 4, '안개 속을 걷는 날. 확실하지 않은 건 확실해질 때까지 판단을 아껴요.', '오해가 걷히는 중. 물어보면 별일 아니었다는 걸 알게 됩니다.', true),
  ('major-19', 19, 'XIX', '태양', 'The Sun', '☀️', null, 'fire', 10, '숨길 것 없이 환한 날. 웃는 얼굴 하나로 다 해결되는 시기입니다.', '억지로 밝은 척하고 있어요. 안 괜찮으면 안 괜찮다고 해도 됩니다.', true),
  ('major-20', 20, 'XX', '심판', 'Judgement', '📯', null, 'fire', 6, '결론을 낼 때가 됐어요. 지나온 걸 돌아보면 답이 이미 나와 있습니다.', '스스로를 너무 몰아세우고 있어요. 판결은 조금 미뤄도 괜찮습니다.', true),
  ('major-21', 21, 'XXI', '세계', 'The World', '🌍', null, 'earth', 9, '한 바퀴를 잘 돌았어요. 함께한 시간이 제자리를 찾는 날입니다.', '마지막 한 걸음이 남았어요. 거의 다 왔으니 마무리만 하면 됩니다.', true)
on conflict (id) do update set
  sort_order = excluded.sort_order, rank = excluded.rank, name = excluded.name, name_en = excluded.name_en,
  emoji = excluded.emoji, element = excluded.element, love = excluded.love,
  meaning_up = excluded.meaning_up, meaning_rev = excluded.meaning_rev, is_active = excluded.is_active;
  -- image_url 은 의도적으로 덮어쓰지 않음(관리자가 올린 그림 유지)

-- 확인용(선택 실행)
-- select sort_order, rank, name, element, love, (image_url is not null) as has_image
--   from public.tarot_cards order by sort_order;


-- =============================================================
--  6. 권한(GRANT)
-- =============================================================

grant execute on function public.submit_lotto_entry(int[]) to authenticated;
grant execute on function public.use_sticker_board(text, text) to authenticated;
grant execute on function public.praise_get(uuid) to authenticated;
grant execute on function public.praise_place(uuid, uuid, int, text) to authenticated;
grant execute on function public.praise_edit(uuid, text) to authenticated;
grant execute on function public.praise_claim(uuid) to authenticated;
grant execute on function public.praise_board_get(uuid) to authenticated;
