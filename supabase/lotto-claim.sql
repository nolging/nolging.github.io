-- =============================================================
--  로또: 당첨금을 정산 시점에 자동 지급하지 않고, 응모자가 당첨 번호 공개 페이지에서
--  직접 "N등" 알약 버튼을 눌러야 지급되도록 변경(수령제).
--  _lotto_settle_round() 는 이제 코인 원장에 바로 꽂지 않고, 각 응모 행에 등수/당첨금만
--  기록한다. 실제 지급은 신규 RPC claim_lotto_prize() 가 담당.
--  ⚠️ 이미 지난(이 마이그레이션 이전에 추첨된) 회차의 응모 행은 rank/reward 가 비어 있는
--  채로 남는다 — 그 회차들은 이미 옛 방식(즉시 지급)으로 정산이 끝났으므로 다시 계산해서
--  claim 가능하게 만들면 이중 지급이 된다. 새로 열리는 회차부터만 수령제가 적용된다.
-- =============================================================

alter table public.lotto_entries add column if not exists rank int;
alter table public.lotto_entries add column if not exists reward int;
alter table public.lotto_entries add column if not exists claimed_at timestamptz;

-- 당첨 정산(자동 추첨/관리자 수동 지정 공용) — 회차의 각 응모마다 당첨 번호와 겹치는 개수·
-- 보너스 일치 여부를 계산해 회차에 스냅샷된 prize_tiers 에서 등수를 찾아 응모 행에 등수/
-- 당첨금만 기록한다(코인 원장 지급은 claim_lotto_prize 에서 응모자가 직접 수령할 때).
create or replace function public._lotto_settle_round(p_round_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_round public.lotto_rounds;
  v_entry record;
  v_match int;
  v_bonus_hit boolean;
  v_tier jsonb;
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

    update public.lotto_entries
      set rank = (v_tier->>'rank')::int, reward = coalesce((v_tier->>'reward')::int, 0)
      where id = v_entry.id;
  end loop;

  -- 이번 회차에 응모한(당첨 여부 무관) 모든 회원에게 추첨 완료 알림. notif_render 를 거치지
  -- 않고 시스템 공지와 동일하게 제목/본문을 직접 넣는다(알림센터에서도 시스템 공지와 같은
  -- 카드 스타일로 표시되도록 type='lotto_draw' 고정, 클릭 시 당첨 번호 페이지로 이동).
  insert into public.notifications(user_id, actor_id, type, title, body, lotto_round_id)
  select distinct le.user_id, null::uuid, 'lotto_draw',
    '로또 당첨 번호 추첨이 완료됐어요!', '당첨 확인 후 기간 내에 수령하세요', p_round_id
  from public.lotto_entries le
  where le.round_id = p_round_id;
end $$;

-- 당첨금 수령 — 본인 응모 건에 한해, 아직 안 받았고 지급액이 0보다 클 때만 코인 원장에
-- 지급을 남기고 claimed_at 을 찍는다.
create or replace function public.claim_lotto_prize(p_entry_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_entry public.lotto_entries;
  v_round public.lotto_rounds;
begin
  select * into v_entry from public.lotto_entries where id = p_entry_id and user_id = auth.uid() for update;
  if v_entry.id is null then raise exception '응모 내역을 찾을 수 없어요.'; end if;
  if v_entry.claimed_at is not null then raise exception '이미 수령한 당첨금이에요.'; end if;
  if v_entry.reward is null or v_entry.reward <= 0 then raise exception '수령할 당첨금이 없어요.'; end if;

  select * into v_round from public.lotto_rounds where id = v_entry.round_id;
  if v_round.id is null or v_round.winning_numbers is null then raise exception '아직 추첨 전이에요.'; end if;

  update public.lotto_entries set claimed_at = now() where id = p_entry_id;

  insert into public.coin_ledger(user_id, delta, reason, ref_type, ref_id)
    values (auth.uid(), v_entry.reward,
      '로또 ' || v_entry.rank || '등 당첨 수령 - ' || v_round.round_no || '회', 'lotto', p_entry_id);

  return v_entry.reward;
end $$;
grant execute on function public.claim_lotto_prize(uuid) to authenticated;

-- ⚠️ 배포 후: 이 파일의 내용은 schema-store-items.sql 에도 반영해 두었습니다. 프로덕션에
-- 실행 완료되면(위 함수들이 잘 동작하면) 이 파일은 지워도 됩니다.
