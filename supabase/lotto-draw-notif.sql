-- 로또 당첨 번호 추첨 완료 알림: 해당 회차에 응모한 회원 전원에게(당첨 여부 무관) 발송.
-- 알림센터에서 시스템 공지와 동일한 카드 스타일로 보이고, 클릭하면 당첨 번호 페이지로 이동.
-- Supabase SQL Editor 에서 실행. 최종본은 schema-minigames.sql 에도 반영됨.

-- 1) 알림이 당첨 번호 페이지로 바로 이동할 수 있게 컬럼 추가.
alter table public.notifications add column if not exists lotto_round_id bigint
  references public.lotto_rounds(id) on delete cascade;

-- 2) 정산 함수에 알림 발송 추가(당첨 정산 로직 자체는 기존과 동일).
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

  -- 이번 회차에 응모한(당첨 여부 무관) 모든 회원에게 추첨 완료 알림. notif_render 를 거치지
  -- 않고 시스템 공지와 동일하게 제목/본문을 직접 넣는다(알림센터에서도 시스템 공지와 같은
  -- 카드 스타일로 표시되도록 type='lotto_draw' 고정, 클릭 시 당첨 번호 페이지로 이동).
  insert into public.notifications(user_id, actor_id, type, title, body, lotto_round_id)
  select distinct le.user_id, null::uuid, 'lotto_draw',
    '로또 당첨 번호 추첨이 완료됐어요!', '당첨 확인 후 기간 내에 수령하세요', p_round_id
  from public.lotto_entries le
  where le.round_id = p_round_id;
end $$;
