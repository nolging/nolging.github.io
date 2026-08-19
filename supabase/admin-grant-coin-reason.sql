-- =============================================================
--  관리자 츄르 지급/차감 시 사유를 입력하지 않은 경우, 유저의 적립/사용 내역에
--  차감이어도 항상 "관리자 지급"으로 표기되던 것을 방향에 맞게 "관리자 지급"/"관리자 차감"으로 분기.
--  반환 타입은 그대로라 create or replace 로 안전하게 적용된다.
-- =============================================================
create or replace function public.admin_grant_coin(p_user_id uuid, p_amount integer, p_reason text)
returns integer language plpgsql security definer set search_path = public as $$
declare v_balance integer;
begin
  if not public.is_admin(auth.uid()) then
    raise exception '관리자만 지급할 수 있습니다.'; end if;
  if p_amount is null or p_amount = 0 then
    raise exception '지급/차감 수량을 입력해 주세요.'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception '존재하지 않는 사용자입니다.'; end if;

  insert into public.coin_ledger(user_id, delta, reason, ref_type, created_by)
    values (p_user_id, p_amount,
      coalesce(nullif(btrim(p_reason), ''), case when p_amount > 0 then '관리자 지급' else '관리자 차감' end),
      'admin_grant', auth.uid());

  select coalesce(sum(delta), 0)::integer into v_balance
    from public.coin_ledger where user_id = p_user_id;
  return v_balance;
end;
$$;
grant execute on function public.admin_grant_coin(uuid, integer, text) to authenticated;
