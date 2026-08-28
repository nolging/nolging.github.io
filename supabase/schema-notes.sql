-- =============================================================
--  쪽지(Notes) 기능 통합 번들
--  다음 6개 개별 파일을 하나로 통합한 것입니다(레포 정리 작업의 일부로 생성):
--    - note-items.sql          (쪽지 동봉 아이템: 여러 종류를 쪽지 하나로, 개별/일괄 수령)
--    - notes-anonymous.sql     (익명(지우개) 발송 + 각 발송 함수에 p_anonymous 추가)
--    - notes-pagination.sql    (list_received_notes 페이지네이션: limit/offset)
--    - notes-unread-count.sql  (받은 쪽지 안 읽음 개수, 익명 포함)
--    - gift-message.sql        (상점 선물하기에 메시지 첨부: gift_item + p_message)
--    - water-note-read.sql     (물풍선 쪽지 읽음 처리 원자화: open_water_note 단일 호출로 통합)
--
--  각 함수/컬럼이 원본 6개 파일 중 둘 이상에서 반복 정의된 경우, 이 파일에는
--  최종(가장 나중) 버전만 실었습니다(특히 list_received_notes 는 notes-anonymous.sql
--  의 무인자 버전 → notes-pagination.sql 의 limit/offset 버전으로 대체되었고,
--  후자만 수록합니다).
--
--  적용 범위: supabase/schema.sql + supabase/schema-v2.sql 적용 이후, 새 환경을
--  처음부터 세팅할 때 그대로 실행하면 됩니다(문서화 / 재해복구 / 신규 환경용).
--  이미 라이브 중인 프로덕션 DB에는 원본 6개 파일이 이미 순서대로 적용되어
--  있으므로 이 파일을 다시 실행할 필요는 없습니다(재실행해도 create or replace /
--  if not exists 위주라 안전하긴 하지만 불필요합니다).
-- =============================================================


-- =============================================================
--  1. 테이블 / 컬럼
-- =============================================================

-- 쪽지 익명 발송 지원 (notes-anonymous.sql)
alter table public.notes add column if not exists anonymous boolean not null default false;

-- 쪽지 동봉 아이템(여러 종류를 쪽지 하나로) — 개별/일괄 수령 (note-items.sql)
create table if not exists public.note_items (
  id         uuid primary key default gen_random_uuid(),
  note_id    uuid not null references public.notes(id) on delete cascade,
  item_id    text not null,
  item_name  text not null,
  qty        integer not null default 1,
  claimed    boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_note_items_note on public.note_items(note_id);
alter table public.note_items enable row level security;

-- note_items RLS 는 아래 notes_select 정책(§2)을 그대로 재사용할 수 없다 — 그 정책은
-- 받는 사람에게 "익명 쪽지의 원본 행"을 아예 숨기는데(발신자 식별 정보 보호 목적), 그
-- 서브쿼리가 일반 role 로 실행되면 notes 자신의 RLS 도 함께 적용돼 anonymous=true 인
-- 쪽지는 받는 사람에게도 exists() 가 항상 false 로 나온다. 그 결과 지우개(익명)로 보낸
-- 쪽지에 아이템을 동봉하면 받는 사람 화면에 "수령하기" 버튼 자체가 안 뜨는 버그가 있었다
-- (listNoteItems() 가 note_items 를 직접 SELECT 하므로 이 RLS 를 그대로 탄다).
-- 발신자 식별과 무관하게 "이 쪽지의 당사자인지"만 판정하는 정의자 함수로 우회한다.
create or replace function public._note_participant(p_note_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.notes where id = p_note_id and (sender_id = auth.uid() or recipient_id = auth.uid()));
$$;
grant execute on function public._note_participant(uuid) to authenticated;

drop policy if exists note_items_select on public.note_items;
create policy note_items_select on public.note_items for select to authenticated using (
  public._note_participant(note_id)
);


-- =============================================================
--  2. RLS: 쪽지 SELECT 정책 (익명이면 받는 사람이 원본 행을 직접 못 읽음)
-- =============================================================

-- 익명 쪽지는 받는 사람이 원본 행을 직접 못 읽음(전용 RPC 로만) → 완전 익명
drop policy if exists notes_select on public.notes;
create policy notes_select on public.notes
  for select to authenticated
  using ( sender_id = auth.uid() or (recipient_id = auth.uid() and anonymous = false) );


-- =============================================================
--  3. 헬퍼 함수
-- =============================================================

-- 지우개 1개 소모(없으면 예외)
create or replace function public.consume_one_eraser()
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from public.user_items
   where user_id = auth.uid() and item_id = 'eraser' and status = 'active'
   order by created_at asc limit 1;
  if v_id is null then raise exception '사용할 수 있는 지우개가 없습니다.'; end if;
  update public.user_items set status = 'used', used_at = now() where id = v_id;
end;
$$;
grant execute on function public.consume_one_eraser() to authenticated;


-- =============================================================
--  4. 받은 쪽지 목록 / 안 읽음 개수
-- =============================================================

-- list_received_notes 의 모든 오버로드(무인자/구버전 포함) 제거 후
-- limit/offset 버전 하나만 생성(화면에 ~9개 노출 → 최근 15개만 조회,
-- 더 과거는 스크롤 시 추가 조회. 익명이면 발신자 정보 가림은 동일).
do $$
declare r record;
begin
  for r in
    select oid::regprocedure::text as sig
    from pg_proc where proname = 'list_received_notes' and pronamespace = 'public'::regnamespace
  loop
    execute 'drop function ' || r.sig;
  end loop;
end $$;

create function public.list_received_notes(p_limit integer default 15, p_offset integer default 0)
returns table(
  id uuid, group_id uuid, sender_id uuid, recipient_id uuid,
  sender_name text, recipient_name text, sender_avatar text, recipient_avatar text,
  body text, kind text, is_read boolean, created_at timestamptz,
  item_id text, item_name text, claimed boolean, rejected boolean, media_url text, anonymous boolean, qty integer
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
    n.item_id, n.item_name, n.claimed, n.rejected, n.media_url, n.anonymous, coalesce(n.qty, 1)
  from public.notes n
  where n.recipient_id = auth.uid()
  order by n.created_at desc
  limit greatest(1, least(coalesce(p_limit, 15), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;
grant execute on function public.list_received_notes(integer, integer) to authenticated;

-- 받은 쪽지 안 읽음 개수(익명 포함). 익명 쪽지는 notes_select RLS 상 수신자가
-- 원본 행을 직접 조회할 수 없어 클라이언트의 select count 가 익명 쪽지를
-- 세지 못한다(→ 하단 탭 '쪽지' 점 안 뜸, 읽어도 카운트 갱신 안 됨). 수신자
-- 본인의 미확인 쪽지(익명 포함)를 세는 SECURITY DEFINER 함수로 처리한다.
create or replace function public.unread_note_count()
returns integer language sql security definer set search_path = public stable as $$
  select count(*)::int
    from public.notes
   where recipient_id = auth.uid() and is_read = false;
$$;
grant execute on function public.unread_note_count() to authenticated;


-- =============================================================
--  5. 발송 함수 (일반 쪽지 / 카세트 / 비디오 / 블루레이 / 선물 상자)
--  파라미터가 늘어나는 함수들은 기존 시그니처를 먼저 제거(오버로드 모호성 방지)
--  후 p_anonymous 추가(익명이면 지우개 1개 소모, 커플/우정 링은 익명 불가).
-- =============================================================

drop function if exists public.send_note(uuid, uuid, text);
drop function if exists public.use_cassette(uuid, uuid, text, text);
drop function if exists public.use_video(uuid, uuid, text, text);
drop function if exists public.use_bluray(uuid, uuid, text, text);
drop function if exists public.use_link(uuid, uuid, text, text, text);

-- ---- 일반 쪽지 --------------------------------------------------
create or replace function public.send_note(p_group_id uuid, p_recipient_id uuid, p_body text, p_anonymous boolean default false)
returns public.notes language plpgsql security definer set search_path = public as $$
declare r public.notes; v_sender text; v_recipient text; v_sender_av text; v_recipient_av text;
begin
  if not public.is_group_member(p_group_id, auth.uid()) then raise exception '그룹 멤버만 보낼 수 있습니다.'; end if;
  if p_recipient_id = auth.uid() then raise exception '자기 자신에게는 보낼 수 없습니다.'; end if;
  if not public.is_group_member(p_group_id, p_recipient_id) then raise exception '받는 사람이 그룹 멤버가 아닙니다.'; end if;
  if p_body is null or btrim(p_body) = '' then raise exception '쪽지 내용을 입력해 주세요.'; end if;
  if char_length(p_body) > 150 then raise exception '쪽지는 최대 150자까지 작성할 수 있습니다.'; end if;

  if coalesce(p_anonymous, false) then perform public.consume_one_eraser(); end if;

  v_sender    := public.notif_member_name(p_group_id, auth.uid());
  v_recipient := public.notif_member_name(p_group_id, p_recipient_id);
  select avatar_url into v_sender_av    from public.group_members where group_id = p_group_id and user_id = auth.uid();
  select avatar_url into v_recipient_av from public.group_members where group_id = p_group_id and user_id = p_recipient_id;

  insert into public.notes(group_id, sender_id, recipient_id, sender_name, recipient_name, sender_avatar, recipient_avatar, body, anonymous)
    values (p_group_id, auth.uid(), p_recipient_id, v_sender, v_recipient, v_sender_av, v_recipient_av, btrim(p_body), coalesce(p_anonymous, false))
    returning * into r;
  return r;
end;
$$;
grant execute on function public.send_note(uuid, uuid, text, boolean) to authenticated;

-- ---- 카세트 --------------------------------------------------
create or replace function public.use_cassette(p_group_id uuid, p_recipient_id uuid, p_message text, p_url text, p_anonymous boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.user_items; v_sender text; v_recipient text; v_sav text; v_rav text; v_body text;
begin
  if p_url is null or btrim(p_url) = '' then raise exception '음악 링크를 입력해 주세요.'; end if;
  select * into v_item from public.user_items where user_id = auth.uid() and item_id = 'cassette' and status = 'active' order by created_at asc limit 1;
  if v_item.id is null then raise exception '사용할 수 있는 카세트 테이프가 없습니다.'; end if;
  if not public.is_group_member(p_group_id, auth.uid()) then raise exception '그룹 멤버만 사용할 수 있습니다.'; end if;
  if p_recipient_id = auth.uid() then raise exception '자기 자신에게는 보낼 수 없습니다.'; end if;
  if not public.is_group_member(p_group_id, p_recipient_id) then raise exception '받는 사람이 그룹 멤버가 아닙니다.'; end if;

  update public.user_items set status = 'used', used_at = now() where id = v_item.id;
  if coalesce(p_anonymous, false) then perform public.consume_one_eraser(); end if;

  v_sender    := coalesce(public.notif_member_name(p_group_id, auth.uid()), '');
  v_recipient := coalesce(public.notif_member_name(p_group_id, p_recipient_id), '');
  select avatar_url into v_sav from public.group_members where group_id = p_group_id and user_id = auth.uid();
  select avatar_url into v_rav from public.group_members where group_id = p_group_id and user_id = p_recipient_id;
  v_body := coalesce(nullif(btrim(p_message), ''), '음악을 보냈어요 🎵');

  insert into public.notes(group_id, sender_id, recipient_id, sender_name, recipient_name, sender_avatar, recipient_avatar, body, kind, item_id, media_url, anonymous)
    values (p_group_id, auth.uid(), p_recipient_id, v_sender, v_recipient, v_sav, v_rav, v_body, 'cassette', 'cassette', btrim(p_url), coalesce(p_anonymous, false));

  insert into public.notifications(user_id, actor_id, type, title, body, group_id)
    values (p_recipient_id, case when coalesce(p_anonymous, false) then null else auth.uid() end, 'cassette',
            case when coalesce(p_anonymous, false) then '익명의 음악이 도착했어요' when v_sender <> '' then v_sender || ' 님이 음악을 보냈어요' else '음악이 도착했어요' end,
            '쪽지함에서 들어보세요 🎵', p_group_id);
end;
$$;
grant execute on function public.use_cassette(uuid, uuid, text, text, boolean) to authenticated;

-- ---- 비디오 --------------------------------------------------
create or replace function public.use_video(p_group_id uuid, p_recipient_id uuid, p_message text, p_url text, p_anonymous boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.user_items; v_sender text; v_recipient text; v_sav text; v_rav text; v_body text;
begin
  if p_url is null or btrim(p_url) = '' then raise exception '영상 링크를 입력해 주세요.'; end if;
  select * into v_item from public.user_items where user_id = auth.uid() and item_id = 'video' and status = 'active' order by created_at asc limit 1;
  if v_item.id is null then raise exception '사용할 수 있는 비디오 테이프가 없습니다.'; end if;
  if not public.is_group_member(p_group_id, auth.uid()) then raise exception '그룹 멤버만 사용할 수 있습니다.'; end if;
  if p_recipient_id = auth.uid() then raise exception '자기 자신에게는 보낼 수 없습니다.'; end if;
  if not public.is_group_member(p_group_id, p_recipient_id) then raise exception '받는 사람이 그룹 멤버가 아닙니다.'; end if;

  update public.user_items set status = 'used', used_at = now() where id = v_item.id;
  if coalesce(p_anonymous, false) then perform public.consume_one_eraser(); end if;

  v_sender    := coalesce(public.notif_member_name(p_group_id, auth.uid()), '');
  v_recipient := coalesce(public.notif_member_name(p_group_id, p_recipient_id), '');
  select avatar_url into v_sav from public.group_members where group_id = p_group_id and user_id = auth.uid();
  select avatar_url into v_rav from public.group_members where group_id = p_group_id and user_id = p_recipient_id;
  v_body := coalesce(nullif(btrim(p_message), ''), '영상을 보냈어요 📹');

  insert into public.notes(group_id, sender_id, recipient_id, sender_name, recipient_name, sender_avatar, recipient_avatar, body, kind, item_id, media_url, anonymous)
    values (p_group_id, auth.uid(), p_recipient_id, v_sender, v_recipient, v_sav, v_rav, v_body, 'video', 'video', btrim(p_url), coalesce(p_anonymous, false));

  insert into public.notifications(user_id, actor_id, type, title, body, group_id)
    values (p_recipient_id, case when coalesce(p_anonymous, false) then null else auth.uid() end, 'video',
            case when coalesce(p_anonymous, false) then '익명의 영상이 도착했어요' when v_sender <> '' then v_sender || ' 님이 영상을 보냈어요' else '영상이 도착했어요' end,
            '쪽지함에서 확인하세요 📹', p_group_id);
end;
$$;
grant execute on function public.use_video(uuid, uuid, text, text, boolean) to authenticated;

-- ---- 블루레이 --------------------------------------------------
create or replace function public.use_bluray(p_group_id uuid, p_recipient_id uuid, p_message text, p_url text, p_anonymous boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.user_items; v_sender text; v_recipient text; v_sav text; v_rav text; v_body text;
begin
  if p_url is null or btrim(p_url) = '' then raise exception '영상 링크를 입력해 주세요.'; end if;
  select * into v_item from public.user_items where user_id = auth.uid() and item_id = 'bluray' and status = 'active' order by created_at asc limit 1;
  if v_item.id is null then raise exception '사용할 수 있는 블루레이가 없습니다.'; end if;
  if not public.is_group_member(p_group_id, auth.uid()) then raise exception '그룹 멤버만 사용할 수 있습니다.'; end if;
  if p_recipient_id = auth.uid() then raise exception '자기 자신에게는 보낼 수 없습니다.'; end if;
  if not public.is_group_member(p_group_id, p_recipient_id) then raise exception '받는 사람이 그룹 멤버가 아닙니다.'; end if;

  update public.user_items set status = 'used', used_at = now() where id = v_item.id;
  if coalesce(p_anonymous, false) then perform public.consume_one_eraser(); end if;

  v_sender    := coalesce(public.notif_member_name(p_group_id, auth.uid()), '');
  v_recipient := coalesce(public.notif_member_name(p_group_id, p_recipient_id), '');
  select avatar_url into v_sav from public.group_members where group_id = p_group_id and user_id = auth.uid();
  select avatar_url into v_rav from public.group_members where group_id = p_group_id and user_id = p_recipient_id;
  v_body := coalesce(nullif(btrim(p_message), ''), '영상을 보냈어요 💿');

  insert into public.notes(group_id, sender_id, recipient_id, sender_name, recipient_name, sender_avatar, recipient_avatar, body, kind, item_id, media_url, anonymous)
    values (p_group_id, auth.uid(), p_recipient_id, v_sender, v_recipient, v_sav, v_rav, v_body, 'bluray', 'bluray', btrim(p_url), coalesce(p_anonymous, false));

  insert into public.notifications(user_id, actor_id, type, title, body, group_id)
    values (p_recipient_id, case when coalesce(p_anonymous, false) then null else auth.uid() end, 'bluray',
            case when coalesce(p_anonymous, false) then '익명의 영상이 도착했어요' when v_sender <> '' then v_sender || ' 님이 영상을 보냈어요' else '영상이 도착했어요' end,
            '쪽지함에서 확인하세요 💿', p_group_id);
end;
$$;
grant execute on function public.use_bluray(uuid, uuid, text, text, boolean) to authenticated;

-- ---- 선물 상자(링크) --------------------------------------------------
create or replace function public.use_link(p_group_id uuid, p_recipient_id uuid, p_message text, p_url text, p_label text default null, p_anonymous boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.user_items; v_sender text; v_recipient text; v_sav text; v_rav text; v_body text; v_label text;
begin
  if p_url is null or btrim(p_url) = '' then raise exception '링크를 입력해 주세요.'; end if;
  select * into v_item from public.user_items where user_id = auth.uid() and item_id = 'link' and status = 'active' order by created_at asc limit 1;
  if v_item.id is null then raise exception '사용할 수 있는 선물 상자가 없습니다.'; end if;
  if not public.is_group_member(p_group_id, auth.uid()) then raise exception '그룹 멤버만 사용할 수 있습니다.'; end if;
  if p_recipient_id = auth.uid() then raise exception '자기 자신에게는 보낼 수 없습니다.'; end if;
  if not public.is_group_member(p_group_id, p_recipient_id) then raise exception '받는 사람이 그룹 멤버가 아닙니다.'; end if;

  update public.user_items set status = 'used', used_at = now() where id = v_item.id;
  if coalesce(p_anonymous, false) then perform public.consume_one_eraser(); end if;

  v_sender    := coalesce(public.notif_member_name(p_group_id, auth.uid()), '');
  v_recipient := coalesce(public.notif_member_name(p_group_id, p_recipient_id), '');
  select avatar_url into v_sav from public.group_members where group_id = p_group_id and user_id = auth.uid();
  select avatar_url into v_rav from public.group_members where group_id = p_group_id and user_id = p_recipient_id;
  v_body  := coalesce(nullif(btrim(p_message), ''), '선물 상자를 보냈어요 🎁');
  v_label := coalesce(nullif(btrim(p_label), ''), '선물 상자 열기');

  insert into public.notes(group_id, sender_id, recipient_id, sender_name, recipient_name, sender_avatar, recipient_avatar, body, kind, item_id, item_name, media_url, anonymous)
    values (p_group_id, auth.uid(), p_recipient_id, v_sender, v_recipient, v_sav, v_rav, v_body, 'link', 'link', v_label, btrim(p_url), coalesce(p_anonymous, false));

  insert into public.notifications(user_id, actor_id, type, title, body, group_id)
    values (p_recipient_id, case when coalesce(p_anonymous, false) then null else auth.uid() end, 'link',
            case when coalesce(p_anonymous, false) then '익명의 선물 상자가 도착했어요' when v_sender <> '' then v_sender || ' 님이 선물 상자를 보냈어요' else '선물 상자가 도착했어요' end,
            '쪽지함에서 확인하세요 🎁', p_group_id);
end;
$$;
grant execute on function public.use_link(uuid, uuid, text, text, text, boolean) to authenticated;


-- =============================================================
--  6. 상점 선물 / 보유 아이템 선물
-- =============================================================

-- 상점 선물하기(츄르로 구매해 선물) — 선물 쪽지에 메시지 첨부(없으면 기존처럼 아이템명)
drop function if exists public.gift_item(text, uuid, uuid, integer);
create or replace function public.gift_item(p_item_id text, p_group_id uuid, p_recipient_id uuid, p_qty integer default 1, p_message text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare it public.store_items; v_balance integer; v_sender text; v_recipient text; v_sender_av text; v_recipient_av text; v_note_id uuid; v_qty integer; v_total integer; i integer; v_body text;
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
  insert into public.notifications(user_id, actor_id, type, title, body, group_id, note_id)
    values (p_recipient_id, auth.uid(), 'gift', v_sender || ' 님이 선물을 보냈어요',
            it.name || case when v_qty > 1 then ' ' || v_qty || '개' else '' end || ' · 쪽지함에서 수령하세요', p_group_id, v_note_id);

  return v_balance - v_total;
end;
$$;
grant execute on function public.gift_item(text, uuid, uuid, integer, text) to authenticated;

-- 아이템 선물(내 보유분에서 소모 + 메시지 첨부 + 익명) ------------------
--  gift_item(츄르로 구매해 선물)과 달리, 쪽지 작성 화면의 "아이템 선물"은
--  내 인벤토리에 있는 아이템을 꺼내 보낸다(보유분 소모, 츄르 차감 없음).
create or replace function public.gift_owned_item(p_item_id text, p_group_id uuid, p_recipient_id uuid, p_qty integer default 1, p_message text default null, p_anonymous boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare it public.store_items; v_sender text; v_recipient text; v_sav text; v_rav text; v_note_id uuid; v_qty integer; i integer; v_body text; v_anon boolean; v_ids uuid[]; v_name text;
begin
  v_anon := coalesce(p_anonymous, false);
  v_qty := greatest(1, coalesce(p_qty, 1));
  select * into it from public.store_items where id = p_item_id;
  v_name := coalesce(it.name, p_item_id);

  if not public.is_group_member(p_group_id, auth.uid()) then raise exception '그룹 멤버만 선물할 수 있습니다.'; end if;
  if p_recipient_id = auth.uid() then raise exception '자기 자신에게는 선물할 수 없습니다.'; end if;
  if not public.is_group_member(p_group_id, p_recipient_id) then raise exception '받는 사람이 그룹 멤버가 아닙니다.'; end if;

  -- 소원권: 선물받아 수신자가 정해진 아이템 → 재선물 불가
  if p_item_id = 'wish' then raise exception '선물받은 소원권은 다시 선물할 수 없어요.'; end if;

  -- 프리미엄 아이템은 프리미엄 회원(티어별 커플/우정)에게만 선물 가능
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

  -- 소모할 보유 아이템(active) 선택
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

  insert into public.notifications(user_id, actor_id, type, title, body, group_id, note_id)
    values (p_recipient_id, case when v_anon then null else auth.uid() end, 'gift',
            case when v_anon then '익명의 선물이 도착했어요' else v_sender || ' 님이 선물을 보냈어요' end,
            v_name || case when v_qty > 1 then ' ' || v_qty || '개' else '' end || ' · 쪽지함에서 수령하세요', p_group_id, v_note_id);
end;
$$;
grant execute on function public.gift_owned_item(text, uuid, uuid, integer, text, boolean) to authenticated;

-- 여러 아이템을 한 쪽지로 선물. p_gifts = [{"item_id":"...","qty":n}, ...]
create or replace function public.send_gift_note(
  p_group_id uuid, p_recipient_id uuid, p_message text, p_anonymous boolean, p_gifts jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_sender text; v_recipient text; v_sav text; v_rav text; v_note_id uuid;
        v_anon boolean; g jsonb; v_item_id text; v_qty integer; it public.store_items;
        v_name text; v_ids uuid[]; v_count integer := 0; v_first_name text; v_total integer := 0; i integer;
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

  insert into public.notifications(user_id, actor_id, type, title, body, group_id, note_id)
    values (p_recipient_id, case when v_anon then null else auth.uid() end, 'gift',
            case when v_anon then '익명의 선물이 도착했어요' else v_sender || ' 님이 선물을 보냈어요' end,
            case when v_count > 1 then v_first_name || ' 외 ' || (v_count-1) || '종'
                 else v_first_name || case when v_total>1 then ' ' || v_total || '개' else '' end end
            || ' · 쪽지함에서 수령하세요', p_group_id, v_note_id);
  return v_note_id;
end; $$;
grant execute on function public.send_gift_note(uuid, uuid, text, boolean, jsonb) to authenticated;

-- 개별 수령: 쪽지 안 특정 아이템(종류)을 수량만큼 인벤토리로
create or replace function public.claim_gift_item(p_note_id uuid, p_item_id text)
returns void language plpgsql security definer set search_path = public as $$
declare n public.notes; ni public.note_items; i integer;
begin
  select * into n from public.notes where id = p_note_id;
  if n.id is null or n.recipient_id <> auth.uid() or n.kind <> 'gift' then raise exception '수령할 수 없는 선물입니다.'; end if;
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

-- 일괄 수령: 쪽지 안 미수령 아이템 전부
create or replace function public.claim_gift_note(p_note_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select distinct item_id from public.note_items where note_id = p_note_id and not claimed loop
    perform public.claim_gift_item(p_note_id, r.item_id);
  end loop;
end; $$;
grant execute on function public.claim_gift_note(uuid) to authenticated;


-- =============================================================
--  7. 읽음 처리 (일반 쪽지 / 물풍선 쪽지)
-- =============================================================

-- 받은 쪽지 읽음 처리(익명 포함). 익명 쪽지는 notes_select 정책상 수신자가
-- 직접 볼 수 없어 클라이언트의 update .eq(id) 가 0행이 되므로, 수신자 본인 것만
-- 갱신하는 SECURITY DEFINER 함수로 처리한다.
create or replace function public.mark_note_read(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.notes set is_read = true
  where id = p_id and recipient_id = auth.uid();
$$;
grant execute on function public.mark_note_read(uuid) to authenticated;

-- 물풍선(타이머) 쪽지 읽음 처리 원자화.
-- 증상이었던 버그: 물풍선을 열 때 opened_at 기록(open_water_note)과 읽음 처리
-- (mark_note_read)가 같은 notes 행에 '별도 요청'으로 동시에 발생 → 배포/타이밍
-- 상황에 따라 읽음이 확정되지 않아 열어도 안 읽음 점이 사라지지 않는 문제가 있었다.
-- 해법: 여는 동작 자체가 읽음 처리까지 '원자적으로' 수행하도록 open_water_note 를
-- opened_at 최초 1회 기록 + is_read=true 통합 단일 호출로 만든다(별도 mark_note_read
-- 호출 불필요, 최종/현재 버전).
drop function if exists public.open_water_note(uuid);
create or replace function public.open_water_note(p_note_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.notes
     set opened_at = coalesce(opened_at, now()),
         is_read   = true
   where id = p_note_id
     and recipient_id = auth.uid()
     and timer_seconds is not null;
$$;
grant execute on function public.open_water_note(uuid) to authenticated;

-- 백필: 이미 열어본(opened_at 존재) 물풍선 쪽지인데 안 읽음으로 남아있는 것들을 읽음 처리.
-- (이미 라이브 DB에는 적용되어 있음 — 신규 환경 fresh 세팅 시에는 대상 행이 없어 no-op)
update public.notes
   set is_read = true
 where timer_seconds is not null
   and opened_at is not null
   and is_read = false;


-- =============================================================
--  8. PostgREST 스키마 캐시 리로드
-- =============================================================
notify pgrst, 'reload schema';
