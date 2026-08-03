-- =============================================================
--  오류 리포트: 추가 문의를 "채팅"으로 전환
--   · 유저 받은함에는 리포트당 카드 1개(앵커)만. 관리자가 추가 문의해도 새 쪽지가 아니라
--     같은 대화(스레드)에 이어짐. 실시간 반영은 프론트 Realtime broadcast 로 처리.
--   · 삭제: 유저가 카드를 삭제하면 받은함에서만 숨김(error_reports.user_hidden), 관리자엔 남음.
--  전제: error-reports.sql 적용됨.  적용: Supabase SQL Editor 에 그대로 실행(멱등).
-- =============================================================

-- 1) 컬럼 -------------------------------------------------------
alter table public.notes add column if not exists is_anchor boolean not null default false;
alter table public.error_reports add column if not exists user_hidden boolean not null default false;
create index if not exists idx_notes_anchor on public.notes(report_id) where is_anchor;

-- 2) 기존 데이터 마이그레이션 ------------------------------------
--    (구모델: 관리자 문의마다 recipient=본인 쪽지 → 신모델: 스레드 메시지 recipient=null + 앵커 1개)
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

-- 3) 관리자: SYSTEM 문의 보내기 → 스레드 메시지 + 앵커 갱신(새 카드 X) ----
create or replace function public.admin_send_error_report(p_report_id uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare v_rep uuid; v_t text; v_b text;
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
    insert into public.notes(recipient_id, sender_name, recipient_name, body, kind, report_id, is_anchor, is_read)
      values (v_rep, 'SYSTEM', '', btrim(p_body), 'system', p_report_id, true, false);
  end if;

  select rr.title, rr.body into v_t, v_b from public.notif_render('system_note', jsonb_build_object()) rr;
  insert into public.notifications(user_id, type, title, body, report_id)
    values (v_rep, 'system_note', coalesce(v_t, 'SYSTEM 문의'),
            coalesce(v_b, '오류 리포트에 SYSTEM 이 문의를 남겼어요'), p_report_id);
end;
$$;
grant execute on function public.admin_send_error_report(uuid, text) to authenticated;

-- 4) 유저: 답변 → 스레드 메시지(발신 유저) + 관리자 알림 ----------
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

-- 5) 스레드 조회(앵커 제외) — 관리자용/유저용 -----------------------
create or replace function public.admin_error_report_thread(p_id uuid)
returns table(id uuid, from_system boolean, body text, created_at timestamptz)
language sql security definer set search_path = public stable as $$
  select n.id, (n.sender_id is null), n.body, n.created_at
    from public.notes n
   where n.report_id = p_id and coalesce(n.is_anchor, false) = false and public.is_admin(auth.uid())
   order by n.created_at asc;
$$;
grant execute on function public.admin_error_report_thread(uuid) to authenticated;

create or replace function public.error_report_thread(p_report_id uuid)
returns table(id uuid, from_system boolean, body text, created_at timestamptz)
language sql security definer set search_path = public stable as $$
  select n.id, (n.sender_id is null), n.body, n.created_at
    from public.notes n
    join public.error_reports er on er.id = n.report_id
   where n.report_id = p_report_id and coalesce(n.is_anchor, false) = false and er.reporter_id = auth.uid()
   order by n.created_at asc;
$$;
grant execute on function public.error_report_thread(uuid) to authenticated;

-- 6) 유저: 카드 삭제 = 받은함에서만 숨김(관리자엔 유지) ---------------
create or replace function public.delete_error_report_for_user(p_report_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.error_reports set user_hidden = true
   where id = p_report_id and reporter_id = auth.uid();
end;
$$;
grant execute on function public.delete_error_report_for_user(uuid) to authenticated;

-- 7) 받은 쪽지: 시스템은 '앵커'만 카드로, 삭제한 리포트는 제외 ---------
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
    and not (n.kind = 'system' and (
          coalesce(n.is_anchor, false) = false
          or coalesce((select er.user_hidden from public.error_reports er where er.id = n.report_id), false)
        ))
  order by n.created_at desc
  limit greatest(1, least(coalesce(p_limit, 15), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;
grant execute on function public.list_received_notes(integer, integer) to authenticated;

notify pgrst, 'reload schema';
