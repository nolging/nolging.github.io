-- =============================================================
--  Nolging · 실시간 멀티플레이 미니게임 (schema-v2.sql 분리본)
--  ------------------------------------------------------------
--  대규모로 누적되어 온 schema-v2.sql(2767줄)을 도메인별로 잘게
--  쪼개는 저장소 정리 작업의 일환으로, "프리미엄 그룹 실시간
--  대전/협동 미니게임" 관련 내용만 이 파일로 옮겼습니다.
--  (다른 122개 소규모 마이그레이션을 모은 13개 번들 파일과는
--   별개 — 그 번들들과는 내용이 겹치지 않는 것을 확인했습니다.)
--
--  포함 범위: 함께 그리기(낙서장) / 함께 퍼즐(직소) / 캐치마인드
--  (실시간 그림 맞히기) / 오목 / 다빈치코드 / 가위바위보 —
--  각 게임의 진행상태 테이블 + RLS 정책 + 베팅/보상 정산 함수.
--
--  실행 순서: schema.sql 적용 이후에 실행하세요.
--  ⚠️ 이 파일은 "과거에 schema-v2.sql 의 일부로 이미 운영 DB에
--  적용된 내용"을 그대로 옮긴 것뿐입니다. 즉 이미 적용되어 있으므로
--  운영(live) DB에 다시 실행할 필요는 없습니다 — 새 환경을 셋업할
--  때만 필요합니다.
--
--  ⚠️ 교차 파일 의존성: group_puzzles 테이블의 elapsed_ms 컬럼은
--  이 파일이 만드는 base 테이블에는 없고, schema-minigames.sql 의
--  `alter table public.group_puzzles add column if not exists
--  elapsed_ms ...` 구문에서 추가됩니다. 새 환경에 처음부터 적용할
--  때는 반드시 이 파일 → schema-minigames.sql 순서로 실행해야
--  elapsed_ms 컬럼까지 정상적으로 붙습니다.
-- =============================================================


-- =============================================================
--  1. 함께 그리기 (낙서장, 프리미엄 그룹 공용 캔버스)
-- =============================================================
-- 실시간 스트로크는 Supabase Realtime Broadcast 로 주고받고, 아래 테이블은
-- "마지막 그림"을 저장해 재진입 시 이어 그릴 수 있게 하는 영속 저장소.
-- stroke: { c:색상, w:굵기(0..1), p:[[x,y],...] 정규화(0..1) }
create table if not exists public.group_drawings (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  author     uuid not null references public.profiles(id) on delete cascade,
  stroke     jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_group_drawings_group on public.group_drawings(group_id, created_at);
alter table public.group_drawings enable row level security;
drop policy if exists gd_select on public.group_drawings;
create policy gd_select on public.group_drawings for select
  using (public.is_group_member(group_id, auth.uid()));
drop policy if exists gd_insert on public.group_drawings;
create policy gd_insert on public.group_drawings for insert
  with check (public.is_group_member(group_id, auth.uid()) and author = auth.uid());
drop policy if exists gd_delete on public.group_drawings;
create policy gd_delete on public.group_drawings for delete
  using (public.is_group_member(group_id, auth.uid()));


-- =============================================================
--  2. 함께 퍼즐 (프리미엄 그룹 실시간 직소)
-- =============================================================
-- 실시간 조각 이동은 Broadcast, 아래 테이블은 현재 퍼즐/조각 위치 저장(재진입 이어하기).
-- positions: { "r-c": { x, y, placed } } (x,y=놀이영역 너비 기준 정규화)
-- ⚠️ elapsed_ms 컬럼은 여기서 만들지 않습니다 — schema-minigames.sql 이
--   `alter table ... add column if not exists elapsed_ms` 로 추가합니다.
--   (이 파일은 base 테이블만 생성하고, elapsed_ms 는 그 파일 실행 후 붙습니다.)
create table if not exists public.group_puzzles (
  group_id   uuid primary key references public.groups(id) on delete cascade,
  image      text not null,
  cols       int not null,
  rows       int not null,
  seed       int not null,
  positions  jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.group_puzzles enable row level security;
drop policy if exists gp_all on public.group_puzzles;
create policy gp_all on public.group_puzzles for all
  using (public.is_group_member(group_id, auth.uid()))
  with check (public.is_group_member(group_id, auth.uid()));


-- =============================================================
--  3. 캐치마인드 (프리미엄 그룹 실시간 그림 맞히기)
-- =============================================================
-- 그룹별 커스텀 제시어 (멤버 누구나 추가). 기본 리스트와 합쳐 사용.
create table if not exists public.group_catch_words (
  group_id uuid primary key references public.groups(id) on delete cascade,
  words    jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.group_catch_words enable row level security;
drop policy if exists gcw_all on public.group_catch_words;
create policy gcw_all on public.group_catch_words for all
  using (public.is_group_member(group_id, auth.uid()))
  with check (public.is_group_member(group_id, auth.uid()));

-- 우승 보상 지급 이력(그룹당 하루 1건) — 중복 지급 방지 & 하루 1회 제한
create table if not exists public.catchmind_awards (
  group_id   uuid not null references public.groups(id) on delete cascade,
  day        date not null default current_date,
  winner     uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, day)
);
alter table public.catchmind_awards enable row level security;

-- ---- 캐치마인드 베팅 정산: 참여자 각자 bet, 1등(들)이 판돈 분배(게임당 1회, 멱등) ----
create table if not exists public.catchmind_settlements (
  game_id    text primary key,
  group_id   uuid not null references public.groups(id) on delete cascade,
  bet        int  not null,
  created_at timestamptz not null default now()
);
alter table public.catchmind_settlements enable row level security;


-- =============================================================
--  4. 오목 (프리미엄 그룹 실시간 대전)
-- =============================================================
-- 승자에게 츄르 10개, 그룹당 하루 1회 제한.
create table if not exists public.omok_awards (
  group_id   uuid not null references public.groups(id) on delete cascade,
  day        date not null default current_date,
  winner     uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, day)
);
alter table public.omok_awards enable row level security;

-- ---- 오목 베팅 정산: 패자→승자 츄르 이전(게임당 1회, 멱등) ----
-- 하루 1회 보상(award_omok) 대신 베팅으로 전환. 승자 클라이언트가 game_id 로 호출.
create table if not exists public.omok_settlements (
  game_id    text primary key,
  group_id   uuid not null references public.groups(id) on delete cascade,
  winner     uuid not null references public.profiles(id) on delete cascade,
  loser      uuid not null references public.profiles(id) on delete cascade,
  bet        int  not null,
  created_at timestamptz not null default now()
);
alter table public.omok_settlements enable row level security;

-- 오목 진행 상태 저장(이어하기). 공개 정보라 그룹 멤버가 직접 읽고 쓸 수 있음.
create table if not exists public.omok_matches (
  group_id   uuid primary key references public.groups(id) on delete cascade,
  state      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.omok_matches enable row level security;
drop policy if exists omok_matches_all on public.omok_matches;
create policy omok_matches_all on public.omok_matches for all
  using (public.is_group_member(group_id, auth.uid()))
  with check (public.is_group_member(group_id, auth.uid()));


-- =============================================================
--  5. 가위바위보 (프리미엄 그룹 실시간 대전)
-- =============================================================
-- ---- 가위바위보 베팅 정산: 패자→승자 츄르 이전(게임당 1회, 멱등) ----
create table if not exists public.rps_settlements (
  game_id    text primary key,
  group_id   uuid not null references public.groups(id) on delete cascade,
  winner     uuid not null references public.profiles(id) on delete cascade,
  loser      uuid not null references public.profiles(id) on delete cascade,
  bet        int  not null,
  created_at timestamptz not null default now()
);
alter table public.rps_settlements enable row level security;


-- =============================================================
--  6. 다빈치코드 (프리미엄 그룹, 숨은 정보 + 츄르 베팅)
-- =============================================================
-- 비밀 상태(state)는 오직 Edge Function(davinci)이 service_role 로만 접근.
-- 클라이언트 직접 SELECT 정책 없음 = 접근 불가(상대 숫자 노출 방지).
create table if not exists public.davinci_matches (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  status     text not null default 'lobby',   -- lobby | playing | ended | cancelled
  stake      int  not null default 0,
  state      jsonb not null default '{}'::jsonb,
  winner     uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_davinci_group on public.davinci_matches(group_id, status);
alter table public.davinci_matches enable row level security;
-- (정책 없음 → authenticated 는 직접 읽기/쓰기 불가. 엣지 함수만 접근)


-- =============================================================
--  함수: 캐치마인드
-- =============================================================

-- 우승자에게 30 츄르 지급. 공동 우승이면 균등 분배(내림, 나머지 버림).
-- 하루 1회/그룹 제한(unique). 반환: { ok, share, n, reason }
drop function if exists public.award_catchmind(uuid, uuid);
create or replace function public.award_catchmind(p_group_id uuid, p_winners uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  n int := coalesce(array_length(p_winners, 1), 0);
  share int;
  w uuid;
begin
  if n = 0 then return jsonb_build_object('ok', false, 'reason', 'no_winner'); end if;
  if not public.is_group_member(p_group_id, auth.uid()) then return jsonb_build_object('ok', false, 'reason', 'forbidden'); end if;
  if not (public.is_couple_group(p_group_id) or public.is_friend_group(p_group_id)) then return jsonb_build_object('ok', false, 'reason', 'not_premium'); end if;
  foreach w in array p_winners loop
    if not public.is_group_member(p_group_id, w) then return jsonb_build_object('ok', false, 'reason', 'bad_winner'); end if;
  end loop;
  -- 그룹당 하루 1회 지급 마커(대표로 첫 우승자 기록)
  begin
    insert into public.catchmind_awards(group_id, day, winner) values (p_group_id, current_date, p_winners[1]);
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'already');
  end;
  share := floor(30.0 / n);
  if share >= 1 then
    foreach w in array p_winners loop
      insert into public.coin_ledger(user_id, delta, reason, ref_type)
        values (w, share, '캐치마인드 우승', 'catchmind');
    end loop;
  end if;
  return jsonb_build_object('ok', true, 'share', share, 'n', n);
end;
$$;
grant execute on function public.award_catchmind(uuid, uuid[]) to authenticated;

-- 캐치마인드 베팅 정산: 참여자 각자 bet, 1등(들)이 판돈 분배(게임당 1회, 멱등)
create or replace function public.catchmind_settle(p_group_id uuid, p_game_id text, p_participants uuid[], p_winners uuid[], p_bet int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_bet int; v_losers uuid[]; v_pot int := 0; v_share int; u uuid; v_bal int; v_paid int;
begin
  if auth.uid() is null or not (auth.uid() = any(p_winners)) then return jsonb_build_object('ok', false, 'reason', 'forbidden'); end if;
  if coalesce(array_length(p_winners, 1), 0) = 0 or coalesce(array_length(p_participants, 1), 0) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'bad'); end if;
  if exists (select 1 from public.catchmind_settlements where game_id = p_game_id) then
    return jsonb_build_object('ok', true, 'already', true); end if;
  v_bet := greatest(0, coalesce(p_bet, 0));
  insert into public.catchmind_settlements(game_id, group_id, bet) values (p_game_id, p_group_id, v_bet);
  if v_bet = 0 then return jsonb_build_object('ok', true, 'bet', 0, 'share', 0); end if;
  select array_agg(x) into v_losers from unnest(p_participants) x where not (x = any(p_winners));
  if v_losers is not null then
    foreach u in array v_losers loop
      select coalesce(sum(delta), 0) into v_bal from public.coin_ledger where user_id = u;
      v_paid := least(v_bet, greatest(0, v_bal));
      if v_paid > 0 then
        insert into public.coin_ledger(user_id, delta, reason, ref_type) values (u, -v_paid, '캐치마인드 베팅 패배', 'catchmind');
        v_pot := v_pot + v_paid;
      end if;
    end loop;
  end if;
  v_share := v_pot / array_length(p_winners, 1);   -- 공동 우승 시 floor 분배(나머지 버림)
  if v_share > 0 then
    foreach u in array p_winners loop
      insert into public.coin_ledger(user_id, delta, reason, ref_type) values (u, v_share, '캐치마인드 베팅 승리', 'catchmind');
    end loop;
  end if;
  return jsonb_build_object('ok', true, 'bet', v_bet, 'pot', v_pot, 'share', v_share, 'n', array_length(p_winners, 1));
end;
$$;
grant execute on function public.catchmind_settle(uuid, text, uuid[], uuid[], int) to authenticated;


-- =============================================================
--  함수: 오목
-- =============================================================

create or replace function public.award_omok(p_group_id uuid, p_winner uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_group_member(p_group_id, auth.uid()) then return jsonb_build_object('ok', false, 'reason', 'forbidden'); end if;
  if not public.is_group_member(p_group_id, p_winner) then return jsonb_build_object('ok', false, 'reason', 'bad_winner'); end if;
  if not (public.is_couple_group(p_group_id) or public.is_friend_group(p_group_id)) then return jsonb_build_object('ok', false, 'reason', 'not_premium'); end if;
  begin
    insert into public.omok_awards(group_id, day, winner) values (p_group_id, current_date, p_winner);
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'already');
  end;
  insert into public.coin_ledger(user_id, delta, reason, ref_type)
    values (p_winner, 10, '오목 승리', 'omok');
  return jsonb_build_object('ok', true, 'coin', 10);
end;
$$;
grant execute on function public.award_omok(uuid, uuid) to authenticated;

-- 오목 베팅 정산: 패자→승자 츄르 이전(게임당 1회, 멱등)
create or replace function public.omok_settle(p_group_id uuid, p_game_id text, p_winner uuid, p_loser uuid, p_bet int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_bal int; v_amt int; v_done public.omok_settlements;
begin
  if auth.uid() is null or auth.uid() not in (p_winner, p_loser) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden'); end if;
  if not public.is_group_member(p_group_id, p_winner) or not public.is_group_member(p_group_id, p_loser) then
    return jsonb_build_object('ok', false, 'reason', 'not_member'); end if;
  if p_winner = p_loser then return jsonb_build_object('ok', false, 'reason', 'same'); end if;
  -- 멱등: 이미 정산됐으면 그 결과 그대로 반환
  select * into v_done from public.omok_settlements where game_id = p_game_id;
  if found then return jsonb_build_object('ok', true, 'already', true, 'bet', v_done.bet); end if;
  v_amt := greatest(0, coalesce(p_bet, 0));
  if v_amt > 0 then
    select coalesce(sum(delta), 0) into v_bal from public.coin_ledger where user_id = p_loser;
    v_amt := least(v_amt, greatest(0, v_bal));   -- 패자 잔액 한도까지만
  end if;
  insert into public.omok_settlements(game_id, group_id, winner, loser, bet)
    values (p_game_id, p_group_id, p_winner, p_loser, v_amt);
  if v_amt > 0 then
    insert into public.coin_ledger(user_id, delta, reason, ref_type) values
      (p_winner, v_amt, '오목 베팅 승리', 'omok'),
      (p_loser, -v_amt, '오목 베팅 패배', 'omok');
  end if;
  return jsonb_build_object('ok', true, 'bet', v_amt);
end;
$$;
grant execute on function public.omok_settle(uuid, text, uuid, uuid, int) to authenticated;


-- =============================================================
--  함수: 가위바위보
-- =============================================================

-- 가위바위보 베팅 정산: 패자→승자 츄르 이전(게임당 1회, 멱등)
create or replace function public.rps_settle(p_group_id uuid, p_game_id text, p_winner uuid, p_loser uuid, p_bet int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_bal int; v_amt int; v_done public.rps_settlements;
begin
  if auth.uid() is null or auth.uid() not in (p_winner, p_loser) then return jsonb_build_object('ok', false, 'reason', 'forbidden'); end if;
  if not public.is_group_member(p_group_id, p_winner) or not public.is_group_member(p_group_id, p_loser) then
    return jsonb_build_object('ok', false, 'reason', 'not_member'); end if;
  if p_winner = p_loser then return jsonb_build_object('ok', false, 'reason', 'same'); end if;
  select * into v_done from public.rps_settlements where game_id = p_game_id;
  if found then return jsonb_build_object('ok', true, 'already', true, 'bet', v_done.bet); end if;
  v_amt := greatest(0, coalesce(p_bet, 0));
  if v_amt > 0 then
    select coalesce(sum(delta), 0) into v_bal from public.coin_ledger where user_id = p_loser;
    v_amt := least(v_amt, greatest(0, v_bal));
  end if;
  insert into public.rps_settlements(game_id, group_id, winner, loser, bet) values (p_game_id, p_group_id, p_winner, p_loser, v_amt);
  if v_amt > 0 then
    insert into public.coin_ledger(user_id, delta, reason, ref_type) values
      (p_winner, v_amt, '가위바위보 승리', 'rps'),
      (p_loser, -v_amt, '가위바위보 패배', 'rps');
  end if;
  return jsonb_build_object('ok', true, 'bet', v_amt);
end;
$$;
grant execute on function public.rps_settle(uuid, text, uuid, uuid, int) to authenticated;


-- =============================================================
--  함수: 냥피또 (스크래치 복권) — 결과는 서버가 결정(조작 방지).
--  활성 냥피또 1개 소모 + 가중 상품표로 랜덤 츄르 당첨(0=꽝) → 원장 적립.
--  반환값 = 당첨 츄르(0이면 꽝).
--  상품표(합100): 꽝40 / 3츄르28 / 5츄르18 / 10츄르9 / 30츄르4 / 100츄르1
--  기대값 ≈ 4.84츄르 (가격 5츄르 대비 약한 하우스 엣지)
--
--  ⚠️ 이름 주의: 이 함수는 "스크래치 카드를 긁어 즉시 결과가 나오는" 방식의
--  냥피또(store_items 의 'nyangpito' 소모형 아이템)를 처리합니다.
--  schema-minigames.sql 의 lotto_rounds / lotto_entries 는 "회차에 번호를
--  응모해 추첨을 기다리는" 별개의 로또형 냥피또 메커닉입니다. 이름(냥피또)은
--  같지만 서로 다른 두 시스템이며, 이 파일에서는 하나로 합치거나 정리하지
--  않고 schema-v2.sql 에 있던 그대로 옮겼습니다. (사용자 확인 필요)
-- =============================================================
create or replace function public.scratch_nyangpito()
returns integer language plpgsql security definer set search_path = public as $$
declare v_item public.user_items; v_roll integer; v_prize integer;
begin
  select * into v_item from public.user_items
    where user_id = auth.uid() and item_id = 'nyangpito' and status = 'active'
    order by created_at asc limit 1 for update;
  if v_item.id is null then raise exception '사용할 수 있는 냥피또가 없어요.'; end if;

  update public.user_items set status = 'used', used_at = now() where id = v_item.id;

  v_roll := floor(random() * 100)::int;  -- 0..99
  v_prize := case
    when v_roll < 40 then 0
    when v_roll < 68 then 3
    when v_roll < 86 then 5
    when v_roll < 95 then 10
    when v_roll < 99 then 30
    else 100
  end;

  if v_prize > 0 then
    insert into public.coin_ledger(user_id, delta, reason, ref_type)
      values (auth.uid(), v_prize, '냥피또 당첨', 'nyangpito');
  end if;

  return v_prize;
end;
$$;
grant execute on function public.scratch_nyangpito() to authenticated;
