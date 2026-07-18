-- =============================================================
--  푸시 알림 템플릿 연결: 아이템 사용(음악/영상/블루레이/선물 상자)
--   · 대상: use_cassette(음악) · use_video(영상) · use_bluray(영상) · use_link(선물 상자)
--   · 각각 일반/익명 템플릿 사용(없으면 기존 문구 폴백). 본문은 타입별 안내 문구.
--  적용: notif-templates.sql 실행 후 이 파일을 Supabase SQL Editor 에 실행.
-- =============================================================

insert into public.notif_templates (key, label, title, body, vars, sort_order) values
  ('cassette',      '음악 도착',              '{actor} 님이 음악을 보냈어요',        '쪽지함에서 들어보세요 🎵', '{actor} = 보낸 사람', 70),
  ('cassette_anon', '음악 도착(익명)',        '익명의 음악이 도착했어요',            '쪽지함에서 들어보세요 🎵', '(치환자 없음)', 71),
  ('video',         '영상 도착(비디오)',       '{actor} 님이 영상을 보냈어요',        '쪽지함에서 확인하세요 📹', '{actor} = 보낸 사람', 72),
  ('video_anon',    '영상 도착(비디오·익명)',  '익명의 영상이 도착했어요',            '쪽지함에서 확인하세요 📹', '(치환자 없음)', 73),
  ('bluray',        '영상 도착(블루레이)',     '{actor} 님이 영상을 보냈어요',        '쪽지함에서 확인하세요 💿', '{actor} = 보낸 사람', 74),
  ('bluray_anon',   '영상 도착(블루레이·익명)', '익명의 영상이 도착했어요',           '쪽지함에서 확인하세요 💿', '(치환자 없음)', 75),
  ('link',          '선물 상자 도착',          '{actor} 님이 선물 상자를 보냈어요',   '쪽지함에서 확인하세요 🎁', '{actor} = 보낸 사람', 76),
  ('link_anon',     '선물 상자 도착(익명)',    '익명의 선물 상자가 도착했어요',       '쪽지함에서 확인하세요 🎁', '(치환자 없음)', 77)
on conflict (key) do update set label = excluded.label, vars = excluded.vars, sort_order = excluded.sort_order;

-- ── 음악(카세트) ──────────────────────────────────────────
create or replace function public.use_cassette(p_group_id uuid, p_recipient_id uuid, p_message text, p_url text, p_anonymous boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.user_items; v_sender text; v_recipient text; v_sav text; v_rav text; v_body text; v_anon boolean; v_nt_t text; v_nt_b text;
begin
  v_anon := coalesce(p_anonymous, false);
  if p_url is null or btrim(p_url) = '' then raise exception '음악 링크를 입력해 주세요.'; end if;
  select * into v_item from public.user_items where user_id = auth.uid() and item_id = 'cassette' and status = 'active' order by created_at asc limit 1;
  if v_item.id is null then raise exception '사용할 수 있는 카세트 테이프가 없습니다.'; end if;
  if not public.is_group_member(p_group_id, auth.uid()) then raise exception '그룹 멤버만 사용할 수 있습니다.'; end if;
  if p_recipient_id = auth.uid() then raise exception '자기 자신에게는 보낼 수 없습니다.'; end if;
  if not public.is_group_member(p_group_id, p_recipient_id) then raise exception '받는 사람이 그룹 멤버가 아닙니다.'; end if;

  update public.user_items set status = 'used', used_at = now() where id = v_item.id;
  if v_anon then perform public.consume_one_eraser(); end if;

  v_sender    := coalesce(public.notif_member_name(p_group_id, auth.uid()), '');
  v_recipient := coalesce(public.notif_member_name(p_group_id, p_recipient_id), '');
  select avatar_url into v_sav from public.group_members where group_id = p_group_id and user_id = auth.uid();
  select avatar_url into v_rav from public.group_members where group_id = p_group_id and user_id = p_recipient_id;
  v_body := coalesce(nullif(btrim(p_message), ''), '음악을 보냈어요 🎵');

  insert into public.notes(group_id, sender_id, recipient_id, sender_name, recipient_name, sender_avatar, recipient_avatar, body, kind, item_id, media_url, anonymous)
    values (p_group_id, auth.uid(), p_recipient_id, v_sender, v_recipient, v_sav, v_rav, v_body, 'cassette', 'cassette', btrim(p_url), v_anon);

  select r.title, r.body into v_nt_t, v_nt_b from public.notif_render(case when v_anon then 'cassette_anon' else 'cassette' end, jsonb_build_object('actor', v_sender)) r;
  insert into public.notifications(user_id, actor_id, type, title, body, group_id)
    values (p_recipient_id, case when v_anon then null else auth.uid() end, 'cassette',
            coalesce(v_nt_t, case when v_anon then '익명의 음악이 도착했어요' when v_sender <> '' then v_sender || ' 님이 음악을 보냈어요' else '음악이 도착했어요' end),
            coalesce(v_nt_b, '쪽지함에서 들어보세요 🎵'), p_group_id);
end;
$$;
grant execute on function public.use_cassette(uuid, uuid, text, text, boolean) to authenticated;

-- ── 영상(비디오) ──────────────────────────────────────────
create or replace function public.use_video(p_group_id uuid, p_recipient_id uuid, p_message text, p_url text, p_anonymous boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.user_items; v_sender text; v_recipient text; v_sav text; v_rav text; v_body text; v_anon boolean; v_nt_t text; v_nt_b text;
begin
  v_anon := coalesce(p_anonymous, false);
  if p_url is null or btrim(p_url) = '' then raise exception '영상 링크를 입력해 주세요.'; end if;
  select * into v_item from public.user_items where user_id = auth.uid() and item_id = 'video' and status = 'active' order by created_at asc limit 1;
  if v_item.id is null then raise exception '사용할 수 있는 비디오 테이프가 없습니다.'; end if;
  if not public.is_group_member(p_group_id, auth.uid()) then raise exception '그룹 멤버만 사용할 수 있습니다.'; end if;
  if p_recipient_id = auth.uid() then raise exception '자기 자신에게는 보낼 수 없습니다.'; end if;
  if not public.is_group_member(p_group_id, p_recipient_id) then raise exception '받는 사람이 그룹 멤버가 아닙니다.'; end if;

  update public.user_items set status = 'used', used_at = now() where id = v_item.id;
  if v_anon then perform public.consume_one_eraser(); end if;

  v_sender    := coalesce(public.notif_member_name(p_group_id, auth.uid()), '');
  v_recipient := coalesce(public.notif_member_name(p_group_id, p_recipient_id), '');
  select avatar_url into v_sav from public.group_members where group_id = p_group_id and user_id = auth.uid();
  select avatar_url into v_rav from public.group_members where group_id = p_group_id and user_id = p_recipient_id;
  v_body := coalesce(nullif(btrim(p_message), ''), '영상을 보냈어요 📹');

  insert into public.notes(group_id, sender_id, recipient_id, sender_name, recipient_name, sender_avatar, recipient_avatar, body, kind, item_id, media_url, anonymous)
    values (p_group_id, auth.uid(), p_recipient_id, v_sender, v_recipient, v_sav, v_rav, v_body, 'video', 'video', btrim(p_url), v_anon);

  select r.title, r.body into v_nt_t, v_nt_b from public.notif_render(case when v_anon then 'video_anon' else 'video' end, jsonb_build_object('actor', v_sender)) r;
  insert into public.notifications(user_id, actor_id, type, title, body, group_id)
    values (p_recipient_id, case when v_anon then null else auth.uid() end, 'video',
            coalesce(v_nt_t, case when v_anon then '익명의 영상이 도착했어요' when v_sender <> '' then v_sender || ' 님이 영상을 보냈어요' else '영상이 도착했어요' end),
            coalesce(v_nt_b, '쪽지함에서 확인하세요 📹'), p_group_id);
end;
$$;
grant execute on function public.use_video(uuid, uuid, text, text, boolean) to authenticated;

-- ── 영상(블루레이) ────────────────────────────────────────
create or replace function public.use_bluray(p_group_id uuid, p_recipient_id uuid, p_message text, p_url text, p_anonymous boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.user_items; v_sender text; v_recipient text; v_sav text; v_rav text; v_body text; v_anon boolean; v_nt_t text; v_nt_b text;
begin
  v_anon := coalesce(p_anonymous, false);
  if p_url is null or btrim(p_url) = '' then raise exception '영상 링크를 입력해 주세요.'; end if;
  select * into v_item from public.user_items where user_id = auth.uid() and item_id = 'bluray' and status = 'active' order by created_at asc limit 1;
  if v_item.id is null then raise exception '사용할 수 있는 블루레이가 없습니다.'; end if;
  if not public.is_group_member(p_group_id, auth.uid()) then raise exception '그룹 멤버만 사용할 수 있습니다.'; end if;
  if p_recipient_id = auth.uid() then raise exception '자기 자신에게는 보낼 수 없습니다.'; end if;
  if not public.is_group_member(p_group_id, p_recipient_id) then raise exception '받는 사람이 그룹 멤버가 아닙니다.'; end if;

  update public.user_items set status = 'used', used_at = now() where id = v_item.id;
  if v_anon then perform public.consume_one_eraser(); end if;

  v_sender    := coalesce(public.notif_member_name(p_group_id, auth.uid()), '');
  v_recipient := coalesce(public.notif_member_name(p_group_id, p_recipient_id), '');
  select avatar_url into v_sav from public.group_members where group_id = p_group_id and user_id = auth.uid();
  select avatar_url into v_rav from public.group_members where group_id = p_group_id and user_id = p_recipient_id;
  v_body := coalesce(nullif(btrim(p_message), ''), '영상을 보냈어요 💿');

  insert into public.notes(group_id, sender_id, recipient_id, sender_name, recipient_name, sender_avatar, recipient_avatar, body, kind, item_id, media_url, anonymous)
    values (p_group_id, auth.uid(), p_recipient_id, v_sender, v_recipient, v_sav, v_rav, v_body, 'bluray', 'bluray', btrim(p_url), v_anon);

  select r.title, r.body into v_nt_t, v_nt_b from public.notif_render(case when v_anon then 'bluray_anon' else 'bluray' end, jsonb_build_object('actor', v_sender)) r;
  insert into public.notifications(user_id, actor_id, type, title, body, group_id)
    values (p_recipient_id, case when v_anon then null else auth.uid() end, 'bluray',
            coalesce(v_nt_t, case when v_anon then '익명의 영상이 도착했어요' when v_sender <> '' then v_sender || ' 님이 영상을 보냈어요' else '영상이 도착했어요' end),
            coalesce(v_nt_b, '쪽지함에서 확인하세요 💿'), p_group_id);
end;
$$;
grant execute on function public.use_bluray(uuid, uuid, text, text, boolean) to authenticated;

-- ── 선물 상자(링크) ───────────────────────────────────────
create or replace function public.use_link(p_group_id uuid, p_recipient_id uuid, p_message text, p_url text, p_label text default null, p_anonymous boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.user_items; v_sender text; v_recipient text; v_sav text; v_rav text; v_body text; v_label text; v_anon boolean; v_nt_t text; v_nt_b text;
begin
  v_anon := coalesce(p_anonymous, false);
  if p_url is null or btrim(p_url) = '' then raise exception '링크를 입력해 주세요.'; end if;
  select * into v_item from public.user_items where user_id = auth.uid() and item_id = 'link' and status = 'active' order by created_at asc limit 1;
  if v_item.id is null then raise exception '사용할 수 있는 선물 상자가 없습니다.'; end if;
  if not public.is_group_member(p_group_id, auth.uid()) then raise exception '그룹 멤버만 사용할 수 있습니다.'; end if;
  if p_recipient_id = auth.uid() then raise exception '자기 자신에게는 보낼 수 없습니다.'; end if;
  if not public.is_group_member(p_group_id, p_recipient_id) then raise exception '받는 사람이 그룹 멤버가 아닙니다.'; end if;

  update public.user_items set status = 'used', used_at = now() where id = v_item.id;
  if v_anon then perform public.consume_one_eraser(); end if;

  v_sender    := coalesce(public.notif_member_name(p_group_id, auth.uid()), '');
  v_recipient := coalesce(public.notif_member_name(p_group_id, p_recipient_id), '');
  select avatar_url into v_sav from public.group_members where group_id = p_group_id and user_id = auth.uid();
  select avatar_url into v_rav from public.group_members where group_id = p_group_id and user_id = p_recipient_id;
  v_body  := coalesce(nullif(btrim(p_message), ''), '선물 상자를 보냈어요 🎁');
  v_label := coalesce(nullif(btrim(p_label), ''), '선물 상자 열기');

  insert into public.notes(group_id, sender_id, recipient_id, sender_name, recipient_name, sender_avatar, recipient_avatar, body, kind, item_id, item_name, media_url, anonymous)
    values (p_group_id, auth.uid(), p_recipient_id, v_sender, v_recipient, v_sav, v_rav, v_body, 'link', 'link', v_label, btrim(p_url), v_anon);

  select r.title, r.body into v_nt_t, v_nt_b from public.notif_render(case when v_anon then 'link_anon' else 'link' end, jsonb_build_object('actor', v_sender)) r;
  insert into public.notifications(user_id, actor_id, type, title, body, group_id)
    values (p_recipient_id, case when v_anon then null else auth.uid() end, 'link',
            coalesce(v_nt_t, case when v_anon then '익명의 선물 상자가 도착했어요' when v_sender <> '' then v_sender || ' 님이 선물 상자를 보냈어요' else '선물 상자가 도착했어요' end),
            coalesce(v_nt_b, '쪽지함에서 확인하세요 🎁'), p_group_id);
end;
$$;
grant execute on function public.use_link(uuid, uuid, text, text, text, boolean) to authenticated;
