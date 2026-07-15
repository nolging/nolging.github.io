-- =============================================================
--  쪽지: 익명(지우개) 지원 + 선물에 메시지 첨부
--  - notes.anonymous 추가
--  - 익명이면 받는 사람은 발신자(id/이름/아바타)를 알 수 없음
--    (RLS 로 직접 조회 차단 + 전용 SECURITY DEFINER RPC 로만 가려서 전달)
--  - send_note / use_cassette / use_video / use_bluray / use_link / gift_item
--    에 p_anonymous 추가(=지우개 1개 소모). 커플/우정 링은 익명 불가.
--  적용: Supabase SQL Editor 에 그대로 실행.
-- =============================================================

alter table public.notes add column if not exists anonymous boolean not null default false;

-- 파라미터가 늘어나는 함수들은 기존 시그니처를 먼저 제거(오버로드 모호성 방지)
drop function if exists public.send_note(uuid, uuid, text);
drop function if exists public.use_cassette(uuid, uuid, text, text);
drop function if exists public.use_video(uuid, uuid, text, text);
drop function if exists public.use_bluray(uuid, uuid, text, text);
drop function if exists public.use_link(uuid, uuid, text, text, text);

-- 지우개 1개 소모(없으면 예외)
create or replace function public.consume_one_eraser()
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from public.user_items
   where user_id = auth.uid() and item_id = 'eraser' and status = 'active'
   order by created_at asc limit 1;
  if v_id is null then raise exception '사용할 수 있는 지우개가 없습니다.'; end if;
  update public.user_items set status = 'used', used_at = now() where id = v_id;
end;
$$;
grant execute on function public.consume_one_eraser() to authenticated;

-- 익명 쪽지는 받는 사람이 원본 행을 직접 못 읽음(전용 RPC 로만) → 완전 익명
drop policy if exists notes_select on public.notes;
create policy notes_select on public.notes
  for select to authenticated
  using ( sender_id = auth.uid() or (recipient_id = auth.uid() and anonymous = false) );

-- 받은 쪽지 목록: 익명이면 발신자 정보 가림
drop function if exists public.list_received_notes();
create or replace function public.list_received_notes()
returns table(
  id uuid, group_id uuid, sender_id uuid, recipient_id uuid,
  sender_name text, recipient_name text, sender_avatar text, recipient_avatar text,
  body text, kind text, is_read boolean, created_at timestamptz,
  item_id text, item_name text, claimed boolean, rejected boolean, media_url text, anonymous boolean, qty integer
) language sql security definer set search_path = public stable as $$
  select
    n.id, n.group_id,
    case when n.anonymous then null else n.sender_id end,
    n.recipient_id,
    case when n.anonymous then '익명' else n.sender_name end,
    n.recipient_name,
    case when n.anonymous then null else n.sender_avatar end,
    n.recipient_avatar,
    n.body, n.kind, n.is_read, n.created_at,
    n.item_id, n.item_name, n.claimed, n.rejected, n.media_url, n.anonymous, coalesce(n.qty, 1)
  from public.notes n
  where n.recipient_id = auth.uid()
  order by n.created_at desc;
$$;
grant execute on function public.list_received_notes() to authenticated;

-- ---- 일반 쪽지 --------------------------------------------------
create or replace function public.send_note(p_group_id uuid, p_recipient_id uuid, p_body text, p_anonymous boolean default false)
returns public.notes language plpgsql security definer set search_path = public as $$
declare r public.notes; v_sender text; v_recipient text; v_sender_av text; v_recipient_av text;
begin
  if not public.is_group_member(p_group_id, auth.uid()) then raise exception '그룹 멤버만 보낼 수 있습니다.'; end if;
  if p_recipient_id = auth.uid() then raise exception '자기 자신에게는 보낼 수 없습니다.'; end if;
  if not public.is_group_member(p_group_id, p_recipient_id) then raise exception '받는 사람이 그룹 멤버가 아닙니다.'; end if;
  if p_body is null or btrim(p_body) = '' then raise exception '쪽지 내용을 입력해 주세요.'; end if;
  if char_length(p_body) > 150 then raise exception '쪽지는 최대 150자까지 작성할 수 있습니다.'; end if;

  if coalesce(p_anonymous, false) then perform public.consume_one_eraser(); end if;

  v_sender    := public.notif_member_name(p_group_id, auth.uid());
  v_recipient := public.notif_member_name(p_group_id, p_recipient_id);
  select avatar_url into v_sender_av    from public.group_members where group_id = p_group_id and user_id = auth.uid();
  select avatar_url into v_recipient_av from public.group_members where group_id = p_group_id and user_id = p_recipient_id;

  insert into public.notes(group_id, sender_id, recipient_id, sender_name, recipient_name, sender_avatar, recipient_avatar, body, anonymous)
    values (p_group_id, auth.uid(), p_recipient_id, v_sender, v_recipient, v_sender_av, v_recipient_av, btrim(p_body), coalesce(p_anonymous, false))
    returning * into r;
  return r;
end;
$$;
grant execute on function public.send_note(uuid, uuid, text, boolean) to authenticated;

-- ---- 카세트 --------------------------------------------------
create or replace function public.use_cassette(p_group_id uuid, p_recipient_id uuid, p_message text, p_url text, p_anonymous boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.user_items; v_sender text; v_recipient text; v_sav text; v_rav text; v_body text;
begin
  if p_url is null or btrim(p_url) = '' then raise exception '음악 링크를 입력해 주세요.'; end if;
  select * into v_item from public.user_items where user_id = auth.uid() and item_id = 'cassette' and status = 'active' order by created_at asc limit 1;
  if v_item.id is null then raise exception '사용할 수 있는 카세트 테이프가 없습니다.'; end if;
  if not public.is_group_member(p_group_id, auth.uid()) then raise exception '그룹 멤버만 사용할 수 있습니다.'; end if;
  if p_recipient_id = auth.uid() then raise exception '자기 자신에게는 보낼 수 없습니다.'; end if;
  if not public.is_group_member(p_group_id, p_recipient_id) then raise exception '받는 사람이 그룹 멤버가 아닙니다.'; end if;

  update public.user_items set status = 'used', used_at = now() where id = v_item.id;
  if coalesce(p_anonymous, false) then perform public.consume_one_eraser(); end if;

  v_sender    := coalesce(public.notif_member_name(p_group_id, auth.uid()), '');
  v_recipient := coalesce(public.notif_member_name(p_group_id, p_recipient_id), '');
  select avatar_url into v_sav from public.group_members where group_id = p_group_id and user_id = auth.uid();
  select avatar_url into v_rav from public.group_members where group_id = p_group_id and user_id = p_recipient_id;
  v_body := coalesce(nullif(btrim(p_message), ''), '음악을 보냈어요 🎵');

  insert into public.notes(group_id, sender_id, recipient_id, sender_name, recipient_name, sender_avatar, recipient_avatar, body, kind, item_id, media_url, anonymous)
    values (p_group_id, auth.uid(), p_recipient_id, v_sender, v_recipient, v_sav, v_rav, v_body, 'cassette', 'cassette', btrim(p_url), coalesce(p_anonymous, false));

  insert into public.notifications(user_id, actor_id, type, title, body, group_id)
    values (p_recipient_id, case when coalesce(p_anonymous, false) then null else auth.uid() end, 'cassette',
            case when coalesce(p_anonymous, false) then '익명의 음악이 도착했어요' when v_sender <> '' then v_sender || ' 님이 음악을 보냈어요' else '음악이 도착했어요' end,
            '쪽지함에서 들어보세요 🎵', p_group_id);
end;
$$;
grant execute on function public.use_cassette(uuid, uuid, text, text, boolean) to authenticated;

-- ---- 비디오 --------------------------------------------------
create or replace function public.use_video(p_group_id uuid, p_recipient_id uuid, p_message text, p_url text, p_anonymous boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.user_items; v_sender text; v_recipient text; v_sav text; v_rav text; v_body text;
begin
  if p_url is null or btrim(p_url) = '' then raise exception '영상 링크를 입력해 주세요.'; end if;
  select * into v_item from public.user_items where user_id = auth.uid() and item_id = 'video' and status = 'active' order by created_at asc limit 1;
  if v_item.id is null then raise exception '사용할 수 있는 비디오 테이프가 없습니다.'; end if;
  if not public.is_group_member(p_group_id, auth.uid()) then raise exception '그룹 멤버만 사용할 수 있습니다.'; end if;
  if p_recipient_id = auth.uid() then raise exception '자기 자신에게는 보낼 수 없습니다.'; end if;
  if not public.is_group_member(p_group_id, p_recipient_id) then raise exception '받는 사람이 그룹 멤버가 아닙니다.'; end if;

  update public.user_items set status = 'used', used_at = now() where id = v_item.id;
  if coalesce(p_anonymous, false) then perform public.consume_one_eraser(); end if;

  v_sender    := coalesce(public.notif_member_name(p_group_id, auth.uid()), '');
  v_recipient := coalesce(public.notif_member_name(p_group_id, p_recipient_id), '');
  select avatar_url into v_sav from public.group_members where group_id = p_group_id and user_id = auth.uid();
  select avatar_url into v_rav from public.group_members where group_id = p_group_id and user_id = p_recipient_id;
  v_body := coalesce(nullif(btrim(p_message), ''), '영상을 보냈어요 📹');

  insert into public.notes(group_id, sender_id, recipient_id, sender_name, recipient_name, sender_avatar, recipient_avatar, body, kind, item_id, media_url, anonymous)
    values (p_group_id, auth.uid(), p_recipient_id, v_sender, v_recipient, v_sav, v_rav, v_body, 'video', 'video', btrim(p_url), coalesce(p_anonymous, false));

  insert into public.notifications(user_id, actor_id, type, title, body, group_id)
    values (p_recipient_id, case when coalesce(p_anonymous, false) then null else auth.uid() end, 'video',
            case when coalesce(p_anonymous, false) then '익명의 영상이 도착했어요' when v_sender <> '' then v_sender || ' 님이 영상을 보냈어요' else '영상이 도착했어요' end,
            '쪽지함에서 확인하세요 📹', p_group_id);
end;
$$;
grant execute on function public.use_video(uuid, uuid, text, text, boolean) to authenticated;

-- ---- 블루레이 --------------------------------------------------
create or replace function public.use_bluray(p_group_id uuid, p_recipient_id uuid, p_message text, p_url text, p_anonymous boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.user_items; v_sender text; v_recipient text; v_sav text; v_rav text; v_body text;
begin
  if p_url is null or btrim(p_url) = '' then raise exception '영상 링크를 입력해 주세요.'; end if;
  select * into v_item from public.user_items where user_id = auth.uid() and item_id = 'bluray' and status = 'active' order by created_at asc limit 1;
  if v_item.id is null then raise exception '사용할 수 있는 블루레이가 없습니다.'; end if;
  if not public.is_group_member(p_group_id, auth.uid()) then raise exception '그룹 멤버만 사용할 수 있습니다.'; end if;
  if p_recipient_id = auth.uid() then raise exception '자기 자신에게는 보낼 수 없습니다.'; end if;
  if not public.is_group_member(p_group_id, p_recipient_id) then raise exception '받는 사람이 그룹 멤버가 아닙니다.'; end if;

  update public.user_items set status = 'used', used_at = now() where id = v_item.id;
  if coalesce(p_anonymous, false) then perform public.consume_one_eraser(); end if;

  v_sender    := coalesce(public.notif_member_name(p_group_id, auth.uid()), '');
  v_recipient := coalesce(public.notif_member_name(p_group_id, p_recipient_id), '');
  select avatar_url into v_sav from public.group_members where group_id = p_group_id and user_id = auth.uid();
  select avatar_url into v_rav from public.group_members where group_id = p_group_id and user_id = p_recipient_id;
  v_body := coalesce(nullif(btrim(p_message), ''), '영상을 보냈어요 💿');

  insert into public.notes(group_id, sender_id, recipient_id, sender_name, recipient_name, sender_avatar, recipient_avatar, body, kind, item_id, media_url, anonymous)
    values (p_group_id, auth.uid(), p_recipient_id, v_sender, v_recipient, v_sav, v_rav, v_body, 'bluray', 'bluray', btrim(p_url), coalesce(p_anonymous, false));

  insert into public.notifications(user_id, actor_id, type, title, body, group_id)
    values (p_recipient_id, case when coalesce(p_anonymous, false) then null else auth.uid() end, 'bluray',
            case when coalesce(p_anonymous, false) then '익명의 영상이 도착했어요' when v_sender <> '' then v_sender || ' 님이 영상을 보냈어요' else '영상이 도착했어요' end,
            '쪽지함에서 확인하세요 💿', p_group_id);
end;
$$;
grant execute on function public.use_bluray(uuid, uuid, text, text, boolean) to authenticated;

-- ---- 선물 상자(링크) --------------------------------------------------
create or replace function public.use_link(p_group_id uuid, p_recipient_id uuid, p_message text, p_url text, p_label text default null, p_anonymous boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.user_items; v_sender text; v_recipient text; v_sav text; v_rav text; v_body text; v_label text;
begin
  if p_url is null or btrim(p_url) = '' then raise exception '링크를 입력해 주세요.'; end if;
  select * into v_item from public.user_items where user_id = auth.uid() and item_id = 'link' and status = 'active' order by created_at asc limit 1;
  if v_item.id is null then raise exception '사용할 수 있는 선물 상자가 없습니다.'; end if;
  if not public.is_group_member(p_group_id, auth.uid()) then raise exception '그룹 멤버만 사용할 수 있습니다.'; end if;
  if p_recipient_id = auth.uid() then raise exception '자기 자신에게는 보낼 수 없습니다.'; end if;
  if not public.is_group_member(p_group_id, p_recipient_id) then raise exception '받는 사람이 그룹 멤버가 아닙니다.'; end if;

  update public.user_items set status = 'used', used_at = now() where id = v_item.id;
  if coalesce(p_anonymous, false) then perform public.consume_one_eraser(); end if;

  v_sender    := coalesce(public.notif_member_name(p_group_id, auth.uid()), '');
  v_recipient := coalesce(public.notif_member_name(p_group_id, p_recipient_id), '');
  select avatar_url into v_sav from public.group_members where group_id = p_group_id and user_id = auth.uid();
  select avatar_url into v_rav from public.group_members where group_id = p_group_id and user_id = p_recipient_id;
  v_body  := coalesce(nullif(btrim(p_message), ''), '선물 상자를 보냈어요 🎁');
  v_label := coalesce(nullif(btrim(p_label), ''), '선물 상자 열기');

  insert into public.notes(group_id, sender_id, recipient_id, sender_name, recipient_name, sender_avatar, recipient_avatar, body, kind, item_id, item_name, media_url, anonymous)
    values (p_group_id, auth.uid(), p_recipient_id, v_sender, v_recipient, v_sav, v_rav, v_body, 'link', 'link', v_label, btrim(p_url), coalesce(p_anonymous, false));

  insert into public.notifications(user_id, actor_id, type, title, body, group_id)
    values (p_recipient_id, case when coalesce(p_anonymous, false) then null else auth.uid() end, 'link',
            case when coalesce(p_anonymous, false) then '익명의 선물 상자가 도착했어요' when v_sender <> '' then v_sender || ' 님이 선물 상자를 보냈어요' else '선물 상자가 도착했어요' end,
            '쪽지함에서 확인하세요 🎁', p_group_id);
end;
$$;
grant execute on function public.use_link(uuid, uuid, text, text, text, boolean) to authenticated;

-- ---- 아이템 선물(내 보유분에서 소모 + 메시지 첨부 + 익명) ------------------
--  gift_item(츄르로 구매해 선물)과 달리, 쪽지 작성 화면의 "아이템 선물"은
--  내 인벤토리에 있는 아이템을 꺼내 보낸다(보유분 소모, 츄르 차감 없음).
create or replace function public.gift_owned_item(p_item_id text, p_group_id uuid, p_recipient_id uuid, p_qty integer default 1, p_message text default null, p_anonymous boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare it public.store_items; v_sender text; v_recipient text; v_sav text; v_rav text; v_note_id uuid; v_qty integer; i integer; v_body text; v_anon boolean; v_ids uuid[]; v_name text;
begin
  v_anon := coalesce(p_anonymous, false);
  v_qty := greatest(1, coalesce(p_qty, 1));
  select * into it from public.store_items where id = p_item_id;
  v_name := coalesce(it.name, p_item_id);

  if not public.is_group_member(p_group_id, auth.uid()) then raise exception '그룹 멤버만 선물할 수 있습니다.'; end if;
  if p_recipient_id = auth.uid() then raise exception '자기 자신에게는 선물할 수 없습니다.'; end if;
  if not public.is_group_member(p_group_id, p_recipient_id) then raise exception '받는 사람이 그룹 멤버가 아닙니다.'; end if;

  -- 소원권: 선물받아 수신자가 정해진 아이템 → 재선물 불가
  if p_item_id = 'wish' then raise exception '선물받은 소원권은 다시 선물할 수 없어요.'; end if;

  -- 프리미엄 아이템은 프리미엄 회원(티어별 커플/우정)에게만 선물 가능
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

  -- 소모할 보유 아이템(active) 선택
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

  insert into public.notifications(user_id, actor_id, type, title, body, group_id, note_id)
    values (p_recipient_id, case when v_anon then null else auth.uid() end, 'gift',
            case when v_anon then '익명의 선물이 도착했어요' else v_sender || ' 님이 선물을 보냈어요' end,
            v_name || case when v_qty > 1 then ' ' || v_qty || '개' else '' end || ' · 쪽지함에서 수령하세요', p_group_id, v_note_id);
end;
$$;
grant execute on function public.gift_owned_item(text, uuid, uuid, integer, text, boolean) to authenticated;
