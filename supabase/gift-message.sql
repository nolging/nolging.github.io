-- =============================================================
--  상점 선물하기에 메시지(쪽지) 첨부 — gift_item 에 p_message 추가.
--  · 선물 쪽지 본문을 메시지로(없으면 기존처럼 아이템명). 그 외 로직 동일.
--  Supabase SQL Editor 에서 실행.
-- =============================================================
drop function if exists public.gift_item(text, uuid, uuid, integer);
create or replace function public.gift_item(p_item_id text, p_group_id uuid, p_recipient_id uuid, p_qty integer default 1, p_message text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare it public.store_items; v_balance integer; v_sender text; v_recipient text; v_sender_av text; v_recipient_av text; v_note_id uuid; v_qty integer; v_total integer; i integer; v_body text;
begin
  v_qty := greatest(1, coalesce(p_qty, 1));
  select * into it from public.store_items where id = p_item_id and is_active;
  if it.id is null then raise exception '존재하지 않는 아이템입니다.'; end if;

  if not public.is_group_member(p_group_id, auth.uid()) then
    raise exception '그룹 멤버만 선물할 수 있습니다.'; end if;
  if p_recipient_id = auth.uid() then
    raise exception '자기 자신에게는 선물할 수 없습니다.'; end if;
  if not public.is_group_member(p_group_id, p_recipient_id) then
    raise exception '받는 사람이 그룹 멤버가 아닙니다.'; end if;
  if p_item_id = 'couple-ring' then
    if v_qty > 1 then raise exception '커플 링은 한 개만 선물할 수 있어요.'; end if;
    if exists (select 1 from public.user_items where user_id = p_recipient_id and item_id = 'couple-ring') then
      raise exception '상대가 이미 커플 링을 보유하고 있어요.'; end if;
  end if;
  if p_item_id = 'ledboard' and not exists (
       select 1 from public.user_items where user_id = p_recipient_id and item_id = 'couple-ring' and status = 'used') then
    raise exception '받는 사람이 커플이 아니에요. 전광판은 커플만 사용할 수 있어요.'; end if;

  v_total := it.price * v_qty;
  select coalesce(sum(delta), 0)::integer into v_balance
    from public.coin_ledger where user_id = auth.uid();
  if v_balance < v_total then
    raise exception '츄르가 부족해요.'; end if;

  v_sender    := public.notif_member_name(p_group_id, auth.uid());
  v_recipient := public.notif_member_name(p_group_id, p_recipient_id);
  select avatar_url into v_sender_av    from public.group_members where group_id = p_group_id and user_id = auth.uid();
  select avatar_url into v_recipient_av from public.group_members where group_id = p_group_id and user_id = p_recipient_id;

  v_body := coalesce(nullif(btrim(p_message), ''), it.name || case when v_qty > 1 then ' ×' || v_qty else '' end);

  insert into public.coin_ledger(user_id, delta, reason, ref_type)
    values (auth.uid(), -v_total, it.name || ' 선물' || case when v_qty > 1 then ' ×' || v_qty else '' end, 'gift');
  for i in 1..v_qty loop
    insert into public.item_gifts(group_id, sender_id, recipient_id, item_id, item_name, sender_name, recipient_name)
      values (p_group_id, auth.uid(), p_recipient_id, p_item_id, it.name, v_sender, v_recipient);
  end loop;
  insert into public.notes(group_id, sender_id, recipient_id, sender_name, recipient_name, sender_avatar, recipient_avatar, body, kind, item_id, item_name, qty, claimed, rejected)
    values (p_group_id, auth.uid(), p_recipient_id, v_sender, v_recipient, v_sender_av, v_recipient_av,
            v_body, 'gift', it.id, it.name, v_qty, false, false)
    returning id into v_note_id;
  insert into public.notifications(user_id, actor_id, type, title, body, group_id, note_id)
    values (p_recipient_id, auth.uid(), 'gift', v_sender || ' 님이 선물을 보냈어요',
            it.name || case when v_qty > 1 then ' ' || v_qty || '개' else '' end || ' · 쪽지함에서 수령하세요', p_group_id, v_note_id);

  return v_balance - v_total;
end;
$$;
grant execute on function public.gift_item(text, uuid, uuid, integer, text) to authenticated;
