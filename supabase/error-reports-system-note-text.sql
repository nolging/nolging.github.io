-- =============================================================
--  오류 리포트 SYSTEM 문의(최초 1건) 알림에도 실제 입력한 메시지가
--  보이도록 {text} 치환자 지원 추가.
--   · 지금까지 최초 문의(system_note 템플릿)만 고정 문구
--     ("...문의를 남겼어요")로 나가고, 관리자가 실제로 입력한 내용은
--     알림에 반영되지 않았다(두 번째 문의부터 쓰이는 error_chat_admin
--     템플릿만 {text} 로 실제 메시지를 보여줬음). 그 결과 관리자가
--     알림 관리에서 문구를 수정해도, 정작 알림 본문은 자신이 입력한
--     메시지와 무관한 고정 문구로 나가 혼란을 줬다.
--   · system_note 템플릿에도 {text}(보낸 메시지) 치환자를 전달하도록
--     고치고, 기본 문구도 실제 메시지를 담게 갱신한다. 관리자가 알림
--     관리에서 문구를 직접 커스텀했다면 그 내용은 그대로 둔다(기존
--     기본 문구 그대로인 경우에만 갱신).
--  전제: error-reports-reward.sql(admin_send_error_report 최신 버전) 적용됨.
--  적용: Supabase SQL Editor 에 그대로 실행.
-- =============================================================

-- 1) vars 힌트 갱신(알림 관리 화면의 "사용 가능한 치환자"에 표시) — label/sort_order 는 기존과 동일,
--    title/body 는 관리자 편집 보존을 위해 갱신하지 않음(기존 규칙과 동일).
insert into public.notif_templates (key, label, title, body, vars, sort_order) values
  ('system_note', 'SYSTEM 문의 도착(유저)', 'SYSTEM 문의', '오류 리포트에 SYSTEM 이 문의를 남겼어요', '{text} = 보낸 메시지', 91)
on conflict (key) do update set vars = excluded.vars;

-- 2) 아직 기본 문구 그대로인 경우에만, 실제 메시지가 보이는 문구로 한 번 갱신.
--    (관리자가 이미 다른 내용으로 고쳐둔 상태라면 건드리지 않는다)
update public.notif_templates
   set body = '오류 리포트에 SYSTEM 이 "{text}" 라고 문의를 남겼어요'
 where key = 'system_note' and body = '오류 리포트에 SYSTEM 이 문의를 남겼어요';

-- 3) admin_send_error_report: 최초 문의도 실제 입력한 메시지를 {text} 로 전달.
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
    -- 최초 문의: 알림센터 + 푸시. 실제로 입력한 메시지를 {text} 로 전달.
    select rr.title, rr.body into v_t, v_b
      from public.notif_render('system_note', jsonb_build_object('text', btrim(p_body))) rr;
    insert into public.notifications(user_id, type, title, body, report_id)
      values (v_rep, 'system_note', coalesce(v_t, 'SYSTEM 문의'),
              coalesce(v_b, '오류 리포트에 SYSTEM 이 "' || btrim(p_body) || '" 라고 문의를 남겼어요'), p_report_id);
  else
    -- 이후 문의: 푸시만(알림센터 미표시) + 접속 중이면 send-push 가 생략.
    select rr.title, rr.body into v_t, v_b
      from public.notif_render('error_chat_admin', jsonb_build_object('text', btrim(p_body))) rr;
    insert into public.notifications(user_id, type, title, body, report_id, silent)
      values (v_rep, 'system_note', coalesce(v_t, '깜냥'), coalesce(v_b, btrim(p_body)), p_report_id, true);
  end if;
end;
$$;
grant execute on function public.admin_send_error_report(uuid, text, jsonb, integer) to authenticated;

notify pgrst, 'reload schema';
