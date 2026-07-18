-- =============================================================
--  푸시 알림 템플릿 연결: 아이템 선물
--   · 대상 함수: gift_item(상점 선물), gift_owned_item(인벤토리 선물), send_gift_note(묶음 선물)
--   · 알림 문구를 notif_templates('gift' / 'gift_anon') 로 렌더(없으면 기존 문구 폴백).
--  적용: notif-templates.sql 실행 후 이 파일을 Supabase SQL Editor 에 실행.
-- =============================================================

insert into public.notif_templates (key, label, title, body, vars, sort_order) values
  ('gift',      '아이템 선물',        '{actor} 님이 선물을 보냈어요', '{items} · 쪽지함에서 수령하세요', '{actor} = 보낸 사람, {items} = 선물 내용(예: 명찰 2개 / 명찰 외 1종)', 60),
  ('gift_anon', '아이템 선물(익명)',  '익명의 선물이 도착했어요',     '{items} · 쪽지함에서 수령하세요', '{items} = 선물 내용(예: 명찰 2개 / 명찰 외 1종)', 61)
on conflict (key) do update set label = excluded.label, vars = excluded.vars, sort_order = excluded.sort_order;

-- ── 상점 선물 (gift_item) ──────────────────────────────────
create or replace function public.gift_item(p_item_id text, p_group_id uuid, p_recipient_id uuid, p_qty integer default 1, p_message text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare it public.store_items; v_balance integer; v_sender text; v_recipient text; v_sender_av text; v_recipient_av text; v_note_id uuid; v_qty integer; v_total integer; i integer; v_body text; v_items text; v_nt_t text; v_nt_b text;
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

  v_items := it.name || case when v_qty > 1 then ' ' || v_qty || '개' else '' end;
  select r.title, r.body into v_nt_t, v_nt_b from public.notif_render('gift', jsonb_build_object('actor', v_sender, 'items', v_items)) r;
  insert into public.notifications(user_id, actor_id, type, title, body, group_id, note_id)
    values (p_recipient_id, auth.uid(), 'gift',
            coalesce(v_nt_t, v_sender || ' 님이 선물을 보냈어요'),
            coalesce(v_nt_b, v_items || ' · 쪽지함에서 수령하세요'), p_group_id, v_note_id);

  return v_balance - v_total;
end;
$$;
grant execute on function public.gift_item(text, uuid, uuid, integer, text) to authenticated;

-- ── 인벤토리 선물 (gift_owned_item) ────────────────────────
create or replace function public.gift_owned_item(p_item_id text, p_group_id uuid, p_recipient_id uuid, p_qty integer default 1, p_message text default null, p_anonymous boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare it public.store_items; v_sender text; v_recipient text; v_sav text; v_rav text; v_note_id uuid; v_qty integer; i integer; v_body text; v_anon boolean; v_ids uuid[]; v_name text; v_items text; v_nt_t text; v_nt_b text;
begin
  v_anon := coalesce(p_anonymous, false);
  v_qty := greatest(1, coalesce(p_qty, 1));
  select * into it from public.store_items where id = p_item_id;
  v_name := coalesce(it.name, p_item_id);

  if not public.is_group_member(p_group_id, auth.uid()) then raise exception '그룹 멤버만 선물할 수 있습니다.'; end if;
  if p_recipient_id = auth.uid() then raise exception '자기 자신에게는 선물할 수 없습니다.'; end if;
  if not public.is_group_member(p_group_id, p_recipient_id) then raise exception '받는 사람이 그룹 멤버가 아닙니다.'; end if;

  if p_item_id = 'wish' then raise exception '선물받은 소원권은 다시 선물할 수 없어요.'; end if;

  if coalesce(it.premium, false) then
    if it.tier = 'couple' then
      if not exists (select 1 from public.user_items where user_id = p_recipient_id and item_id = 'couple-ring' and status = 'used') then
        raise exception '커플 회원에게만 선물할 수 있는 아이템이에요.'; end if;
    elsif it.tier = 'friend' then
      if not exists (select 1 from public.user_items where user_id = p_recipient_id and item_id = 'friend-ring' and status = 'used') then
        raise exception '우정 회원에게만 선물할 수 있는 아이템이에요.'; end if;
    else
      if not exists (select 1 from public.user_items where user_id = p_recipient_id and item_id in ('couple-ring','friend-ring') and status = 'used') then
        raise exception '프리미엄 회원에게만 선물할 수 있는 아이템이에요.'; end if;
    end if;
  end if;

  select array_agg(id) into v_ids from (
    select id from public.user_items
     where user_id = auth.uid() and item_id = p_item_id and status = 'active'
     order by created_at asc limit v_qty
  ) t;
  if v_ids is null or array_length(v_ids, 1) < v_qty then raise exception '선물할 아이템이 부족해요.'; end if;

  if p_item_id = 'couple-ring' then
    if v_qty > 1 then raise exception '커플 링은 한 개만 선물할 수 있어요.'; end if;
    if exists (select 1 from public.user_items where user_id = p_recipient_id and item_id = 'couple-ring') then
      raise exception '상대가 이미 커플 링을 보유하고 있어요.'; end if;
  end if;

  if v_anon then perform public.consume_one_eraser(); end if;

  update public.user_items set status = 'used', used_at = now() where id = any(v_ids);

  v_sender    := public.notif_member_name(p_group_id, auth.uid());
  v_recipient := public.notif_member_name(p_group_id, p_recipient_id);
  select avatar_url into v_sav from public.group_members where group_id = p_group_id and user_id = auth.uid();
  select avatar_url into v_rav from public.group_members where group_id = p_group_id and user_id = p_recipient_id;
  v_body := coalesce(nullif(btrim(p_message), ''), v_name);

  for i in 1..v_qty loop
    insert into public.item_gifts(group_id, sender_id, recipient_id, item_id, item_name, sender_name, recipient_name)
      values (p_group_id, auth.uid(), p_recipient_id, p_item_id, v_name, v_sender, v_recipient);
    insert into public.notes(group_id, sender_id, recipient_id, sender_name, recipient_name, sender_avatar, recipient_avatar, body, kind, item_id, item_name, claimed, rejected, anonymous)
      values (p_group_id, auth.uid(), p_recipient_id, v_sender, v_recipient, v_sav, v_rav, v_body, 'gift', p_item_id, v_name, false, false, v_anon)
      returning id into v_note_id;
  end loop;

  v_items := v_name || case when v_qty > 1 then ' ' || v_qty || '개' else '' end;
  select r.title, r.body into v_nt_t, v_nt_b from public.notif_render(case when v_anon then 'gift_anon' else 'gift' end, jsonb_build_object('actor', v_sender, 'items', v_items)) r;
  insert into public.notifications(user_id, actor_id, type, title, body, group_id, note_id)
    values (p_recipient_id, case when v_anon then null else auth.uid() end, 'gift',
            coalesce(v_nt_t, case when v_anon then '익명의 선물이 도착했어요' else v_sender || ' 님이 선물을 보냈어요' end),
            coalesce(v_nt_b, v_items || ' · 쪽지함에서 수령하세요'), p_group_id, v_note_id);
end;
$$;
grant execute on function public.gift_owned_item(text, uuid, uuid, integer, text, boolean) to authenticated;

-- ── 묶음 선물 (send_gift_note) ─────────────────────────────
create or replace function public.send_gift_note(
  p_group_id uuid, p_recipient_id uuid, p_message text, p_anonymous boolean, p_gifts jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_sender text; v_recipient text; v_sav text; v_rav text; v_note_id uuid;
        v_anon boolean; g jsonb; v_item_id text; v_qty integer; it public.store_items;
        v_name text; v_ids uuid[]; v_count integer := 0; v_first_name text; v_total integer := 0; i integer;
        v_items text; v_nt_t text; v_nt_b text;
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

  v_items := case when v_count > 1 then v_first_name || ' 외 ' || (v_count-1) || '종'
                  else v_first_name || case when v_total>1 then ' ' || v_total || '개' else '' end end;
  select r.title, r.body into v_nt_t, v_nt_b from public.notif_render(case when v_anon then 'gift_anon' else 'gift' end, jsonb_build_object('actor', v_sender, 'items', v_items)) r;
  insert into public.notifications(user_id, actor_id, type, title, body, group_id, note_id)
    values (p_recipient_id, case when v_anon then null else auth.uid() end, 'gift',
            coalesce(v_nt_t, case when v_anon then '익명의 선물이 도착했어요' else v_sender || ' 님이 선물을 보냈어요' end),
            coalesce(v_nt_b, v_items || ' · 쪽지함에서 수령하세요'), p_group_id, v_note_id);
  return v_note_id;
end; $$;
grant execute on function public.send_gift_note(uuid, uuid, text, boolean, jsonb) to authenticated;
