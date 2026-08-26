-- =============================================================
--  프리미엄 소비/효과 아이템 + 그룹 공용 꾸미기 테마(THEME) — 통합본
--  다음 15개의 개별 SQL 파일을 하나로 합친 것 (저장소 정리 작업의 일부로 생성):
--    premium-items.sql, premium-items-open.sql, nametag-auto-revert.sql,
--    led-takeover.sql, megaphone.sql, megaphone-notif.sql,
--    purin-mic.sql, purin-mic-lock-notify.sql, purin-mic-mirror-selfheal.sql,
--    polaroid-film.sql, water-balloon.sql,
--    theme-items.sql, theme-waterpark.sql, theme-swap-fix.sql, theme-swap-crossuser.sql
--
--  각 객체는 위 파일들에 걸쳐 여러 번 재정의된 경우 "가장 마지막" 버전만 담았다.
--  (예: use_purin_mic / purin_mic_state / dispatch_purin_mic_reverts 는
--   purin-mic.sql → purin-mic-lock-notify.sql → purin-mic-mirror-selfheal.sql 순으로
--   3번 재정의됐고, 이 파일엔 마지막 self-heal 버전만 들어있다.
--   apply_group_theme 도 theme-swap-fix.sql → theme-swap-crossuser.sql 중 마지막 버전만.)
--
--  ⚠️ 이미 운영 DB에는 원본 파일들이 순서대로 적용되어 있으므로, 이 파일을 운영 DB에
--  다시 실행할 필요는 없다. schema.sql + schema-v2.sql 적용 후 "새 환경을 처음부터
--  세팅"하거나 재해복구가 필요할 때, 혹은 문서화 목적으로 참고하기 위한 파일이다.
-- =============================================================


-- =====================================================================
-- 1. 테이블 (생성 + 컬럼 추가) — 시간순 누적
-- =====================================================================

-- 1-1) group_members: 명찰(name-tag) 닉네임 오버라이드 + 푸린 마이크(purin-mic) 낙서 잠금 미러
alter table public.group_members add column if not exists nick_original        text;
alter table public.group_members add column if not exists nick_locked_by       uuid;
alter table public.group_members add column if not exists nick_locked_until    timestamptz;
alter table public.group_members add column if not exists graffiti_locked_until timestamptz;

-- 1-2) notes: 물풍선 폭탄(waterbomb) 타이머 + 처음 연 시각
alter table public.notes add column if not exists timer_seconds integer;
alter table public.notes add column if not exists opened_at timestamptz;

-- 1-3) 푸린 마이크 낙서 저장 테이블 (그룹당 최대 2행 — 각 파트너가 상대 사진에 그린 것)
create table if not exists public.profile_graffiti (
  group_id uuid not null references public.groups(id) on delete cascade,
  target_user_id uuid not null,
  artist_id uuid not null,
  image_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (group_id, target_user_id)
);
alter table public.profile_graffiti enable row level security;
-- 정책 없음 = 직접 테이블 접근은 전부 막고, 아래 SECURITY DEFINER 함수로만 읽고 쓴다.

-- 1-4) 폴라로이드 필름(polaroid-film) 사진 저장 테이블 — note_items 와 같은 패턴.
--      인화 전까지는 recipient 에게 노출 안 됨(recipient select 정책이 claimed=true 일 때만 허용).
create table if not exists public.note_photos (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes(id) on delete cascade,
  url text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_note_photos_note on public.note_photos(note_id);
alter table public.note_photos enable row level security;


-- =====================================================================
-- 2. RLS 정책
-- =====================================================================

drop policy if exists note_photos_select on public.note_photos;
create policy note_photos_select on public.note_photos for select to authenticated using (
  exists (select 1 from public.notes n where n.id = note_id and n.sender_id = auth.uid())
  or exists (select 1 from public.notes n where n.id = note_id and n.recipient_id = auth.uid() and n.claimed = true)
);


-- =====================================================================
-- 3. 함수 (헬퍼 → 그것을 쓰는 함수 순서)
-- =====================================================================

-- 3-1) 잠금 중 본인 닉네임/프로필 사진 변경 차단 (다른 필드는 허용).
--      정의자 함수(사용/원복)는 auth.uid() ≠ 대상 또는 만료 후라 이 트리거를 통과한다.
--      명찰(nick_locked_until)과 푸린 마이크(graffiti_locked_until) 두 필드를 각각 독립적으로 검사.
--      (purin-mic-lock-notify.sql 에서 최종 확정된 버전 — 이후 mirror-selfheal.sql 은 이 함수를
--       재정의하지 않는다.)
create or replace function public._block_locked_nick() returns trigger
language plpgsql set search_path = public as $$
begin
  if TG_OP = 'UPDATE' and auth.uid() = OLD.user_id then
    if OLD.nick_locked_until is not null and OLD.nick_locked_until > now()
       and NEW.display_nickname is distinct from OLD.display_nickname then
      raise exception '명찰 효과가 끝난 뒤에 닉네임을 바꿀 수 있어요.';
    end if;
    if OLD.graffiti_locked_until is not null and OLD.graffiti_locked_until > now()
       and NEW.avatar_url is distinct from OLD.avatar_url then
      raise exception '푸린 마이크 효과가 끝난 뒤에 사진을 바꿀 수 있어요.';
    end if;
  end if;
  return NEW;
end $$;

-- 3-2) 명찰 사용: 상대(짝꿍) 닉네임을 설정. 미사용이면 명찰 1개 소모 + 24h 시작,
--      사용 중이면 이름만 갱신(타이머 유지).
create or replace function public.use_name_tag(p_group_id uuid, p_nickname text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_partner uuid; v_gm public.group_members; v_item public.user_items; v_active boolean;
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
  else
    update public.group_members set display_nickname = btrim(p_nickname)
     where group_id = p_group_id and user_id = v_partner;
  end if;

  select * into v_gm from public.group_members where group_id = p_group_id and user_id = v_partner;
  return jsonb_build_object('target_id', v_partner, 'nickname', v_gm.display_nickname, 'until', v_gm.nick_locked_until);
end $$;
grant execute on function public.use_name_tag(uuid, text) to authenticated;

-- 3-3) 명찰 상태 조회 + 만료 자동 원복(이 그룹). 인벤토리/프로필에서 호출.
create or replace function public.nametag_state(p_group_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_active jsonb; v_mine jsonb;
begin
  if not public.is_group_member(p_group_id, v_uid) then raise exception '그룹 멤버가 아니에요.'; end if;
  -- 만료된 잠금 원복
  update public.group_members
     set display_nickname = coalesce(nullif(nick_original, ''), display_nickname),
         nick_original = null, nick_locked_by = null, nick_locked_until = null
   where group_id = p_group_id and nick_locked_until is not null and nick_locked_until <= now();

  select jsonb_build_object('target_id', gm.user_id, 'nickname', gm.display_nickname, 'until', gm.nick_locked_until)
    into v_active from public.group_members gm
   where gm.group_id = p_group_id and gm.nick_locked_by = v_uid
     and gm.nick_locked_until is not null and gm.nick_locked_until > now() limit 1;

  select jsonb_build_object('until', gm.nick_locked_until) into v_mine
    from public.group_members gm
   where gm.group_id = p_group_id and gm.user_id = v_uid
     and gm.nick_locked_until is not null and gm.nick_locked_until > now() limit 1;

  return jsonb_build_object('active', v_active, 'mine', v_mine);
end $$;
grant execute on function public.nametag_state(uuid) to authenticated;

-- 3-4) 타임머신 사용: 물풍선 쪽지의 opened_at 을 현재로 재설정(타이머 재시작) + 타임머신 1개 소모.
create or replace function public.use_time_machine(p_note_id uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare n public.notes; v_item public.user_items; v_now timestamptz := now();
begin
  select * into n from public.notes where id = p_note_id;
  if n.id is null or n.recipient_id <> auth.uid() then raise exception '쪽지를 찾을 수 없어요.'; end if;
  if n.timer_seconds is null then raise exception '물풍선 쪽지가 아니에요.'; end if;
  select * into v_item from public.user_items
    where user_id = auth.uid() and item_id = 'time-machine' and status = 'active'
    order by created_at asc limit 1 for update;
  if v_item.id is null then raise exception '사용할 수 있는 타임머신이 없어요.'; end if;
  update public.user_items set status = 'used', used_at = v_now where id = v_item.id;
  update public.notes set opened_at = v_now where id = n.id;
  return v_now;
end $$;
grant execute on function public.use_time_machine(uuid) to authenticated;

-- 3-5) 명찰 24시간 만료 자동 원복(pg_cron 용). nametag_state() 는 그 페이지를 방문할 때만
--      호출되므로, 아무도 안 들어가면 만료돼도 안 풀리는 문제를 막기 위해 매분 전체 스캔.
create or replace function public.dispatch_nametag_reverts()
returns integer language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.group_members
     set display_nickname = coalesce(nullif(nick_original, ''), display_nickname),
         nick_original = null, nick_locked_by = null, nick_locked_until = null
   where nick_locked_until is not null and nick_locked_until <= now();
  get diagnostics n = row_count;
  return n;
end;
$$;

-- 3-6) 게재자 닉네임을 함께 반환하는 내 전광판 조회 (반환 컬럼 추가 → drop 후 재생성).
drop function if exists public.my_led_banner();
create or replace function public.my_led_banner()
returns table (id uuid, group_id uuid, owner_id uuid, owner_name text, "text" text, color text, expires_at timestamptz, is_owner boolean)
language sql security definer stable set search_path = public as $$
  select b.id, b.group_id, b.owner_id,
         public.notif_member_name(b.group_id, b.owner_id),
         b.text, b.color, b.expires_at, (b.owner_id = auth.uid())
  from public.led_banners b
  where b.active and b.expires_at > now()
    and public.is_group_member(b.group_id, auth.uid())
  order by b.started_at desc
  limit 1;
$$;
grant execute on function public.my_led_banner() to authenticated;

-- 3-7) 전광판 게재 권한 가져오기(takeover): 상대가 게재 중일 때, 남은 시간만큼 츄르를 상대에게
--      배상하고 내 전광판으로 교체. 비용 = 남은 시간(시간 단위 올림) × 2 츄르.
create or replace function public.takeover_ledboard(p_text text, p_color text)
returns integer language plpgsql security definer set search_path = public as $$
declare v_group uuid; v_color text; v_banner public.led_banners; v_cost int; v_bal int; v_item public.user_items;
begin
  if p_text is null or btrim(p_text) = '' then raise exception '문구를 입력해 주세요.'; end if;
  if char_length(btrim(p_text)) > 60 then raise exception '문구는 60자까지 입력할 수 있어요.'; end if;
  v_color := public.led_color_ok(p_color);

  -- 내 커플 그룹
  select group_id into v_group from public.user_items
   where user_id = auth.uid() and item_id = 'couple-ring' and status = 'used' and group_id is not null
   order by used_at desc nulls last limit 1;
  if v_group is null then raise exception '커플 링을 장착한 커플만 사용할 수 있어요.'; end if;

  -- 현재 게재 중인 배너(상대 것)
  select * into v_banner from public.led_banners
   where group_id = v_group and active and expires_at > now()
   order by started_at desc limit 1;
  if v_banner.id is null then raise exception '게재 중인 전광판이 없어요. 그냥 게재해 주세요.'; end if;
  if v_banner.owner_id = auth.uid() then raise exception '이미 내가 전광판을 게재 중이에요.'; end if;

  -- 비용 = 남은 시간(시간 올림) × 2
  v_cost := ceil(extract(epoch from (v_banner.expires_at - now())) / 3600.0)::int * 2;

  -- 게재할 전광판 아이템 보유 확인
  select * into v_item from public.user_items
   where user_id = auth.uid() and item_id = 'ledboard' and status = 'active'
   order by created_at asc limit 1;
  if v_item.id is null then raise exception '사용할 수 있는 전광판이 없습니다.'; end if;

  -- 잔액 확인
  select coalesce(sum(delta), 0) into v_bal from public.coin_ledger where user_id = auth.uid();
  if v_bal < v_cost then raise exception '츄르가 부족해요.'; end if;

  -- 상대 배너 내림
  update public.led_banners set active = false where id = v_banner.id;

  -- 츄르 이동: 나 차감 → 상대 배상 적립
  if v_cost > 0 then
    insert into public.coin_ledger(user_id, delta, reason, ref_type)
      values (auth.uid(), -v_cost, '전광판 게재 권한 가져오기', 'ledboard_takeover');
    insert into public.coin_ledger(user_id, delta, reason, ref_type)
      values (v_banner.owner_id, v_cost, '전광판 게재 조기 종료 배상', 'ledboard_takeover');
  end if;

  -- 내 전광판 아이템 소모 + 24시간 게재
  update public.user_items set status = 'used', used_at = now() where id = v_item.id;
  insert into public.led_banners(group_id, owner_id, text, color, active, started_at, expires_at)
    values (v_group, auth.uid(), btrim(p_text), v_color, true, now(), now() + interval '24 hours');

  return v_cost;
end $$;
grant execute on function public.takeover_ledboard(text, text) to authenticated;

-- 3-8) 확성기(megaphone) 발송: 그룹 멤버 전원(본인 제외)에게 직접 작성한 메시지로 알림 발송.
--      제목은 관리자 "알림 관리"에서 편집 가능한 템플릿(notif_templates, key='megaphone')에서
--      렌더( {group} 치환 ), 본문은 사용자 입력 그대로. (megaphone-notif.sql 최종 버전)
create or replace function public.megaphone_send(p_group uuid, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_item public.user_items;
        v_gname text; v_body text := btrim(coalesce(p_body, '')); v_title text; v_cnt int := 0;
begin
  if not public.is_group_member(p_group, v_uid) then raise exception '그룹 멤버가 아니에요.'; end if;
  if v_body = '' then raise exception '보낼 메시지를 입력해 주세요.'; end if;
  if char_length(v_body) > 500 then raise exception '메시지는 500자까지예요.'; end if;

  select name into v_gname from public.groups where id = p_group;
  -- 제목: 관리자 편집 템플릿에서 렌더( {group} 치환 ), 없으면 기본 문구
  select r.title into v_title from public.notif_render('megaphone', jsonb_build_object('group', coalesce(v_gname, '그룹'))) r;
  v_title := coalesce(nullif(btrim(v_title), ''), '[' || coalesce(v_gname, '그룹') || '] 확성기가 켜졌어요');

  select * into v_item from public.user_items
    where user_id = v_uid and item_id = 'megaphone' and status = 'active'
    order by created_at asc limit 1 for update;
  if v_item.id is null then raise exception '사용할 수 있는 확성기가 없어요.'; end if;

  update public.user_items set status = 'used', used_at = now(), group_id = p_group where id = v_item.id;

  insert into public.notifications(user_id, actor_id, type, title, body, group_id)
  select m.user_id, v_uid, 'megaphone', v_title, v_body, p_group
  from public.group_members m
  where m.group_id = p_group and m.user_id <> v_uid;
  get diagnostics v_cnt = row_count;

  return jsonb_build_object('sent', v_cnt, 'title', v_title);
end $$;
grant execute on function public.megaphone_send(uuid, text) to authenticated;

-- 3-9) 푸린 마이크 사용/수정: 커플 그룹에서만, 짝꿍 사진에 낙서.
--      (purin-mic.sql → purin-mic-lock-notify.sql → purin-mic-mirror-selfheal.sql 순으로
--      3번 재정의된 함수 중 마지막 self-heal 버전. 새로 잠글 때 group_members.graffiti_locked_until
--      미러 컬럼을 채우고 대상에게 알림을 보내며, 재수정(else 분기)/조회 시에도 미러 컬럼이
--      원본(profile_graffiti)과 어긋나 있으면 항상 맞춰 쓰도록 자가 치유한다.)
create or replace function public.use_purin_mic(p_group_id uuid, p_image_url text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_partner uuid; v_row public.profile_graffiti; v_item public.user_items;
        v_active boolean; v_actor text; v_t text; v_b text;
begin
  if not public.is_couple_group(p_group_id) then raise exception '커플 그룹에서만 사용할 수 있어요.'; end if;
  if not public.is_group_member(p_group_id, v_uid) then raise exception '그룹 멤버가 아니에요.'; end if;
  if p_image_url is null or btrim(p_image_url) = '' then raise exception '낙서 이미지가 없어요.'; end if;

  select user_id into v_partner from public.group_members where group_id = p_group_id and user_id <> v_uid limit 1;
  if v_partner is null then raise exception '짝꿍을 찾을 수 없어요.'; end if;

  select * into v_row from public.profile_graffiti where group_id = p_group_id and target_user_id = v_partner for update;
  v_active := v_row.group_id is not null and v_row.artist_id = v_uid and v_row.expires_at > now();

  if not v_active then
    select * into v_item from public.user_items
      where user_id = v_uid and item_id = 'purin-mic' and status = 'active'
      order by created_at asc limit 1 for update;
    if v_item.id is null then raise exception '사용할 수 있는 푸린 마이크가 없어요.'; end if;
    update public.user_items set status = 'used', used_at = now() where id = v_item.id;

    insert into public.profile_graffiti(group_id, target_user_id, artist_id, image_url, expires_at)
      values (p_group_id, v_partner, v_uid, p_image_url, now() + interval '24 hours')
    on conflict (group_id, target_user_id) do update
      set artist_id = excluded.artist_id, image_url = excluded.image_url,
          updated_at = now(), expires_at = excluded.expires_at;

    update public.group_members set graffiti_locked_until = now() + interval '24 hours'
      where group_id = p_group_id and user_id = v_partner;

    -- 카운트다운이 시작되는 이 시점에만 대상에게 알림(이후 낙서만 고칠 땐 조용히) — 명찰과 동일한 규칙
    select coalesce(nullif(gm.display_nickname, ''), '연인') into v_actor
      from public.group_members gm where gm.group_id = p_group_id and gm.user_id = v_uid;
    select r.title, r.body into v_t, v_b
      from public.notif_render('purin_mic', jsonb_build_object('actor', v_actor)) r;
    insert into public.notifications(user_id, actor_id, type, title, body, group_id)
      values (v_partner, v_uid, 'purin_mic',
              coalesce(v_t, '연인이 내 프로필 사진에 낙서했어요'),
              coalesce(v_b, '24시간 동안 낙서가 남아 있어요'), p_group_id);
  else
    update public.profile_graffiti set image_url = p_image_url, updated_at = now()
      where group_id = p_group_id and target_user_id = v_partner;
    -- 재수정 시에도 미러 컬럼이 원본과 어긋나 있으면(과거 사용분 등) 맞춰 둔다 — 자가 치유.
    update public.group_members set graffiti_locked_until = v_row.expires_at
      where group_id = p_group_id and user_id = v_partner
        and graffiti_locked_until is distinct from v_row.expires_at;
  end if;

  select * into v_row from public.profile_graffiti where group_id = p_group_id and target_user_id = v_partner;
  return jsonb_build_object('target_id', v_row.target_user_id, 'image_url', v_row.image_url, 'until', v_row.expires_at);
end $$;
grant execute on function public.use_purin_mic(uuid, text) to authenticated;

-- 3-10) 내 푸린 마이크 상태 조회(수정 모달 진입용). 조회 시점에 만료된 행 정리 +
--       활성 낙서가 있는데 미러 컬럼이 비어있거나 어긋나 있으면 맞춰 둔다 — 자가 치유.
create or replace function public.purin_mic_state(p_group_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_active jsonb;
begin
  if not public.is_group_member(p_group_id, v_uid) then raise exception '그룹 멤버가 아니에요.'; end if;
  delete from public.profile_graffiti where group_id = p_group_id and expires_at <= now();
  update public.group_members set graffiti_locked_until = null
    where group_id = p_group_id and graffiti_locked_until is not null and graffiti_locked_until <= now();

  -- 활성 낙서가 있는데 미러 컬럼이 비어있거나 어긋나 있으면(과거 사용분 등) 맞춰 둔다 — 자가 치유.
  update public.group_members gm set graffiti_locked_until = pg.expires_at
    from public.profile_graffiti pg
   where pg.group_id = p_group_id and pg.target_user_id = gm.user_id and pg.expires_at > now()
     and gm.graffiti_locked_until is distinct from pg.expires_at;

  select jsonb_build_object('target_id', pg.target_user_id, 'image_url', pg.image_url, 'until', pg.expires_at)
    into v_active from public.profile_graffiti pg
   where pg.group_id = p_group_id and pg.artist_id = v_uid and pg.expires_at > now() limit 1;

  return jsonb_build_object('active', v_active);
end $$;
grant execute on function public.purin_mic_state(uuid) to authenticated;

-- 3-11) 그룹의 낙서 전체 조회(아바타 렌더링용) — 데코와 동일하게 그룹 멤버면 조회 가능.
create or replace function public.list_group_graffiti(p_group_id uuid)
returns table(target_user_id uuid, image_url text) language sql stable security definer set search_path = public as $$
  select pg.target_user_id, pg.image_url
    from public.profile_graffiti pg
   where pg.group_id = p_group_id and pg.expires_at > now()
     and (public.is_group_member(p_group_id, auth.uid()) or public.is_admin(auth.uid()));
$$;
grant execute on function public.list_group_graffiti(uuid) to authenticated;

-- 3-12) 푸린 마이크 만료 자동 정리(pg_cron 용, 페이지 방문 없이도 낙서가 사라지게).
--       매분 도는 크론도 미러 컬럼을 동일하게 자가 치유(어떤 그룹이든 방문 없이도 맞춰짐).
create or replace function public.dispatch_purin_mic_reverts()
returns integer language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.profile_graffiti where expires_at <= now();
  update public.group_members set graffiti_locked_until = null
    where graffiti_locked_until is not null and graffiti_locked_until <= now();
  update public.group_members gm set graffiti_locked_until = pg.expires_at
    from public.profile_graffiti pg
   where pg.target_user_id = gm.user_id and pg.expires_at > now()
     and gm.graffiti_locked_until is distinct from pg.expires_at;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- 3-13) 폴라로이드 필름 사용: 필름 N장(=사진 N장) 소모 → 쪽지 하나로 전송.
--       받는 사람은 바로 사진이 보이지 않고 "인화하기"를 눌러야(develop_polaroid_note) 공개된다.
create or replace function public.use_polaroid_film(
  p_group_id uuid, p_recipient_id uuid, p_message text, p_urls jsonb, p_anonymous boolean default false
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_sender text; v_recipient text; v_sav text; v_rav text; v_body text; v_anon boolean;
  v_qty integer; v_ids uuid[]; v_note_id uuid; v_url text; i integer; v_nt_t text; v_nt_b text;
begin
  v_anon := coalesce(p_anonymous, false);
  if p_urls is null or jsonb_typeof(p_urls) <> 'array' or jsonb_array_length(p_urls) = 0 then
    raise exception '첨부할 사진이 없어요.'; end if;
  v_qty := jsonb_array_length(p_urls);
  if v_qty > 5 then raise exception '사진은 쪽지 하나에 최대 5장까지 첨부할 수 있어요.'; end if;
  if not public.is_group_member(p_group_id, auth.uid()) then raise exception '그룹 멤버만 사용할 수 있습니다.'; end if;
  if p_recipient_id = auth.uid() then raise exception '자기 자신에게는 보낼 수 없습니다.'; end if;
  if not public.is_group_member(p_group_id, p_recipient_id) then raise exception '받는 사람이 그룹 멤버가 아닙니다.'; end if;

  select array_agg(id) into v_ids from (
    select id from public.user_items where user_id = auth.uid() and item_id = 'polaroid-film' and status = 'active'
    order by created_at asc limit v_qty) t;
  if v_ids is null or array_length(v_ids, 1) < v_qty then raise exception '폴라로이드 필름이 부족해요.'; end if;
  update public.user_items set status = 'used', used_at = now() where id = any(v_ids);
  if v_anon then perform public.consume_one_eraser(); end if;

  v_sender    := coalesce(public.notif_member_name(p_group_id, auth.uid()), '');
  v_recipient := coalesce(public.notif_member_name(p_group_id, p_recipient_id), '');
  select avatar_url into v_sav from public.group_members where group_id = p_group_id and user_id = auth.uid();
  select avatar_url into v_rav from public.group_members where group_id = p_group_id and user_id = p_recipient_id;
  v_body := coalesce(nullif(btrim(p_message), ''), '사진을 보냈어요 📷');

  insert into public.notes(group_id, sender_id, recipient_id, sender_name, recipient_name, sender_avatar, recipient_avatar, body, kind, item_id, item_name, qty, anonymous)
    values (p_group_id, auth.uid(), p_recipient_id, v_sender, v_recipient, v_sav, v_rav, v_body, 'polaroid', 'polaroid-film', '폴라로이드 필름', v_qty, v_anon)
    returning id into v_note_id;

  i := 0;
  for v_url in select jsonb_array_elements_text(p_urls) loop
    insert into public.note_photos(note_id, url, sort_order) values (v_note_id, v_url, i);
    i := i + 1;
  end loop;

  select r.title, r.body into v_nt_t, v_nt_b from public.notif_render(case when v_anon then 'polaroid_anon' else 'polaroid' end, jsonb_build_object('actor', v_sender)) r;
  insert into public.notifications(user_id, actor_id, type, title, body, group_id)
    values (p_recipient_id, case when v_anon then null else auth.uid() end, 'polaroid',
            coalesce(v_nt_t, case when v_anon then '익명의 폴라로이드 사진이 도착했어요' when v_sender <> '' then v_sender || ' 님이 폴라로이드 사진을 보냈어요' else '폴라로이드 사진이 도착했어요' end),
            coalesce(v_nt_b, '쪽지함에서 인화해 보세요 📷'), p_group_id);
  return v_note_id;
end;
$$;
grant execute on function public.use_polaroid_film(uuid, uuid, text, jsonb, boolean) to authenticated;

-- 3-14) 인화하기: 받는 사람이 눌러야 사진이 공개됨(notes.claimed = true → note_photos 조회 가능해짐)
create or replace function public.develop_polaroid_note(p_note_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare n public.notes;
begin
  select * into n from public.notes where id = p_note_id;
  if n.id is null or n.recipient_id <> auth.uid() or n.kind <> 'polaroid' then
    raise exception '인화할 수 없는 쪽지입니다.'; end if;
  if n.claimed then raise exception '이미 인화했어요.'; end if;
  update public.notes set claimed = true, is_read = true where id = n.id;
end;
$$;
grant execute on function public.develop_polaroid_note(uuid) to authenticated;

-- 3-15) send_note: p_timer_seconds(10~120) 지원(물풍선 폭탄 1개 소모) 포함 최종 버전.
--       기존 3·4-인자 버전은 제거하고 단일 5-인자 버전으로 통일(시그니처 모호성 방지).
drop function if exists public.send_note(uuid, uuid, text);
drop function if exists public.send_note(uuid, uuid, text, boolean);
create or replace function public.send_note(
  p_group_id uuid, p_recipient_id uuid, p_body text,
  p_anonymous boolean default false, p_timer_seconds integer default null
)
returns public.notes language plpgsql security definer set search_path = public as $$
declare r public.notes; v_sender text; v_recipient text; v_sender_av text; v_recipient_av text;
        v_timer integer; v_wb uuid;
begin
  if not public.is_group_member(p_group_id, auth.uid()) then raise exception '그룹 멤버만 보낼 수 있습니다.'; end if;
  if p_recipient_id = auth.uid() then raise exception '자기 자신에게는 보낼 수 없습니다.'; end if;
  if not public.is_group_member(p_group_id, p_recipient_id) then raise exception '받는 사람이 그룹 멤버가 아닙니다.'; end if;
  if p_body is null or btrim(p_body) = '' then raise exception '쪽지 내용을 입력해 주세요.'; end if;
  if char_length(p_body) > 150 then raise exception '쪽지는 최대 150자까지 작성할 수 있습니다.'; end if;

  -- 물풍선 폭탄: 타이머가 있으면 1개 소모(10~120초로 클램프)
  if p_timer_seconds is not null then
    v_timer := greatest(10, least(120, p_timer_seconds));
    select id into v_wb from public.user_items
      where user_id = auth.uid() and item_id = 'waterbomb' and status = 'active'
      order by created_at asc limit 1 for update;
    if v_wb is null then raise exception '물풍선 폭탄이 없어요.'; end if;
    update public.user_items set status = 'used', used_at = now() where id = v_wb;
  end if;

  if coalesce(p_anonymous, false) then perform public.consume_one_eraser(); end if;

  v_sender    := public.notif_member_name(p_group_id, auth.uid());
  v_recipient := public.notif_member_name(p_group_id, p_recipient_id);
  select avatar_url into v_sender_av    from public.group_members where group_id = p_group_id and user_id = auth.uid();
  select avatar_url into v_recipient_av from public.group_members where group_id = p_group_id and user_id = p_recipient_id;

  insert into public.notes(group_id, sender_id, recipient_id, sender_name, recipient_name, sender_avatar, recipient_avatar, body, anonymous, timer_seconds)
    values (p_group_id, auth.uid(), p_recipient_id, v_sender, v_recipient, v_sender_av, v_recipient_av, btrim(p_body), coalesce(p_anonymous, false), v_timer)
    returning * into r;
  return r;
end;
$$;
grant execute on function public.send_note(uuid, uuid, text, boolean, integer) to authenticated;

-- 3-16) 물풍선 쪽지 처음 열기: opened_at 을 최초 1회만 기록(멱등) + 읽음 처리(is_read)까지
--       한 번에. 여는 순간 읽음이 원자적으로 확정되므로 동시성 문제가 없다.
drop function if exists public.open_water_note(uuid);
create or replace function public.open_water_note(p_note_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.notes
     set opened_at = coalesce(opened_at, now()),
         is_read   = true
   where id = p_note_id and recipient_id = auth.uid()
     and timer_seconds is not null;
$$;
grant execute on function public.open_water_note(uuid) to authenticated;

-- 3-17) list_received_notes: timer_seconds / opened_at 포함 최종 버전 (반환 타입 변경 → drop 먼저).
drop function if exists public.list_received_notes();
create or replace function public.list_received_notes()
returns table(
  id uuid, group_id uuid, sender_id uuid, recipient_id uuid,
  sender_name text, recipient_name text, sender_avatar text, recipient_avatar text,
  body text, kind text, is_read boolean, created_at timestamptz,
  item_id text, item_name text, claimed boolean, rejected boolean, media_url text, anonymous boolean, qty integer,
  timer_seconds integer, opened_at timestamptz
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
    n.item_id, n.item_name, n.claimed, n.rejected, n.media_url, n.anonymous, coalesce(n.qty, 1),
    n.timer_seconds, n.opened_at
  from public.notes n
  where n.recipient_id = auth.uid()
  order by n.created_at desc;
$$;
grant execute on function public.list_received_notes() to authenticated;

-- 3-18) 꾸미기 테마 적용: 그룹당 테마 1개. 같은 그룹에 '다른 멤버'가 새 테마를 적용하면
--       (누구 것이든) 이전에 적용돼 있던 테마도 자동 해제된다.
--       (theme-swap-fix.sql 은 "자기 것만" 해제해서 다른 멤버의 테마가 남는 버그가 있었고,
--       theme-swap-crossuser.sql 이 이를 수정한 최종 버전 — 여기엔 그 최종본만 담았다.)
create or replace function public.apply_group_theme(p_group_id uuid, p_theme text)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.user_items; v_old uuid;
begin
  if not (public.is_couple_group(p_group_id) or public.is_friend_group(p_group_id)) then
    raise exception '프리미엄 그룹에만 테마를 적용할 수 있어요.'; end if;
  if not public.is_group_member(p_group_id, auth.uid()) then
    raise exception '그룹 멤버만 적용할 수 있어요.'; end if;
  -- 내 테마 아이템 하나 선택(미적용=active 우선, 없으면 적용중=used 를 옮김)
  select * into v_item from public.user_items
    where user_id = auth.uid() and item_id = 'theme-' || p_theme and status in ('active', 'used')
    order by (status = 'active') desc, created_at asc limit 1 for update;
  if v_item.id is null then raise exception '보유한 테마가 없어요.'; end if;
  v_old := v_item.group_id;
  -- 이전 그룹에서 이 테마 해제(다른 그룹으로 옮기는 경우)
  if v_item.status = 'used' and v_old is not null and v_old <> p_group_id then
    update public.groups set deco_theme = null where id = v_old and deco_theme = p_theme;
  end if;
  -- 그룹당 테마 1개: 이 그룹에 적용돼 있던 '다른' 테마 아이템은 (누구 것이든) 미적용으로
  update public.user_items
    set status = 'active', group_id = null
    where status = 'used' and group_id = p_group_id
      and item_id like 'theme-%' and id <> v_item.id;
  update public.user_items set status = 'used', group_id = p_group_id, used_at = now() where id = v_item.id;
  update public.groups set deco_theme = p_theme where id = p_group_id;
end;
$$;
grant execute on function public.apply_group_theme(uuid, text) to authenticated;


-- =====================================================================
-- 4. 트리거
-- =====================================================================

-- group_members 업데이트 시 잠금 검사(_block_locked_nick, 위 3-1 참고).
drop trigger if exists trg_block_locked_nick on public.group_members;
create trigger trg_block_locked_nick before update on public.group_members
  for each row execute function public._block_locked_nick();


-- =====================================================================
-- 5. pg_cron 스케줄 (매분, unschedule → schedule 가드 패턴)
-- =====================================================================

create extension if not exists pg_cron;

-- 명찰 만료 자동 원복
do $$
begin
  perform cron.unschedule('nolging-nametag-revert');
exception when others then null;
end $$;
select cron.schedule('nolging-nametag-revert', '* * * * *', $$select public.dispatch_nametag_reverts()$$);

-- 푸린 마이크 낙서 만료 자동 정리
do $$
begin
  perform cron.unschedule('nolging-purin-mic-revert');
exception when others then null;
end $$;
select cron.schedule('nolging-purin-mic-revert', '* * * * *', $$select public.dispatch_purin_mic_reverts()$$);


-- =====================================================================
-- 6. 시드 데이터
-- =====================================================================

-- 6-1) 알림 템플릿(관리자 "알림 관리"에서 문구 수정 가능)
insert into public.notif_templates (key, label, title, body, vars, emoji, sort_order) values
  ('megaphone', '확성기', '[{group}] 확성기가 켜졌어요', '(내용은 사용자가 입력)',
   '{group} = 그룹명 · 본문은 사용자가 입력', '📣', 101)
on conflict (key) do update set label = excluded.label, vars = excluded.vars, sort_order = excluded.sort_order;
-- 기본 이모지 배경색(빨강 계열) — 이미 값이 있으면 유지
update public.notif_templates set emoji_bg = coalesce(emoji_bg, '#fdeceb') where key = 'megaphone';

insert into public.notif_templates (key, label, title, body, vars, sort_order) values
  ('purin_mic', '연인이 푸린 마이크 사용', '연인이 내 프로필 사진에 낙서했어요', '24시간 동안 낙서가 남아 있어요',
   '{actor} = 사용한 사람 닉네임', 62)
on conflict (key) do update set label = excluded.label, vars = excluded.vars, sort_order = excluded.sort_order;

insert into public.notif_templates (key, label, title, body, vars, sort_order) values
  ('polaroid',      '사진 도착',       '{actor} 님이 폴라로이드 사진을 보냈어요', '쪽지함에서 인화해 보세요 📷', '{actor} = 보낸 사람', 78),
  ('polaroid_anon', '사진 도착(익명)', '익명의 폴라로이드 사진이 도착했어요',    '쪽지함에서 인화해 보세요 📷', '(치환자 없음)', 79)
on conflict (key) do update set label = excluded.label, vars = excluded.vars, sort_order = excluded.sort_order;

-- 6-2) 상점 아이템 — 명찰 / 타임머신: 프리미엄 상점에 정식 오픈(admin_only = false).
--      명찰 = couple(커플 그룹만), 타임머신 = null(프리미엄 그룹 공통). (premium-items-open.sql 최종 상태)
update public.store_items
   set admin_only = false, is_active = true, premium = true, tier = 'couple'
 where id = 'name-tag';

update public.store_items
   set admin_only = false, is_active = true, premium = true, tier = null
 where id = 'time-machine';

-- 6-3) 상점 아이템 — 푸린 마이크(커플 전용, 관리자 전용 노출)
insert into public.store_items (id, name, price, emoji, description, premium, tier, admin_only, category, sort_order, is_active) values
  ('purin-mic', '푸린 마이크', 30, '🎤', '24시간 동안 짝꿍 프로필 사진에 낙서할 수 있어요', true, 'couple', true, 'feature', 47, true)
on conflict (id) do update set
  name = excluded.name, price = excluded.price, emoji = excluded.emoji,
  admin_only = excluded.admin_only, category = excluded.category, is_active = excluded.is_active;

-- 6-4) 상점 아이템 — 폴라로이드 필름(프리미엄 아님, 관리자 전용, 5 츄르)
insert into public.store_items (id, name, price, emoji, description, premium, tier, admin_only, category, sort_order, is_active) values
  ('polaroid-film', '폴라로이드 필름', 5, '📷', '쪽지에 사진을 첨부해요 (최대 5장)', false, null, true, 'feature', 45, true)
on conflict (id) do update set
  name = excluded.name, price = excluded.price, emoji = excluded.emoji,
  admin_only = excluded.admin_only, category = excluded.category, is_active = excluded.is_active;
  -- description, sort_order 는 관리자 편집 보존을 위해 갱신하지 않음

-- 6-5) 상점 아이템 — 물풍선 폭탄(지우개(8)와 천체 망원경(9) 사이에 삽입, 최초 1회만)
do $$
begin
  if not exists (select 1 from public.store_items where id = 'waterbomb') then
    update public.store_items set sort_order = sort_order + 1 where sort_order >= 9;
    insert into public.store_items (id, name, price, emoji, description, gift_only, sort_order)
      values ('waterbomb', '물풍선 폭탄', 10, '💧',
              E'타이머가 0이 되면 물풍선이 터져요\n쪽지가 다 젖어서 다시 읽을 수 없게 돼요', false, 9);
  end if;
end $$;

-- 6-6) 상점 아이템 — 꾸미기 테마: 버블버블 / 폭죽 팡팡 / 워터파크
--      (프리미엄, tier=null=아무 프리미엄 그룹, 관리자 전용, 30 츄르. description 은 관리자 모드에서
--      입력 → 갱신하지 않고 보존. 적용 로직은 apply_group_theme RPC 가 임의 테마값을 허용하므로
--      새 테마 추가 시 백엔드 추가 변경이 불필요하다.)
insert into public.store_items
  (id, name, price, emoji, description, premium, tier, admin_only, category, sort_order, is_active)
values
  ('theme-bubble',   '버블버블',  30, '🫧', '', true, null, true, 'theme', 13, true),
  ('theme-firework', '폭죽 팡팡', 30, '🎆', '', true, null, true, 'theme', 14, true)
on conflict (id) do update set
  name       = excluded.name,
  price      = excluded.price,
  emoji      = excluded.emoji,
  premium    = excluded.premium,
  tier       = excluded.tier,
  admin_only = excluded.admin_only,
  category   = excluded.category,
  is_active  = excluded.is_active;

insert into public.store_items
  (id, name, price, emoji, description, premium, tier, admin_only, category, sort_order, is_active)
values
  ('theme-waterpark', '워터파크', 30, '🛟', '', true, null, true, 'theme', 15, true)
on conflict (id) do update set
  name       = excluded.name,
  price      = excluded.price,
  emoji      = excluded.emoji,
  premium    = excluded.premium,
  tier       = excluded.tier,
  admin_only = excluded.admin_only,
  category   = excluded.category,
  is_active  = excluded.is_active;


-- =====================================================================
-- 7. PostgREST 스키마 리로드 (폴라로이드 관련 함수 시그니처 추가에 맞춰)
-- =====================================================================

notify pgrst, 'reload schema';
