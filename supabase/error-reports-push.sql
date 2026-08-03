-- =============================================================
--  오류 리포트 푸시 알림 재정리
--   1) 처음 리포트 전송      → 관리자에게 푸시 + 알림센터  (submit_error_report, 기존 그대로)
--   2) 관리자 '최초' 추가문의 → 유저에게 푸시 + 알림센터    (admin_send_error_report 첫 문의)
--   3) 그 이후 채팅 주고받기 → 상대에게 '푸시만'(알림센터 X), 그리고
--                              상대가 '앱에 머무는 중'이면 푸시도 보내지 않음.
--
--  구현 요지
--   · '푸시만(알림센터 미표시)' = notifications.silent = true 로 INSERT.
--     - DB 웹훅은 모든 INSERT 에 발화 → send-push 가 푸시는 그대로 보냄.
--     - 알림센터 목록/뱃지 쿼리는 silent=true 행을 제외(프론트 api.js).
--   · '앱에 머무는 중'이면 푸시 생략 = user_activity.last_active_at 하트비트.
--     - 클라이언트가 앱이 보일 때 주기적으로 touch_activity() 호출.
--     - send-push 가 silent 푸시에 한해 최근 활동(≈45초 내)이면 전송을 건너뜀.
--
--  전제: error-reports.sql, error-reports-chat.sql 적용됨.
--  적용: Supabase SQL Editor 에 그대로 실행(멱등).
--  ※ send-push/index.ts 를 함께 재배포해야 '앱에 머무는 중 푸시 생략'이 동작함.
-- =============================================================

-- 1) 컬럼: 알림센터에 표시하지 않는 '푸시 전용' 알림 -----------------
alter table public.notifications add column if not exists silent boolean not null default false;

-- 1-1) 3단계(채팅) 푸시 문구 템플릿 → 관리자 페이지 '알림 관리'에서 수정 가능
--      (신규 key 최초 삽입 시에만 기본 문구 세팅, 이후 관리자 편집 보존)
insert into public.notif_templates (key, label, title, body, vars, sort_order) values
  ('error_chat_admin', '오류 리포트 채팅: SYSTEM→회원', '깜냥',    '{text}', '{text} = 보낸 메시지', 92),
  ('error_chat_user',  '오류 리포트 채팅: 회원→관리자', '{actor}', '{text}', '{actor} = 회원 닉네임, {text} = 보낸 메시지, {title} = 리포트 제목', 93)
on conflict (key) do update set label = excluded.label, vars = excluded.vars, sort_order = excluded.sort_order;

-- 2) 활동(하트비트) 테이블 + 갱신 RPC ------------------------------
create table if not exists public.user_activity (
  user_id        uuid primary key references public.profiles(id) on delete cascade,
  last_active_at timestamptz not null default now()
);
alter table public.user_activity enable row level security;
-- 정책 없음: 서비스롤(send-push)·SECURITY DEFINER 함수만 접근

-- 앱이 화면에 보일 때 주기적으로 호출 → '지금 접속 중' 표식
create or replace function public.touch_activity()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.user_activity(user_id, last_active_at)
    values (auth.uid(), now())
  on conflict (user_id) do update set last_active_at = now();
end;
$$;
grant execute on function public.touch_activity() to authenticated;

-- 3) 관리자: SYSTEM 문의 보내기 -----------------------------------
--    · 최초 문의(앵커 생성) → 알림센터 + 푸시
--    · 이후 문의            → 푸시만(silent), 접속 중이면 send-push 가 생략
create or replace function public.admin_send_error_report(p_report_id uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare v_rep uuid; v_first boolean := false; v_t text; v_b text;
begin
  if not public.is_admin(auth.uid()) then raise exception '관리자만 사용할 수 있어요.'; end if;
  if p_body is null or btrim(p_body) = '' then raise exception '내용을 입력해 주세요.'; end if;
  select reporter_id into v_rep from public.error_reports where id = p_report_id;
  if v_rep is null then raise exception '리포트를 찾을 수 없어요.'; end if;

  -- 스레드 메시지(발신 SYSTEM: sender_id=null, recipient=null)
  insert into public.notes(sender_name, recipient_name, body, kind, report_id, is_anchor, is_read)
    values ('SYSTEM', '', btrim(p_body), 'system', p_report_id, false, false);

  -- 받은함 카드(앵커) 갱신 or 생성 → 미리보기=최신 문의, 안 읽음, 최신으로 끌어올림
  update public.notes set body = btrim(p_body), is_read = false, created_at = now()
   where report_id = p_report_id and is_anchor = true;
  if not found then
    v_first := true;   -- 앵커가 없었다 = 이번이 '최초 추가 문의'
    insert into public.notes(recipient_id, sender_name, recipient_name, body, kind, report_id, is_anchor, is_read)
      values (v_rep, 'SYSTEM', '', btrim(p_body), 'system', p_report_id, true, false);
  end if;

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
grant execute on function public.admin_send_error_report(uuid, text) to authenticated;

-- 4) 유저: 답변 → 스레드 메시지 + 관리자에게 '푸시만'(silent) ---------
--    유저 답변은 항상 채팅(앵커 생성 이후)이므로 언제나 3단계 규칙(푸시만).
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
grant execute on function public.reply_error_report(uuid, text) to authenticated;

notify pgrst, 'reload schema';
