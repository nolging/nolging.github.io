-- =============================================================
--  푸시 알림 템플릿 연결: 소원권 · 커플 링(도착/수락/거절) · 우정 링 · 리마인더 · 칭찬 스티커판 완성
--   · 문구/이모지를 notif_templates 로 관리(없으면 기존 문구 폴백).
--   · 칭찬 스티커판 완성 알림은 type 을 'gift'→'praise' 로 바꿔 별도 이모지/이동 지원.
--  적용: notif-templates.sql / notif-emoji.sql 실행 후 이 파일을 Supabase SQL Editor 에 실행.
-- =============================================================

insert into public.notif_templates (key, label, title, body, vars, emoji, sort_order) values
  ('wish',               '소원권 사용',        '{actor} 님이 소원을 빌었어요',        '{wish}',                      '{actor} = 소원 빈 사람, {wish} = 소원 내용', '🌟', 90),
  ('couple_ring',        '커플 링 도착',       '{actor} 님이 커플 링을 보냈어요',      '쪽지함에서 확인하세요',        '{actor} = 보낸 사람', '💍', 91),
  ('couple_ring_accept', '커플 링 수락',       '{actor} 님과 커플 링을 나눠 꼈어요',   '이제 프리미엄 그룹이에요 💍',   '{actor} = 수락한 사람 · (알림센터 이모지는 커플 링 도착과 공유)', '💍', 92),
  ('couple_ring_reject', '커플 링 거절',       '{actor} 님이 커플 링을 거절했어요',    '커플 링은 다시 사용할 수 있어요', '{actor} = 거절한 사람 · (알림센터 이모지는 커플 링 도착과 공유)', '💍', 93),
  ('friend_ring',        '우정 링 도착',       '{actor} 님이 우정 링을 보냈어요',      '쪽지함에서 확인하세요 🤝',      '{actor} = 보낸 사람', '🤝', 94),
  ('reminder',           '약속 리마인더',      '[{title}] {when}',                    '준비해 주세요',                '{title} = 항목 제목, {when} = 약속 시각', '⏰', 95),
  ('praise',             '칭찬 스티커판 완성',  '{actor} 님이 칭찬 스티커판을 완성했어요', '칭찬 스티커에서 소원권을 수령하세요 🎉', '{actor} = 완성한 짝꿍', '🎉', 96)
on conflict (key) do update set label = excluded.label, vars = excluded.vars, sort_order = excluded.sort_order;

-- ── 소원권 사용(wish) ──────────────────────────────────────
create or replace function public.use_wish(p_from_user_id uuid, p_wish text)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.user_items; v_sender text; v_recipient text; v_sav text; v_rav text; v_nt_t text; v_nt_b text;
begin
  if p_wish is null or btrim(p_wish) = '' then raise exception '소원을 입력해 주세요.'; end if;
  if char_length(p_wish) > 300 then raise exception '소원이 너무 길어요.'; end if;

  select * into v_item from public.user_items
   where user_id = auth.uid() and item_id = 'wish' and status = 'active' and from_user_id = p_from_user_id
   order by created_at asc limit 1;
  if v_item.id is null then raise exception '사용할 수 있는 소원권이 없습니다.'; end if;

  update public.user_items set status = 'used', used_at = now() where id = v_item.id;

  v_sender    := coalesce(public.notif_member_name(v_item.group_id, auth.uid()), '');
  v_recipient := coalesce(public.notif_member_name(v_item.group_id, p_from_user_id), '');
  select avatar_url into v_sav from public.group_members where group_id = v_item.group_id and user_id = auth.uid();
  select avatar_url into v_rav from public.group_members where group_id = v_item.group_id and user_id = p_from_user_id;

  insert into public.notes(group_id, sender_id, recipient_id, sender_name, recipient_name, sender_avatar, recipient_avatar, body, kind)
    values (v_item.group_id, auth.uid(), p_from_user_id, v_sender, v_recipient, v_sav, v_rav, btrim(p_wish), 'wish');

  select nr.title, nr.body into v_nt_t, v_nt_b from public.notif_render('wish', jsonb_build_object('actor', v_sender, 'wish', btrim(p_wish))) nr;
  insert into public.notifications(user_id, actor_id, type, title, body, group_id)
    values (p_from_user_id, auth.uid(), 'wish',
            coalesce(v_nt_t, case when v_sender <> '' then v_sender || ' 님이 소원을 빌었어요' else '소원이 도착했어요' end),
            coalesce(v_nt_b, btrim(p_wish)), v_item.group_id);
end;
$$;
grant execute on function public.use_wish(uuid, text) to authenticated;

-- ── 커플 링 보내기(도착) ──────────────────────────────────
create or replace function public.use_couple_ring(p_group_id uuid, p_recipient_id uuid, p_message text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.user_items; v_cnt int; v_sender text; v_recipient text; v_sav text; v_rav text; v_body text; v_note_id uuid; v_nt_t text; v_nt_b text;
begin
  select * into v_item from public.user_items
   where user_id = auth.uid() and item_id = 'couple-ring' and status = 'active'
   order by created_at asc limit 1;
  if v_item.id is null then raise exception '사용할 수 있는 커플 링이 없습니다.'; end if;

  if not public.is_group_member(p_group_id, auth.uid()) then
    raise exception '그룹 멤버만 사용할 수 있습니다.'; end if;
  select count(*) into v_cnt from public.group_members where group_id = p_group_id;
  if v_cnt <> 2 then raise exception '멤버가 2명인 그룹에서만 나눠 낄 수 있어요.'; end if;
  if p_recipient_id = auth.uid() or not public.is_group_member(p_group_id, p_recipient_id) then
    raise exception '상대를 찾을 수 없습니다.'; end if;
  if exists (select 1 from public.user_items
             where user_id = auth.uid() and item_id = 'couple-ring'
               and status in ('used', 'pending') and group_id = p_group_id) then
    raise exception '이미 이 그룹에 커플 링을 보냈거나 끼고 있어요.'; end if;

  update public.user_items set status = 'pending', group_id = p_group_id, used_at = null where id = v_item.id;

  v_sender    := coalesce(public.notif_member_name(p_group_id, auth.uid()), '');
  v_recipient := coalesce(public.notif_member_name(p_group_id, p_recipient_id), '');
  select avatar_url into v_sav from public.group_members where group_id = p_group_id and user_id = auth.uid();
  select avatar_url into v_rav from public.group_members where group_id = p_group_id and user_id = p_recipient_id;
  v_body := coalesce(nullif(btrim(p_message), ''), '커플 링을 함께 끼자고 보냈어요 💍');

  insert into public.notes(group_id, sender_id, recipient_id, sender_name, recipient_name, sender_avatar, recipient_avatar, body, kind, item_id, claimed, rejected)
    values (p_group_id, auth.uid(), p_recipient_id, v_sender, v_recipient, v_sav, v_rav, v_body, 'couple_ring', 'couple-ring', false, false)
    returning id into v_note_id;

  select nr.title, nr.body into v_nt_t, v_nt_b from public.notif_render('couple_ring', jsonb_build_object('actor', v_sender)) nr;
  insert into public.notifications(user_id, actor_id, type, title, body, group_id, note_id)
    values (p_recipient_id, auth.uid(), 'couple_ring',
            coalesce(v_nt_t, case when v_sender <> '' then v_sender || ' 님이 커플 링을 보냈어요' else '커플 링이 도착했어요' end),
            coalesce(v_nt_b, '쪽지함에서 확인하세요'), p_group_id, v_note_id);
end;
$$;
grant execute on function public.use_couple_ring(uuid, uuid, text) to authenticated;

-- ── 커플 링 수락 ──────────────────────────────────────────
create or replace function public.claim_couple_ring(p_note_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare n public.notes; v_actor text; v_leftover public.user_items; v_price integer; v_nt_t text; v_nt_b text;
begin
  select * into n from public.notes where id = p_note_id;
  if n.id is null or n.recipient_id <> auth.uid() or n.kind <> 'couple_ring' then
    raise exception '수령할 수 없는 선물입니다.'; end if;
  if n.claimed then raise exception '이미 수령했어요.'; end if;
  if n.rejected then raise exception '이미 거절한 선물입니다.'; end if;

  update public.notes set claimed = true, is_read = true where id = n.id;

  update public.user_items set status = 'used', used_at = now()
   where user_id = n.sender_id and item_id = 'couple-ring' and status = 'pending' and group_id = n.group_id;

  if not exists (select 1 from public.user_items
                 where user_id = auth.uid() and item_id = 'couple-ring' and status = 'used' and group_id = n.group_id) then
    insert into public.user_items(user_id, item_id, item_name, source, from_user_id, from_name, from_avatar, group_id, status, used_at)
      values (auth.uid(), 'couple-ring', '커플 링', 'gift', n.sender_id, n.sender_name, n.sender_avatar, n.group_id, 'used', now());
  end if;

  for v_leftover in
    select * from public.user_items
     where user_id = auth.uid() and item_id = 'couple-ring' and status = 'active'
  loop
    select price into v_price from public.store_items where id = 'couple-ring';
    insert into public.coin_ledger(user_id, delta, reason, ref_type)
      values (auth.uid(), coalesce(v_price, 5000), '커플 링 환불', 'refund');
    delete from public.user_items where id = v_leftover.id;
  end loop;

  v_actor := coalesce(public.notif_member_name(n.group_id, auth.uid()), '');
  select nr.title, nr.body into v_nt_t, v_nt_b from public.notif_render('couple_ring_accept', jsonb_build_object('actor', v_actor)) nr;
  insert into public.notifications(user_id, actor_id, type, title, body, group_id, note_id)
    values (n.sender_id, auth.uid(), 'couple_ring',
            coalesce(v_nt_t, case when v_actor <> '' then v_actor || ' 님과 커플 링을 나눠 꼈어요' else '커플 링을 함께 끼게 됐어요' end),
            coalesce(v_nt_b, '이제 프리미엄 그룹이에요 💍'), n.group_id, n.id);
end;
$$;
grant execute on function public.claim_couple_ring(uuid) to authenticated;

-- ── 커플 링 거절 ──────────────────────────────────────────
create or replace function public.reject_couple_ring(p_note_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare n public.notes; v_actor text; v_nt_t text; v_nt_b text;
begin
  select * into n from public.notes where id = p_note_id;
  if n.id is null or n.recipient_id <> auth.uid() or n.kind <> 'couple_ring' then
    raise exception '처리할 수 없는 선물입니다.'; end if;
  if n.claimed then raise exception '이미 수령한 선물이라 거절할 수 없어요.'; end if;
  if n.rejected then raise exception '이미 거절했어요.'; end if;

  update public.notes set rejected = true, is_read = true where id = n.id;

  update public.user_items set status = 'active', group_id = null, used_at = null
   where user_id = n.sender_id and item_id = 'couple-ring' and status = 'pending' and group_id = n.group_id;

  v_actor := coalesce(public.notif_member_name(n.group_id, auth.uid()), '');
  select nr.title, nr.body into v_nt_t, v_nt_b from public.notif_render('couple_ring_reject', jsonb_build_object('actor', v_actor)) nr;
  insert into public.notifications(user_id, actor_id, type, title, body, group_id, note_id)
    values (n.sender_id, auth.uid(), 'couple_ring',
            coalesce(v_nt_t, case when v_actor <> '' then v_actor || ' 님이 커플 링을 거절했어요' else '커플 링이 거절됐어요' end),
            coalesce(v_nt_b, '커플 링은 다시 사용할 수 있어요'), n.group_id, n.id);
end;
$$;
grant execute on function public.reject_couple_ring(uuid) to authenticated;

-- ── 우정 링 보내기(도착) ──────────────────────────────────
create or replace function public.use_friend_ring(p_group_id uuid, p_message text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.user_items; v_cnt int; v_sender text; v_sav text; v_body text;
        m record; v_rname text; v_rav text; v_note_id uuid; v_nt_t text; v_nt_b text;
begin
  select * into v_item from public.user_items
   where user_id = auth.uid() and item_id = 'friend-ring' and status = 'active'
   order by created_at asc limit 1;
  if v_item.id is null then raise exception '사용할 수 있는 우정 링이 없습니다.'; end if;

  if not public.is_group_member(p_group_id, auth.uid()) then raise exception '그룹 멤버만 사용할 수 있습니다.'; end if;
  select count(*) into v_cnt from public.group_members where group_id = p_group_id;
  if v_cnt < 2 then raise exception '멤버가 2명 이상인 그룹에서만 사용할 수 있어요.'; end if;
  if public.is_friend_group(p_group_id) then raise exception '이미 우정 링이 적용된 그룹이에요.'; end if;

  update public.user_items set status = 'used', group_id = p_group_id, used_at = now() where id = v_item.id;

  v_sender := coalesce(public.notif_member_name(p_group_id, auth.uid()), '');
  select avatar_url into v_sav from public.group_members where group_id = p_group_id and user_id = auth.uid();
  v_body := coalesce(nullif(btrim(p_message), ''), '우정 링을 함께 끼자고 보냈어요 🤝');

  select nr.title, nr.body into v_nt_t, v_nt_b from public.notif_render('friend_ring', jsonb_build_object('actor', v_sender)) nr;

  for m in select user_id from public.group_members where group_id = p_group_id and user_id <> auth.uid()
  loop
    v_rname := coalesce(public.notif_member_name(p_group_id, m.user_id), '');
    select avatar_url into v_rav from public.group_members where group_id = p_group_id and user_id = m.user_id;
    insert into public.notes(group_id, sender_id, recipient_id, sender_name, recipient_name, sender_avatar, recipient_avatar, body, kind, item_id, claimed, rejected)
      values (p_group_id, auth.uid(), m.user_id, v_sender, v_rname, v_sav, v_rav, v_body, 'friend_ring', 'friend-ring', false, false)
      returning id into v_note_id;
    insert into public.notifications(user_id, actor_id, type, title, body, group_id, note_id)
      values (m.user_id, auth.uid(), 'friend_ring',
              coalesce(v_nt_t, case when v_sender <> '' then v_sender || ' 님이 우정 링을 보냈어요' else '우정 링이 도착했어요' end),
              coalesce(v_nt_b, '쪽지함에서 확인하세요 🤝'), p_group_id, v_note_id);
  end loop;
end;
$$;
grant execute on function public.use_friend_ring(uuid, text) to authenticated;

-- ── 약속 리마인더 ─────────────────────────────────────────
create or replace function public.dispatch_due_reminders()
returns integer language plpgsql security definer set search_path = public as $$
declare t record; v_title text; v_when text; v_nt_t text; v_nt_b text; n int := 0;
begin
  for t in
    select * from public.tasks
    where remind_at is not null and reminded = false
      and remind_at <= now() and status = 'accepted'
  loop
    v_when  := to_char(t.scheduled_at at time zone 'Asia/Seoul', 'MM월 DD일 HH24:MI');
    v_title := '[' || t.title || '] ' || v_when;
    select nr.title, nr.body into v_nt_t, v_nt_b from public.notif_render('reminder', jsonb_build_object('title', t.title, 'when', v_when)) nr;

    insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id)
    select p.user_id, null::uuid, 'reminder', coalesce(v_nt_t, v_title), coalesce(v_nt_b, '준비해 주세요'), t.group_id, t.id
    from public.task_participants p where p.task_id = t.id;

    if not found and t.assignee_id is not null then
      insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id)
      values (t.assignee_id, null::uuid, 'reminder', coalesce(v_nt_t, v_title), coalesce(v_nt_b, '준비해 주세요'), t.group_id, t.id);
    end if;

    update public.tasks set reminded = true where id = t.id;
    n := n + 1;
  end loop;
  return n;
end; $$;

-- ── 칭찬 스티커판 완성(type: gift → praise) ────────────────
create or replace function public.praise_place(p_group_id uuid, p_owner_id uuid, p_slot int, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_board public.praise_boards; v_count int; v_pactor text; v_nt_t text; v_nt_b text;
begin
  if not public.is_couple_group(p_group_id) then raise exception '커플 그룹이 아니에요.'; end if;
  if not public.is_group_member(p_group_id, v_uid) then raise exception '그룹 멤버가 아니에요.'; end if;
  if not public.is_group_member(p_group_id, p_owner_id) then raise exception '대상이 그룹 멤버가 아니에요.'; end if;
  if p_owner_id = v_uid then raise exception '내 칭찬판엔 붙일 수 없어요.'; end if;
  if p_slot < 0 or p_slot > 19 then raise exception '잘못된 칸이에요.'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception '칭찬 내용을 입력해 주세요.'; end if;

  select * into v_board from public.praise_boards
    where owner_id = p_owner_id and claimed_at is null
    order by started_at desc limit 1 for update;
  if v_board.id is null then raise exception '상대가 아직 스티커판을 준비하지 않았어요.'; end if;
  if v_board.completed_at is not null then raise exception '이미 완성된 스티커판이에요.'; end if;

  insert into public.praise_stickers(board_id, group_id, owner_id, slot_index, reason, from_id)
    values (v_board.id, p_group_id, p_owner_id, p_slot, left(btrim(p_reason), 100), v_uid);

  select count(*) into v_count from public.praise_stickers where board_id = v_board.id;
  if v_count >= 20 then
    update public.praise_boards
      set completed_at = now(), group_id = p_group_id, gifter_id = v_uid
      where id = v_board.id;
    v_pactor := coalesce(public.notif_member_name(p_group_id, v_uid), '');
    select nr.title, nr.body into v_nt_t, v_nt_b from public.notif_render('praise', jsonb_build_object('actor', v_pactor)) nr;
    insert into public.notifications(user_id, actor_id, type, title, body, group_id)
      values (p_owner_id, v_uid, 'praise',
              coalesce(v_nt_t, v_pactor || ' 님이 칭찬 스티커판을 완성했어요'),
              coalesce(v_nt_b, '칭찬 스티커에서 소원권을 수령하세요 🎉'), p_group_id);
  end if;
end;
$$;
grant execute on function public.praise_place(uuid, uuid, int, text) to authenticated;
