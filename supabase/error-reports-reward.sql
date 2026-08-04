-- =============================================================
--  오류 리포트 해결 처리 시 보상 지급(아이템/츄르) — 채팅 스레드로 전달
--   · 관리자가 리포트를 해결 완료로 처리하면서 리포터에게 아이템(수량 복수 선택)
--     또는 츄르를 지급할 수 있다. 지급 없이 완료 처리도 그대로 가능(선택 사항).
--   · 아이템 지급은 관리자 본인의 인벤토리 보유 여부와 무관하게, 상점(store_items)에
--     존재하고 활성화된 아이템이면 지급 가능. 프리미엄/티어 제한이 있는 아이템은
--     지급 대상(리포터)이 조건(커플/우정 링 사용 중)을 충족해야만 지급 가능.
--   · 지급된 보상은 해당 리포트 채팅(추가 문의 스레드)의 마지막 메시지로 전송된다.
--     - 아이템: 선물 쪽지와 동일한 "박스+수령하기" UI/RPC(note_items·claim_gift_item)를
--       재사용해, 유저가 채팅에서 바로 수령(인벤토리 반영)할 수 있다.
--     - 츄르: 즉시 지급(claim 불필요)하고, 채팅에는 안내 텍스트만 남는다.
--  전제: error-reports.sql, error-reports-chat.sql, error-reports-push.sql, note-items.sql 적용됨.
--  적용: Supabase SQL Editor 에 그대로 실행.
-- =============================================================

-- 1) claim_gift_item: 'gift' 쪽지뿐 아니라 오류 리포트 채팅('system', report_id)에
--    첨부된 보상 아이템도 수령할 수 있게 대상 판정을 리포트 소유자 기준으로 확장.
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
grant execute on function public.claim_gift_item(uuid, text) to authenticated;

-- 2) admin_send_error_report: 아이템/츄르(선택) 첨부 지원 추가.
--    p_items = [{"item_id":"...", "item_name":"...", "qty": n}, ...] 또는 null(기존과 동일).
--    p_coin = 이 메시지가 나타내는 츄르 지급액(구조화 표시용) 또는 null(기존과 동일).
alter table public.notes add column if not exists reward_coin integer;
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

  if v_first then
    -- 최초 문의: 알림센터 + 푸시(기존 그대로)
    select rr.title, rr.body into v_t, v_b from public.notif_render('system_note', jsonb_build_object()) rr;
    insert into public.notifications(user_id, type, title, body, report_id)
      values (v_rep, 'system_note', coalesce(v_t, 'SYSTEM 문의'),
              coalesce(v_b, '오류 리포트에 SYSTEM 이 문의를 남겼어요'), p_report_id);
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

-- 3) 스레드 조회에 첨부 아이템(items)/츄르(reward_coin) 추가 — 유저용/관리자용 모두.
--    (반환 컬럼이 늘어나므로 create or replace 대신 drop 후 재생성)
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
   where n.report_id = p_report_id and coalesce(n.is_anchor, false) = false and er.reporter_id = auth.uid()
   order by n.created_at asc;
$$;
grant execute on function public.error_report_thread(uuid) to authenticated;

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
   where n.report_id = p_id and coalesce(n.is_anchor, false) = false and public.is_admin(auth.uid())
   order by n.created_at asc;
$$;
grant execute on function public.admin_error_report_thread(uuid) to authenticated;

-- 4) 리포터 기준 보상 지급 후보 아이템 목록 조회 -----------------------
--    (관리자 전용 아이템·소원권 제외, 프리미엄/티어 조건 충족 여부 + 이미 보유 수량 반환)
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
grant execute on function public.admin_report_reward_context(uuid) to authenticated;

-- 5) 보상 지급(아이템 여러 개 + 수량 / 츄르) → 채팅 스레드로 전송 ----------
--    p_items: [{"item_id":"...", "qty": n}, ...] (또는 null) — 아이템은 채팅에 "박스+수령하기"로 전달(즉시 지급 X)
--    p_coin: 지급할 츄르 수(또는 null/0) — 츄르는 즉시 지급 + 안내 텍스트만 전달
create or replace function public.admin_grant_report_reward(
  p_report_id uuid, p_items jsonb default null, p_coin integer default null, p_reason text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_rep uuid; v_couple boolean; v_friend boolean;
  v_entry jsonb; v_id text; v_qty integer;
  v_balance integer; v_valid jsonb := '[]'::jsonb;
  si public.store_items;
begin
  if not public.is_admin(auth.uid()) then raise exception '관리자만 사용할 수 있어요.'; end if;
  select reporter_id into v_rep from public.error_reports where id = p_report_id;
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

  if jsonb_array_length(v_valid) > 0 then
    perform public.admin_send_error_report(p_report_id, '🎁 보상 아이템이 도착했어요', v_valid);
  end if;

  if p_coin is not null and p_coin > 0 then
    insert into public.coin_ledger(user_id, delta, reason, ref_type, ref_id, created_by)
      values (v_rep, p_coin, coalesce(nullif(btrim(p_reason), ''), '오류 리포트 보상'), 'error_report_reward', p_report_id, auth.uid());
    select coalesce(sum(delta), 0)::integer into v_balance from public.coin_ledger where user_id = v_rep;
    perform public.admin_send_error_report(p_report_id, '오류 리포트 보상으로 ' || p_coin || ' 츄르 지급됐어요', null, p_coin);
  end if;

  return jsonb_build_object('coin_balance', v_balance);
end;
$$;
grant execute on function public.admin_grant_report_reward(uuid, jsonb, integer, text) to authenticated;

-- 6) note_items RLS 확장 — 오류 리포트 채팅 메시지(kind='system')는 recipient_id/sender_id
--    가 둘 다 null(SYSTEM 발신 스레드 메시지)이라 기존 정책(수신자/발신자만 조회 가능)을
--    통과하지 못해, SECURITY DEFINER 함수로 조회해도 note_items 가 항상 빈 배열로 보였다.
--    리포트 소유자(reporter) 및 관리자도 조회할 수 있게 확장.
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

-- 7) 받은함 카드: 아이템 보상이 있으면(수령 전이면 통통 튀는) 배지 표시용 플래그 추가.
drop function if exists public.list_received_notes(integer, integer);
create function public.list_received_notes(p_limit integer default 15, p_offset integer default 0)
returns table(
  id uuid, group_id uuid, sender_id uuid, recipient_id uuid,
  sender_name text, recipient_name text, sender_avatar text, recipient_avatar text,
  body text, kind text, is_read boolean, created_at timestamptz,
  item_id text, item_name text, claimed boolean, rejected boolean, media_url text, anonymous boolean, qty integer,
  timer_seconds integer, opened_at timestamptz, sender_active boolean,
  report_id uuid, report_resolved boolean, report_resolved_at timestamptz,
  report_has_reward_item boolean, report_reward_pending boolean
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
             where tn.report_id = n.report_id and coalesce(tn.is_anchor, false) = false and not ni.claimed)
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
grant execute on function public.list_received_notes(integer, integer) to authenticated;

-- 8) 채팅(추가 문의)이 아예 없던 리포트는 보상을 채팅이 아니라 깜냥 명의의 "쪽지"로 발송.
--    - 본문 = 리포트 원본 내용 + 줄바꿈 + "처리 완료됐어요"(+ 츄르 지급 시 안내 한 줄 더)
--    - 아이템은 쪽지 선물과 동일하게 note_items 로 첨부(기존 수령 UI 그대로 재사용)
--    - 답장 불가. 아이템을 전부 수령해야(아이템이 없으면 바로) 삭제 가능.
--    스레드 조회에서 이 쪽지를 채팅 메시지로 잘못 집계하지 않도록 kind='system' 조건 추가.
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
grant execute on function public.error_report_thread(uuid) to authenticated;

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
grant execute on function public.admin_error_report_thread(uuid) to authenticated;

-- admin_grant_report_reward 재정의: 채팅이 없으면 쪽지로, 있으면 기존처럼 채팅 메시지로.
create or replace function public.admin_grant_report_reward(
  p_report_id uuid, p_items jsonb default null, p_coin integer default null, p_reason text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_rep uuid; v_report_body text; v_couple boolean; v_friend boolean;
  v_entry jsonb; v_id text; v_qty integer;
  v_balance integer; v_valid jsonb := '[]'::jsonb;
  si public.store_items;
  v_has_chat boolean; v_note_id uuid; v_note_body text; v_it jsonb; v_item_id text; v_name text;
begin
  if not public.is_admin(auth.uid()) then raise exception '관리자만 사용할 수 있어요.'; end if;
  select reporter_id, body into v_rep, v_report_body from public.error_reports where id = p_report_id;
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
    -- 채팅이 없던 리포트: 깜냥 명의로 쪽지(선물) 발송
    v_note_body := coalesce(v_report_body, '') || E'\n' || '처리 완료됐어요';
    if p_coin is not null and p_coin > 0 then
      v_note_body := v_note_body || E'\n오류 리포트 보상으로 ' || p_coin || ' 츄르 지급됐어요';
    end if;
    insert into public.notes(recipient_id, sender_name, recipient_name, body, kind, report_id, is_read)
      values (v_rep, 'SYSTEM', '', v_note_body, 'gift', p_report_id, false)
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
grant execute on function public.admin_grant_report_reward(uuid, jsonb, integer, text) to authenticated;

-- 9) 깜냥 명의 보상 쪽지 삭제(숨김). RLS 상 notes 는 하드 delete 정책이 없어(수신자 UPDATE 만
--    허용) user_hidden 플래그로 숨긴다 — 오류 리포트 채팅 카드 삭제(user_hidden)와 같은 방식.
--    아이템을 전부 수령하기 전에는 삭제할 수 없다(아이템이 없으면 바로 삭제 가능).
alter table public.notes add column if not exists user_hidden boolean not null default false;
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
grant execute on function public.delete_report_gift_note(uuid) to authenticated;

notify pgrst, 'reload schema';
