-- 길냥이 후원(donation) 기능: 회원 간 츄르 직접 후원 RPC.
-- Supabase SQL Editor 에서 실행. 최종본은 schema-economy-store.sql 에도 반영돼 있음.

-- 길냥이 후원: 회원 간 츄르 직접 후원(구매/재고 없이 순수 coin_ledger 이동).
-- 후원한 회원(-금액)과 받는 회원(+금액) 양쪽에 원장을 남기며, reason 에는 서로의 닉네임을 표기.
drop function if exists public.donate_coin(uuid, uuid, integer);
create or replace function public.donate_coin(p_group_id uuid, p_recipient_id uuid, p_amount integer)
returns integer language plpgsql security definer set search_path = public as $$
declare v_balance integer; v_sender text; v_recipient text;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception '후원할 금액을 입력해 주세요.'; end if;
  if p_recipient_id = auth.uid() then
    raise exception '자기 자신에게는 후원할 수 없어요.'; end if;
  if not public.is_group_member(p_group_id, auth.uid()) then
    raise exception '그룹 멤버만 후원할 수 있습니다.'; end if;
  if not public.is_group_member(p_group_id, p_recipient_id) then
    raise exception '후원할 대상이 그룹 멤버가 아닙니다.'; end if;

  select coalesce(sum(delta), 0)::integer into v_balance
    from public.coin_ledger where user_id = auth.uid();
  if v_balance < p_amount then
    raise exception '츄르가 부족해요.'; end if;

  v_sender    := public.notif_member_name(p_group_id, auth.uid());
  v_recipient := public.notif_member_name(p_group_id, p_recipient_id);

  insert into public.coin_ledger(user_id, delta, reason, ref_type, ref_id, created_by)
    values (auth.uid(), -p_amount, '길냥이 츄르 후원 - ' || v_recipient, 'donation', p_recipient_id, auth.uid());
  insert into public.coin_ledger(user_id, delta, reason, ref_type, ref_id, created_by)
    values (p_recipient_id, p_amount, '길냥이 츄르 후원 - ' || v_sender, 'donation', auth.uid(), auth.uid());

  return v_balance - p_amount;
end;
$$;
grant execute on function public.donate_coin(uuid, uuid, integer) to authenticated;
