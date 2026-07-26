-- =============================================================
--  1) 연인이 전광판/명찰을 사용하면 상대에게 알림(→ 푸시)
--     · 전광판: 배너가 게재되는 시점
--     · 명찰:   닉네임이 처음 바뀌어 24시간 카운트다운이 시작되는 시점만
--               (잠금 중 이름만 다시 바꿀 때는 알림 없음)
--  2) 알림센터 이모지 '배경색' 도 관리자에서 편집 (notif_templates.emoji_bg)
--
--  적용: Supabase SQL Editor 에 그대로 실행.
--        (notif-templates.sql / notif-emoji.sql / premium-items.sql 실행 이후)
-- =============================================================

-- ── 1. 알림 템플릿 시드 ─────────────────────────────────────
insert into public.notif_templates (key, label, title, body, vars, sort_order) values
  ('ledboard', '연인이 전광판 게재', '연인이 전광판을 켰어요',   '{actor}: {text}',
   '{actor} = 게재한 사람 닉네임, {text} = 전광판 문구', 60),
  ('nametag',  '연인이 명찰 사용',   '연인이 내 이름을 바꿨어요', '이제 24시간 동안 {nickname} (으)로 불려요',
   '{actor} = 사용한 사람 닉네임, {nickname} = 바뀐 이름', 61)
on conflict (key) do update set label = excluded.label, vars = excluded.vars, sort_order = excluded.sort_order;

-- 기본 이모지(이미 값이 있으면 유지)
update public.notif_templates set emoji = coalesce(emoji, v.e)
from (values ('ledboard','📟'), ('nametag','🏷️')) as v(key, e)
where public.notif_templates.key = v.key;

-- ── 2. 알림센터 이모지 배경색 ───────────────────────────────
alter table public.notif_templates add column if not exists emoji_bg text;

comment on column public.notif_templates.emoji_bg is
  '알림센터 이모지 배경색(#RRGGBB). null 이면 프런트 기본 스타일(타입별 CSS) 사용.';

-- 저장 RPC: 배경색 인자 추가.
-- null  = 기존 값 유지 / ''(빈 문자열) = 해제(기본 스타일) / '#RRGGBB' = 지정
drop function if exists public.admin_set_notif(text, text, text);
drop function if exists public.admin_set_notif(text, text, text, text);
create or replace function public.admin_set_notif(
  p_key text, p_title text, p_body text,
  p_emoji text default null, p_emoji_bg text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception '권한이 없습니다.'; end if;
  if p_title is null or btrim(p_title) = '' then raise exception '제목을 입력해 주세요.'; end if;
  if p_body  is null or btrim(p_body)  = '' then raise exception '본문을 입력해 주세요.'; end if;
  if p_emoji_bg is not null and btrim(p_emoji_bg) <> ''
     and btrim(p_emoji_bg) !~* '^#[0-9a-f]{6}$' then
    raise exception '배경색은 #RRGGBB 형식으로 입력해 주세요.';
  end if;
  update public.notif_templates
     set title    = p_title,
         body     = p_body,
         emoji    = case when p_emoji    is null then emoji    else nullif(btrim(p_emoji), '')    end,
         emoji_bg = case when p_emoji_bg is null then emoji_bg else nullif(btrim(p_emoji_bg), '') end,
         updated_at = now()
   where key = p_key;
  if not found then raise exception '알림 템플릿을 찾을 수 없어요.'; end if;
end $$;
grant execute on function public.admin_set_notif(text, text, text, text, text) to authenticated;

-- 알림센터용 스타일 맵: { key: { emoji, bg } }
-- (기존 notif_emojis() 는 호환을 위해 그대로 둔다)
create or replace function public.notif_styles()
returns jsonb language sql security definer set search_path = public stable as $$
  select coalesce(
    jsonb_object_agg(key, jsonb_strip_nulls(jsonb_build_object('emoji', emoji, 'bg', emoji_bg)))
      filter (where emoji is not null or emoji_bg is not null),
    '{}'::jsonb)
  from public.notif_templates;
$$;
grant execute on function public.notif_styles() to authenticated;

-- ── 3. 전광판 사용 → 상대에게 알림 ──────────────────────────
create or replace function public.use_ledboard(p_text text, p_color text)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.user_items; v_group uuid; v_color text;
        v_partner uuid; v_actor text; v_t text; v_b text;
begin
  if p_text is null or btrim(p_text) = '' then raise exception '문구를 입력해 주세요.'; end if;
  if char_length(btrim(p_text)) > 60 then raise exception '문구는 60자까지 입력할 수 있어요.'; end if;
  v_color := public.led_color_ok(p_color);

  -- 장착한 커플 링 그룹(= 커플 그룹)
  select group_id into v_group from public.user_items
   where user_id = auth.uid() and item_id = 'couple-ring' and status = 'used' and group_id is not null
   order by used_at desc nulls last limit 1;
  if v_group is null then raise exception '커플 링을 장착한 커플만 사용할 수 있어요.'; end if;

  if exists (select 1 from public.led_banners where group_id = v_group and active and expires_at > now()) then
    raise exception '이미 게재 중인 전광판이 있어요.'; end if;

  select * into v_item from public.user_items
   where user_id = auth.uid() and item_id = 'ledboard' and status = 'active'
   order by created_at asc limit 1;
  if v_item.id is null then raise exception '사용할 수 있는 전광판이 없습니다.'; end if;
  update public.user_items set status = 'used', used_at = now() where id = v_item.id;

  insert into public.led_banners(group_id, owner_id, text, color, active, started_at, expires_at)
    values (v_group, auth.uid(), btrim(p_text), v_color, true, now(), now() + interval '24 hours');

  -- 상대(연인)에게 알림 → Database Webhook 이 send-push 호출
  select user_id into v_partner from public.group_members
   where group_id = v_group and user_id <> auth.uid() and left_at is null limit 1;
  if v_partner is not null then
    select coalesce(nullif(gm.display_nickname, ''), '연인') into v_actor
      from public.group_members gm where gm.group_id = v_group and gm.user_id = auth.uid();
    select r.title, r.body into v_t, v_b
      from public.notif_render('ledboard', jsonb_build_object('actor', v_actor, 'text', btrim(p_text))) r;
    insert into public.notifications(user_id, actor_id, type, title, body, group_id)
    values (v_partner, auth.uid(), 'ledboard',
            coalesce(v_t, '연인이 전광판을 켰어요'),
            coalesce(v_b, v_actor || ': ' || btrim(p_text)), v_group);
  end if;
end;
$$;
grant execute on function public.use_ledboard(text, text) to authenticated;

-- ── 4. 명찰 사용 → 대상에게 알림(카운트다운 시작 시점만) ────
create or replace function public.use_name_tag(p_group_id uuid, p_nickname text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_partner uuid; v_gm public.group_members; v_item public.user_items;
        v_active boolean; v_actor text; v_t text; v_b text;
begin
  if not public.is_couple_group(p_group_id) then raise exception '커플 그룹에서만 사용할 수 있어요.'; end if;
  if not public.is_group_member(p_group_id, v_uid) then raise exception '그룹 멤버가 아니에요.'; end if;
  if p_nickname is null or btrim(p_nickname) = '' then raise exception '변경할 이름을 입력해 주세요.'; end if;
  if char_length(btrim(p_nickname)) > 12 then raise exception '이름은 12자까지 정할 수 있어요.'; end if;

  select user_id into v_partner from public.group_members where group_id = p_group_id and user_id <> v_uid limit 1;
  if v_partner is null then raise exception '짝꿍을 찾을 수 없어요.'; end if;

  select * into v_gm from public.group_members where group_id = p_group_id and user_id = v_partner for update;
  v_active := v_gm.nick_locked_until is not null and v_gm.nick_locked_until > now() and v_gm.nick_locked_by = v_uid;

  if not v_active then
    select * into v_item from public.user_items
      where user_id = v_uid and item_id = 'name-tag' and status = 'active'
      order by created_at asc limit 1 for update;
    if v_item.id is null then raise exception '사용할 수 있는 명찰이 없어요.'; end if;
    update public.user_items set status = 'used', used_at = now() where id = v_item.id;
    update public.group_members set
      nick_original     = coalesce(nullif(nick_original, ''), display_nickname),
      display_nickname  = btrim(p_nickname),
      nick_locked_by    = v_uid,
      nick_locked_until = now() + interval '24 hours'
     where group_id = p_group_id and user_id = v_partner;

    -- 카운트다운이 시작되는 이 시점에만 대상에게 알림(이후 이름만 바꿀 때는 조용히)
    select coalesce(nullif(gm.display_nickname, ''), '연인') into v_actor
      from public.group_members gm where gm.group_id = p_group_id and gm.user_id = v_uid;
    select r.title, r.body into v_t, v_b
      from public.notif_render('nametag', jsonb_build_object('actor', v_actor, 'nickname', btrim(p_nickname))) r;
    insert into public.notifications(user_id, actor_id, type, title, body, group_id)
    values (v_partner, v_uid, 'nametag',
            coalesce(v_t, '연인이 내 이름을 바꿨어요'),
            coalesce(v_b, '이제 24시간 동안 ' || btrim(p_nickname) || ' (으)로 불려요'), p_group_id);
  else
    update public.group_members set display_nickname = btrim(p_nickname)
     where group_id = p_group_id and user_id = v_partner;
  end if;

  select * into v_gm from public.group_members where group_id = p_group_id and user_id = v_partner;
  return jsonb_build_object('target_id', v_partner, 'nickname', v_gm.display_nickname, 'until', v_gm.nick_locked_until);
end $$;
grant execute on function public.use_name_tag(uuid, text) to authenticated;
