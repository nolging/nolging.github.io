-- =============================================================
--  오류 리포트 기능
--   · 유저가 마이 페이지에서 오류를 리포트 → 모든 관리자에게 알림(+푸시)
--   · 관리자 페이지 "오류 관리" 에서 목록/상세 조회, 해결 완료 처리
--   · 관리자 ↔ 유저 추가 문의를 쪽지(발신자 "SYSTEM")로 주고받음
--       - 유저: 받은 쪽지함에서 SYSTEM 쪽지 확인 + 답장(해결 완료 전까지)
--       - 관리자: 상세 화면에서 답글 형태로 전체 대화 확인
--  전제: schema-v2.sql, notif-templates.sql 적용됨(notif_render/notif_templates 존재).
--  적용: Supabase SQL Editor 에 그대로 실행.
--  ※ 푸시는 notifications INSERT 시 DB 웹훅 → send-push 로 자동 전송(새 type 추가 시
--     send-push/index.ts 에 라우팅 분기도 추가할 것).
-- =============================================================

-- 1) 리포트 테이블 ------------------------------------------------
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

alter table public.error_reports enable row level security;
drop policy if exists er_select on public.error_reports;
create policy er_select on public.error_reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_admin(auth.uid()));
-- 쓰기는 전부 SECURITY DEFINER RPC 경유(직접 insert/update 정책 없음)

-- 2) notes: 시스템 쪽지용 — group/sender/recipient NULL 허용 + report_id 연결 ----
alter table public.notes alter column group_id     drop not null;
alter table public.notes alter column sender_id    drop not null;
alter table public.notes alter column recipient_id drop not null;
alter table public.notes add column if not exists report_id uuid
  references public.error_reports(id) on delete cascade;
create index if not exists idx_notes_report on public.notes(report_id, created_at);

-- 3) notifications: 오류 리포트/시스템 쪽지 라우팅용 ----------------
alter table public.notifications add column if not exists report_id uuid;

-- 4) 알림 템플릿 등록(문구는 관리자 페이지 알림 관리에서 수정 가능) ----
insert into public.notif_templates (key, label, title, body, vars, sort_order) values
  ('error_report', '오류 리포트 접수(관리자)', '새 오류 리포트', '{actor} 님이 "{title}" 오류를 리포트했어요', '{actor} = 리포터, {title} = 리포트 제목', 90),
  ('system_note',  'SYSTEM 문의 도착(유저)',   'SYSTEM 문의',     '오류 리포트에 SYSTEM 이 문의를 남겼어요', '(치환자 없음)', 91)
on conflict (key) do update set label = excluded.label, vars = excluded.vars, sort_order = excluded.sort_order;
  -- title/body 는 관리자 편집 보존을 위해 갱신하지 않음

-- 5) 유저: 오류 리포트 제출 → 모든 관리자에게 알림 -------------------
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
grant execute on function public.submit_error_report(text, text) to authenticated;

-- 6) 관리자: 리포트 목록 -----------------------------------------
create or replace function public.admin_list_error_reports()
returns table(id uuid, title text, reporter_login text, resolved boolean, created_at timestamptz)
language sql security definer set search_path = public stable as $$
  select r.id, r.title, p.nickname, r.resolved, r.created_at
    from public.error_reports r
    join public.profiles p on p.id = r.reporter_id
   where public.is_admin(auth.uid())
   order by r.resolved asc, r.created_at desc;
$$;
grant execute on function public.admin_list_error_reports() to authenticated;

-- 7) 관리자: 리포트 상세 -----------------------------------------
create or replace function public.admin_get_error_report(p_id uuid)
returns table(id uuid, title text, body text, reporter_id uuid, reporter_login text,
              resolved boolean, created_at timestamptz, resolved_at timestamptz)
language sql security definer set search_path = public stable as $$
  select r.id, r.title, r.body, r.reporter_id, p.nickname, r.resolved, r.created_at, r.resolved_at
    from public.error_reports r
    join public.profiles p on p.id = r.reporter_id
   where r.id = p_id and public.is_admin(auth.uid());
$$;
grant execute on function public.admin_get_error_report(uuid) to authenticated;

-- 8) 관리자: 상세 스레드(주고받은 SYSTEM 쪽지) ---------------------
create or replace function public.admin_error_report_thread(p_id uuid)
returns table(id uuid, from_system boolean, body text, created_at timestamptz)
language sql security definer set search_path = public stable as $$
  select n.id, (n.sender_id is null), n.body, n.created_at
    from public.notes n
   where n.report_id = p_id and public.is_admin(auth.uid())
   order by n.created_at asc;
$$;
grant execute on function public.admin_error_report_thread(uuid) to authenticated;

-- 9) 관리자: SYSTEM 쪽지 보내기(추가 질문) → 유저 받은함 + 유저 알림 ---
create or replace function public.admin_send_error_report(p_report_id uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare v_rep uuid; v_t text; v_b text;
begin
  if not public.is_admin(auth.uid()) then raise exception '관리자만 사용할 수 있어요.'; end if;
  if p_body is null or btrim(p_body) = '' then raise exception '내용을 입력해 주세요.'; end if;
  select reporter_id into v_rep from public.error_reports where id = p_report_id;
  if v_rep is null then raise exception '리포트를 찾을 수 없어요.'; end if;

  insert into public.notes(recipient_id, sender_name, recipient_name, body, kind, report_id, is_read)
    values (v_rep, 'SYSTEM', '', btrim(p_body), 'system', p_report_id, false);

  select rr.title, rr.body into v_t, v_b from public.notif_render('system_note', jsonb_build_object()) rr;
  insert into public.notifications(user_id, type, title, body, report_id)
    values (v_rep, 'system_note', coalesce(v_t, 'SYSTEM 문의'),
            coalesce(v_b, '오류 리포트에 SYSTEM 이 문의를 남겼어요'), p_report_id);
end;
$$;
grant execute on function public.admin_send_error_report(uuid, text) to authenticated;

-- 10) 유저: SYSTEM 쪽지에 답장(해결 완료면 차단) → 관리자 알림 --------
create or replace function public.reply_error_report(p_report_id uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare v_rep uuid; v_resolved boolean; v_title text; v_name text; v_t text; v_b text;
begin
  if p_body is null or btrim(p_body) = '' then raise exception '내용을 입력해 주세요.'; end if;
  select reporter_id, resolved, title into v_rep, v_resolved, v_title from public.error_reports where id = p_report_id;
  if v_rep is null then raise exception '리포트를 찾을 수 없어요.'; end if;
  if v_rep <> auth.uid() then raise exception '본인 리포트에만 답장할 수 있어요.'; end if;
  if v_resolved then raise exception '이미 해결 완료된 리포트라 답장할 수 없어요.'; end if;

  insert into public.notes(sender_id, sender_name, recipient_name, body, kind, report_id, is_read)
    values (auth.uid(), '나', '', btrim(p_body), 'system', p_report_id, true);

  select nickname into v_name from public.profiles where id = auth.uid();
  select rr.title, rr.body into v_t, v_b
    from public.notif_render('error_report',
           jsonb_build_object('actor', coalesce(v_name, '회원'), 'title', coalesce(v_title, ''))) rr;
  insert into public.notifications(user_id, actor_id, type, title, body, report_id)
    select p.id, auth.uid(), 'error_report',
           coalesce(v_t, '오류 리포트 답장'),
           coalesce(v_b, coalesce(v_name, '회원') || ' 님이 오류 리포트에 답장했어요'),
           p_report_id
      from public.profiles p where p.role = 'admin';
end;
$$;
grant execute on function public.reply_error_report(uuid, text) to authenticated;

-- 11) 관리자: 해결 완료 토글 --------------------------------------
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
grant execute on function public.admin_resolve_error_report(uuid, boolean) to authenticated;

-- 12) 받은 쪽지 목록에 report_id / report_resolved 추가(시스템 쪽지 답장 UI 용) --
drop function if exists public.list_received_notes(integer, integer);
create function public.list_received_notes(p_limit integer default 15, p_offset integer default 0)
returns table(
  id uuid, group_id uuid, sender_id uuid, recipient_id uuid,
  sender_name text, recipient_name text, sender_avatar text, recipient_avatar text,
  body text, kind text, is_read boolean, created_at timestamptz,
  item_id text, item_name text, claimed boolean, rejected boolean, media_url text, anonymous boolean, qty integer,
  timer_seconds integer, opened_at timestamptz, sender_active boolean,
  report_id uuid, report_resolved boolean
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
    (select er.resolved from public.error_reports er where er.id = n.report_id)
  from public.notes n
  where n.recipient_id = auth.uid()
  order by n.created_at desc
  limit greatest(1, least(coalesce(p_limit, 15), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;
grant execute on function public.list_received_notes(integer, integer) to authenticated;

notify pgrst, 'reload schema';
