-- =============================================================
--  로또: 관리자가 당첨 번호를 "미리" 지정(스테이징)할 수 있게 확장
--  기존 admin_set_lotto_winning_numbers() 는 지정 즉시 당첨을 공개하고 정산까지
--  해버렸는데, 이제는 관리자가 미리 번호만 정해 두면(preset) 실제 공개/정산은
--  정기 추첨 시각(매주 토요일 18시 KST, draw_lotto_round())에 그대로 이뤄진다.
--  보너스 번호는 선택 사항 — 관리자가 안 정해두면 추첨 시각에 랜덤으로 채워진다.
-- =============================================================

alter table public.lotto_rounds add column if not exists preset_numbers int[];
alter table public.lotto_rounds add column if not exists preset_bonus int;

-- 관리자: 아직 미추첨인 회차의 당첨 번호를 "미리" 지정(스테이징)만 한다. 여기서는
-- 공개/정산을 하지 않고, 실제 공개는 draw_lotto_round() 가 정기 추첨 시각에 그대로
-- 가져다 쓴다. p_bonus 는 null 허용(보너스는 나중에 랜덤으로 채워짐).
create or replace function public.admin_preset_lotto_winning_numbers(p_round_id bigint, p_numbers int[], p_bonus int)
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
  if p_bonus is not null then
    if p_bonus < v_round.number_min or p_bonus > v_round.number_max then
      raise exception '보너스 번호가 올바르지 않아요.';
    end if;
    if p_bonus = any(v_nums) then raise exception '보너스 번호는 당첨 번호와 겹칠 수 없어요.'; end if;
  end if;

  update public.lotto_rounds set preset_numbers = v_nums, preset_bonus = p_bonus
    where id = p_round_id;
end $$;
grant execute on function public.admin_preset_lotto_winning_numbers(bigint, int[], int) to authenticated;

-- 기존 즉시-확정 RPC는 더 이상 쓰지 않음(위 preset 함수로 대체) — 남아 있으면 관리자
-- 페이지 개편 후에도 실수로 호출될 수 있어 제거한다.
drop function if exists public.admin_set_lotto_winning_numbers(bigint, int[], int);

-- 자동/정기 추첨: 회차에 preset_numbers/preset_bonus 가 있으면 그대로 쓰고(없는 조각만
-- 랜덤 보충), 아예 없으면 기존처럼 전부 랜덤으로 뽑는다.
create or replace function public.draw_lotto_round()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_round public.lotto_rounds;
  v_nums int[];
  v_bonus int;
begin
  select * into v_round from public.lotto_rounds
    where winning_numbers is null order by round_no asc limit 1
    for update skip locked;
  if v_round.id is null then return; end if;

  if v_round.preset_numbers is not null then
    v_nums := v_round.preset_numbers;
  else
    select array_agg(x order by x) into v_nums
      from (select x from generate_series(v_round.number_min, v_round.number_max) as x
            order by random() limit v_round.pick_count) s;
  end if;

  if v_round.preset_bonus is not null then
    v_bonus := v_round.preset_bonus;
  else
    select x into v_bonus from generate_series(v_round.number_min, v_round.number_max) as x
      where x <> all(v_nums) order by random() limit 1;
  end if;

  update public.lotto_rounds
    set winning_numbers = v_nums, bonus_number = v_bonus, drawn_at = now()
    where id = v_round.id;

  perform public._lotto_settle_round(v_round.id);
end $$;
-- authenticated 에게 grant 하지 않음(cron 전용 — dispatch_due_reminders() 와 동일 패턴)

-- 관리자: 회차 목록에 preset_numbers/preset_bonus 도 함께 반환(공개 전 미리보기용) —
-- returns table 컬럼이 늘어나 drop 후 재생성해야 한다.
drop function if exists public.admin_list_lotto_rounds();
create or replace function public.admin_list_lotto_rounds()
returns table(id bigint, round_no integer, entry_count bigint, winning_numbers int[], bonus_number int,
              number_min int, number_max int, pick_count int, prize_tiers jsonb,
              preset_numbers int[], preset_bonus int,
              drawn_at timestamptz, created_at timestamptz)
language sql security definer stable set search_path = public as $$
  select r.id, r.round_no,
         (select count(*) from public.lotto_entries e where e.round_id = r.id) as entry_count,
         r.winning_numbers, r.bonus_number, r.number_min, r.number_max, r.pick_count, r.prize_tiers,
         r.preset_numbers, r.preset_bonus,
         r.drawn_at, r.created_at
  from public.lotto_rounds r
  where public.is_admin(auth.uid())
  order by r.round_no desc;
$$;
grant execute on function public.admin_list_lotto_rounds() to authenticated;

-- ⚠️ 배포 후: 이 파일의 내용은 schema-store-items.sql 에도 반영해 두었습니다. 프로덕션에
-- 실행 완료되면(위 함수들이 잘 동작하면) 이 파일은 지워도 됩니다.
