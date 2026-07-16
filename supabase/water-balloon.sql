-- =============================================================
--  물풍선 폭탄 (waterbomb) — 일반 상점 기능 강화 아이템
--  쪽지에 타이머(초)를 실어 보내고, 받는 사람이 쪽지 모달을 '처음 연 시각'(opened_at)
--  부터 카운트다운. 0 이 되면 내용이 블러 처리되어 다시 읽을 수 없게 된다.
-- =============================================================

-- 1) 상점 아이템: 지우개(8)와 천체 망원경(9) 사이에 삽입
do $$
begin
  if not exists (select 1 from public.store_items where id = 'waterbomb') then
    update public.store_items set sort_order = sort_order + 1 where sort_order >= 9;
    insert into public.store_items (id, name, price, emoji, description, gift_only, sort_order)
      values ('waterbomb', '물풍선 폭탄', 10, '💧',
              E'타이머가 0이 되면 물풍선이 터져요\n쪽지가 다 젖어서 다시 읽을 수 없게 돼요', false, 9);
  end if;
end $$;

-- 2) notes 컬럼: 타이머(초) + 처음 연 시각
alter table public.notes add column if not exists timer_seconds integer;
alter table public.notes add column if not exists opened_at timestamptz;

-- 3) send_note: p_timer_seconds(10~120) 지원 + 물풍선 폭탄 1개 소모
--    (기존 3·4-인자 버전 제거 후 단일 5-인자 버전으로 통일 → 시그니처 모호성 방지)
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

-- 4) 물풍선 쪽지 처음 열기: opened_at 을 최초 1회만 기록(멱등). 반환값 없음.
--    (반환 테이블에서 opened_at 컬럼명이 겹쳐 return query 가 실패→update 롤백되던 문제 제거)
drop function if exists public.open_water_note(uuid);
create or replace function public.open_water_note(p_note_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.notes set opened_at = now()
    where id = p_note_id and recipient_id = auth.uid()
      and timer_seconds is not null and opened_at is null;
$$;
grant execute on function public.open_water_note(uuid) to authenticated;

-- 5) list_received_notes: timer_seconds / opened_at 추가 (반환 타입 변경 → drop 먼저)
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
