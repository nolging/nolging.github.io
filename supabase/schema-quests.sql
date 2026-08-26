-- =============================================================
--  퀘스트 시스템 통합본 (schema-quests.sql)
--  · 데일리 퀘스트(출석/그룹방문/쪽지) + 랜덤 퀘스트(5칸 슬롯, 30분 쿨다운, 관리자 CRUD)
--  · 원래 아래 12개 파일에 나뉘어 있던 내용을 하나로 합친 것 (repo 정리 작업):
--      quests.sql, quests-v2.sql, quest-badge.sql, quest-daily-defs.sql,
--      quest-random-emoji-bg.sql, quests-more.sql, quest-reward-reason.sql,
--      quest-nyangpito-fix.sql, quest-item-note-fix.sql, quest-item-present-purin.sql,
--      quest-item-note-fix-2.sql, quest-purin-mic-active-exclude.sql
--  · schema.sql + schema-v2.sql 적용 후, 새 환경에 한 번에 적용하는 용도로 작성됨.
--  · 이미 위 12개 파일을 개별 적용해 온 운영 DB에는 다시 실행할 필요 없음(전부 이미
--    반영돼 있음) — 이 파일은 문서화/재해복구/신규 환경 셋업용.
--  · 각 함수는 여러 번 재정의된 이력이 있고, 이 파일은 매번 "최종 버전"만 담았다:
--    _quest_done 은 quest-item-note-fix-2.sql 버전(그 자체가 "이후로는 이것만 실행하면
--    됨"이라고 명시한 최종 통합본), _quest_pick 은 quest-purin-mic-active-exclude.sql
--    버전(활성 아이템 제외 로직 포함)이 최종.
--  · 의도적으로 제외한 것: 단일 랜덤 퀘스트(quest_random 테이블) 방식은 quests-v2.sql
--    에서 5칸 슬롯(quest_slots) 방식으로 완전히 대체됐고, quest_random 테이블과
--    reroll_random_quest() 함수는 quests-v2.sql 이 명시적으로 drop 했으므로 포함하지
--    않는다. 그에 딸려 있던 _quest_is_premium() / _quest_pick_random(text) /
--    _quest_meta(text) 도 v2 이후로는 아무 데서도 호출되지 않는 죽은 코드라 제외했다.
-- =============================================================


-- =========================
-- 1. 테이블 (생성 + 컬럼 추가)
-- =========================

-- 데일리 '그룹 방문' 판정용: 마지막 그룹 방문 시각
alter table public.profiles add column if not exists last_group_visit_at timestamptz;

-- 데일리 퀘스트 수령 기록(중복 수령 방지). day = KST 날짜.
create table if not exists public.quest_daily_claims (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  quest_key  text not null,
  day        date not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, quest_key, day)
);
alter table public.quest_daily_claims enable row level security;
drop policy if exists qdc_self on public.quest_daily_claims;
create policy qdc_self on public.quest_daily_claims for select to authenticated using (user_id = auth.uid());

-- 랜덤 퀘스트 정의(관리자 CRUD). id = 완료 판정 키(_quest_done 의 case 키).
create table if not exists public.quest_defs (
  id          text primary key,
  title       text not null,
  body        text not null default '',
  emoji       text not null default '✨',    -- 마이 페이지 랜덤 퀘스트 카드 아이콘
  reward      int  not null default 1 check (reward >= 0),
  grade       text not null default 'all',   -- all | premium | vvip | vip
  active      boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
alter table public.quest_defs add column if not exists emoji text not null default '✨';
alter table public.quest_defs add column if not exists reward_reason text; -- 츄르 내역 사유(비워두면 제목 대체)
alter table public.quest_defs add column if not exists emoji_bg text not null default '#eef0f2';
alter table public.quest_defs enable row level security;
drop policy if exists quest_defs_select on public.quest_defs;
create policy quest_defs_select on public.quest_defs for select to authenticated using (true);
drop policy if exists quest_defs_write on public.quest_defs;
create policy quest_defs_write on public.quest_defs for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- 랜덤 퀘스트 5칸 슬롯(사용자당 5개, 슬롯별 완료 후 30분 쿨다운)
create table if not exists public.quest_slots (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  slot         int not null check (slot between 1 and 5),
  quest_key    text not null,
  assigned_at  timestamptz not null default now(),   -- 노출 시각(완료 판정 기준)
  available_at timestamptz not null default now(),   -- 이 시각부터 노출(쿨다운 종료)
  primary key (user_id, slot)
);
alter table public.quest_slots enable row level security;
drop policy if exists qs_self on public.quest_slots;
create policy qs_self on public.quest_slots for select to authenticated using (user_id = auth.uid());

-- 데일리 퀘스트 정의(관리자 CRUD). key 는 완료 판정 키(_quest_done 의 case 키)와 일치해야 함.
create table if not exists public.quest_daily_defs (
  key         text primary key,
  title       text not null,
  emoji       text not null default '✨',
  emoji_bg    text not null default '#eef0f2',
  reward      int  not null default 1 check (reward >= 0),
  sort_order  int  not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table public.quest_daily_defs add column if not exists reward_reason text; -- 츄르 내역 사유(비워두면 제목 대체)
alter table public.quest_daily_defs enable row level security;
drop policy if exists quest_daily_defs_select on public.quest_daily_defs;
create policy quest_daily_defs_select on public.quest_daily_defs for select to authenticated using (true);
drop policy if exists quest_daily_defs_write on public.quest_daily_defs;
create policy quest_daily_defs_write on public.quest_daily_defs for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- 방문/접촉형(데이트·뽀뽀·프리미엄상점·일정 등) 퀘스트용 이벤트 기록 (키별 마지막 발생 시각)
create table if not exists public.quest_events (
  user_id uuid not null references public.profiles(id) on delete cascade,
  key     text not null,
  at      timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.quest_events enable row level security;
drop policy if exists qe_self on public.quest_events;
create policy qe_self on public.quest_events for select to authenticated using (user_id = auth.uid());


-- =========================
-- 2. 헬퍼 함수 (의존 순서대로: 등급 → 등급판정 → 뽑기 → 완료판정)
-- =========================

-- profiles 쓰기는 정의자 함수로만 (그룹 상세 진입 시 호출)
create or replace function public.touch_group_visit()
returns void language sql security definer set search_path = public as $$
  update public.profiles set last_group_visit_at = now() where id = auth.uid();
$$;

-- 방문/접촉형 퀘스트 이벤트 기록(프런트에서 호출)
create or replace function public.touch_quest(p_key text)
returns void language sql security definer set search_path = public as $$
  insert into public.quest_events(user_id, key, at) values (auth.uid(), p_key, now())
  on conflict (user_id, key) do update set at = now();
$$;

-- 사용자 등급(커플/우정 링 장착 여부)
create or replace function public._quest_user_grade()
returns text language sql security definer set search_path = public as $$
  select case
    when exists(select 1 from public.user_items where user_id=auth.uid() and item_id='couple-ring' and status='used') then 'vvip'
    when exists(select 1 from public.user_items where user_id=auth.uid() and item_id='friend-ring' and status='used') then 'vip'
    else 'normal' end;
$$;

-- 등급 노출 판정
create or replace function public._quest_grade_ok(p_qgrade text, p_ugrade text)
returns boolean language sql immutable as $$
  select case p_qgrade
    when 'all' then true
    when 'premium' then p_ugrade in ('vvip','vip')
    when 'vvip' then p_ugrade = 'vvip'
    when 'vip' then p_ugrade = 'vip'
    else false end;
$$;

-- 활성 + 등급 충족 퀘스트 중 p_exclude 제외하고 랜덤 하나(없으면 제외 무시).
-- '이미 사용 중인 아이템' 효과가 아직 살아있는 동안은 그 퀘스트를 새로 배정하지 않음
-- (r_purin_mic: 푸린 마이크 24시간 낙서 효과, r_nametag: 명찰 24시간 잠금 효과,
--  r_ledboard: 내 전광판 게재 중) — 최종본(quest-purin-mic-active-exclude.sql).
create or replace function public._quest_pick(p_exclude text[])
returns text language plpgsql security definer set search_path = public as $$
declare
  v_g text := public._quest_user_grade();
  v_uid uuid := auth.uid();
  v_key text;
  v_purin_active boolean := exists(
    select 1 from public.profile_graffiti where artist_id = v_uid and expires_at > now()
  );
  v_nametag_active boolean := exists(
    select 1 from public.group_members where nick_locked_by = v_uid and nick_locked_until > now()
  );
  v_ledboard_active boolean := exists(
    select 1 from public.led_banners where owner_id = v_uid and active and expires_at > now()
  );
begin
  select d.id into v_key from public.quest_defs d
  where d.active and public._quest_grade_ok(d.grade, v_g)
    and not (d.id = any(coalesce(p_exclude, array[]::text[])))
    and not (d.id = 'r_purin_mic' and v_purin_active)
    and not (d.id = 'r_nametag' and v_nametag_active)
    and not (d.id = 'r_ledboard' and v_ledboard_active)
  order by random() limit 1;
  if v_key is null then
    select d.id into v_key from public.quest_defs d
    where d.active and public._quest_grade_ok(d.grade, v_g)
      and not (d.id = 'r_purin_mic' and v_purin_active)
      and not (d.id = 'r_nametag' and v_nametag_active)
      and not (d.id = 'r_ledboard' and v_ledboard_active)
    order by random() limit 1;
  end if;
  return v_key;
end $$;

-- 퀘스트 완료 판정. p_since 이후의 행동을 기준으로 판단.
-- 최종본(quest-item-note-fix-2.sql): quest-item-note-fix.sql 의 r_item_note 수정
-- (아이템 '선물' kind='gift' 는 제외, 강화 아이템을 '사용'해 쪽지를 보냈을 때만 완료)
-- + quest-item-present-purin.sql 의 r_item_present/r_purin_mic 를 합친 최종 버전.
create or replace function public._quest_done(p_key text, p_since timestamptz)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  return case p_key
    when 'attend'      then true
    when 'visit'       then exists(select 1 from public.profiles where id = v_uid and last_group_visit_at >= p_since)
    when 'note'        then exists(select 1 from public.notes where sender_id = v_uid and created_at >= p_since)
    when 'r_wish'      then exists(select 1 from public.tasks where created_by = v_uid and created_at >= p_since)
    -- 강화 아이템 '사용'만 인정(아이템 선물 kind='gift' 는 제외):
    --   선물상자(link)/이어폰(cassette)/비디오(video)/블루레이(bluray)/폴라로이드필름(polaroid) → kind
    --   지우개 → 익명(anonymous=true) / 물풍선 폭탄 → 타이머(timer_seconds is not null)
    when 'r_item_note' then exists(select 1 from public.notes where sender_id = v_uid and created_at >= p_since
                                     and coalesce(kind, '') <> 'gift'
                                     and (kind in ('cassette','video','bluray','link','polaroid') or anonymous = true or timer_seconds is not null))
    -- 긁는 '행동'으로 판정(당첨/꽝 무관): 냥피또가 used 로 소모됐는지
    when 'r_nyangpito' then exists(select 1 from public.user_items where user_id = v_uid and item_id = 'nyangpito' and status = 'used' and used_at >= p_since)
    when 'r_buy'       then exists(select 1 from public.coin_ledger where user_id = v_uid and ref_type = 'purchase' and created_at >= p_since)
    when 'r_spend10'   then coalesce((select -sum(delta) from public.coin_ledger
                                        where user_id = v_uid and delta < 0 and created_at >= p_since), 0) >= 10
    when 'r_game_win'  then exists(select 1 from public.coin_ledger where user_id = v_uid and delta > 0
                                     and ref_type in ('omok','catchmind','rps') and created_at >= p_since)
    when 'r_poke'      then exists(select 1 from public.notifications where actor_id = v_uid and type = 'poke' and created_at >= p_since)
    when 'r_date'          then exists(select 1 from public.quest_events where user_id = v_uid and key = 'r_date' and at >= p_since)
    when 'r_doodle'        then exists(select 1 from public.group_drawings where author = v_uid and created_at >= p_since)
    when 'r_kiss'          then exists(select 1 from public.quest_events where user_id = v_uid and key = 'r_kiss' and at >= p_since)
    when 'r_accept'        then exists(select 1 from public.tasks where assignee_id = v_uid and accepted_at >= p_since)
    when 'r_waterbomb'     then exists(select 1 from public.notes where sender_id = v_uid and timer_seconds is not null and created_at >= p_since)
    when 'r_deco'          then exists(select 1 from public.user_items where user_id = v_uid and item_id like 'deco-%' and status = 'used' and used_at >= p_since)
    when 'r_premium_shop'  then exists(select 1 from public.quest_events where user_id = v_uid and key = 'r_premium_shop' and at >= p_since)
    when 'r_review'        then exists(select 1 from public.task_reviews where author_id = v_uid and created_at >= p_since)
    when 'r_first_comment' then exists(select 1 from public.task_comments c where c.author_id = v_uid and c.created_at >= p_since
                                         and not exists(select 1 from public.task_comments c2 where c2.task_id = c.task_id and c2.created_at < c.created_at))
    when 'r_schedule'      then exists(select 1 from public.quest_events where user_id = v_uid and key = 'r_schedule' and at >= p_since)
    -- 관리자가 관리자 페이지에서 직접 등록한 퀘스트(quest_defs 시드 없이 앱에서 생성됨)
    when 'r_item_present'  then exists(select 1 from public.notes where sender_id = v_uid and kind = 'gift' and created_at >= p_since)
    when 'r_purin_mic'     then exists(select 1 from public.user_items where user_id = v_uid and item_id = 'purin-mic' and status = 'used' and used_at >= p_since)
    else false end;
end $$;


-- =========================
-- 3. 공개 RPC
-- =========================

-- 마이 페이지 퀘스트 상태 조회(+잔액/등급). 데일리는 quest_daily_defs 에서, 랜덤은
-- 5칸 슬롯 보장 + 노출 상태 슬롯의 무효 퀘스트(비활성/삭제/등급불일치) 자동 교체.
-- 쿨다운 중에도 '다음 퀘스트' 내용은 노출(진행은 available_at 이후 가능). emoji/emoji_bg 포함.
create or replace function public.get_quests()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'Asia/Seoul')::date;
  v_day_start timestamptz := (v_day::timestamp at time zone 'Asia/Seoul');
  v_bal int; v_grade text; v_daily jsonb; v_slots jsonb; i int;
begin
  select coalesce(sum(delta),0) into v_bal from public.coin_ledger where user_id = v_uid;
  v_grade := public._quest_user_grade();

  select jsonb_agg(jsonb_build_object('key',d.key,'label',d.title,'reward',d.reward,
      'emoji', d.emoji, 'emoji_bg', d.emoji_bg,
      'done', public._quest_done(d.key, v_day_start),
      'claimed', exists(select 1 from public.quest_daily_claims c where c.user_id=v_uid and c.quest_key=d.key and c.day=v_day)) order by d.sort_order)
    into v_daily
  from public.quest_daily_defs d where d.active;

  -- 슬롯 보장 + 노출 상태 슬롯의 무효 퀘스트(비활성/삭제/등급불일치) 교체
  for i in 1..5 loop
    if not exists (select 1 from public.quest_slots where user_id=v_uid and slot=i) then
      insert into public.quest_slots(user_id, slot, quest_key, assigned_at, available_at)
        values (v_uid, i, public._quest_pick(array(select quest_key from public.quest_slots where user_id=v_uid)), now(), now())
        on conflict do nothing;
    else
      update public.quest_slots s set
        quest_key = public._quest_pick(array(select quest_key from public.quest_slots where user_id=v_uid and slot<>i)),
        assigned_at = now(), available_at = now()
      where s.user_id=v_uid and s.slot=i and s.available_at <= now()
        and not exists (select 1 from public.quest_defs d
                        where d.id=s.quest_key and d.active and public._quest_grade_ok(d.grade, v_grade));
    end if;
  end loop;

  -- 쿨다운 중에도 '다음 퀘스트' 내용은 노출(진행은 available_at 이후 가능)
  select jsonb_agg(jsonb_build_object(
      'slot', s.slot,
      'cooldown_until', case when s.available_at > now() then s.available_at else null end,
      'assigned_at', s.assigned_at,
      'key',    s.quest_key,
      'title',  dq.title,
      'body',   dq.body,
      'emoji',  dq.emoji,
      'emoji_bg', dq.emoji_bg,
      'reward', dq.reward,
      'done',   case when s.available_at <= now() then public._quest_done(s.quest_key, s.assigned_at) else false end
    ) order by s.slot)
    into v_slots
  from public.quest_slots s left join public.quest_defs dq on dq.id = s.quest_key
  where s.user_id = v_uid;

  return jsonb_build_object('balance',v_bal,'grade',v_grade,'daily',coalesce(v_daily,'[]'::jsonb),'slots',coalesce(v_slots,'[]'::jsonb));
end $$;

-- 데일리 퀘스트 보상 수령. 당일 1회. 보상액/사유는 quest_daily_defs 에서 조회.
-- 츄르 내역 사유는 "데일리 퀘스트 - {reward_reason 또는 title}" 형식으로 남긴다.
create or replace function public.claim_quest(p_key text)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'Asia/Seoul')::date;
  v_day_start timestamptz := (v_day::timestamp at time zone 'Asia/Seoul');
  v_reward int; v_title text; v_reason text;
begin
  if p_key not in ('attend','visit','note') then raise exception '알 수 없는 퀘스트예요.'; end if;
  if exists(select 1 from public.quest_daily_claims where user_id=v_uid and quest_key=p_key and day=v_day) then
    raise exception '이미 수령한 퀘스트예요.'; end if;
  if not public._quest_done(p_key, v_day_start) then raise exception '아직 완료하지 않았어요.'; end if;
  select reward, title, reward_reason into v_reward, v_title, v_reason from public.quest_daily_defs where key = p_key;
  v_reward := coalesce(v_reward, 0);
  insert into public.quest_daily_claims(user_id, quest_key, day) values (v_uid, p_key, v_day);
  insert into public.coin_ledger(user_id, delta, reason, ref_type)
    values (v_uid, v_reward, '데일리 퀘스트 - ' || coalesce(nullif(btrim(v_reason), ''), v_title), 'quest');
  return (select coalesce(sum(delta),0) from public.coin_ledger where user_id = v_uid);
end $$;

-- 랜덤 슬롯 보상 수령 → 30분 후 다음 퀘스트로 교체. 반환=새 잔액.
-- 츄르 내역 사유는 "랜덤 퀘스트 - {reward_reason 또는 title}" 형식으로 남긴다.
create or replace function public.claim_slot_quest(p_slot int)
returns int language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_slot public.quest_slots; v_reward int; v_title text; v_reason text;
begin
  select * into v_slot from public.quest_slots where user_id=v_uid and slot=p_slot;
  if v_slot.user_id is null then raise exception '슬롯이 없어요.'; end if;
  if v_slot.available_at > now() then raise exception '아직 쿨다운 중이에요.'; end if;
  if not public._quest_done(v_slot.quest_key, v_slot.assigned_at) then raise exception '아직 완료하지 않았어요.'; end if;
  select reward, title, reward_reason into v_reward, v_title, v_reason from public.quest_defs where id=v_slot.quest_key and active;
  if coalesce(v_reward,0) <= 0 then raise exception '보상을 확인할 수 없어요.'; end if;
  insert into public.coin_ledger(user_id, delta, reason, ref_type)
    values (v_uid, v_reward, '랜덤 퀘스트 - ' || coalesce(nullif(btrim(v_reason), ''), v_title), 'quest');
  update public.quest_slots set
    quest_key = public._quest_pick(array(select quest_key from public.quest_slots where user_id=v_uid and slot<>p_slot)),
    assigned_at = now() + interval '30 minutes',
    available_at = now() + interval '30 minutes'
  where user_id=v_uid and slot=p_slot;
  return (select coalesce(sum(delta),0) from public.coin_ledger where user_id = v_uid);
end $$;

-- 랜덤 슬롯 교체(1츄르, 노출 중인 슬롯만). 반환=갱신된 get_quests().
create or replace function public.reroll_slot_quest(p_slot int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_slot public.quest_slots; v_bal int;
begin
  select * into v_slot from public.quest_slots where user_id=v_uid and slot=p_slot;
  if v_slot.user_id is null then raise exception '슬롯이 없어요.'; end if;
  if v_slot.available_at > now() then raise exception '쿨다운 중에는 바꿀 수 없어요.'; end if;
  select coalesce(sum(delta),0) into v_bal from public.coin_ledger where user_id=v_uid;
  if v_bal < 1 then raise exception '츄르가 부족해요.'; end if;
  insert into public.coin_ledger(user_id, delta, reason, ref_type) values (v_uid, -1, '랜덤 퀘스트 교체', 'quest_reroll');
  update public.quest_slots set
    quest_key = public._quest_pick(array(select quest_key from public.quest_slots where user_id=v_uid and slot<>p_slot) || array[v_slot.quest_key]),
    assigned_at = now(), available_at = now()
  where user_id=v_uid and slot=p_slot;
  return public.get_quests();
end $$;

-- 하단 탭 "마이" 배지: 완료돼서 "받기" 가능한 퀘스트가 있는지 가벼운 boolean 으로 확인.
--   · get_quests() 는 슬롯 5칸 보장/무효 슬롯 교체(쓰기)까지 하는 무거운 함수라, 60초마다
--     전 페이지에서 폴링하는 배지 체크용으로는 부적합 — 쓰기 없는 순수 조회 함수.
--   · "받기" 버튼이 뜨는 조건과 정확히 같아야 한다: 데일리는 완료(_quest_done)했지만 그날
--     아직 claim 안 한 것, 랜덤 슬롯은 쿨다운이 끝났고(available_at<=now) 완료된 것.
create or replace function public.has_claimable_quest()
returns boolean language plpgsql security definer set search_path = public stable as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'Asia/Seoul')::date;
  v_day_start timestamptz := (v_day::timestamp at time zone 'Asia/Seoul');
begin
  if v_uid is null then return false; end if;

  if exists (
    select 1 from (values ('attend',1),('visit',2),('note',3)) as d(key, ord)
    where public._quest_done(d.key, v_day_start)
      and not exists (
        select 1 from public.quest_daily_claims c
        where c.user_id = v_uid and c.quest_key = d.key and c.day = v_day
      )
  ) then return true; end if;

  if exists (
    select 1 from public.quest_slots s
    where s.user_id = v_uid and s.available_at <= now()
      and public._quest_done(s.quest_key, s.assigned_at)
  ) then return true; end if;

  return false;
end;
$$;


-- =========================
-- 4. 시드 데이터 (quest_daily_defs, quest_defs)
-- =========================

-- 데일리 퀘스트 3종(기존 하드코딩 값 그대로 시드: MyProfile.jsx 의 QUEST_ICON 과 동일)
insert into public.quest_daily_defs (key, title, emoji, emoji_bg, reward, sort_order) values
  ('attend', '출석하기', '🗓️', '#eef1fb', 1, 1),
  ('visit', '그룹 방문하기', '🚪', '#e8f4ec', 1, 2),
  ('note', '쪽지 보내기', '💌', '#fde8ee', 3, 3)
on conflict (key) do nothing;

-- 랜덤 퀘스트 기존 7종
insert into public.quest_defs (id, title, body, emoji, reward, grade, active, sort_order) values
  ('r_wish','위시 작성하기','아무 그룹에나 위시를 하나 작성해요.','⭐',2,'all',true,1),
  ('r_item_note','아이템 넣어 쪽지 보내기','선물 상자·카세트·비디오 등 아이템을 담아 쪽지를 보내요.','💌',3,'all',true,2),
  ('r_nyangpito','냥피또 긁기','냥피또를 한 번 긁어요.','🐾',2,'all',true,3),
  ('r_buy','상점에서 아이템 구매하기','상점에서 아이템을 하나 구매해요.','🛍️',2,'all',true,4),
  ('r_spend10','10츄르 이상 사용하기','10츄르 이상을 사용해요.','🪙',3,'all',true,5),
  ('r_game_win','게임에서 승리하기','미니 게임에서 승리해요.','🎮',3,'premium',true,6),
  ('r_poke','콕 찌르기','상대를 콕 찔러요.','👉',1,'premium',true,7)
on conflict (id) do nothing;

-- 랜덤 퀘스트 추가 10종
insert into public.quest_defs (id, title, body, emoji, reward, grade, active, sort_order) values
  ('r_date',         '데이트하러 가기', '보고 싶어서 괜히 기웃기웃',        '💖', 2, 'vvip',    true, 10),
  ('r_doodle',       '낙서 끄적거리기', '텔레파시 보내면 누군가 나타날지도?','✏️', 3, 'premium', true, 11),
  ('r_kiss',         '쪽 쪽 뽀갈',      '박력 있게 벽치기 쾅',              '💋', 5, 'vvip',    true, 12),
  ('r_accept',       '놀기 신청',       '함께하는 일정을 만들어 봐요',      '📆', 3, 'all',     true, 13),
  ('r_waterbomb',    '워터밤 즐기기',   '물풍선 폭탄을 던져 볼까요?',        '💦', 7, 'all',     true, 14),
  ('r_deco',         '오늘 느낌 꾸꾸꾸', '프로필 꾸미기로 단장해 봐요',      '✨', 3, 'premium', true, 15),
  ('r_premium_shop', '프리미엄 상점 입장','프리미엄 등급의 특권을 누려요',   '💍', 2, 'premium', true, 16),
  ('r_review',       '리뷰 작성하기',   '함께한 추억에 리뷰를 남겨 주세요', '⭐️', 3, 'all',     true, 17),
  ('r_first_comment','첫 댓글 달기',    '무플방지위원회에서 나왔습니다',     '💬', 3, 'all',     true, 18),
  ('r_schedule',     '일정 확인하기',   '이번 달 일정을 확인해 보세요',      '🗓', 2, 'all',     true, 19)
on conflict (id) do nothing;

-- r_item_present("아이템 택배 보내기"), r_purin_mic("얼굴에 낙서하기")는 관리자 페이지에서
-- 직접 등록된 quest_defs 행이라 SQL 시드가 없음 — _quest_done 의 CASE 분기만 여기 포함됨.
-- r_nametag("명찰 빼앗기"), r_ledboard("전광판 게재하기")도 마찬가지로 관리자 페이지에서
-- 등록된 quest_defs 행으로 보이며(_quest_pick 의 활성 아이템 제외 로직에서만 참조),
-- 이 12개 소스 파일 안에는 _quest_done 판정 분기도 quest_defs 시드도 없다 — 완료 판정이
-- 어떻게 되는지는 이 번들 범위 밖(다른 파일이나 앱 코드에 있을 수 있음)이라 확인 필요.


-- =========================
-- 5. 함수 실행 권한
-- =========================
grant execute on function public.touch_group_visit() to authenticated;
grant execute on function public.touch_quest(text) to authenticated;
grant execute on function public.get_quests() to authenticated;
grant execute on function public.claim_quest(text) to authenticated;
grant execute on function public.claim_slot_quest(int) to authenticated;
grant execute on function public.reroll_slot_quest(int) to authenticated;
grant execute on function public.has_claimable_quest() to authenticated;
