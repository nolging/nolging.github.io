-- =============================================================
--  쪽지 동봉 아이템(여러 종류를 쪽지 하나로) — 개별/일괄 수령
-- =============================================================

create table if not exists public.note_items (
  id         uuid primary key default gen_random_uuid(),
  note_id    uuid not null references public.notes(id) on delete cascade,
  item_id    text not null,
  item_name  text not null,
  qty        integer not null default 1,
  claimed    boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_note_items_note on public.note_items(note_id);
alter table public.note_items enable row level security;
drop policy if exists note_items_select on public.note_items;
create policy note_items_select on public.note_items for select to authenticated using (
  exists (select 1 from public.notes n where n.id = note_id and (n.recipient_id = auth.uid() or n.sender_id = auth.uid()))
);

-- 여러 아이템을 한 쪽지로 선물. p_gifts = [{"item_id":"...","qty":n}, ...]
create or replace function public.send_gift_note(
  p_group_id uuid, p_recipient_id uuid, p_message text, p_anonymous boolean, p_gifts jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_sender text; v_recipient text; v_sav text; v_rav text; v_note_id uuid;
        v_anon boolean; g jsonb; v_item_id text; v_qty integer; it public.store_items;
        v_name text; v_ids uuid[]; v_count integer := 0; v_first_name text; v_total integer := 0; i integer;
begin
  v_anon := coalesce(p_anonymous, false);
  if not public.is_group_member(p_group_id, auth.uid()) then raise exception '그룹 멤버만 선물할 수 있습니다.'; end if;
  if p_recipient_id = auth.uid() then raise exception '자기 자신에게는 선물할 수 없습니다.'; end if;
  if not public.is_group_member(p_group_id, p_recipient_id) then raise exception '받는 사람이 그룹 멤버가 아닙니다.'; end if;
  if p_gifts is null or jsonb_array_length(p_gifts) = 0 then raise exception '선물할 아이템이 없어요.'; end if;

  v_sender    := public.notif_member_name(p_group_id, auth.uid());
  v_recipient := public.notif_member_name(p_group_id, p_recipient_id);
  select avatar_url into v_sav from public.group_members where group_id = p_group_id and user_id = auth.uid();
  select avatar_url into v_rav from public.group_members where group_id = p_group_id and user_id = p_recipient_id;

  if v_anon then perform public.consume_one_eraser(); end if;

  insert into public.notes(group_id, sender_id, recipient_id, sender_name, recipient_name, sender_avatar, recipient_avatar, body, kind, claimed, rejected, anonymous)
    values (p_group_id, auth.uid(), p_recipient_id, v_sender, v_recipient, v_sav, v_rav,
            coalesce(nullif(btrim(p_message), ''), '아이템'), 'gift', false, false, v_anon)
    returning id into v_note_id;

  for g in select * from jsonb_array_elements(p_gifts) loop
    v_item_id := g->>'item_id';
    v_qty := greatest(1, coalesce((g->>'qty')::int, 1));
    select * into it from public.store_items where id = v_item_id;
    v_name := coalesce(it.name, v_item_id);
    if v_first_name is null then v_first_name := v_name; end if;

    if v_item_id = 'wish' then raise exception '선물받은 소원권은 다시 선물할 수 없어요.'; end if;
    if coalesce(it.premium, false) then
      if it.tier = 'couple' then
        if not exists (select 1 from public.user_items where user_id=p_recipient_id and item_id='couple-ring' and status='used') then
          raise exception '커플 회원에게만 선물할 수 있는 아이템이에요.'; end if;
      elsif it.tier = 'friend' then
        if not exists (select 1 from public.user_items where user_id=p_recipient_id and item_id='friend-ring' and status='used') then
          raise exception '우정 회원에게만 선물할 수 있는 아이템이에요.'; end if;
      else
        if not exists (select 1 from public.user_items where user_id=p_recipient_id and item_id in ('couple-ring','friend-ring') and status='used') then
          raise exception '프리미엄 회원에게만 선물할 수 있는 아이템이에요.'; end if;
      end if;
    end if;
    if v_item_id = 'couple-ring' then
      if v_qty > 1 then raise exception '커플 링은 한 개만 선물할 수 있어요.'; end if;
      if exists (select 1 from public.user_items where user_id=p_recipient_id and item_id='couple-ring') then
        raise exception '상대가 이미 커플 링을 보유하고 있어요.'; end if;
    end if;

    select array_agg(id) into v_ids from (
      select id from public.user_items where user_id=auth.uid() and item_id=v_item_id and status='active'
      order by created_at asc limit v_qty) t;
    if v_ids is null or array_length(v_ids,1) < v_qty then raise exception '% 아이템이 부족해요.', v_name; end if;
    update public.user_items set status='used', used_at=now() where id = any(v_ids);

    for i in 1..v_qty loop
      insert into public.item_gifts(group_id, sender_id, recipient_id, item_id, item_name, sender_name, recipient_name)
        values (p_group_id, auth.uid(), p_recipient_id, v_item_id, v_name, v_sender, v_recipient);
    end loop;
    insert into public.note_items(note_id, item_id, item_name, qty) values (v_note_id, v_item_id, v_name, v_qty);
    v_count := v_count + 1; v_total := v_total + v_qty;
  end loop;

  insert into public.notifications(user_id, actor_id, type, title, body, group_id, note_id)
    values (p_recipient_id, case when v_anon then null else auth.uid() end, 'gift',
            case when v_anon then '익명의 선물이 도착했어요' else v_sender || ' 님이 선물을 보냈어요' end,
            case when v_count > 1 then v_first_name || ' 외 ' || (v_count-1) || '종'
                 else v_first_name || case when v_total>1 then ' ' || v_total || '개' else '' end end
            || ' · 쪽지함에서 수령하세요', p_group_id, v_note_id);
  return v_note_id;
end; $$;
grant execute on function public.send_gift_note(uuid, uuid, text, boolean, jsonb) to authenticated;

-- 개별 수령: 쪽지 안 특정 아이템(종류)을 수량만큼 인벤토리로
create or replace function public.claim_gift_item(p_note_id uuid, p_item_id text)
returns void language plpgsql security definer set search_path = public as $$
declare n public.notes; ni public.note_items; i integer;
begin
  select * into n from public.notes where id = p_note_id;
  if n.id is null or n.recipient_id <> auth.uid() or n.kind <> 'gift' then raise exception '수령할 수 없는 선물입니다.'; end if;
  select * into ni from public.note_items where note_id = p_note_id and item_id = p_item_id and not claimed limit 1 for update;
  if ni.id is null then raise exception '이미 수령했거나 없는 아이템이에요.'; end if;
  for i in 1..greatest(1, ni.qty) loop
    insert into public.user_items(user_id, item_id, item_name, source, from_user_id, from_name, from_avatar, group_id, status)
      values (auth.uid(), ni.item_id, ni.item_name, 'gift', n.sender_id, n.sender_name, n.sender_avatar, n.group_id, 'active');
  end loop;
  update public.note_items set claimed = true where id = ni.id;
  if not exists (select 1 from public.note_items where note_id = p_note_id and not claimed) then
    update public.notes set claimed = true, is_read = true where id = p_note_id;
  else
    update public.notes set is_read = true where id = p_note_id;
  end if;
end; $$;
grant execute on function public.claim_gift_item(uuid, text) to authenticated;

-- 일괄 수령: 쪽지 안 미수령 아이템 전부
create or replace function public.claim_gift_note(p_note_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select distinct item_id from public.note_items where note_id = p_note_id and not claimed loop
    perform public.claim_gift_item(p_note_id, r.item_id);
  end loop;
end; $$;
grant execute on function public.claim_gift_note(uuid) to authenticated;
