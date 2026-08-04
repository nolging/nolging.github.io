-- =============================================================
--  채팅 없이 지급되는 깜냥 명의 보상 쪽지(kind=gift, report_id 있음) 스타일 정리
--   · 카드 색깔: 네이비(기존 유지) / 모달 색깔: 흰색(기본)
--   · 쪽지 내용: 리포트 제목(굵게, 검정) + 리포트 원문(회색) + 여백 두 줄 + "처리 완료됐어요"(검정)
--     → "처리 완료됐어요"는 고정 문구라 DB 에 저장하지 않고 프런트에서 렌더링.
--     → 제목은 새 컬럼(report_title)에 저장, 본문(body)은 리포트 원문만 담는다.
--   · 츄르 지급도 아이템처럼 별도 박스 영역으로 표시(기존 reward_coin 컬럼 재사용).
--  전제: error-reports-reward.sql 적용됨.
--  적용: Supabase SQL Editor 에 그대로 실행.
-- =============================================================

alter table public.notes add column if not exists report_title text;

-- admin_grant_report_reward: '채팅 없음' 분기의 쪽지 본문을 원문만 담게 정리하고
-- (완료 문구는 프런트가 고정 렌더), 제목을 report_title 에 별도 저장. 츄르는 텍스트로
-- 합치지 않고 reward_coin 컬럼에만 저장(프런트가 별도 박스로 표시).
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
grant execute on function public.admin_grant_report_reward(uuid, jsonb, integer, text) to authenticated;

-- list_received_notes: report_title / reward_coin 추가 반환(받은함 카드가 이 쪽지도 함께
-- 여는 detail 소스라, 목록 조회에서부터 필요한 필드를 실어 보내야 모달에서 쓸 수 있다).
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
grant execute on function public.list_received_notes(integer, integer) to authenticated;

notify pgrst, 'reload schema';
