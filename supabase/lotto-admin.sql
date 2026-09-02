-- 로또 당첨 관리(관리자): 회차별 응모 확인, 당첨 룰(번호 범위/추첨 개수/등수별 츄르) 설정,
-- 미추첨 회차 당첨 번호 수동 지정. 룰 변경은 이번 회차가 아니라 "새로 열리는 다음 회차"부터
-- 적용되도록, 각 회차가 생성되는 시점의 룰을 lotto_rounds 에 그대로 스냅샷해 둔다.
-- Supabase SQL Editor 에서 실행. 최종본은 schema-minigames.sql 에도 반영됨.

-- 1) 룰 설정(싱글턴 1행) — number_min~number_max 범위에서 pick_count 개를 뽑고(본번호),
--    이후 보너스 번호 1개를 추가로 더 뽑는다. prize_tiers: 등수별 지급 규칙 배열
--    [{rank, match, bonus, reward}, ...] (rank 오름차순 = 좋은 등수 먼저, match=일치 개수,
--    bonus=보너스 번호까지 일치해야 하는지, reward=지급 츄르).
create table if not exists public.lotto_config (
  id          integer primary key default 1 check (id = 1),
  number_min  integer not null default 1,
  number_max  integer not null default 30,
  pick_count  integer not null default 6,
  prize_tiers jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id)
);
insert into public.lotto_config (id, number_min, number_max, pick_count, prize_tiers)
  values (1, 1, 30, 6, '[
    {"rank":1,"match":6,"bonus":false,"reward":500},
    {"rank":2,"match":5,"bonus":true,"reward":100},
    {"rank":3,"match":5,"bonus":false,"reward":50},
    {"rank":4,"match":4,"bonus":false,"reward":10},
    {"rank":5,"match":3,"bonus":false,"reward":5}
  ]'::jsonb)
  on conflict (id) do nothing;

alter table public.lotto_config enable row level security;
drop policy if exists lotto_config_select on public.lotto_config;
create policy lotto_config_select on public.lotto_config for select to authenticated using (true);
-- 쓰기는 admin_update_lotto_config RPC(정의자)만 — 직접 UPDATE 정책 없음.

-- 2) 각 회차 생성 시점의 룰을 스냅샷(이후 룰이 바뀌어도 이미 응모가 진행 중인 회차는 그대로).
alter table public.lotto_rounds add column if not exists number_min int;
alter table public.lotto_rounds add column if not exists number_max int;
alter table public.lotto_rounds add column if not exists pick_count int;
alter table public.lotto_rounds add column if not exists prize_tiers jsonb;
-- 이미 존재하는(이 마이그레이션 이전에 생성된) 회차는 지금의 기본 룰로 백필.
update public.lotto_rounds set
  number_min = coalesce(number_min, 1), number_max = coalesce(number_max, 30),
  pick_count = coalesce(pick_count, 6),
  prize_tiers = coalesce(prize_tiers, (select prize_tiers from public.lotto_config where id = 1))
where number_min is null or number_max is null or pick_count is null or prize_tiers is null;

-- 3) 응모: 라운드를 먼저 찾거나(없으면 현재 룰로 새로 만들어) 그 라운드의 스냅샷 기준으로
--    번호를 검증한다(하드코딩된 1~30/6개 대신). 검증 실패 시 로또 아이템은 소모하지 않는다.
create or replace function public.submit_lotto_entry(p_numbers int[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_item public.user_items;
  v_round public.lotto_rounds;
  v_cfg public.lotto_config;
  v_round_no integer;
  v_nums int[];
  v_n int;
begin
  select * into v_item from public.user_items
    where user_id = auth.uid() and item_id = 'lotto' and status = 'active'
    order by created_at asc limit 1 for update;
  if v_item.id is null then
    raise exception '사용할 수 있는 로또가 없어요.';
  end if;

  perform pg_advisory_xact_lock(872634981);
  select * into v_round from public.lotto_rounds
    where winning_numbers is null order by round_no asc limit 1
    for update;
  if v_round.id is null then
    select * into v_cfg from public.lotto_config where id = 1;
    select coalesce(max(round_no), 0) + 1 into v_round_no from public.lotto_rounds;
    insert into public.lotto_rounds(round_no, number_min, number_max, pick_count, prize_tiers)
      values (v_round_no, v_cfg.number_min, v_cfg.number_max, v_cfg.pick_count, v_cfg.prize_tiers)
      returning * into v_round;
  end if;

  if p_numbers is null or array_length(p_numbers, 1) is distinct from v_round.pick_count then
    raise exception '번호를 %개 선택해 주세요.', v_round.pick_count;
  end if;
  select array_agg(distinct x order by x) into v_nums from unnest(p_numbers) as x;
  if array_length(v_nums, 1) is distinct from v_round.pick_count then
    raise exception '중복되지 않는 번호 %개를 선택해 주세요.', v_round.pick_count;
  end if;
  foreach v_n in array v_nums loop
    if v_n < v_round.number_min or v_n > v_round.number_max then
      raise exception '번호는 %~% 사이여야 해요.', v_round.number_min, v_round.number_max;
    end if;
  end loop;

  update public.user_items set status = 'used', used_at = now() where id = v_item.id;

  insert into public.lotto_entries(round_id, round_no, user_id, numbers, user_item_id)
    values (v_round.id, v_round.round_no, auth.uid(), v_nums, v_item.id);

  return jsonb_build_object(
    'roundNo', v_round.round_no,
    'remaining', (select count(*) from public.user_items where user_id = auth.uid() and item_id = 'lotto' and status = 'active')
  );
end;
$$;

-- 4) 당첨 정산(자동 추첨/관리자 수동 지정 공용) — 회차의 각 응모마다 당첨 번호와 겹치는
--    개수·보너스 일치 여부를 계산해 회차에 스냅샷된 prize_tiers 에서 등수를 찾고, 있으면
--    코인 원장에 지급을 남긴다. prize_tiers 는 rank 오름차순으로 저장돼 있다고 가정.
create or replace function public._lotto_settle_round(p_round_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_round public.lotto_rounds;
  v_entry record;
  v_match int;
  v_bonus_hit boolean;
  v_tier jsonb;
  v_reward int;
begin
  select * into v_round from public.lotto_rounds where id = p_round_id;
  if v_round.id is null or v_round.winning_numbers is null then return; end if;

  for v_entry in select * from public.lotto_entries where round_id = p_round_id loop
    select count(*) into v_match from unnest(v_entry.numbers) n where n = any(v_round.winning_numbers);
    v_bonus_hit := v_round.bonus_number = any(v_entry.numbers);

    select t into v_tier from jsonb_array_elements(coalesce(v_round.prize_tiers, '[]'::jsonb)) t
      where (t->>'match')::int = v_match
        and (coalesce((t->>'bonus')::boolean, false) = false or v_bonus_hit)
      order by (t->>'rank')::int asc
      limit 1;

    if v_tier is not null then
      v_reward := coalesce((v_tier->>'reward')::int, 0);
      if v_reward > 0 then
        insert into public.coin_ledger(user_id, delta, reason, ref_type, ref_id)
          values (v_entry.user_id, v_reward,
            '로또 ' || (v_tier->>'rank') || '등 당첨 - ' || v_round.round_no || '회', 'lotto', v_entry.id);
      end if;
    end if;
  end loop;
end $$;

-- 5) 자동 추첨: 회차 자신의 스냅샷(number_min~number_max, pick_count)을 기준으로 랜덤 추첨.
create or replace function public.draw_lotto_round()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_round public.lotto_rounds;
  v_nums int[];
begin
  select * into v_round from public.lotto_rounds
    where winning_numbers is null order by round_no asc limit 1
    for update skip locked;
  if v_round.id is null then return; end if;

  select array_agg(x) into v_nums
    from (select x from generate_series(v_round.number_min, v_round.number_max) as x
          order by random() limit (v_round.pick_count + 1)) s;

  update public.lotto_rounds
    set winning_numbers = (select array_agg(n order by n) from unnest(v_nums[1:v_round.pick_count]) as n),
        bonus_number = v_nums[v_round.pick_count + 1],
        drawn_at = now()
    where id = v_round.id;

  perform public._lotto_settle_round(v_round.id);
end $$;

-- 6) 관리자: 아직 미추첨인 회차의 당첨 번호를 직접 지정(자동 추첨을 기다리지 않고 확정).
create or replace function public.admin_set_lotto_winning_numbers(p_round_id bigint, p_numbers int[], p_bonus int)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_round public.lotto_rounds;
  v_nums int[];
  v_n int;
begin
  if not public.is_admin(auth.uid()) then raise exception '관리자만 사용할 수 있어요.'; end if;

  select * into v_round from public.lotto_rounds where id = p_round_id for update;
  if v_round.id is null then raise exception '회차를 찾을 수 없어요.'; end if;
  if v_round.winning_numbers is not null then raise exception '이미 추첨이 완료된 회차예요.'; end if;

  if p_numbers is null or array_length(p_numbers, 1) is distinct from v_round.pick_count then
    raise exception '번호를 %개 선택해 주세요.', v_round.pick_count;
  end if;
  select array_agg(distinct x order by x) into v_nums from unnest(p_numbers) as x;
  if array_length(v_nums, 1) is distinct from v_round.pick_count then
    raise exception '중복되지 않는 번호 %개를 선택해 주세요.', v_round.pick_count;
  end if;
  foreach v_n in array v_nums loop
    if v_n < v_round.number_min or v_n > v_round.number_max then
      raise exception '번호는 %~% 사이여야 해요.', v_round.number_min, v_round.number_max;
    end if;
  end loop;
  if p_bonus is null or p_bonus < v_round.number_min or p_bonus > v_round.number_max then
    raise exception '보너스 번호가 올바르지 않아요.';
  end if;
  if p_bonus = any(v_nums) then raise exception '보너스 번호는 당첨 번호와 겹칠 수 없어요.'; end if;

  update public.lotto_rounds set winning_numbers = v_nums, bonus_number = p_bonus, drawn_at = now()
    where id = p_round_id;

  perform public._lotto_settle_round(p_round_id);
end $$;
grant execute on function public.admin_set_lotto_winning_numbers(bigint, int[], int) to authenticated;

-- 7) 관리자: 룰 갱신(다음에 새로 열리는 회차부터 적용 — 이미 열려 있는 회차는 스냅샷을 그대로 씀).
create or replace function public.admin_update_lotto_config(p_number_min int, p_number_max int, p_pick_count int, p_prize_tiers jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception '관리자만 사용할 수 있어요.'; end if;
  if p_number_min is null or p_number_max is null or p_number_min < 1 or p_number_max <= p_number_min then
    raise exception '번호 범위가 올바르지 않아요.';
  end if;
  if p_pick_count is null or p_pick_count < 1 or p_pick_count > (p_number_max - p_number_min) then
    raise exception '추첨 개수가 올바르지 않아요.';
  end if;
  update public.lotto_config set
    number_min = p_number_min, number_max = p_number_max, pick_count = p_pick_count,
    prize_tiers = coalesce(p_prize_tiers, '[]'::jsonb), updated_at = now(), updated_by = auth.uid()
  where id = 1;
end $$;
grant execute on function public.admin_update_lotto_config(int, int, int, jsonb) to authenticated;

-- 8) 관리자: 회차 목록(응모 수 포함) + 특정 회차의 응모자 목록(아이디/응모 번호).
create or replace function public.admin_list_lotto_rounds()
returns table(id bigint, round_no integer, entry_count bigint, winning_numbers int[], bonus_number int,
              number_min int, number_max int, pick_count int, prize_tiers jsonb,
              drawn_at timestamptz, created_at timestamptz)
language sql security definer stable set search_path = public as $$
  select r.id, r.round_no,
         (select count(*) from public.lotto_entries e where e.round_id = r.id) as entry_count,
         r.winning_numbers, r.bonus_number, r.number_min, r.number_max, r.pick_count, r.prize_tiers,
         r.drawn_at, r.created_at
  from public.lotto_rounds r
  where public.is_admin(auth.uid())
  order by r.round_no desc;
$$;
grant execute on function public.admin_list_lotto_rounds() to authenticated;

create or replace function public.admin_list_lotto_entries(p_round_id bigint)
returns table(user_id uuid, login_id text, numbers int[], created_at timestamptz)
language sql security definer stable set search_path = public as $$
  select e.user_id, p.nickname as login_id, e.numbers, e.created_at
  from public.lotto_entries e
  join public.profiles p on p.id = e.user_id
  where public.is_admin(auth.uid()) and e.round_id = p_round_id
  order by e.created_at asc;
$$;
grant execute on function public.admin_list_lotto_entries(bigint) to authenticated;
