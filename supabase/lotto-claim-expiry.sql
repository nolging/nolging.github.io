-- =============================================================
--  로또: 당첨금 수령 기한(추첨 시각으로부터 7일) 서버 측 강제.
--  "1일 18:00 공개"면 "8일 17:59:59"까지만 수령 가능 — 즉 drawn_at + 7일 "이전"까지.
-- =============================================================

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
  if now() >= v_round.drawn_at + interval '7 days' then
    raise exception '수령 기간이 만료됐어요.';
  end if;

  update public.lotto_entries set claimed_at = now() where id = p_entry_id;

  insert into public.coin_ledger(user_id, delta, reason, ref_type, ref_id)
    values (auth.uid(), v_entry.reward,
      '로또 ' || v_entry.rank || ' 등 당첨 수령 - ' || v_round.round_no || '회', 'lotto', p_entry_id);

  return v_entry.reward;
end $$;

-- ⚠️ 배포 후: 이 파일의 내용은 schema-store-items.sql 에도 반영해 두었습니다. 프로덕션에
-- 실행 완료되면(위 함수가 잘 동작하면) 이 파일은 지워도 됩니다.
