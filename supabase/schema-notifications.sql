-- =============================================================
--  알림(notifications) 시스템 통합본
--  ---------------------------------------------------------------
--  원래 아래 16개의 개별 SQL 파일로 나뉘어 순차 적용되던 것을 하나로 묶었습니다.
--    notif-templates.sql              (템플릿 테이블 + notif_render + 핵심 알림 5종 트리거)
--    comment-mentions.sql             (댓글 @멘션: mentioned_ids 컬럼 + 트리거 1차 개편)
--    notif-comment-status.sql         (댓글 알림 {noun} 을 항목 현재 상태로 계산)
--    notif-couple.sql                 (소원권/커플 링/우정 링/리마인더/칭찬 스티커판)
--    notif-emoji.sql                  (notif_templates.emoji 컬럼 + 알림센터 이모지)
--    notif-gift.sql                   (아이템 선물: 상점/인벤토리/묶음)
--    notif-media.sql                  (음악/영상/블루레이/선물 상자 아이템)
--    notif-ledboard-nametag.sql       (전광판/명찰 + notif_templates.emoji_bg)
--    notif-social.sql                 (놀기 신청/콕 찌르기/우심뽀까 부르기)
--    notif-noun-fix.sql               (알림 명칭 통일: 위시/약속/추억)
--    notif-reorder.sql                (관리자 알림 목록 정렬 순서 변경 RPC)
--    memory-review-notifs.sql         (새 추억/새 리뷰 알림 최초 도입)
--    notif-cleanup.sql                (30일 지난 알림 자동 정리 cron)
--    notif-admin-catalog-fix.sql      (새 추억/리뷰/물음표 공방 댓글·답글을 템플릿화)
--    notif-strict-templates.sql       (1단계: notif_render 가 비활성 템플릿을 null 처리)
--    notif-strict-templates-2.sql     (2단계: 모든 발송 지점에서 하드코딩 폴백 제거)
--
--  이 저장소는 마이그레이션 툴 없이 Supabase SQL Editor 로 그때그때 적용해 온 터라,
--  같은 함수/트리거가 여러 파일에 걸쳐 반복 재정의됩니다. 이 파일은 그 중 "최신" 버전만
--  모아 정리한 것으로, 리포 정리 작업의 일부로 생성되었습니다.
--
--  실행 시점: schema.sql, schema-v2.sql 이후. 이미 운영 DB에는 원본 파일들로 순차
--  적용이 끝난 상태이므로 이 파일을 운영 DB에 다시 실행할 필요는 없습니다.
--  문서화 · 재해복구 · 새 환경(fresh) 구축 시 참고용입니다.
--
--  ── 스코프 밖 안내(확인 완료) ──────────────────────────────────
--  notif-strict-templates-2.sql 은 앱 전역의 "알림 발송 지점"을 훑으며 하드코딩 폴백을
--  제거한 대규모 리팩터라서, 아래 함수들도 함께 재정의했습니다:
--    use_polaroid_film, megaphone_send, use_purin_mic,
--    board_create_post, board_add_comment,
--    submit_error_report, admin_send_error_report, reply_error_report
--  이들은 폴라로이드/확성기/푸린 마이크/비밀 게시판/오류 리포트라는 별도 도메인의
--  핵심 로직을 담고 있어 알림 도메인 순수성을 지키기 위해 이 파일에는 포함하지
--  않았습니다 — 각각 schema-premium-items.sql(폴라로이드/확성기/푸린 마이크),
--  schema-board.sql, schema-error-reports.sql 에 이 파일과 동일한(하드코딩 폴백 제거된)
--  최종 버전으로 반영돼 있는지 교차 확인 완료.
--
--  notif_render() 의 최신 버전(아래)은 `notif_templates.active` 컬럼을 참조합니다.
--  이 컬럼은 admin-notif-active.sql(이 번들에 포함되지 않음)에서 추가되며,
--  admin_set_notif() 도 그 파일에서 6번째 인자(p_active)를 받는 버전으로 다시
--  재정의됩니다. 이 파일에는 그 이전 단계(5-인자, emoji/emoji_bg 까지)만 담았으니,
--  `active` 컬럼을 추가하는 스키마가 별도로 적용되어 있어야 notif_render 가 정상
--  동작합니다(컬럼 없이 새 환경에 이 파일만 실행하면 notif_render 호출 시점에
--  "column active does not exist" 런타임 오류가 납니다).
-- =============================================================


-- =============================================================
--  1. 테이블: notif_templates
-- =============================================================

create table if not exists public.notif_templates (
  key        text primary key,
  label      text not null,            -- 관리자 목록에 보일 이름
  title      text not null,            -- 제목 템플릿
  body       text not null,            -- 본문 템플릿
  vars       text,                     -- 사용 가능한 치환자 안내(예: {actor}, {text})
  sort_order int  not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.notif_templates enable row level security;  -- 접근은 정의자/관리자 RPC 로만

-- 알림센터 이모지(관리자 편집 가능)
alter table public.notif_templates add column if not exists emoji text;

-- 알림센터 이모지 배경색(#RRGGBB). null 이면 프런트 기본 스타일(타입별 CSS) 사용.
alter table public.notif_templates add column if not exists emoji_bg text;
comment on column public.notif_templates.emoji_bg is
  '알림센터 이모지 배경색(#RRGGBB). null 이면 프런트 기본 스타일(타입별 CSS) 사용.';

-- 댓글 @멘션에 필요한 컬럼 (task_comments 쪽)
alter table public.task_comments
  add column if not exists mentioned_ids uuid[];


-- =============================================================
--  2. 헬퍼 함수: 렌더 / 관리자 조회·수정·정렬 / 이모지·스타일 맵
-- =============================================================

-- 렌더: 템플릿의 {키} 를 vars 값으로 치환.
-- 템플릿이 없거나 비활성(active = false, notif-strict-templates.sql 이후)이면
-- title/body 를 null 로 반환 — 호출부는 이 경우 알림 발송 자체를 건너뛴다
-- (notif-strict-templates.sql / notif-strict-templates-2.sql: "하드코딩 문구로 폴백" 제거).
create or replace function public.notif_render(p_key text, p_vars jsonb default '{}'::jsonb, out title text, out body text)
language plpgsql stable set search_path = public as $$
declare t public.notif_templates; k text; v text;
begin
  select * into t from public.notif_templates where key = p_key and active;
  if t.key is null then title := null; body := null; return; end if;
  title := t.title; body := t.body;
  for k, v in select key, value from jsonb_each_text(coalesce(p_vars, '{}'::jsonb)) loop
    title := replace(title, '{' || k || '}', coalesce(v, ''));
    body  := replace(body,  '{' || k || '}', coalesce(v, ''));
  end loop;
end $$;

-- 알림 명칭 통일: 모든 그룹에서 위시/약속/추억 사용('태스크' 폐기, notif-noun-fix.sql)
create or replace function public.notif_noun(p_type text)
returns text language sql immutable as $$
  select '위시';
$$;

-- 관리자 조회 RPC
create or replace function public.admin_list_notifs()
returns setof public.notif_templates language plpgsql security definer set search_path = public stable as $$
begin
  if not public.is_admin(auth.uid()) then raise exception '권한이 없습니다.'; end if;
  return query select * from public.notif_templates order by sort_order, key;
end $$;
grant execute on function public.admin_list_notifs() to authenticated;

-- 관리자 수정 RPC: admin_set_notif() 는 이 파일 소관이 아니라 schema-admin.sql 참고.
-- (admin-notif-active.sql 에서 p_active 6번째 인자 버전으로 다시 재정의됨 — 그게 최종본이라
--  schema-admin.sql 에 있고, notif_templates.active 컬럼도 그 파일에서 추가된다. 이 파일의
--  notif_render() 는 그 컬럼을 참조하므로, 새 환경에 적용할 땐 이 파일 다음에 schema-admin.sql
--  도 반드시 적용해야 한다 — 순서: schema.sql → schema-v2.sql → 이 파일 → schema-admin.sql.)

-- 알림 관리 목록 정렬 순서 변경 RPC (notif-reorder.sql)
-- p_items: [{"key":"...", "sortOrder": n}, ...]
create or replace function public.admin_reorder_notifs(p_items jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_it jsonb;
begin
  if not public.is_admin(auth.uid()) then raise exception '권한이 없습니다.'; end if;
  for v_it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    update public.notif_templates
       set sort_order = coalesce((v_it->>'sortOrder')::int, sort_order)
     where key = v_it->>'key';
  end loop;
end $$;
grant execute on function public.admin_reorder_notifs(jsonb) to authenticated;

-- 알림센터용 type→emoji 맵(로그인 사용자 누구나) — notif_styles() 도입 이후에도 호환을 위해 유지
create or replace function public.notif_emojis()
returns jsonb language sql security definer set search_path = public stable as $$
  select coalesce(jsonb_object_agg(key, emoji) filter (where emoji is not null), '{}'::jsonb)
  from public.notif_templates;
$$;
grant execute on function public.notif_emojis() to authenticated;

-- 알림센터용 스타일 맵: { key: { emoji, bg } }
create or replace function public.notif_styles()
returns jsonb language sql security definer set search_path = public stable as $$
  select coalesce(
    jsonb_object_agg(key, jsonb_strip_nulls(jsonb_build_object('emoji', emoji, 'bg', emoji_bg)))
      filter (where emoji is not null or emoji_bg is not null),
    '{}'::jsonb)
  from public.notif_templates;
$$;
grant execute on function public.notif_styles() to authenticated;


-- =============================================================
--  3. 트리거 함수: 댓글/답글/멘션, 새 항목, 새 멤버, 약속→추억 전환
--     (notif-strict-templates-2.sql 최종본: 템플릿 없음/비활성이면 발송 자체를 건너뜀)
-- =============================================================

-- 댓글/답글/멘션. {noun} 은 항목의 "현재 상태"로 계산(위시/약속/추억, notif-comment-status.sql).
create or replace function public.tg_notify_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_group public.groups; v_task public.tasks; v_actor text; v_parent uuid;
  v_noun text; v_t text; v_b text;
begin
  select * into v_task  from public.tasks  where id = NEW.task_id;
  select * into v_group from public.groups where id = NEW.group_id;
  v_actor := public.notif_member_name(NEW.group_id, NEW.author_id);
  v_noun := case v_task.status when 'accepted' then '약속' when 'done' then '추억' else '위시' end;

  if NEW.parent_id is not null then
    select author_id into v_parent from public.task_comments where id = NEW.parent_id;
    if v_parent is not null and v_parent <> NEW.author_id then
      select r.title, r.body into v_t, v_b from public.notif_render('reply', jsonb_build_object('actor', v_actor, 'text', NEW.body)) r;
      if v_t is not null then
        insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id, comment_id)
        values (v_parent, NEW.author_id, 'reply', v_t, v_b, NEW.group_id, NEW.task_id, NEW.id);
      end if;
    end if;
    if v_task.created_by is not null and v_task.created_by <> NEW.author_id and v_task.created_by is distinct from v_parent then
      select r.title, r.body into v_t, v_b from public.notif_render('task_comment', jsonb_build_object('noun', v_noun, 'actor', v_actor, 'text', NEW.body)) r;
      if v_t is not null then
        insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id, comment_id)
        values (v_task.created_by, NEW.author_id, 'task_comment', v_t, v_b, NEW.group_id, NEW.task_id, NEW.id);
      end if;
    end if;
  else
    if v_task.created_by is not null and v_task.created_by <> NEW.author_id then
      select r.title, r.body into v_t, v_b from public.notif_render('task_comment', jsonb_build_object('noun', v_noun, 'actor', v_actor, 'text', NEW.body)) r;
      if v_t is not null then
        insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id, comment_id)
        values (v_task.created_by, NEW.author_id, 'task_comment', v_t, v_b, NEW.group_id, NEW.task_id, NEW.id);
      end if;
    end if;
  end if;

  if NEW.mentioned_ids is not null then
    select r.title, r.body into v_t, v_b from public.notif_render('mention', jsonb_build_object('actor', v_actor, 'text', NEW.body)) r;
    if v_t is not null then
      insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id, comment_id)
      select distinct u, NEW.author_id, 'mention', v_t, v_b, NEW.group_id, NEW.task_id, NEW.id
      from unnest(NEW.mentioned_ids) as u
      where u <> NEW.author_id and public.is_group_member(NEW.group_id, u)
        and u is distinct from v_task.created_by and u is distinct from v_parent;
    end if;
  end if;
  return NEW;
end $$;
drop trigger if exists trg_notify_comment on public.task_comments;
create trigger trg_notify_comment after insert on public.task_comments
  for each row execute function public.tg_notify_comment();

-- 새 항목(위시/할 일/추억)
create or replace function public.tg_notify_task_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_group public.groups; v_noun text; v_t text; v_b text;
begin
  if coalesce(current_setting('nolging.silent_task', true), '') = 'on' then return NEW; end if;
  select * into v_group from public.groups where id = NEW.group_id;
  v_noun := public.notif_noun(v_group.group_type);
  select r.title, r.body into v_t, v_b from public.notif_render('new_task', jsonb_build_object('noun', v_noun, 'title', NEW.title)) r;
  if v_t is not null then
    insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id)
    select gm.user_id, NEW.created_by, 'new_task', v_t, v_b, NEW.group_id, NEW.id
    from public.group_members gm
    where gm.group_id = NEW.group_id and gm.user_id <> NEW.created_by and gm.left_at is null;
  end if;
  return NEW;
end $$;
drop trigger if exists trg_notify_task_insert on public.tasks;
create trigger trg_notify_task_insert after insert on public.tasks
  for each row execute function public.tg_notify_task_insert();

-- 새 멤버 가입
create or replace function public.tg_notify_member_join()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text; v_t text; v_b text;
begin
  v_name := coalesce(nullif(trim(NEW.display_nickname), ''), '새 멤버');
  select r.title, r.body into v_t, v_b from public.notif_render('new_member', jsonb_build_object('name', v_name)) r;
  if v_t is not null then
    insert into public.notifications(user_id, actor_id, type, title, body, group_id)
    select gm.user_id, NEW.user_id, 'new_member', v_t, v_b, NEW.group_id
    from public.group_members gm
    where gm.group_id = NEW.group_id and gm.user_id <> NEW.user_id and gm.left_at is null;
  end if;
  return NEW;
end $$;
drop trigger if exists trg_notify_member_join on public.group_members;
create trigger trg_notify_member_join after insert on public.group_members
  for each row execute function public.tg_notify_member_join();

-- 약속(accepted) → 추억(done) 전환: 참여자(작성자 제외)에게 '새 추억' 알림
-- (notif-strict-templates.sql 최종본. new_memory/new_review 는 여기서 처음 등장 —
--  memory-review-notifs.sql 이 하드코딩 문구로 도입했고, notif-admin-catalog-fix.sql 이
--  notif_templates 에 등록해 관리자 편집 가능하게 했으며, notif-strict-templates.sql 이
--  템플릿 없으면 발송을 건너뛰도록 최종 정리했다.)
create or replace function public.tg_notify_task_done()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_t text; v_b text;
begin
  select r.title, r.body into v_t, v_b from public.notif_render('new_memory', jsonb_build_object('title', NEW.title)) r;
  if v_t is null then return NEW; end if;
  insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id)
  select tp.user_id, auth.uid(), 'new_memory', v_t, v_b, NEW.group_id, NEW.id
  from public.task_participants tp
  where tp.task_id = NEW.id and tp.user_id <> auth.uid();
  return NEW;
end;
$$;
drop trigger if exists trg_notify_task_done on public.tasks;
create trigger trg_notify_task_done after update on public.tasks
  for each row when (OLD.status = 'accepted' and NEW.status = 'done')
  execute function public.tg_notify_task_done();


-- =============================================================
--  4. 항목별 발송 함수 — 놀기 신청 / 콕 찌르기 / 우심뽀까 부르기 (notif-social.sql 계열)
--     (notif-strict-templates-2.sql 최종본)
-- =============================================================

create or replace function public.schedule_task(
  p_task_id uuid, p_scheduled_at timestamptz, p_time_set boolean,
  p_repeat text, p_repeat_until date, p_remind int, p_participants uuid[]
) returns public.tasks language plpgsql security definer set search_path = public as $$
declare r public.tasks; v_gid uuid; v_remind_at timestamptz; v_actor text; v_nt_t text; v_nt_b text;
begin
  select group_id into v_gid from public.tasks where id = p_task_id;
  if v_gid is null then raise exception '존재하지 않는 항목입니다.'; end if;
  if not public.is_group_member(v_gid, auth.uid()) then
    raise exception '그룹 멤버만 신청할 수 있습니다.'; end if;
  if p_remind is not null and p_scheduled_at is not null then
    v_remind_at := p_scheduled_at - make_interval(mins => p_remind);
  end if;
  update public.tasks
     set status='accepted', assignee_id=auth.uid(), accepted_at=now(),
         scheduled_at=p_scheduled_at, scheduled_time_set=coalesce(p_time_set, true),
         repeat_rule=p_repeat, repeat_until=p_repeat_until,
         remind_min=p_remind, remind_at=v_remind_at, reminded=false
   where id=p_task_id and status='open' returning * into r;
  if r.id is null then raise exception '이미 신청되었거나 열려 있지 않은 항목입니다.'; end if;
  delete from public.task_participants where task_id=p_task_id;
  insert into public.task_participants(task_id, user_id)
    select p_task_id, x from unnest(coalesce(p_participants, array[]::uuid[])) as x
    where public.is_group_member(v_gid, x) on conflict do nothing;

  v_actor := public.notif_member_name(v_gid, auth.uid());
  select nr.title, nr.body into v_nt_t, v_nt_b from public.notif_render('accept', jsonb_build_object('actor', v_actor, 'title', r.title)) nr;
  if v_nt_t is not null then
    insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id)
    select tp.user_id, auth.uid(), 'accept', v_nt_t, v_nt_b, v_gid, p_task_id
    from public.task_participants tp
    where tp.task_id = p_task_id and tp.user_id <> auth.uid();
  end if;

  return r;
end; $$;
grant execute on function public.schedule_task(uuid, timestamptz, boolean, text, date, int, uuid[]) to authenticated;

create or replace function public.poke_member(p_group_id uuid, p_target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_name text; v_actor text; v_nt_t text; v_nt_b text;
begin
  if not (public.is_couple_group(p_group_id) or public.is_friend_group(p_group_id)) then
    raise exception '콕 찌르기는 프리미엄 그룹에서만 가능해요.'; end if;
  if not public.is_group_member(p_group_id, auth.uid()) then
    raise exception '그룹 멤버만 사용할 수 있어요.'; end if;
  if p_target = auth.uid() then
    raise exception '자기 자신은 찌를 수 없어요.'; end if;
  if not public.is_group_member(p_group_id, p_target) then
    raise exception '대상이 그룹 멤버가 아니에요.'; end if;
  v_name := public.notif_member_name(p_group_id, auth.uid());
  v_actor := coalesce(nullif(v_name, ''), '누군가');
  select nr.title, nr.body into v_nt_t, v_nt_b from public.notif_render('poke', jsonb_build_object('actor', v_actor)) nr;
  if v_nt_t is not null then
    insert into public.notifications(user_id, actor_id, type, title, body, group_id)
      values (p_target, auth.uid(), 'poke', v_nt_t, v_nt_b, p_group_id);
  end if;
end;
$$;
grant execute on function public.poke_member(uuid, uuid) to authenticated;

create or replace function public.summon_to_touch(p_group_id uuid, p_target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_name text; v_actor text; v_nt_t text; v_nt_b text;
begin
  if not (public.is_couple_group(p_group_id) or public.is_friend_group(p_group_id)) then
    raise exception '프리미엄 그룹에서만 사용할 수 있어요.'; end if;
  if not public.is_group_member(p_group_id, auth.uid()) then
    raise exception '그룹 멤버만 사용할 수 있어요.'; end if;
  if p_target = auth.uid() then
    raise exception '자기 자신은 부를 수 없어요.'; end if;
  if not public.is_group_member(p_group_id, p_target) then
    raise exception '대상이 그룹 멤버가 아니에요.'; end if;
  v_name := public.notif_member_name(p_group_id, auth.uid());
  v_actor := coalesce(nullif(v_name, ''), '누군가');
  select nr.title, nr.body into v_nt_t, v_nt_b from public.notif_render('touch_call', jsonb_build_object('actor', v_actor)) nr;
  if v_nt_t is not null then
    insert into public.notifications(user_id, actor_id, type, title, body, group_id)
      values (p_target, auth.uid(), 'touch_call', v_nt_t, v_nt_b, p_group_id);
  end if;
end;
$$;
grant execute on function public.summon_to_touch(uuid, uuid) to authenticated;


-- =============================================================
--  5. 항목별 발송 함수 — 소원권/커플 링/우정 링/리마인더/칭찬 스티커판 (notif-couple.sql 계열)
--     (notif-strict-templates-2.sql 최종본)
-- =============================================================

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
  if v_nt_t is not null then
    insert into public.notifications(user_id, actor_id, type, title, body, group_id)
      values (p_from_user_id, auth.uid(), 'wish', v_nt_t, v_nt_b, v_item.group_id);
  end if;
end;
$$;
grant execute on function public.use_wish(uuid, text) to authenticated;

create or replace function public.use_couple_ring(p_group_id uuid, p_recipient_id uuid, p_message text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.user_items; v_cnt int; v_sender text; v_recipient text; v_sav text; v_rav text; v_body text; v_note_id uuid; v_nt_t text; v_nt_b text;
begin
  select * into v_item from public.user_items
   where user_id = auth.uid() and item_id = 'couple-ring' and status = 'active'
   order by created_at asc limit 1;
  if v_item.id is null then raise exception '사용할 수 있는 커플 링이 없습니다.'; end if;
  if not public.is_group_member(p_group_id, auth.uid()) then raise exception '그룹 멤버만 사용할 수 있습니다.'; end if;
  select count(*) into v_cnt from public.group_members where group_id = p_group_id and left_at is null;
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
  if v_nt_t is not null then
    insert into public.notifications(user_id, actor_id, type, title, body, group_id, note_id)
      values (p_recipient_id, auth.uid(), 'couple_ring', v_nt_t, v_nt_b, p_group_id, v_note_id);
  end if;
end;
$$;
grant execute on function public.use_couple_ring(uuid, uuid, text) to authenticated;

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
  if v_nt_t is not null then
    insert into public.notifications(user_id, actor_id, type, title, body, group_id, note_id)
      values (n.sender_id, auth.uid(), 'couple_ring', v_nt_t, v_nt_b, n.group_id, n.id);
  end if;
end;
$$;
grant execute on function public.claim_couple_ring(uuid) to authenticated;

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
  if v_nt_t is not null then
    insert into public.notifications(user_id, actor_id, type, title, body, group_id, note_id)
      values (n.sender_id, auth.uid(), 'couple_ring', v_nt_t, v_nt_b, n.group_id, n.id);
  end if;
end;
$$;
grant execute on function public.reject_couple_ring(uuid) to authenticated;

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
  select count(*) into v_cnt from public.group_members where group_id = p_group_id and left_at is null;
  if v_cnt < 2 then raise exception '멤버가 2명 이상인 그룹에서만 사용할 수 있어요.'; end if;
  if public.is_friend_group(p_group_id) then raise exception '이미 우정 링이 적용된 그룹이에요.'; end if;
  update public.user_items set status = 'used', group_id = p_group_id, used_at = now() where id = v_item.id;
  v_sender := coalesce(public.notif_member_name(p_group_id, auth.uid()), '');
  select avatar_url into v_sav from public.group_members where group_id = p_group_id and user_id = auth.uid();
  v_body := coalesce(nullif(btrim(p_message), ''), '우정 링을 함께 끼자고 보냈어요 🤝');
  select nr.title, nr.body into v_nt_t, v_nt_b from public.notif_render('friend_ring', jsonb_build_object('actor', v_sender)) nr;
  for m in select user_id from public.group_members where group_id = p_group_id and user_id <> auth.uid() and left_at is null
  loop
    v_rname := coalesce(public.notif_member_name(p_group_id, m.user_id), '');
    select avatar_url into v_rav from public.group_members where group_id = p_group_id and user_id = m.user_id;
    insert into public.notes(group_id, sender_id, recipient_id, sender_name, recipient_name, sender_avatar, recipient_avatar, body, kind, item_id, claimed, rejected)
      values (p_group_id, auth.uid(), m.user_id, v_sender, v_rname, v_sav, v_rav, v_body, 'friend_ring', 'friend-ring', false, false)
      returning id into v_note_id;
    if v_nt_t is not null then
      insert into public.notifications(user_id, actor_id, type, title, body, group_id, note_id)
        values (m.user_id, auth.uid(), 'friend_ring', v_nt_t, v_nt_b, p_group_id, v_note_id);
    end if;
  end loop;
end;
$$;
grant execute on function public.use_friend_ring(uuid, text) to authenticated;

-- 약속 리마인더(cron 등에서 호출 — authenticated 에게 grant 하지 않음)
create or replace function public.dispatch_due_reminders()
returns integer language plpgsql security definer set search_path = public as $$
declare t record; v_when text; v_nt_t text; v_nt_b text; n int := 0;
begin
  for t in
    select * from public.tasks
    where remind_at is not null and reminded = false
      and remind_at <= now() and status = 'accepted'
  loop
    v_when := to_char(t.scheduled_at at time zone 'Asia/Seoul', 'MM월 DD일 HH24:MI');
    select nr.title, nr.body into v_nt_t, v_nt_b from public.notif_render('reminder', jsonb_build_object('title', t.title, 'when', v_when)) nr;

    if v_nt_t is not null then
      insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id)
      select p.user_id, null::uuid, 'reminder', v_nt_t, v_nt_b, t.group_id, t.id
      from public.task_participants p where p.task_id = t.id;

      if not found and t.assignee_id is not null then
        insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id)
        values (t.assignee_id, null::uuid, 'reminder', v_nt_t, v_nt_b, t.group_id, t.id);
      end if;
    end if;

    update public.tasks set reminded = true where id = t.id;
    n := n + 1;
  end loop;
  return n;
end; $$;

-- 칭찬 스티커(도착/완성, type: 완성 시 'praise', 도착 시 'praise_new')
create or replace function public.praise_place(p_group_id uuid, p_owner_id uuid, p_slot int, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_board public.praise_boards; v_count int; v_pactor text; v_nt_t text; v_nt_b text; v_reason text;
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

  v_reason := left(btrim(p_reason), 100);
  insert into public.praise_stickers(board_id, group_id, owner_id, slot_index, reason, from_id)
    values (v_board.id, p_group_id, p_owner_id, p_slot, v_reason, v_uid);

  v_pactor := coalesce(public.notif_member_name(p_group_id, v_uid), '');
  select count(*) into v_count from public.praise_stickers where board_id = v_board.id;
  if v_count >= 20 then
    update public.praise_boards
      set completed_at = now(), group_id = p_group_id, gifter_id = v_uid
      where id = v_board.id;
    select nr.title, nr.body into v_nt_t, v_nt_b from public.notif_render('praise', jsonb_build_object('actor', v_pactor)) nr;
    if v_nt_t is not null then
      insert into public.notifications(user_id, actor_id, type, title, body, group_id)
        values (p_owner_id, v_uid, 'praise', v_nt_t, v_nt_b, p_group_id);
    end if;
  else
    select nr.title, nr.body into v_nt_t, v_nt_b from public.notif_render('praise_new', jsonb_build_object('actor', v_pactor, 'reason', v_reason)) nr;
    if v_nt_t is not null then
      insert into public.notifications(user_id, actor_id, type, title, body, group_id)
        values (p_owner_id, v_uid, 'praise_new', v_nt_t, coalesce(nullif(v_nt_b, ''), v_reason), p_group_id);
    end if;
  end if;
end $$;
grant execute on function public.praise_place(uuid, uuid, int, text) to authenticated;


-- =============================================================
--  6. 항목별 발송 함수 — 아이템 선물(상점/인벤토리/묶음) (notif-gift.sql 계열)
--     (notif-strict-templates-2.sql 최종본)
-- =============================================================

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
  if v_nt_t is not null then
    insert into public.notifications(user_id, actor_id, type, title, body, group_id, note_id)
      values (p_recipient_id, auth.uid(), 'gift', v_nt_t, v_nt_b, p_group_id, v_note_id);
  end if;

  return v_balance - v_total;
end;
$$;
grant execute on function public.gift_item(text, uuid, uuid, integer, text) to authenticated;

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
  if v_nt_t is not null then
    insert into public.notifications(user_id, actor_id, type, title, body, group_id, note_id)
      values (p_recipient_id, case when v_anon then null else auth.uid() end, 'gift', v_nt_t, v_nt_b, p_group_id, v_note_id);
  end if;
end;
$$;
grant execute on function public.gift_owned_item(text, uuid, uuid, integer, text, boolean) to authenticated;

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
  if v_nt_t is not null then
    insert into public.notifications(user_id, actor_id, type, title, body, group_id, note_id)
      values (p_recipient_id, case when v_anon then null else auth.uid() end, 'gift', v_nt_t, v_nt_b, p_group_id, v_note_id);
  end if;
  return v_note_id;
end; $$;
grant execute on function public.send_gift_note(uuid, uuid, text, boolean, jsonb) to authenticated;


-- =============================================================
--  7. 항목별 발송 함수 — 아이템 사용(음악/영상/블루레이/선물 상자) (notif-media.sql 계열)
--     (notif-strict-templates-2.sql 최종본)
-- =============================================================

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
  if v_nt_t is not null then
    insert into public.notifications(user_id, actor_id, type, title, body, group_id)
      values (p_recipient_id, case when v_anon then null else auth.uid() end, 'cassette', v_nt_t, v_nt_b, p_group_id);
  end if;
end;
$$;
grant execute on function public.use_cassette(uuid, uuid, text, text, boolean) to authenticated;

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
  if v_nt_t is not null then
    insert into public.notifications(user_id, actor_id, type, title, body, group_id)
      values (p_recipient_id, case when v_anon then null else auth.uid() end, 'video', v_nt_t, v_nt_b, p_group_id);
  end if;
end;
$$;
grant execute on function public.use_video(uuid, uuid, text, text, boolean) to authenticated;

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
  if v_nt_t is not null then
    insert into public.notifications(user_id, actor_id, type, title, body, group_id)
      values (p_recipient_id, case when v_anon then null else auth.uid() end, 'bluray', v_nt_t, v_nt_b, p_group_id);
  end if;
end;
$$;
grant execute on function public.use_bluray(uuid, uuid, text, text, boolean) to authenticated;

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
  if v_nt_t is not null then
    insert into public.notifications(user_id, actor_id, type, title, body, group_id)
      values (p_recipient_id, case when v_anon then null else auth.uid() end, 'link', v_nt_t, v_nt_b, p_group_id);
  end if;
end;
$$;
grant execute on function public.use_link(uuid, uuid, text, text, text, boolean) to authenticated;


-- =============================================================
--  8. 항목별 발송 함수 — 전광판 게재 / 명찰 사용 (notif-ledboard-nametag.sql)
--     (notif-strict-templates-2.sql 최종본)
-- =============================================================

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
    if v_t is not null then
      insert into public.notifications(user_id, actor_id, type, title, body, group_id)
      values (v_partner, auth.uid(), 'ledboard', v_t, v_b, v_group);
    end if;
  end if;
end;
$$;
grant execute on function public.use_ledboard(text, text) to authenticated;

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
    if v_t is not null then
      insert into public.notifications(user_id, actor_id, type, title, body, group_id)
      values (v_partner, v_uid, 'nametag', v_t, v_b, p_group_id);
    end if;
  else
    update public.group_members set display_nickname = btrim(p_nickname)
     where group_id = p_group_id and user_id = v_partner;
  end if;

  select * into v_gm from public.group_members where group_id = p_group_id and user_id = v_partner;
  return jsonb_build_object('target_id', v_partner, 'nickname', v_gm.display_nickname, 'until', v_gm.nick_locked_until);
end $$;
grant execute on function public.use_name_tag(uuid, text) to authenticated;


-- =============================================================
--  9. 새 추억(새로고침 없이 신규 등록) / 새 리뷰 / 물음표 공방 댓글·답글
--     memory-review-notifs.sql 이 처음 도입, notif-admin-catalog-fix.sql 이 템플릿화,
--     notif-strict-templates.sql 이 "템플릿 없으면 발송 생략"으로 최종 정리(이 버전이 최신).
-- =============================================================

create or replace function public.create_task_scheduled(
  p_group_id uuid, p_title text, p_description text, p_category text, p_media_info jsonb,
  p_done boolean,
  p_scheduled_at timestamptz, p_time_set boolean, p_repeat text, p_repeat_until date,
  p_remind int, p_participants uuid[]
) returns public.tasks
language plpgsql security definer set search_path = public as $$
declare v_task public.tasks; v_remind_at timestamptz; v_t text; v_b text;
begin
  if not public.is_group_member(p_group_id, auth.uid()) then
    raise exception '그룹 멤버만 등록할 수 있어요.';
  end if;

  -- 이 트랜잭션의 tasks INSERT 트리거가 새 항목 알림을 건너뛰게 함
  perform set_config('nolging.silent_task', 'on', true);

  if p_remind is not null and p_scheduled_at is not null then
    v_remind_at := p_scheduled_at - make_interval(mins => p_remind);
  end if;

  insert into public.tasks(
    group_id, title, description, category, media_info, created_by,
    status, assignee_id, accepted_at, completed_at,
    scheduled_at, scheduled_time_set, repeat_rule, repeat_until,
    remind_min, remind_at, reminded)
  values (
    p_group_id, p_title, coalesce(p_description, ''), p_category, p_media_info, auth.uid(),
    case when p_done then 'done' else 'accepted' end, auth.uid(), now(),
    case when p_done then now() else null end,
    p_scheduled_at, coalesce(p_time_set, true), p_repeat, p_repeat_until,
    p_remind, v_remind_at, false)
  returning * into v_task;

  insert into public.task_participants(task_id, user_id)
    select v_task.id, x from unnest(coalesce(p_participants, array[]::uuid[])) as x
    where public.is_group_member(p_group_id, x) on conflict do nothing;

  -- 처음부터 추억(done) 상태로 등록한 경우 → 참여자(작성자 제외)에게 '새 추억' 알림
  if p_done then
    select r.title, r.body into v_t, v_b from public.notif_render('new_memory', jsonb_build_object('title', v_task.title)) r;
    if v_t is not null then
      insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id)
      select tp.user_id, auth.uid(), 'new_memory', v_t, v_b, p_group_id, v_task.id
      from public.task_participants tp
      where tp.task_id = v_task.id and tp.user_id <> auth.uid();
    end if;
  end if;

  return v_task;
end; $$;
grant execute on function public.create_task_scheduled(uuid, text, text, text, jsonb, boolean, timestamptz, boolean, text, date, int, uuid[]) to authenticated;

create or replace function public.submit_review(p_task_id uuid, p_rating numeric, p_comment text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_gid uuid; v_status text; r public.task_reviews; v_rewarded boolean; v_balance integer;
  v_actor text; v_t text; v_b text;
begin
  select group_id, status into v_gid, v_status from public.tasks where id = p_task_id;
  if v_gid is null then raise exception '존재하지 않는 항목입니다.'; end if;
  if not public.is_group_member(v_gid, auth.uid()) then
    raise exception '그룹 멤버만 가능합니다.'; end if;
  if v_status <> 'done' then
    raise exception '완료된 추억에만 리뷰를 남길 수 있습니다.'; end if;
  if not public.is_task_participant(p_task_id, auth.uid()) then
    raise exception '약속에 참여한 멤버만 리뷰를 작성할 수 있습니다.'; end if;
  if p_rating is null or p_rating < 0.5 or p_rating > 5 or (p_rating * 2) <> floor(p_rating * 2) then
    raise exception '별점은 0.5~5 사이 0.5 단위여야 합니다.'; end if;

  insert into public.task_reviews(task_id, group_id, author_id, rating, comment)
    values (p_task_id, v_gid, auth.uid(), p_rating, coalesce(p_comment, ''))
  on conflict (task_id, author_id) do update
    set rating = excluded.rating, comment = excluded.comment, updated_at = now()
  returning * into r;

  -- 리뷰 작성 보상 1 츄르 (태스크당 1회, 수정 재작성해도 중복 지급 안 됨)
  with ins as (
    insert into public.coin_ledger(user_id, delta, reason, ref_type, ref_id)
      values (auth.uid(), 1, '리뷰 작성 보상', 'review_reward', p_task_id)
    on conflict do nothing
    returning 1
  )
  select exists (select 1 from ins) into v_rewarded;

  select coalesce(sum(delta), 0)::integer into v_balance
    from public.coin_ledger where user_id = auth.uid();

  -- 첫 리뷰 작성일 때만(수정 재저장 시 중복 알림 방지) 다른 참여자에게 알림
  if v_rewarded then
    v_actor := coalesce(public.notif_member_name(v_gid, auth.uid()), '멤버');
    select r2.title, r2.body into v_t, v_b from public.notif_render('new_review', jsonb_build_object('actor', v_actor)) r2;
    if v_t is not null then
      insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id)
      select tp.user_id, auth.uid(), 'new_review', v_t, v_b, v_gid, p_task_id
      from public.task_participants tp
      where tp.task_id = p_task_id and tp.user_id <> auth.uid();
    end if;
  end if;

  return jsonb_build_object(
    'id', r.id, 'rating', r.rating, 'comment', r.comment,
    'rewarded', v_rewarded, 'balance', v_balance
  );
end;
$$;
grant execute on function public.submit_review(uuid, numeric, text) to authenticated;

-- 물음표 공방 댓글/답글(멘션은 기존 'mention' 템플릿 재사용)
create or replace function public.qworkshop_add_comment(p_post uuid, p_parent uuid, p_body text, p_mentioned_ids uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_group uuid; v_post_author uuid; v_id uuid; v_body text;
  v_parent uuid; v_pparent uuid; v_target_author uuid; v_actor text; v_t text; v_b text;
begin
  select group_id, author_id into v_group, v_post_author from public.qworkshop_posts where id = p_post;
  if v_group is null then raise exception '물음표를 찾을 수 없어요.'; end if;
  if not public.qworkshop_access(v_group, auth.uid()) then raise exception '댓글을 쓸 수 없어요.'; end if;
  v_body := btrim(coalesce(p_body, ''));
  if v_body = '' then raise exception '내용을 입력해 주세요.'; end if;
  if char_length(v_body) > 2000 then raise exception '댓글이 너무 길어요.'; end if;

  -- 답글은 1단계만: 부모가 또 답글이면 그 부모(최상위)에 붙인다.
  if p_parent is not null then
    select parent_id, author_id into v_pparent, v_target_author
      from public.qworkshop_comments where id = p_parent and post_id = p_post;
    if v_target_author is null then raise exception '원 댓글을 찾을 수 없어요.'; end if;
    v_parent := p_parent;
    if v_pparent is not null then v_parent := v_pparent; end if;
  end if;

  insert into public.qworkshop_comments(post_id, group_id, author_id, parent_id, body, mentioned_ids)
    values (p_post, v_group, auth.uid(), v_parent, v_body, p_mentioned_ids)
    returning id into v_id;

  v_actor := coalesce(public.notif_member_name(v_group, auth.uid()), '');

  if p_parent is null then
    if v_post_author is not null and v_post_author <> auth.uid() then
      select r.title, r.body into v_t, v_b from public.notif_render('qworkshop_comment', jsonb_build_object('actor', v_actor, 'text', v_body)) r;
      if v_t is not null then
        insert into public.notifications(user_id, actor_id, type, title, body, group_id, qworkshop_post_id, qworkshop_comment_id)
          values (v_post_author, auth.uid(), 'qworkshop_comment', v_t, v_b, v_group, p_post, v_id);
      end if;
    end if;
  else
    if v_target_author is not null and v_target_author <> auth.uid() then
      select r.title, r.body into v_t, v_b from public.notif_render('qworkshop_reply', jsonb_build_object('actor', v_actor, 'text', v_body)) r;
      if v_t is not null then
        insert into public.notifications(user_id, actor_id, type, title, body, group_id, qworkshop_post_id, qworkshop_comment_id)
          values (v_target_author, auth.uid(), 'qworkshop_reply', v_t, v_b, v_group, p_post, v_id);
      end if;
    end if;
  end if;

  if p_mentioned_ids is not null then
    select r.title, r.body into v_t, v_b from public.notif_render('mention', jsonb_build_object('actor', v_actor, 'text', v_body)) r;
    if v_t is not null then
      insert into public.notifications(user_id, actor_id, type, title, body, group_id, qworkshop_post_id, qworkshop_comment_id)
      select distinct u, auth.uid(), 'mention', v_t, v_b, v_group, p_post, v_id
      from unnest(p_mentioned_ids) as u
      where u <> auth.uid()
        and public.is_group_member(v_group, u)
        and u is distinct from v_post_author
        and u is distinct from v_target_author;
    end if;
  end if;

  return v_id;
end $$;
grant execute on function public.qworkshop_add_comment(uuid, uuid, text, uuid[]) to authenticated;


-- =============================================================
--  10. 알림 자동 정리 (notif-cleanup.sql)
-- =============================================================

create or replace function public.cleanup_old_notifications()
returns void language sql security definer set search_path = public as $$
  delete from public.notifications where created_at < now() - interval '30 days';
$$;

-- 매일 새벽 3시 15분, 30일 지난 알림만 정리(이미 있으면 교체)
create extension if not exists pg_cron;
do $$
begin
  perform cron.unschedule('nolging-cleanup-notifications');
exception when others then null;
end $$;
select cron.schedule('nolging-cleanup-notifications', '15 3 * * *', $$select public.cleanup_old_notifications()$$);

-- 지금까지 쌓인 30일 지난 알림도 즉시 1회 정리
select public.cleanup_old_notifications();


-- =============================================================
--  11. 알림 템플릿 시드 — 전체 32종, 키 기준 UNION(각 파일에서 최신 문구 사용)
--      on conflict 시 label/vars/sort_order 만 갱신(관리자가 편집한 title/body/emoji 보존)
--      — 원본 각 파일들의 on conflict 절과 동일한 정책.
-- =============================================================

insert into public.notif_templates (key, label, title, body, vars, emoji, sort_order) values
  -- notif-templates.sql (핵심 알림) — vars 는 notif-noun-fix.sql 최종본
  ('new_member',   '새 멤버 가입',   '새 멤버가 가입했어요',        '{name} 님 입장!',           '{name} = 새 멤버 닉네임', '👋', 10),
  ('new_task',     '새 항목 등록',   '새 {noun}가 있어요',          '{title}',                   '{noun} = 위시/약속/추억, {title} = 항목 제목', '📝', 20),
  ('task_comment', '내 항목에 댓글', '내 {noun}에 댓글이 달렸어요',  '{actor}: {text}',           '{noun} = 위시/약속/추억, {actor} = 작성자, {text} = 댓글 내용', '💬', 30),
  ('reply',        '내 댓글에 답글', '내 댓글에 답글이 달렸어요',    '{actor}: {text}',           '{actor} = 작성자, {text} = 답글 내용', '↩︎', 40),
  ('mention',      '댓글 멘션',      '{actor} 님이 회원님을 언급했어요', '{actor}: {text}',        '{actor} = 작성자, {text} = 댓글 내용', '@', 50),

  -- notif-gift.sql
  ('gift',      '아이템 선물',        '{actor} 님이 선물을 보냈어요', '{items} · 쪽지함에서 수령하세요', '{actor} = 보낸 사람, {items} = 선물 내용(예: 명찰 2개 / 명찰 외 1종)', '🎁', 60),
  ('gift_anon', '아이템 선물(익명)',  '익명의 선물이 도착했어요',     '{items} · 쪽지함에서 수령하세요', '{items} = 선물 내용(예: 명찰 2개 / 명찰 외 1종)', '🎁', 61),

  -- notif-ledboard-nametag.sql
  ('ledboard', '연인이 전광판 게재', '연인이 전광판을 켰어요',   '{actor}: {text}',
   '{actor} = 게재한 사람 닉네임, {text} = 전광판 문구', '📟', 60),
  ('nametag',  '연인이 명찰 사용',   '연인이 내 이름을 바꿨어요', '이제 24시간 동안 {nickname} (으)로 불려요',
   '{actor} = 사용한 사람 닉네임, {nickname} = 바뀐 이름', '🏷️', 61),

  -- notif-media.sql
  ('cassette',      '음악 도착',              '{actor} 님이 음악을 보냈어요',        '쪽지함에서 들어보세요 🎵', '{actor} = 보낸 사람', '🎵', 70),
  ('cassette_anon', '음악 도착(익명)',        '익명의 음악이 도착했어요',            '쪽지함에서 들어보세요 🎵', '(치환자 없음)', '🎵', 71),
  ('video',         '영상 도착(비디오)',       '{actor} 님이 영상을 보냈어요',        '쪽지함에서 확인하세요 📹', '{actor} = 보낸 사람', '📹', 72),
  ('video_anon',    '영상 도착(비디오·익명)',  '익명의 영상이 도착했어요',            '쪽지함에서 확인하세요 📹', '(치환자 없음)', '📹', 73),
  ('bluray',        '영상 도착(블루레이)',     '{actor} 님이 영상을 보냈어요',        '쪽지함에서 확인하세요 💿', '{actor} = 보낸 사람', '💿', 74),
  ('bluray_anon',   '영상 도착(블루레이·익명)', '익명의 영상이 도착했어요',           '쪽지함에서 확인하세요 💿', '(치환자 없음)', '💿', 75),
  ('link',          '선물 상자 도착',          '{actor} 님이 선물 상자를 보냈어요',   '쪽지함에서 확인하세요 🎁', '{actor} = 보낸 사람', '🎁', 76),
  ('link_anon',     '선물 상자 도착(익명)',    '익명의 선물 상자가 도착했어요',       '쪽지함에서 확인하세요 🎁', '(치환자 없음)', '🎁', 77),

  -- notif-social.sql
  ('accept',     '놀기 신청(참여 확정)', '{actor} 님의 놀기 신청!',              '{title}', '{actor} = 신청자, {title} = 항목 제목', '🙌', 80),
  ('poke',       '콕 찌르기',            '{actor} 님이 콕 찔렀어요!',            '',        '{actor} = 콕 찌른 사람', '👉', 81),
  ('touch_call', '우심뽀까 부르기',       '{actor} 님이 입술 내밀고 기다리고 있어요!', 'ㅡ 3ㅡ', '{actor} = 부른 사람', '💋', 82),

  -- notif-couple.sql
  ('wish',               '소원권 사용',        '{actor} 님이 소원을 빌었어요',        '{wish}',                      '{actor} = 소원 빈 사람, {wish} = 소원 내용', '🌟', 90),
  ('couple_ring',        '커플 링 도착',       '{actor} 님이 커플 링을 보냈어요',      '쪽지함에서 확인하세요',        '{actor} = 보낸 사람', '💍', 91),
  ('couple_ring_accept', '커플 링 수락',       '{actor} 님과 커플 링을 나눠 꼈어요',   '이제 프리미엄 그룹이에요 💍',   '{actor} = 수락한 사람 · (알림센터 이모지는 커플 링 도착과 공유)', '💍', 92),
  ('couple_ring_reject', '커플 링 거절',       '{actor} 님이 커플 링을 거절했어요',    '커플 링은 다시 사용할 수 있어요', '{actor} = 거절한 사람 · (알림센터 이모지는 커플 링 도착과 공유)', '💍', 93),
  ('friend_ring',        '우정 링 도착',       '{actor} 님이 우정 링을 보냈어요',      '쪽지함에서 확인하세요 🤝',      '{actor} = 보낸 사람', '🤝', 94),
  ('reminder',           '약속 리마인더',      '[{title}] {when}',                    '준비해 주세요',                '{title} = 항목 제목, {when} = 약속 시각', '⏰', 95),
  ('praise',             '칭찬 스티커판 완성',  '{actor} 님이 칭찬 스티커판을 완성했어요', '칭찬 스티커에서 소원권을 수령하세요 🎉', '{actor} = 완성한 짝꿍', '🎉', 96),
  ('praise_new',         '칭찬 스티커 도착',    '{actor} 님이 칭찬 스티커를 붙였어요', '{reason}', '{actor} = 붙인 짝꿍, {reason} = 칭찬 내용', '🌟', 100),

  -- notif-admin-catalog-fix.sql
  ('new_memory',        '새 추억 생성',              '새로운 추억이 생겼어요',        '[{title}] 리뷰를 작성해 주세요', '{title} = 항목 제목', '📔', 110),
  ('new_review',        '새 리뷰 등록',              '{actor} 님이 리뷰를 작성했어요', '별이 몇 개나 떴을까요?',         '{actor} = 리뷰 작성자', '⭐', 111),
  ('qworkshop_comment', '물음표 공방 내 물음표 댓글', '내 물음표에 댓글이 달렸어요',    '{actor}: {text}', '{actor} = 작성자, {text} = 댓글 내용', '💬', 112),
  ('qworkshop_reply',   '물음표 공방 내 댓글 답글',   '내 댓글에 답글이 달렸어요',      '{actor}: {text}', '{actor} = 작성자, {text} = 답글 내용', '↩️', 113)
on conflict (key) do update set label = excluded.label, vars = excluded.vars, sort_order = excluded.sort_order;

notify pgrst, 'reload schema';
