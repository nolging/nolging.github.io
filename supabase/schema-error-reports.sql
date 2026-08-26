-- =============================================================
--  오류 리포트 기능 — 통합본 (bundle)
--   다음 6개 개별 SQL 파일을 하나로 통합한 파일입니다(레포 정리 작업의 일부로 생성):
--     · error-reports.sql              (기본 기능: 제출/목록/상세/해결 처리)
--     · error-reports-chat.sql         (추가 문의를 SYSTEM 쪽지 채팅 스레드로 전환)
--     · error-reports-push.sql         (채팅 단계별 푸시 전용 알림 + 접속 중 생략)
--     · error-reports-resolved-card.sql(받은함 카드에 처리 완료 시각 노출)
--     · error-reports-reward.sql       (해결 처리 시 아이템/츄르 보상 지급)
--     · error-reports-note-style.sql   (채팅 없던 리포트의 보상 쪽지 스타일 정리)
--   각 객체(테이블/함수)는 위 6개 파일 중 시간순으로 가장 나중에 정의된 최종 버전만 담았고,
--   테이블은 최초 생성 + 이후 모든 alter 를 시간순으로 모두 반영했습니다.
--
--  전제: schema.sql, schema-v2.sql 적용됨(profiles/notes/notifications/notif_templates/
--        notif_render/is_admin/is_group_member/coin_ledger/store_items/user_items/
--        note_items/claim_gift_item(선물용) 등 존재). 새 환경에 처음부터 적용할 때 이 파일을
--        그대로 실행하면 됩니다.
--  주의: 이미 운영 중인 DB 에는 위 6개 원본 파일이 이미 순서대로 적용되어 있으므로
--        이 통합 파일을 다시 실행할 필요는 없습니다. 이 파일은 문서화 및
--        재해복구/신규 환경 셋업 용도로만 존재합니다.
-- =============================================================


-- =============================================================
-- 1. 테이블 (생성 + 이후 alter 전체, 시간순)
-- =============================================================

-- 1-1) error_reports: 리포트 원문 + 해결 상태 -----------------------
create table if not exists public.error_reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references public.profiles(id) on delete cascade,
  title        text not null,
  body         text not null,
  resolved     boolean not null default false,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);
create index if not exists idx_error_reports_list on public.error_reports(resolved, created_at desc);

-- (chat 단계) 유저가 채팅 카드를 받은함에서만 숨김 처리할 수 있도록
alter table public.error_reports add column if not exists user_hidden boolean not null default false;

-- 1-2) notes(schema.sql 정의): 오류 리포트/SYSTEM 채팅 용도로 확장 ----
-- group/sender/recipient NULL 허용(SYSTEM 발신·리포트 전용 메시지) + report_id 연결
alter table public.notes alter column group_id     drop not null;
alter table public.notes alter column sender_id    drop not null;
alter table public.notes alter column recipient_id drop not null;
alter table public.notes add column if not exists report_id uuid
  references public.error_reports(id) on delete cascade;
create index if not exists idx_notes_report on public.notes(report_id, created_at);

-- (chat 단계) 스레드 메시지와 구분되는 "받은함 카드(앵커)" 표시용
alter table public.notes add column if not exists is_anchor boolean not null default false;
create index if not exists idx_notes_anchor on public.notes(report_id) where is_anchor;

-- (reward 단계) 보상 구조화 저장 + 보상 쪽지 삭제(숨김) 처리용
alter table public.notes add column if not exists reward_coin integer;
alter table public.notes add column if not exists user_hidden boolean not null default false;

-- (note-style 단계) 채팅 없이 지급되는 보상 쪽지의 제목(리포트 제목) 별도 저장
alter table public.notes add column if not exists report_title text;

-- 1-3) notifications(schema.sql 정의): 리포트 알림 라우팅 + 무음 푸시 --
alter table public.notifications add column if not exists report_id uuid;
-- (push 단계) 알림센터에는 안 띄우고 푸시만 보내는 알림 표시용
alter table public.notifications add column if not exists silent boolean not null default false;

-- 1-4) user_activity: '앱에 머무는 중' 판정용 하트비트 테이블(push 단계) --
create table if not exists public.user_activity (
  user_id        uuid primary key references public.profiles(id) on delete cascade,
  last_active_at timestamptz not null default now()
);
alter table public.user_activity enable row level security;
-- 정책 없음: 서비스롤(send-push)·SECURITY DEFINER 함수만 접근


-- =============================================================
-- 2. RLS + 정책
-- =============================================================

alter table public.error_reports enable row level security;
drop policy if exists er_select on public.error_reports;
create policy er_select on public.error_reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_admin(auth.uid()));
-- 쓰기는 전부 SECURITY DEFINER RPC 경유(직접 insert/update 정책 없음)

-- note_items(note-items.sql 정의) 조회 정책 확장(reward 단계):
-- 오류 리포트 채팅 메시지(kind='system')는 recipient_id/sender_id 가 둘 다 null 이라
-- 기존 정책(수신자/발신자만 조회 가능)을 통과하지 못해 note_items 가 항상 빈 배열로
-- 보였다. 리포트 소유자(reporter) 및 관리자도 조회할 수 있게 확장.
drop policy if exists note_items_select on public.note_items;
create policy note_items_select on public.note_items for select to authenticated using (
  exists (
    select 1 from public.notes n
    where n.id = note_id
      and (
        n.recipient_id = auth.uid()
        or n.sender_id = auth.uid()
        or (n.kind = 'system' and exists (
              select 1 from public.error_reports er
              where er.id = n.report_id and er.reporter_id = auth.uid()
            ))
        or public.is_admin(auth.uid())
      )
  )
);


-- =============================================================
-- 3. 함수
-- =============================================================

-- 3-1) 유저: 오류 리포트 제출 → 모든 관리자에게 알림 -------------------
create or replace function public.submit_error_report(p_title text, p_body text)
returns public.error_reports language plpgsql security definer set search_path = public as $$
declare r public.error_reports; v_name text; v_t text; v_b text;
begin
  if p_title is null or btrim(p_title) = '' then raise exception '제목을 입력해 주세요.'; end if;
  if p_body  is null or btrim(p_body)  = '' then raise exception '내용을 입력해 주세요.'; end if;
  if char_length(p_title) > 100  then raise exception '제목은 100자까지 입력할 수 있어요.'; end if;
  if char_length(p_body)  > 2000 then raise exception '내용은 2000자까지 입력할 수 있어요.'; end if;

  insert into public.error_reports(reporter_id, title, body)
    values (auth.uid(), btrim(p_title), btrim(p_body)) returning * into r;

  select nickname into v_name from public.profiles where id = auth.uid();
  select rr.title, rr.body into v_t, v_b
    from public.notif_render('error_report',
           jsonb_build_object('actor', coalesce(v_name, '회원'), 'title', btrim(p_title))) rr;
  insert into public.notifications(user_id, actor_id, type, title, body, report_id)
    select p.id, auth.uid(), 'error_report',
           coalesce(v_t, '새 오류 리포트'),
           coalesce(v_b, coalesce(v_name, '회원') || ' 님이 "' || btrim(p_title) || '" 오류를 리포트했어요'),
           r.id
      from public.profiles p where p.role = 'admin';
  return r;
end;
$$;

-- 3-2) 관리자: 리포트 목록(내용 미리보기 포함) -----------------------
drop function if exists public.admin_list_error_reports();
create function public.admin_list_error_reports()
returns table(id uuid, title text, body text, reporter_login text, resolved boolean, created_at timestamptz)
language sql security definer set search_path = public stable as $$
  select r.id, r.title, r.body, p.nickname, r.resolved, r.created_at
    from public.error_reports r
    join public.profiles p on p.id = r.reporter_id
   where public.is_admin(auth.uid())
   order by r.resolved asc, r.created_at desc;
$$;

-- 3-3) 관리자: 리포트 상세 -----------------------------------------
create or replace function public.admin_get_error_report(p_id uuid)
returns table(id uuid, title text, body text, reporter_id uuid, reporter_login text,
              resolved boolean, created_at timestamptz, resolved_at timestamptz)
language sql security definer set search_path = public stable as $$
  select r.id, r.title, r.body, r.reporter_id, p.nickname, r.resolved, r.created_at, r.resolved_at
    from public.error_reports r
    join public.profiles p on p.id = r.reporter_id
   where r.id = p_id and public.is_admin(auth.uid());
$$;

-- 3-4) 관리자용 채팅 스레드 조회(앵커 제외, 첨부 아이템/츄르 포함) -------
-- kind='system' 조건으로 채팅 없이 지급된 보상 쪽지(kind='gift')를
-- 채팅 메시지로 잘못 집계하지 않도록 한다(reward 단계 최종본).
drop function if exists public.admin_error_report_thread(uuid);
create function public.admin_error_report_thread(p_id uuid)
returns table(id uuid, from_system boolean, body text, created_at timestamptz, items jsonb, reward_coin integer)
language sql security definer set search_path = public stable as $$
  select n.id, (n.sender_id is null), n.body, n.created_at,
    (select coalesce(jsonb_agg(jsonb_build_object(
        'item_id', ni.item_id, 'item_name', ni.item_name, 'qty', ni.qty, 'claimed', ni.claimed
      ) order by ni.created_at), '[]'::jsonb)
     from public.note_items ni where ni.note_id = n.id) as items,
    n.reward_coin
    from public.notes n
   where n.report_id = p_id and n.kind = 'system' and coalesce(n.is_anchor, false) = false
     and public.is_admin(auth.uid())
   order by n.created_at asc;
$$;

-- 3-5) 유저용 채팅 스레드 조회(앵커 제외, 첨부 아이템/츄르 포함) --------
drop function if exists public.error_report_thread(uuid);
create function public.error_report_thread(p_report_id uuid)
returns table(id uuid, from_system boolean, body text, created_at timestamptz, items jsonb, reward_coin integer)
language sql security definer set search_path = public stable as $$
  select n.id, (n.sender_id is null), n.body, n.created_at,
    (select coalesce(jsonb_agg(jsonb_build_object(
        'item_id', ni.item_id, 'item_name', ni.item_name, 'qty', ni.qty, 'claimed', ni.claimed
      ) order by ni.created_at), '[]'::jsonb)
     from public.note_items ni where ni.note_id = n.id) as items,
    n.reward_coin
    from public.notes n
    join public.error_reports er on er.id = n.report_id
   where n.report_id = p_report_id and n.kind = 'system' and coalesce(n.is_anchor, false) = false
     and er.reporter_id = auth.uid()
   order by n.created_at asc;
$$;

-- 3-6) 유저: 내 리포트 원문(채팅창 상단 회색 영역용) -------------------
create or replace function public.error_report_info(p_report_id uuid)
returns table(id uuid, title text, body text, resolved boolean, created_at timestamptz)
language sql security definer set search_path = public stable as $$
  select r.id, r.title, r.body, r.resolved, r.created_at
    from public.error_reports r
   where r.id = p_report_id and r.reporter_id = auth.uid();
$$;

-- 3-7) 관리자: SYSTEM 문의 보내기(채팅 스레드) — 아이템/츄르 첨부 지원,
--      단계별 알림센터/무음 푸시 분기, 유저가 숨긴 카드 재노출까지 포함한 최종본.
--      · 최초 문의(앵커 생성) → 알림센터 + 푸시
--      · 이후 문의            → 푸시만(silent), 접속 중이면 send-push 가 생략
--      · 유저가 예전에 채팅 카드를 삭제(user_hidden=true)했어도 새 메시지가 오면 재노출
drop function if exists public.admin_send_error_report(uuid, text);
drop function if exists public.admin_send_error_report(uuid, text, jsonb);
create or replace function public.admin_send_error_report(
  p_report_id uuid, p_body text, p_items jsonb default null, p_coin integer default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_rep uuid; v_first boolean := false; v_t text; v_b text; v_note_id uuid;
        v_it jsonb; v_item_id text; v_qty integer; v_name text;
begin
  if not public.is_admin(auth.uid()) then raise exception '관리자만 사용할 수 있어요.'; end if;
  if p_body is null or btrim(p_body) = '' then raise exception '내용을 입력해 주세요.'; end if;
  select reporter_id into v_rep from public.error_reports where id = p_report_id;
  if v_rep is null then raise exception '리포트를 찾을 수 없어요.'; end if;

  -- 스레드 메시지(발신 SYSTEM: sender_id=null, recipient=null)
  insert into public.notes(sender_name, recipient_name, body, kind, report_id, is_anchor, is_read, reward_coin)
    values ('SYSTEM', '', btrim(p_body), 'system', p_report_id, false, false, p_coin)
    returning id into v_note_id;

  if p_items is not null then
    for v_it in select * from jsonb_array_elements(p_items) loop
      v_item_id := v_it->>'item_id';
      v_qty := greatest(1, coalesce((v_it->>'qty')::int, 1));
      v_name := coalesce(v_it->>'item_name', v_item_id);
      insert into public.note_items(note_id, item_id, item_name, qty) values (v_note_id, v_item_id, v_name, v_qty);
    end loop;
  end if;

  -- 받은함 카드(앵커) 갱신 or 생성 → 미리보기=최신 문의, 안 읽음, 최신으로 끌어올림
  update public.notes set body = btrim(p_body), is_read = false, created_at = now()
   where report_id = p_report_id and is_anchor = true;
  if not found then
    v_first := true;   -- 앵커가 없었다 = 이번이 '최초 추가 문의'
    insert into public.notes(recipient_id, sender_name, recipient_name, body, kind, report_id, is_anchor, is_read)
      values (v_rep, 'SYSTEM', '', btrim(p_body), 'system', p_report_id, true, false);
  end if;

  -- 유저가 예전에 이 채팅 카드를 삭제했었더라도, 새 메시지가 왔으니 다시 보이게 한다.
  update public.error_reports set user_hidden = false where id = p_report_id;

  if v_first then
    -- 최초 문의: 알림센터 + 푸시(기존 그대로)
    select rr.title, rr.body into v_t, v_b from public.notif_render('system_note', jsonb_build_object()) rr;
    insert into public.notifications(user_id, type, title, body, report_id)
      values (v_rep, 'system_note', coalesce(v_t, 'SYSTEM 문의'),
              coalesce(v_b, '오류 리포트에 SYSTEM 이 문의를 남겼어요'), p_report_id);
  else
    -- 이후 문의: 푸시만(알림센터 미표시) + 접속 중이면 send-push 가 생략.
    -- 문구는 관리자 '알림 관리'의 error_chat_admin 템플릿을 렌더(미배포 시 폴백).
    select rr.title, rr.body into v_t, v_b
      from public.notif_render('error_chat_admin', jsonb_build_object('text', btrim(p_body))) rr;
    insert into public.notifications(user_id, type, title, body, report_id, silent)
      values (v_rep, 'system_note', coalesce(v_t, '깜냥'), coalesce(v_b, btrim(p_body)), p_report_id, true);
  end if;
end;
$$;

-- 3-8) 유저: SYSTEM 쪽지에 답장(해결 완료면 차단) → 관리자에게 '푸시만'(silent) --
--      유저 답변은 항상 채팅(앵커 생성 이후)이므로 언제나 무음 푸시 규칙 적용.
create or replace function public.reply_error_report(p_report_id uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare v_rep uuid; v_resolved boolean; v_title text; v_name text; v_t text; v_b text;
begin
  if p_body is null or btrim(p_body) = '' then raise exception '내용을 입력해 주세요.'; end if;
  select reporter_id, resolved, title into v_rep, v_resolved, v_title from public.error_reports where id = p_report_id;
  if v_rep is null then raise exception '리포트를 찾을 수 없어요.'; end if;
  if v_rep <> auth.uid() then raise exception '본인 리포트에만 답장할 수 있어요.'; end if;
  if v_resolved then raise exception '이미 해결 완료된 리포트라 답장할 수 없어요.'; end if;

  insert into public.notes(sender_id, sender_name, recipient_name, body, kind, report_id, is_anchor, is_read)
    values (auth.uid(), '나', '', btrim(p_body), 'system', p_report_id, false, true);

  -- 받은함 카드(앵커) 미리보기 = 마지막 메시지(내가 보낸 답장)로 갱신. 내가 보낸 거라 읽음 유지.
  update public.notes set body = btrim(p_body), created_at = now(), is_read = true
   where report_id = p_report_id and is_anchor = true;

  select nickname into v_name from public.profiles where id = auth.uid();
  -- 관리자에게 푸시만(알림센터 미표시). 접속 중인 관리자는 send-push 가 생략.
  -- 문구는 관리자 '알림 관리'의 error_chat_user 템플릿을 렌더(미배포 시 폴백).
  select rr.title, rr.body into v_t, v_b
    from public.notif_render('error_chat_user',
           jsonb_build_object('actor', coalesce(v_name, '회원'), 'text', btrim(p_body), 'title', coalesce(v_title, ''))) rr;
  insert into public.notifications(user_id, actor_id, type, title, body, report_id, silent)
    select p.id, auth.uid(), 'error_report',
           coalesce(v_t, coalesce(v_name, '회원')), coalesce(v_b, btrim(p_body)), p_report_id, true
      from public.profiles p where p.role = 'admin';
end;
$$;

-- 3-9) 관리자: 해결 완료 토글 --------------------------------------
create or replace function public.admin_resolve_error_report(p_id uuid, p_resolved boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception '관리자만 사용할 수 있어요.'; end if;
  update public.error_reports
     set resolved = coalesce(p_resolved, true),
         resolved_at = case when coalesce(p_resolved, true) then now() else null end
   where id = p_id;
end;
$$;

-- 3-10) 유저: 카드 삭제 = 받은함에서만 숨김(관리자엔 유지) -------------
create or replace function public.delete_error_report_for_user(p_report_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.error_reports set user_hidden = true
   where id = p_report_id and reporter_id = auth.uid();
end;
$$;

-- 3-11) 앱이 화면에 보일 때 주기적으로 호출 → '지금 접속 중' 표식 -------
create or replace function public.touch_activity()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.user_activity(user_id, last_active_at)
    values (auth.uid(), now())
  on conflict (user_id) do update set last_active_at = now();
end;
$$;

-- 3-12) claim_gift_item(note-items.sql 정의) 확장: 'gift' 쪽지뿐 아니라
--       오류 리포트 채팅('system', report_id)에 첨부된 보상 아이템도 수령할 수
--       있게 대상 판정을 리포트 소유자 기준으로 확장.
create or replace function public.claim_gift_item(p_note_id uuid, p_item_id text)
returns void language plpgsql security definer set search_path = public as $$
declare n public.notes; ni public.note_items; i integer; v_ok boolean;
begin
  select * into n from public.notes where id = p_note_id;
  if n.id is null then raise exception '수령할 수 없는 선물입니다.'; end if;

  if n.kind = 'gift' then
    v_ok := (n.recipient_id = auth.uid());
  elsif n.kind = 'system' then
    v_ok := exists (select 1 from public.error_reports er where er.id = n.report_id and er.reporter_id = auth.uid());
  else
    v_ok := false;
  end if;
  if not v_ok then raise exception '수령할 수 없는 선물입니다.'; end if;

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

-- 3-13) 리포터 기준 보상 지급 후보 아이템 목록 조회 --------------------
--       (관리자 전용 아이템·소원권 제외, 프리미엄/티어 조건 충족 여부 + 이미 보유 수량 반환)
create or replace function public.admin_report_reward_context(p_report_id uuid)
returns table(item_id text, eligible boolean, owned_qty integer)
language plpgsql security definer stable set search_path = public as $$
declare v_rep uuid; v_couple boolean; v_friend boolean;
begin
  if not public.is_admin(auth.uid()) then raise exception '관리자만 사용할 수 있어요.'; end if;
  select reporter_id into v_rep from public.error_reports where id = p_report_id;
  if v_rep is null then raise exception '리포트를 찾을 수 없어요.'; end if;

  -- RETURNS TABLE 의 item_id 가 plpgsql 변수로도 잡혀, 테이블 별칭 없이 쓰면
  -- "column reference item_id is ambiguous" 가 남 → user_items 에 별칭(ui)을 붙여 한정.
  v_couple := exists (select 1 from public.user_items ui
    where ui.user_id = v_rep and ui.item_id = 'couple-ring' and ui.status = 'used');
  v_friend := exists (select 1 from public.user_items ui
    where ui.user_id = v_rep and ui.item_id = 'friend-ring' and ui.status = 'used');

  return query
    select
      si.id,
      (not si.premium)
        or (si.tier = 'couple' and v_couple)
        or (si.tier = 'friend' and v_friend)
        or (si.tier is null and (v_couple or v_friend)),
      coalesce((select count(*)::int from public.user_items ui
                 where ui.user_id = v_rep and ui.item_id = si.id and ui.status = 'active'), 0)
    from public.store_items si
    where si.is_active and coalesce(si.admin_only, false) = false and si.id <> 'wish';
end;
$$;

-- 3-14) 보상 지급(아이템 여러 개 + 수량 / 츄르) — 최종본(note-style 단계) -----
--   p_items: [{"item_id":"...", "qty": n}, ...] (또는 null) — 아이템은 "박스+수령하기"로 전달(즉시 지급 X)
--   p_coin: 지급할 츄르 수(또는 null/0) — 츄르는 즉시 지급(coin_ledger)
--   · 채팅(추가 문의)이 있던 리포트 → 보상을 채팅 스레드의 새 메시지로 전송(admin_send_error_report).
--   · 채팅이 아예 없던 리포트 → 깜냥 명의 "쪽지"(kind=gift)로 발송.
--     - 카드 색깔: 네이비(기존 유지) / 모달 색깔: 흰색(기본).
--     - 쪽지 내용: 본문(body)에는 리포트 원문만 담고, "처리 완료됐어요" 고정 문구는
--       DB 에 저장하지 않고 프런트에서 렌더링. 제목은 report_title 컬럼에 별도 저장.
--     - 츄르 지급은 텍스트로 합치지 않고 reward_coin 컬럼에 구조화 저장(프런트가 별도 박스로 표시).
create or replace function public.admin_grant_report_reward(
  p_report_id uuid, p_items jsonb default null, p_coin integer default null, p_reason text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_rep uuid; v_report_title text; v_report_body text; v_couple boolean; v_friend boolean;
  v_entry jsonb; v_id text; v_qty integer;
  v_balance integer; v_valid jsonb := '[]'::jsonb;
  si public.store_items;
  v_has_chat boolean; v_note_id uuid; v_it jsonb; v_item_id text; v_name text;
begin
  if not public.is_admin(auth.uid()) then raise exception '관리자만 사용할 수 있어요.'; end if;
  select reporter_id, title, body into v_rep, v_report_title, v_report_body
    from public.error_reports where id = p_report_id;
  if v_rep is null then raise exception '리포트를 찾을 수 없어요.'; end if;

  v_couple := exists (select 1 from public.user_items
    where user_id = v_rep and item_id = 'couple-ring' and status = 'used');
  v_friend := exists (select 1 from public.user_items
    where user_id = v_rep and item_id = 'friend-ring' and status = 'used');

  if p_items is not null then
    for v_entry in select * from jsonb_array_elements(p_items) loop
      v_id := v_entry->>'item_id';
      v_qty := coalesce((v_entry->>'qty')::int, 0);
      if v_qty <= 0 then continue; end if;
      if v_qty > 99 then raise exception '한 번에 지급할 수 있는 수량이 너무 많아요.'; end if;

      select * into si from public.store_items
        where id = v_id and is_active and coalesce(admin_only, false) = false and id <> 'wish';
      if si.id is null then raise exception '지급할 수 없는 아이템이에요: %', coalesce(v_id, '(없음)'); end if;

      if si.premium and not (
           (si.tier = 'couple' and v_couple)
        or (si.tier = 'friend' and v_friend)
        or (si.tier is null and (v_couple or v_friend))
      ) then
        raise exception '%은(는) 이 회원에게 지급할 수 없는 아이템이에요(프리미엄 조건 미충족).', si.name;
      end if;

      v_valid := v_valid || jsonb_build_object('item_id', si.id, 'item_name', si.name, 'qty', v_qty);
    end loop;
  end if;

  if p_coin is not null and p_coin > 0 then
    insert into public.coin_ledger(user_id, delta, reason, ref_type, ref_id, created_by)
      values (v_rep, p_coin, coalesce(nullif(btrim(p_reason), ''), '오류 리포트 보상'), 'error_report_reward', p_report_id, auth.uid());
    select coalesce(sum(delta), 0)::integer into v_balance from public.coin_ledger where user_id = v_rep;
  end if;

  if jsonb_array_length(v_valid) = 0 and (p_coin is null or p_coin <= 0) then
    return jsonb_build_object('coin_balance', v_balance);
  end if;

  v_has_chat := exists (select 1 from public.notes where report_id = p_report_id and kind = 'system' and is_anchor = true);

  if v_has_chat then
    if jsonb_array_length(v_valid) > 0 then
      perform public.admin_send_error_report(p_report_id, '🎁 보상 아이템이 도착했어요', v_valid);
    end if;
    if p_coin is not null and p_coin > 0 then
      perform public.admin_send_error_report(p_report_id, '오류 리포트 보상으로 ' || p_coin || ' 츄르 지급됐어요', null, p_coin);
    end if;
  else
    -- 채팅이 없던 리포트: 깜냥 명의로 쪽지(선물) 발송. 본문 = 리포트 원문만(완료 문구는
    -- 프런트에서 고정 렌더), 제목은 report_title 에, 츄르는 reward_coin 에 구조화 저장.
    insert into public.notes(recipient_id, sender_name, recipient_name, body, kind, report_id, report_title, reward_coin, is_read)
      values (v_rep, 'SYSTEM', '', coalesce(v_report_body, ''), 'gift', p_report_id, v_report_title,
              case when p_coin is not null and p_coin > 0 then p_coin else null end, false)
      returning id into v_note_id;
    if jsonb_array_length(v_valid) > 0 then
      for v_it in select * from jsonb_array_elements(v_valid) loop
        v_item_id := v_it->>'item_id';
        v_qty := coalesce((v_it->>'qty')::int, 1);
        v_name := coalesce(v_it->>'item_name', v_item_id);
        insert into public.note_items(note_id, item_id, item_name, qty) values (v_note_id, v_item_id, v_name, v_qty);
      end loop;
    end if;
    insert into public.notifications(user_id, type, title, body, report_id)
      values (v_rep, 'gift', '깜냥', '오류 리포트가 처리 완료됐어요. 쪽지함을 확인해 보세요.', p_report_id);
  end if;

  return jsonb_build_object('coin_balance', v_balance);
end;
$$;

-- 3-15) 깜냥 명의 보상 쪽지 삭제(숨김). RLS 상 notes 는 하드 delete 정책이 없어
--       (수신자 UPDATE 만 허용) user_hidden 플래그로 숨긴다 — 채팅 카드 삭제와 같은 방식.
--       아이템을 전부 수령하기 전에는 삭제할 수 없다(아이템이 없으면 바로 삭제 가능).
create or replace function public.delete_report_gift_note(p_note_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare n public.notes;
begin
  select * into n from public.notes where id = p_note_id;
  if n.id is null or n.recipient_id <> auth.uid() or n.kind <> 'gift' or n.report_id is null then
    raise exception '삭제할 수 없는 쪽지입니다.';
  end if;
  if exists (select 1 from public.note_items where note_id = p_note_id and not claimed) then
    raise exception '아이템을 먼저 수령해 주세요.';
  end if;
  update public.notes set user_hidden = true where id = p_note_id;
end;
$$;

-- 3-16) 받은 쪽지 목록(list_received_notes) — 최종본(note-style 단계):
--       시스템은 '앵커'만 카드로(채팅 스레드 메시지 자체는 목록에 안 뜸),
--       유저가 숨긴 리포트/쪽지는 제외, 처리 완료 시각/보상 배지/보상 쪽지 제목·츄르까지 포함.
drop function if exists public.list_received_notes(integer, integer);
create function public.list_received_notes(p_limit integer default 15, p_offset integer default 0)
returns table(
  id uuid, group_id uuid, sender_id uuid, recipient_id uuid,
  sender_name text, recipient_name text, sender_avatar text, recipient_avatar text,
  body text, kind text, is_read boolean, created_at timestamptz,
  item_id text, item_name text, claimed boolean, rejected boolean, media_url text, anonymous boolean, qty integer,
  timer_seconds integer, opened_at timestamptz, sender_active boolean,
  report_id uuid, report_resolved boolean, report_resolved_at timestamptz,
  report_has_reward_item boolean, report_reward_pending boolean,
  report_title text, reward_coin integer
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
    n.timer_seconds, n.opened_at,
    public.is_group_member(n.group_id, n.sender_id),
    n.report_id,
    (select er.resolved from public.error_reports er where er.id = n.report_id),
    (select er.resolved_at from public.error_reports er where er.id = n.report_id),
    exists (select 1 from public.note_items ni join public.notes tn on tn.id = ni.note_id
             where tn.report_id = n.report_id and coalesce(tn.is_anchor, false) = false),
    exists (select 1 from public.note_items ni join public.notes tn on tn.id = ni.note_id
             where tn.report_id = n.report_id and coalesce(tn.is_anchor, false) = false and not ni.claimed),
    n.report_title, n.reward_coin
  from public.notes n
  where n.recipient_id = auth.uid()
    and coalesce(n.user_hidden, false) = false
    and not (n.kind = 'system' and (
          coalesce(n.is_anchor, false) = false
          or coalesce((select er.user_hidden from public.error_reports er where er.id = n.report_id), false)
        ))
  order by n.created_at desc
  limit greatest(1, least(coalesce(p_limit, 15), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;


-- =============================================================
-- 4. 알림 템플릿 시드(문구는 관리자 페이지 "알림 관리"에서 수정 가능;
--    최초 삽입 시에만 기본 문구 세팅, 이후 관리자 편집은 보존됨)
-- =============================================================

insert into public.notif_templates (key, label, title, body, vars, sort_order) values
  ('error_report', '오류 리포트 접수(관리자)', '새 오류 리포트', '{actor} 님이 "{title}" 오류를 리포트했어요', '{actor} = 리포터, {title} = 리포트 제목', 90),
  ('system_note',  'SYSTEM 문의 도착(유저)',   'SYSTEM 문의',     '오류 리포트에 SYSTEM 이 문의를 남겼어요', '(치환자 없음)', 91),
  ('error_chat_admin', '오류 리포트 채팅: SYSTEM→회원', '깜냥',    '{text}', '{text} = 보낸 메시지', 92),
  ('error_chat_user',  '오류 리포트 채팅: 회원→관리자', '{actor}', '{text}', '{actor} = 회원 닉네임, {text} = 보낸 메시지, {title} = 리포트 제목', 93)
on conflict (key) do update set label = excluded.label, vars = excluded.vars, sort_order = excluded.sort_order;
  -- title/body 는 관리자 편집 보존을 위해 갱신하지 않음


-- =============================================================
-- 5. 일회성 데이터 정리(과거 라이브 DB 버그 픽스 이력 — 신규/빈 DB 에서는 no-op)
-- =============================================================

-- 5-1) (chat 단계) 구모델→신모델 마이그레이션: 관리자 문의마다 recipient=본인 쪽지였던
--      구조를, 스레드 메시지(recipient=null) + 앵커 카드 1개 구조로 이전.
update public.notes
   set recipient_id = null
 where kind = 'system' and sender_id is null and coalesce(is_anchor, false) = false;

insert into public.notes(recipient_id, sender_name, recipient_name, body, kind, report_id, is_anchor, is_read, created_at)
select er.reporter_id, 'SYSTEM', '',
       (select n2.body from public.notes n2
         where n2.report_id = er.id and n2.kind = 'system' and coalesce(n2.is_anchor, false) = false
         order by n2.created_at desc limit 1),
       'system', er.id, true, false, now()
  from public.error_reports er
 where exists (select 1 from public.notes n3
                where n3.report_id = er.id and n3.kind = 'system' and coalesce(n3.is_anchor, false) = false)
   and not exists (select 1 from public.notes na
                    where na.report_id = er.id and coalesce(na.is_anchor, false) = true);

-- 5-2) (reward 단계) user_hidden 이 안 풀리던 버그로 인해 꼬여있던 리포트 되살리기:
--      앵커가 안 읽음 상태인데 error_reports.user_hidden 이 true 로 남아있는 경우만 대상.
update public.error_reports er
set user_hidden = false
where er.user_hidden = true
  and exists (
    select 1 from public.notes n
    where n.report_id = er.id and n.is_anchor = true and n.is_read = false
  );


-- =============================================================
-- 6. 권한 부여(GRANT) — 최종 함수 시그니처 기준
-- =============================================================

grant execute on function public.submit_error_report(text, text) to authenticated;
grant execute on function public.admin_list_error_reports() to authenticated;
grant execute on function public.admin_get_error_report(uuid) to authenticated;
grant execute on function public.admin_error_report_thread(uuid) to authenticated;
grant execute on function public.error_report_thread(uuid) to authenticated;
grant execute on function public.error_report_info(uuid) to authenticated;
grant execute on function public.admin_send_error_report(uuid, text, jsonb, integer) to authenticated;
grant execute on function public.reply_error_report(uuid, text) to authenticated;
grant execute on function public.admin_resolve_error_report(uuid, boolean) to authenticated;
grant execute on function public.delete_error_report_for_user(uuid) to authenticated;
grant execute on function public.touch_activity() to authenticated;
grant execute on function public.claim_gift_item(uuid, text) to authenticated;
grant execute on function public.admin_report_reward_context(uuid) to authenticated;
grant execute on function public.admin_grant_report_reward(uuid, jsonb, integer, text) to authenticated;
grant execute on function public.delete_report_gift_note(uuid) to authenticated;
grant execute on function public.list_received_notes(integer, integer) to authenticated;

notify pgrst, 'reload schema';
