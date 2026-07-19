-- =============================================================
--  탈퇴 시 콘텐츠 보존(소프트 탈퇴)
--   · 탈퇴해도 group_members 행은 남기고 left_at 만 기록 → 그 멤버가 쓴 위시/리뷰/댓글/쪽지는
--     삭제되지 않고, 닉네임·프로필도 계속 표시됨.
--   · is_group_member 는 탈퇴자(left_at 있음)를 제외 → 목록/권한/새 글 작성에서 빠짐.
--   · 재가입하면 left_at 해제 → 본인이 쓴 글/댓글 수정·삭제 권한 그대로.
--   · group_member_cards 는 탈퇴자도 반환하되 is_left=true(상세에서 "탈퇴한 멤버"), 개인정보는 가림.
--   · list_received_notes 에 sender_active 추가 → 보낸 사람이 탈퇴했으면 답장 불가 처리.
--  적용: Supabase SQL Editor 에 그대로 실행.
-- =============================================================

alter table public.group_members add column if not exists left_at timestamptz;

-- 활성 멤버만 멤버로 인정
create or replace function public.is_group_member(gid uuid, uid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.group_members where group_id = gid and user_id = uid and left_at is null
  );
$$;

-- 소프트 탈퇴/내보내기: 행 유지 + left_at 기록. 남의 강제 퇴장은 소유자만.
create or replace function public.leave_group(p_group_id uuid, p_user_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_target uuid := coalesce(p_user_id, auth.uid()); v_owner uuid;
begin
  if v_target <> auth.uid() then
    select owner_id into v_owner from public.groups where id = p_group_id;
    if v_owner is distinct from auth.uid() then raise exception '내보낼 권한이 없어요.'; end if;
  end if;
  update public.group_members set left_at = now()
    where group_id = p_group_id and user_id = v_target and left_at is null;
end $$;
grant execute on function public.leave_group(uuid, uuid) to authenticated;

-- 재가입: 남아 있던 행 재활성화(left_at 해제)
create or replace function public.join_group(p_code text)
returns public.groups language plpgsql security definer set search_path = public as $$
declare g public.groups;
begin
  select * into g from public.groups where upper(invite_code) = upper(trim(p_code));
  if g.id is null then raise exception '유효하지 않은 초대 코드입니다.'; end if;
  if not public.is_group_member(g.id, auth.uid()) and public.is_couple_group(g.id) then
    raise exception '커플 그룹에는 입장할 수 없어요.';
  end if;
  insert into public.group_members(group_id, user_id, role)
    values (g.id, auth.uid(), 'member')
    on conflict (group_id, user_id) do update set left_at = null;
  perform public.grant_friend_ring_on_join(g.id);
  return g;
end;
$$;
grant execute on function public.join_group(text) to authenticated;

create or replace function public.join_group_with_profile(
  p_code text, p_display_nickname text, p_avatar_url text,
  p_show_contact boolean, p_show_birthdate boolean, p_show_ott boolean
) returns public.groups language plpgsql security definer set search_path = public as $$
declare g public.groups;
begin
  select * into g from public.groups where upper(invite_code) = upper(trim(p_code));
  if g.id is null then raise exception '유효하지 않은 초대 코드입니다.'; end if;
  if not public.is_group_member(g.id, auth.uid()) and public.is_couple_group(g.id) then
    raise exception '커플 그룹에는 입장할 수 없어요.';
  end if;
  insert into public.group_members(group_id, user_id, role, display_nickname, avatar_url, show_contact, show_birthdate, show_ott)
    values (g.id, auth.uid(), 'member',
            nullif(trim(coalesce(p_display_nickname, '')), ''), nullif(p_avatar_url, ''),
            coalesce(p_show_contact, false), coalesce(p_show_birthdate, false), coalesce(p_show_ott, false))
  on conflict (group_id, user_id) do update
    set display_nickname = excluded.display_nickname,
        avatar_url       = excluded.avatar_url,
        show_contact     = excluded.show_contact,
        show_birthdate   = excluded.show_birthdate,
        show_ott         = excluded.show_ott,
        left_at          = null;
  perform public.grant_friend_ring_on_join(g.id);
  return g;
end;
$$;
grant execute on function public.join_group_with_profile(text, text, text, boolean, boolean, boolean) to authenticated;

-- 멤버 카드: 탈퇴자도 반환(is_left=true), 개인정보는 가림. 목록은 프런트에서 is_left 로 필터.
drop function if exists public.group_member_cards(uuid);
create or replace function public.group_member_cards(p_group_id uuid)
returns table (
  user_id uuid, login_id text, display_nickname text, avatar_url text, role text, is_self boolean,
  contact text, birthdate date, subscribed_ott text[], joined_at timestamptz, is_left boolean
) language plpgsql security definer stable set search_path = public as $$
declare g public.groups;
begin
  if not (public.is_group_member(p_group_id, auth.uid()) or public.is_admin(auth.uid())) then
    raise exception '그룹 멤버만 조회할 수 있습니다.';
  end if;
  select * into g from public.groups where id = p_group_id;
  return query
    select
      gm.user_id,
      case when gm.user_id = auth.uid() then p.nickname else null end,
      coalesce(nullif(gm.display_nickname, ''), '멤버'),
      gm.avatar_url,
      gm.role,
      (gm.user_id = auth.uid()),
      case when gm.left_at is null and g.show_contact   and gm.show_contact   then p.contact       else null end,
      case when gm.left_at is null and g.show_birthdate and gm.show_birthdate then p.birthdate     else null end,
      case when gm.left_at is null and g.show_ott       and gm.show_ott       then p.subscribed_ott else null end,
      gm.joined_at,
      (gm.left_at is not null)
    from public.group_members gm
    join public.profiles p on p.id = gm.user_id
    where gm.group_id = p_group_id
    order by (gm.left_at is not null), gm.joined_at asc;
end;
$$;
grant execute on function public.group_member_cards(uuid) to authenticated;

-- 받은 쪽지: sender_active(보낸 사람이 아직 그룹 멤버인지) 추가 → 답장 가능 여부 판단.
do $$
declare r record;
begin
  for r in select oid::regprocedure::text as sig from pg_proc
    where proname = 'list_received_notes' and pronamespace = 'public'::regnamespace
  loop execute 'drop function ' || r.sig; end loop;
end $$;
create function public.list_received_notes(p_limit integer default 15, p_offset integer default 0)
returns table(
  id uuid, group_id uuid, sender_id uuid, recipient_id uuid,
  sender_name text, recipient_name text, sender_avatar text, recipient_avatar text,
  body text, kind text, is_read boolean, created_at timestamptz,
  item_id text, item_name text, claimed boolean, rejected boolean, media_url text, anonymous boolean, qty integer,
  timer_seconds integer, opened_at timestamptz, sender_active boolean
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
    public.is_group_member(n.group_id, n.sender_id)
  from public.notes n
  where n.recipient_id = auth.uid()
  order by n.created_at desc
  limit greatest(1, least(coalesce(p_limit, 15), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;
grant execute on function public.list_received_notes(integer, integer) to authenticated;

-- ── 멤버 수 계산/알림 대상에서 탈퇴자 제외(활성 멤버만) ──────────────

-- 커플 링: 멤버 2명 판정에서 탈퇴자 제외
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
  insert into public.notifications(user_id, actor_id, type, title, body, group_id, note_id)
    values (p_recipient_id, auth.uid(), 'couple_ring',
            coalesce(v_nt_t, case when v_sender <> '' then v_sender || ' 님이 커플 링을 보냈어요' else '커플 링이 도착했어요' end),
            coalesce(v_nt_b, '쪽지함에서 확인하세요'), p_group_id, v_note_id);
end;
$$;
grant execute on function public.use_couple_ring(uuid, uuid, text) to authenticated;

-- 우정 링: 멤버 수 판정/발송 대상에서 탈퇴자 제외
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
    insert into public.notifications(user_id, actor_id, type, title, body, group_id, note_id)
      values (m.user_id, auth.uid(), 'friend_ring',
              coalesce(v_nt_t, case when v_sender <> '' then v_sender || ' 님이 우정 링을 보냈어요' else '우정 링이 도착했어요' end),
              coalesce(v_nt_b, '쪽지함에서 확인하세요 🤝'), p_group_id, v_note_id);
  end loop;
end;
$$;
grant execute on function public.use_friend_ring(uuid, text) to authenticated;

-- 새 항목/새 멤버 알림: 탈퇴자에게는 발송 안 함
create or replace function public.tg_notify_task_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_group public.groups; v_noun text; v_t text; v_b text;
begin
  if coalesce(current_setting('nolging.silent_task', true), '') = 'on' then return NEW; end if;
  select * into v_group from public.groups where id = NEW.group_id;
  v_noun := public.notif_noun(v_group.group_type);
  select r.title, r.body into v_t, v_b from public.notif_render('new_task', jsonb_build_object('noun', v_noun, 'title', NEW.title)) r;
  insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id)
  select gm.user_id, NEW.created_by, 'new_task',
         coalesce(v_t, '새 ' || v_noun || '가 있어요'),
         coalesce(v_b, NEW.title),
         NEW.group_id, NEW.id
  from public.group_members gm
  where gm.group_id = NEW.group_id and gm.user_id <> NEW.created_by and gm.left_at is null;
  return NEW;
end $$;
drop trigger if exists trg_notify_task_insert on public.tasks;
create trigger trg_notify_task_insert after insert on public.tasks
  for each row execute function public.tg_notify_task_insert();

create or replace function public.tg_notify_member_join()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text; v_t text; v_b text;
begin
  v_name := coalesce(nullif(trim(NEW.display_nickname), ''), '새 멤버');
  select r.title, r.body into v_t, v_b from public.notif_render('new_member', jsonb_build_object('name', v_name)) r;
  insert into public.notifications(user_id, actor_id, type, title, body, group_id)
  select gm.user_id, NEW.user_id, 'new_member',
         coalesce(v_t, '새 멤버가 가입했어요'),
         coalesce(v_b, v_name || ' 님 입장!'),
         NEW.group_id
  from public.group_members gm
  where gm.group_id = NEW.group_id and gm.user_id <> NEW.user_id and gm.left_at is null;
  return NEW;
end $$;
drop trigger if exists trg_notify_member_join on public.group_members;
create trigger trg_notify_member_join after insert on public.group_members
  for each row execute function public.tg_notify_member_join();

notify pgrst, 'reload schema';
