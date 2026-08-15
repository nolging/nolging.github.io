-- 로또 시스템: 회차(round) + 응모 용지(entry).
-- 로또 상점 아이템(store_items.id='lotto')은 관리자가 이미 등록해 둔 상태 — 여기서는
-- "보유한 로또 1장 소모 → 번호 6개 응모" 기능만 추가한다. 당첨 발표·당첨금 수령은 이후 별도 작업.

create table if not exists public.lotto_rounds (
  id              bigserial primary key,
  round_no        integer not null unique,
  winning_numbers int[],                 -- 당첨 번호(추후 발표 기능에서 채움) — null = 아직 미발표
  drawn_at        timestamptz,
  created_at      timestamptz not null default now()
);
alter table public.lotto_rounds enable row level security;
drop policy if exists lotto_rounds_select on public.lotto_rounds;
create policy lotto_rounds_select on public.lotto_rounds
  for select to authenticated using (true);

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
alter table public.lotto_entries enable row level security;
drop policy if exists lotto_entries_select on public.lotto_entries;
create policy lotto_entries_select on public.lotto_entries
  for select to authenticated using (user_id = auth.uid());
-- 직접 INSERT 불가(RLS): 응모는 submit_lotto_entry RPC(정의자)만 기록

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
grant execute on function public.submit_lotto_entry(int[]) to authenticated;
