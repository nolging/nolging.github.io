-- =============================================================
--  알림 발송 전체를 notif_templates 에 전적으로 의존하도록 강화(2단계).
--  1단계(notif-strict-templates.sql)에서 notif_render() 가 템플릿 없음/비활성 시
--  null 을 반환하도록 고쳤는데, 정작 대부분의 발송 함수는 여전히
--  coalesce(v_t, '하드코딩 문구') 로 폴백하고 있어 active=false 로 꺼도 실제로는
--  계속 나가고 있었다. 이 파일은 그 폴백을 전부 제거하고, notif_render 가 null 을
--  반환하면(템플릿 없음/비활성) 해당 알림을 아예 보내지 않도록 모든 발송 지점을
--  다시 정의한다. 아이템 소모/쪽지 발송 등 알림과 무관한 나머지 로직은 그대로 둔다.
--
--  적용: Supabase SQL Editor 에 그대로 실행.
--  (notif-strict-templates.sql, member-soft-leave.sql, board-notifs.sql, notif-couple.sql,
--   notif-social.sql, notif-gift.sql, notif-media.sql, notif-ledboard-nametag.sql,
--   megaphone-notif.sql, polaroid-film.sql, purin-mic-mirror-selfheal.sql,
--   error-reports-reward.sql, error-reports-push.sql, notif-comment-status.sql 이후)
-- =============================================================

-- ── 댓글/답글/멘션 ──────────────────────────────────────────
create or replace function public.tg_notify_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_group public.groups; v_task public.tasks; v_actor text; v_parent uuid;
  v_noun text; v_t text; v_b text;
begin
  select * into v_task  from public.tasks  where id = NEW.task_id;
  select * into v_group from public.groups where id = NEW.group_id;
  v_actor := public.notif_member_name(NEW.group_id, NEW.author_id);
  v_noun := case v_task.status when 'accepted' then '약속' when 'done' then '추억' else '위시' end;

  if NEW.parent_id is not null then
    select author_id into v_parent from public.task_comments where id = NEW.parent_id;
    if v_parent is not null and v_parent <> NEW.author_id then
      select r.title, r.body into v_t, v_b from public.notif_render('reply', jsonb_build_object('actor', v_actor, 'text', NEW.body)) r;
      if v_t is not null then
        insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id, comment_id)
        values (v_parent, NEW.author_id, 'reply', v_t, v_b, NEW.group_id, NEW.task_id, NEW.id);
      end if;
    end if;
    if v_task.created_by is not null and v_task.created_by <> NEW.author_id and v_task.created_by is distinct from v_parent then
      select r.title, r.body into v_t, v_b from public.notif_render('task_comment', jsonb_build_object('noun', v_noun, 'actor', v_actor, 'text', NEW.body)) r;
      if v_t is not null then
        insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id, comment_id)
        values (v_task.created_by, NEW.author_id, 'task_comment', v_t, v_b, NEW.group_id, NEW.task_id, NEW.id);
      end if;
    end if;
  else
    if v_task.created_by is not null and v_task.created_by <> NEW.author_id then
      select r.title, r.body into v_t, v_b from public.notif_render('task_comment', jsonb_build_object('noun', v_noun, 'actor', v_actor, 'text', NEW.body)) r;
      if v_t is not null then
        insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id, comment_id)
        values (v_task.created_by, NEW.author_id, 'task_comment', v_t, v_b, NEW.group_id, NEW.task_id, NEW.id);
      end if;
    end if;
  end if;

  if NEW.mentioned_ids is not null then
    select r.title, r.body into v_t, v_b from public.notif_render('mention', jsonb_build_object('actor', v_actor, 'text', NEW.body)) r;
    if v_t is not null then
      insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id, comment_id)
      select distinct u, NEW.author_id, 'mention', v_t, v_b, NEW.group_id, NEW.task_id, NEW.id
      from unnest(NEW.mentioned_ids) as u
      where u <> NEW.author_id and public.is_group_member(NEW.group_id, u)
        and u is distinct from v_task.created_by and u is distinct from v_parent;
    end if;
  end if;
  return NEW;
end $$;
drop trigger if exists trg_notify_comment on public.task_comments;
create trigger trg_notify_comment after insert on public.task_comments
  for each row execute function public.tg_notify_comment();

-- ── 새 항목(위시/약속/추억) ──────────────────────────────────
create or replace function public.tg_notify_task_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_group public.groups; v_noun text; v_t text; v_b text;
begin
  if coalesce(current_setting('nolging.silent_task', true), '') = 'on' then return NEW; end if;
  select * into v_group from public.groups where id = NEW.group_id;
  v_noun := public.notif_noun(v_group.group_type);
  select r.title, r.body into v_t, v_b from public.notif_render('new_task', jsonb_build_object('noun', v_noun, 'title', NEW.title)) r;
  if v_t is not null then
    insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id)
    select gm.user_id, NEW.created_by, 'new_task', v_t, v_b, NEW.group_id, NEW.id
    from public.group_members gm
    where gm.group_id = NEW.group_id and gm.user_id <> NEW.created_by and gm.left_at is null;
  end if;
  return NEW;
end $$;
drop trigger if exists trg_notify_task_insert on public.tasks;
create trigger trg_notify_task_insert after insert on public.tasks
  for each row execute function public.tg_notify_task_insert();

-- ── 새 멤버 가입 ────────────────────────────────────────────
create or replace function public.tg_notify_member_join()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text; v_t text; v_b text;
begin
  v_name := coalesce(nullif(trim(NEW.display_nickname), ''), '새 멤버');
  select r.title, r.body into v_t, v_b from public.notif_render('new_member', jsonb_build_object('name', v_name)) r;
  if v_t is not null then
    insert into public.notifications(user_id, actor_id, type, title, body, group_id)
    select gm.user_id, NEW.user_id, 'new_member', v_t, v_b, NEW.group_id
    from public.group_members gm
    where gm.group_id = NEW.group_id and gm.user_id <> NEW.user_id and gm.left_at is null;
  end if;
  return NEW;
end $$;
drop trigger if exists trg_notify_member_join on public.group_members;
create trigger trg_notify_member_join after insert on public.group_members
  for each row execute function public.tg_notify_member_join();

-- ── 놀기 신청(accept) / 콕 찌르기(poke) / 우심뽀까 부르기(touch_call) ──
create or replace function public.schedule_task(
  p_task_id uuid, p_scheduled_at timestamptz, p_time_set boolean,
  p_repeat text, p_repeat_until date, p_remind int, p_participants uuid[]
) returns public.tasks language plpgsql security definer set search_path = public as $$
declare r public.tasks; v_gid uuid; v_remind_at timestamptz; v_actor text; v_nt_t text; v_nt_b text;
begin
  select group_id into v_gid from public.tasks where id = p_task_id;
  if v_gid is null then raise exception '존재하지 않는 항목입니다.'; end if;
  if not public.is_group_member(v_gid, auth.uid()) then
    raise exception '그룹 멤버만 신청할 수 있습니다.'; end if;
  if p_remind is not null and p_scheduled_at is not null then
    v_remind_at := p_scheduled_at - make_interval(mins => p_remind);
  end if;
  update public.tasks
     set status='accepted', assignee_id=auth.uid(), accepted_at=now(),
         scheduled_at=p_scheduled_at, scheduled_time_set=coalesce(p_time_set, true),
         repeat_rule=p_repeat, repeat_until=p_repeat_until,
         remind_min=p_remind, remind_at=v_remind_at, reminded=false
   where id=p_task_id and status='open' returning * into r;
  if r.id is null then raise exception '이미 신청되었거나 열려 있지 않은 항목입니다.'; end if;
  delete from public.task_participants where task_id=p_task_id;
  insert into public.task_participants(task_id, user_id)
    select p_task_id, x from unnest(coalesce(p_participants, array[]::uuid[])) as x
    where public.is_group_member(v_gid, x) on conflict do nothing;

  v_actor := public.notif_member_name(v_gid, auth.uid());
  select nr.title, nr.body into v_nt_t, v_nt_b from public.notif_render('accept', jsonb_build_object('actor', v_actor, 'title', r.title)) nr;
  if v_nt_t is not null then
    insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id)
    select tp.user_id, auth.uid(), 'accept', v_nt_t, v_nt_b, v_gid, p_task_id
    from public.task_participants tp
    where tp.task_id = p_task_id and tp.user_id <> auth.uid();
  end if;

  return r;
end; $$;
grant execute on function public.schedule_task(uuid, timestamptz, boolean, text, date, int, uuid[]) to authenticated;

create or replace function public.poke_member(p_group_id uuid, p_target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_name text; v_actor text; v_nt_t text; v_nt_b text;
begin
  if not (public.is_couple_group(p_group_id) or public.is_friend_group(p_group_id)) then
    raise exception '콕 찌르기는 프리미엄 그룹에서만 가능해요.'; end if;
  if not public.is_group_member(p_group_id, auth.uid()) then
    raise exception '그룹 멤버만 사용할 수 있어요.'; end if;
  if p_target = auth.uid() then
    raise exception '자기 자신은 찌를 수 없어요.'; end if;
  if not public.is_group_member(p_group_id, p_target) then
    raise exception '대상이 그룹 멤버가 아니에요.'; end if;
  v_name := public.notif_member_name(p_group_id, auth.uid());
  v_actor := coalesce(nullif(v_name, ''), '누군가');
  select nr.title, nr.body into v_nt_t, v_nt_b from public.notif_render('poke', jsonb_build_object('actor', v_actor)) nr;
  if v_nt_t is not null then
    insert into public.notifications(user_id, actor_id, type, title, body, group_id)
      values (p_target, auth.uid(), 'poke', v_nt_t, v_nt_b, p_group_id);
  end if;
end;
$$;
grant execute on function public.poke_member(uuid, uuid) to authenticated;

create or replace function public.summon_to_touch(p_group_id uuid, p_target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_name text; v_actor text; v_nt_t text; v_nt_b text;
begin
  if not (public.is_couple_group(p_group_id) or public.is_friend_group(p_group_id)) then
    raise exception '프리미엄 그룹에서만 사용할 수 있어요.'; end if;
  if not public.is_group_member(p_group_id, auth.uid()) then
    raise exception '그룹 멤버만 사용할 수 있어요.'; end if;
  if p_target = auth.uid() then
    raise exception '자기 자신은 부를 수 없어요.'; end if;
  if not public.is_group_member(p_group_id, p_target) then
    raise exception '대상이 그룹 멤버가 아니에요.'; end if;
  v_name := public.notif_member_name(p_group_id, auth.uid());
  v_actor := coalesce(nullif(v_name, ''), '누군가');
  select nr.title, nr.body into v_nt_t, v_nt_b from public.notif_render('touch_call', jsonb_build_object('actor', v_actor)) nr;
  if v_nt_t is not null then
    insert into public.notifications(user_id, actor_id, type, title, body, group_id)
      values (p_target, auth.uid(), 'touch_call', v_nt_t, v_nt_b, p_group_id);
  end if;
end;
$$;
grant execute on function public.summon_to_touch(uuid, uuid) to authenticated;

-- ── 소원권 사용 ─────────────────────────────────────────────
create or replace function public.use_wish(p_from_user_id uuid, p_wish text)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.user_items; v_sender text; v_recipient text; v_sav text; v_rav text; v_nt_t text; v_nt_b text;
begin
  if p_wish is null or btrim(p_wish) = '' then raise exception '소원을 입력해 주세요.'; end if;
  if char_length(p_wish) > 300 then raise exception '소원이 너무 길어요.'; end if;

  select * into v_item from public.user_items
   where user_id = auth.uid() and item_id = 'wish' and status = 'active' and from_user_id = p_from_user_id
   order by created_at asc limit 1;
  if v_item.id is null then raise exception '사용할 수 있는 소원권이 없습니다.'; end if;

  update public.user_items set status = 'used', used_at = now() where id = v_item.id;

  v_sender    := coalesce(public.notif_member_name(v_item.group_id, auth.uid()), '');
  v_recipient := coalesce(public.notif_member_name(v_item.group_id, p_from_user_id), '');
  select avatar_url into v_sav from public.group_members where group_id = v_item.group_id and user_id = auth.uid();
  select avatar_url into v_rav from public.group_members where group_id = v_item.group_id and user_id = p_from_user_id;

  insert into public.notes(group_id, sender_id, recipient_id, sender_name, recipient_name, sender_avatar, recipient_avatar, body, kind)
    values (v_item.group_id, auth.uid(), p_from_user_id, v_sender, v_recipient, v_sav, v_rav, btrim(p_wish), 'wish');

  select nr.title, nr.body into v_nt_t, v_nt_b from public.notif_render('wish', jsonb_build_object('actor', v_sender, 'wish', btrim(p_wish))) nr;
  if v_nt_t is not null then
    insert into public.notifications(user_id, actor_id, type, title, body, group_id)
      values (p_from_user_id, auth.uid(), 'wish', v_nt_t, v_nt_b, v_item.group_id);
  end if;
end;
$$;
grant execute on function public.use_wish(uuid, text) to authenticated;

-- ── 커플 링(보내기/수락/거절) ────────────────────────────────
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
  if v_nt_t is not null then
    insert into public.notifications(user_id, actor_id, type, title, body, group_id, note_id)
      values (p_recipient_id, auth.uid(), 'couple_ring', v_nt_t, v_nt_b, p_group_id, v_note_id);
  end if;
end;
$$;
grant execute on function public.use_couple_ring(uuid, uuid, text) to authenticated;

create or replace function public.claim_couple_ring(p_note_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare n public.notes; v_actor text; v_leftover public.user_items; v_price integer; v_nt_t text; v_nt_b text;
begin
  select * into n from public.notes where id = p_note_id;
  if n.id is null or n.recipient_id <> auth.uid() or n.kind <> 'couple_ring' then
    raise exception '수령할 수 없는 선물입니다.'; end if;
  if n.claimed then raise exception '이미 수령했어요.'; end if;
  if n.rejected then raise exception '이미 거절한 선물입니다.'; end if;

  update public.notes set claimed = true, is_read = true where id = n.id;

  update public.user_items set status = 'used', used_at = now()
   where user_id = n.sender_id and item_id = 'couple-ring' and status = 'pending' and group_id = n.group_id;

  if not exists (select 1 from public.user_items
                 where user_id = auth.uid() and item_id = 'couple-ring' and status = 'used' and group_id = n.group_id) then
    insert into public.user_items(user_id, item_id, item_name, source, from_user_id, from_name, from_avatar, group_id, status, used_at)
      values (auth.uid(), 'couple-ring', '커플 링', 'gift', n.sender_id, n.sender_name, n.sender_avatar, n.group_id, 'used', now());
  end if;

  for v_leftover in
    select * from public.user_items
     where user_id = auth.uid() and item_id = 'couple-ring' and status = 'active'
  loop
    select price into v_price from public.store_items where id = 'couple-ring';
    insert into public.coin_ledger(user_id, delta, reason, ref_type)
      values (auth.uid(), coalesce(v_price, 5000), '커플 링 환불', 'refund');
    delete from public.user_items where id = v_leftover.id;
  end loop;

  v_actor := coalesce(public.notif_member_name(n.group_id, auth.uid()), '');
  select nr.title, nr.body into v_nt_t, v_nt_b from public.notif_render('couple_ring_accept', jsonb_build_object('actor', v_actor)) nr;
  if v_nt_t is not null then
    insert into public.notifications(user_id, actor_id, type, title, body, group_id, note_id)
      values (n.sender_id, auth.uid(), 'couple_ring', v_nt_t, v_nt_b, n.group_id, n.id);
  end if;
end;
$$;
grant execute on function public.claim_couple_ring(uuid) to authenticated;

create or replace function public.reject_couple_ring(p_note_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare n public.notes; v_actor text; v_nt_t text; v_nt_b text;
begin
  select * into n from public.notes where id = p_note_id;
  if n.id is null or n.recipient_id <> auth.uid() or n.kind <> 'couple_ring' then
    raise exception '처리할 수 없는 선물입니다.'; end if;
  if n.claimed then raise exception '이미 수령한 선물이라 거절할 수 없어요.'; end if;
  if n.rejected then raise exception '이미 거절했어요.'; end if;

  update public.notes set rejected = true, is_read = true where id = n.id;

  update public.user_items set status = 'active', group_id = null, used_at = null
   where user_id = n.sender_id and item_id = 'couple-ring' and status = 'pending' and group_id = n.group_id;

  v_actor := coalesce(public.notif_member_name(n.group_id, auth.uid()), '');
  select nr.title, nr.body into v_nt_t, v_nt_b from public.notif_render('couple_ring_reject', jsonb_build_object('actor', v_actor)) nr;
  if v_nt_t is not null then
    insert into public.notifications(user_id, actor_id, type, title, body, group_id, note_id)
      values (n.sender_id, auth.uid(), 'couple_ring', v_nt_t, v_nt_b, n.group_id, n.id);
  end if;
end;
$$;
grant execute on function public.reject_couple_ring(uuid) to authenticated;

-- ── 우정 링 보내기 ──────────────────────────────────────────
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
    if v_nt_t is not null then
      insert into public.notifications(user_id, actor_id, type, title, body, group_id, note_id)
        values (m.user_id, auth.uid(), 'friend_ring', v_nt_t, v_nt_b, p_group_id, v_note_id);
    end if;
  end loop;
end;
$$;
grant execute on function public.use_friend_ring(uuid, text) to authenticated;

-- ── 약속 리마인더 ───────────────────────────────────────────
create or replace function public.dispatch_due_reminders()
returns integer language plpgsql security definer set search_path = public as $$
declare t record; v_when text; v_nt_t text; v_nt_b text; n int := 0;
begin
  for t in
    select * from public.tasks
    where remind_at is not null and reminded = false
      and remind_at <= now() and status = 'accepted'
  loop
    v_when := to_char(t.scheduled_at at time zone 'Asia/Seoul', 'MM월 DD일 HH24:MI');
    select nr.title, nr.body into v_nt_t, v_nt_b from public.notif_render('reminder', jsonb_build_object('title', t.title, 'when', v_when)) nr;

    if v_nt_t is not null then
      insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id)
      select p.user_id, null::uuid, 'reminder', v_nt_t, v_nt_b, t.group_id, t.id
      from public.task_participants p where p.task_id = t.id;

      if not found and t.assignee_id is not null then
        insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id)
        values (t.assignee_id, null::uuid, 'reminder', v_nt_t, v_nt_b, t.group_id, t.id);
      end if;
    end if;

    update public.tasks set reminded = true where id = t.id;
    n := n + 1;
  end loop;
  return n;
end; $$;

-- ── 칭찬 스티커(도착/완성) ──────────────────────────────────
create or replace function public.praise_place(p_group_id uuid, p_owner_id uuid, p_slot int, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_board public.praise_boards; v_count int; v_pactor text; v_nt_t text; v_nt_b text; v_reason text;
begin
  if not public.is_couple_group(p_group_id) then raise exception '커플 그룹이 아니에요.'; end if;
  if not public.is_group_member(p_group_id, v_uid) then raise exception '그룹 멤버가 아니에요.'; end if;
  if not public.is_group_member(p_group_id, p_owner_id) then raise exception '대상이 그룹 멤버가 아니에요.'; end if;
  if p_owner_id = v_uid then raise exception '내 칭찬판엔 붙일 수 없어요.'; end if;
  if p_slot < 0 or p_slot > 19 then raise exception '잘못된 칸이에요.'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception '칭찬 내용을 입력해 주세요.'; end if;

  select * into v_board from public.praise_boards
    where owner_id = p_owner_id and claimed_at is null
    order by started_at desc limit 1 for update;
  if v_board.id is null then raise exception '상대가 아직 스티커판을 준비하지 않았어요.'; end if;
  if v_board.completed_at is not null then raise exception '이미 완성된 스티커판이에요.'; end if;

  v_reason := left(btrim(p_reason), 100);
  insert into public.praise_stickers(board_id, group_id, owner_id, slot_index, reason, from_id)
    values (v_board.id, p_group_id, p_owner_id, p_slot, v_reason, v_uid);

  v_pactor := coalesce(public.notif_member_name(p_group_id, v_uid), '');
  select count(*) into v_count from public.praise_stickers where board_id = v_board.id;
  if v_count >= 20 then
    update public.praise_boards
      set completed_at = now(), group_id = p_group_id, gifter_id = v_uid
      where id = v_board.id;
    select nr.title, nr.body into v_nt_t, v_nt_b from public.notif_render('praise', jsonb_build_object('actor', v_pactor)) nr;
    if v_nt_t is not null then
      insert into public.notifications(user_id, actor_id, type, title, body, group_id)
        values (p_owner_id, v_uid, 'praise', v_nt_t, v_nt_b, p_group_id);
    end if;
  else
    select nr.title, nr.body into v_nt_t, v_nt_b from public.notif_render('praise_new', jsonb_build_object('actor', v_pactor, 'reason', v_reason)) nr;
    if v_nt_t is not null then
      insert into public.notifications(user_id, actor_id, type, title, body, group_id)
        values (p_owner_id, v_uid, 'praise_new', v_nt_t, coalesce(nullif(v_nt_b, ''), v_reason), p_group_id);
    end if;
  end if;
end $$;
grant execute on function public.praise_place(uuid, uuid, int, text) to authenticated;

-- ── 아이템 선물(상점/인벤토리/묶음) ──────────────────────────
create or replace function public.gift_item(p_item_id text, p_group_id uuid, p_recipient_id uuid, p_qty integer default 1, p_message text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare it public.store_items; v_balance integer; v_sender text; v_recipient text; v_sender_av text; v_recipient_av text; v_note_id uuid; v_qty integer; v_total integer; i integer; v_body text; v_items text; v_nt_t text; v_nt_b text;
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

  v_items := it.name || case when v_qty > 1 then ' ' || v_qty || '개' else '' end;
  select r.title, r.body into v_nt_t, v_nt_b from public.notif_render('gift', jsonb_build_object('actor', v_sender, 'items', v_items)) r;
  if v_nt_t is not null then
    insert into public.notifications(user_id, actor_id, type, title, body, group_id, note_id)
      values (p_recipient_id, auth.uid(), 'gift', v_nt_t, v_nt_b, p_group_id, v_note_id);
  end if;

  return v_balance - v_total;
end;
$$;
grant execute on function public.gift_item(text, uuid, uuid, integer, text) to authenticated;

create or replace function public.gift_owned_item(p_item_id text, p_group_id uuid, p_recipient_id uuid, p_qty integer default 1, p_message text default null, p_anonymous boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare it public.store_items; v_sender text; v_recipient text; v_sav text; v_rav text; v_note_id uuid; v_qty integer; i integer; v_body text; v_anon boolean; v_ids uuid[]; v_name text; v_items text; v_nt_t text; v_nt_b text;
begin
  v_anon := coalesce(p_anonymous, false);
  v_qty := greatest(1, coalesce(p_qty, 1));
  select * into it from public.store_items where id = p_item_id;
  v_name := coalesce(it.name, p_item_id);

  if not public.is_group_member(p_group_id, auth.uid()) then raise exception '그룹 멤버만 선물할 수 있습니다.'; end if;
  if p_recipient_id = auth.uid() then raise exception '자기 자신에게는 선물할 수 없습니다.'; end if;
  if not public.is_group_member(p_group_id, p_recipient_id) then raise exception '받는 사람이 그룹 멤버가 아닙니다.'; end if;

  if p_item_id = 'wish' then raise exception '선물받은 소원권은 다시 선물할 수 없어요.'; end if;

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

  v_items := v_name || case when v_qty > 1 then ' ' || v_qty || '개' else '' end;
  select r.title, r.body into v_nt_t, v_nt_b from public.notif_render(case when v_anon then 'gift_anon' else 'gift' end, jsonb_build_object('actor', v_sender, 'items', v_items)) r;
  if v_nt_t is not null then
    insert into public.notifications(user_id, actor_id, type, title, body, group_id, note_id)
      values (p_recipient_id, case when v_anon then null else auth.uid() end, 'gift', v_nt_t, v_nt_b, p_group_id, v_note_id);
  end if;
end;
$$;
grant execute on function public.gift_owned_item(text, uuid, uuid, integer, text, boolean) to authenticated;

create or replace function public.send_gift_note(
  p_group_id uuid, p_recipient_id uuid, p_message text, p_anonymous boolean, p_gifts jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_sender text; v_recipient text; v_sav text; v_rav text; v_note_id uuid;
        v_anon boolean; g jsonb; v_item_id text; v_qty integer; it public.store_items;
        v_name text; v_ids uuid[]; v_count integer := 0; v_first_name text; v_total integer := 0; i integer;
        v_items text; v_nt_t text; v_nt_b text;
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

  v_items := case when v_count > 1 then v_first_name || ' 외 ' || (v_count-1) || '종'
                  else v_first_name || case when v_total>1 then ' ' || v_total || '개' else '' end end;
  select r.title, r.body into v_nt_t, v_nt_b from public.notif_render(case when v_anon then 'gift_anon' else 'gift' end, jsonb_build_object('actor', v_sender, 'items', v_items)) r;
  if v_nt_t is not null then
    insert into public.notifications(user_id, actor_id, type, title, body, group_id, note_id)
      values (p_recipient_id, case when v_anon then null else auth.uid() end, 'gift', v_nt_t, v_nt_b, p_group_id, v_note_id);
  end if;
  return v_note_id;
end; $$;
grant execute on function public.send_gift_note(uuid, uuid, text, boolean, jsonb) to authenticated;

-- ── 아이템 사용(음악/영상/블루레이/선물 상자) ────────────────
create or replace function public.use_cassette(p_group_id uuid, p_recipient_id uuid, p_message text, p_url text, p_anonymous boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.user_items; v_sender text; v_recipient text; v_sav text; v_rav text; v_body text; v_anon boolean; v_nt_t text; v_nt_b text;
begin
  v_anon := coalesce(p_anonymous, false);
  if p_url is null or btrim(p_url) = '' then raise exception '음악 링크를 입력해 주세요.'; end if;
  select * into v_item from public.user_items where user_id = auth.uid() and item_id = 'cassette' and status = 'active' order by created_at asc limit 1;
  if v_item.id is null then raise exception '사용할 수 있는 카세트 테이프가 없습니다.'; end if;
  if not public.is_group_member(p_group_id, auth.uid()) then raise exception '그룹 멤버만 사용할 수 있습니다.'; end if;
  if p_recipient_id = auth.uid() then raise exception '자기 자신에게는 보낼 수 없습니다.'; end if;
  if not public.is_group_member(p_group_id, p_recipient_id) then raise exception '받는 사람이 그룹 멤버가 아닙니다.'; end if;

  update public.user_items set status = 'used', used_at = now() where id = v_item.id;
  if v_anon then perform public.consume_one_eraser(); end if;

  v_sender    := coalesce(public.notif_member_name(p_group_id, auth.uid()), '');
  v_recipient := coalesce(public.notif_member_name(p_group_id, p_recipient_id), '');
  select avatar_url into v_sav from public.group_members where group_id = p_group_id and user_id = auth.uid();
  select avatar_url into v_rav from public.group_members where group_id = p_group_id and user_id = p_recipient_id;
  v_body := coalesce(nullif(btrim(p_message), ''), '음악을 보냈어요 🎵');

  insert into public.notes(group_id, sender_id, recipient_id, sender_name, recipient_name, sender_avatar, recipient_avatar, body, kind, item_id, media_url, anonymous)
    values (p_group_id, auth.uid(), p_recipient_id, v_sender, v_recipient, v_sav, v_rav, v_body, 'cassette', 'cassette', btrim(p_url), v_anon);

  select r.title, r.body into v_nt_t, v_nt_b from public.notif_render(case when v_anon then 'cassette_anon' else 'cassette' end, jsonb_build_object('actor', v_sender)) r;
  if v_nt_t is not null then
    insert into public.notifications(user_id, actor_id, type, title, body, group_id)
      values (p_recipient_id, case when v_anon then null else auth.uid() end, 'cassette', v_nt_t, v_nt_b, p_group_id);
  end if;
end;
$$;
grant execute on function public.use_cassette(uuid, uuid, text, text, boolean) to authenticated;

create or replace function public.use_video(p_group_id uuid, p_recipient_id uuid, p_message text, p_url text, p_anonymous boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.user_items; v_sender text; v_recipient text; v_sav text; v_rav text; v_body text; v_anon boolean; v_nt_t text; v_nt_b text;
begin
  v_anon := coalesce(p_anonymous, false);
  if p_url is null or btrim(p_url) = '' then raise exception '영상 링크를 입력해 주세요.'; end if;
  select * into v_item from public.user_items where user_id = auth.uid() and item_id = 'video' and status = 'active' order by created_at asc limit 1;
  if v_item.id is null then raise exception '사용할 수 있는 비디오 테이프가 없습니다.'; end if;
  if not public.is_group_member(p_group_id, auth.uid()) then raise exception '그룹 멤버만 사용할 수 있습니다.'; end if;
  if p_recipient_id = auth.uid() then raise exception '자기 자신에게는 보낼 수 없습니다.'; end if;
  if not public.is_group_member(p_group_id, p_recipient_id) then raise exception '받는 사람이 그룹 멤버가 아닙니다.'; end if;

  update public.user_items set status = 'used', used_at = now() where id = v_item.id;
  if v_anon then perform public.consume_one_eraser(); end if;

  v_sender    := coalesce(public.notif_member_name(p_group_id, auth.uid()), '');
  v_recipient := coalesce(public.notif_member_name(p_group_id, p_recipient_id), '');
  select avatar_url into v_sav from public.group_members where group_id = p_group_id and user_id = auth.uid();
  select avatar_url into v_rav from public.group_members where group_id = p_group_id and user_id = p_recipient_id;
  v_body := coalesce(nullif(btrim(p_message), ''), '영상을 보냈어요 📹');

  insert into public.notes(group_id, sender_id, recipient_id, sender_name, recipient_name, sender_avatar, recipient_avatar, body, kind, item_id, media_url, anonymous)
    values (p_group_id, auth.uid(), p_recipient_id, v_sender, v_recipient, v_sav, v_rav, v_body, 'video', 'video', btrim(p_url), v_anon);

  select r.title, r.body into v_nt_t, v_nt_b from public.notif_render(case when v_anon then 'video_anon' else 'video' end, jsonb_build_object('actor', v_sender)) r;
  if v_nt_t is not null then
    insert into public.notifications(user_id, actor_id, type, title, body, group_id)
      values (p_recipient_id, case when v_anon then null else auth.uid() end, 'video', v_nt_t, v_nt_b, p_group_id);
  end if;
end;
$$;
grant execute on function public.use_video(uuid, uuid, text, text, boolean) to authenticated;

create or replace function public.use_bluray(p_group_id uuid, p_recipient_id uuid, p_message text, p_url text, p_anonymous boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.user_items; v_sender text; v_recipient text; v_sav text; v_rav text; v_body text; v_anon boolean; v_nt_t text; v_nt_b text;
begin
  v_anon := coalesce(p_anonymous, false);
  if p_url is null or btrim(p_url) = '' then raise exception '영상 링크를 입력해 주세요.'; end if;
  select * into v_item from public.user_items where user_id = auth.uid() and item_id = 'bluray' and status = 'active' order by created_at asc limit 1;
  if v_item.id is null then raise exception '사용할 수 있는 블루레이가 없습니다.'; end if;
  if not public.is_group_member(p_group_id, auth.uid()) then raise exception '그룹 멤버만 사용할 수 있습니다.'; end if;
  if p_recipient_id = auth.uid() then raise exception '자기 자신에게는 보낼 수 없습니다.'; end if;
  if not public.is_group_member(p_group_id, p_recipient_id) then raise exception '받는 사람이 그룹 멤버가 아닙니다.'; end if;

  update public.user_items set status = 'used', used_at = now() where id = v_item.id;
  if v_anon then perform public.consume_one_eraser(); end if;

  v_sender    := coalesce(public.notif_member_name(p_group_id, auth.uid()), '');
  v_recipient := coalesce(public.notif_member_name(p_group_id, p_recipient_id), '');
  select avatar_url into v_sav from public.group_members where group_id = p_group_id and user_id = auth.uid();
  select avatar_url into v_rav from public.group_members where group_id = p_group_id and user_id = p_recipient_id;
  v_body := coalesce(nullif(btrim(p_message), ''), '영상을 보냈어요 💿');

  insert into public.notes(group_id, sender_id, recipient_id, sender_name, recipient_name, sender_avatar, recipient_avatar, body, kind, item_id, media_url, anonymous)
    values (p_group_id, auth.uid(), p_recipient_id, v_sender, v_recipient, v_sav, v_rav, v_body, 'bluray', 'bluray', btrim(p_url), v_anon);

  select r.title, r.body into v_nt_t, v_nt_b from public.notif_render(case when v_anon then 'bluray_anon' else 'bluray' end, jsonb_build_object('actor', v_sender)) r;
  if v_nt_t is not null then
    insert into public.notifications(user_id, actor_id, type, title, body, group_id)
      values (p_recipient_id, case when v_anon then null else auth.uid() end, 'bluray', v_nt_t, v_nt_b, p_group_id);
  end if;
end;
$$;
grant execute on function public.use_bluray(uuid, uuid, text, text, boolean) to authenticated;

create or replace function public.use_link(p_group_id uuid, p_recipient_id uuid, p_message text, p_url text, p_label text default null, p_anonymous boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.user_items; v_sender text; v_recipient text; v_sav text; v_rav text; v_body text; v_label text; v_anon boolean; v_nt_t text; v_nt_b text;
begin
  v_anon := coalesce(p_anonymous, false);
  if p_url is null or btrim(p_url) = '' then raise exception '링크를 입력해 주세요.'; end if;
  select * into v_item from public.user_items where user_id = auth.uid() and item_id = 'link' and status = 'active' order by created_at asc limit 1;
  if v_item.id is null then raise exception '사용할 수 있는 선물 상자가 없습니다.'; end if;
  if not public.is_group_member(p_group_id, auth.uid()) then raise exception '그룹 멤버만 사용할 수 있습니다.'; end if;
  if p_recipient_id = auth.uid() then raise exception '자기 자신에게는 보낼 수 없습니다.'; end if;
  if not public.is_group_member(p_group_id, p_recipient_id) then raise exception '받는 사람이 그룹 멤버가 아닙니다.'; end if;

  update public.user_items set status = 'used', used_at = now() where id = v_item.id;
  if v_anon then perform public.consume_one_eraser(); end if;

  v_sender    := coalesce(public.notif_member_name(p_group_id, auth.uid()), '');
  v_recipient := coalesce(public.notif_member_name(p_group_id, p_recipient_id), '');
  select avatar_url into v_sav from public.group_members where group_id = p_group_id and user_id = auth.uid();
  select avatar_url into v_rav from public.group_members where group_id = p_group_id and user_id = p_recipient_id;
  v_body  := coalesce(nullif(btrim(p_message), ''), '선물 상자를 보냈어요 🎁');
  v_label := coalesce(nullif(btrim(p_label), ''), '선물 상자 열기');

  insert into public.notes(group_id, sender_id, recipient_id, sender_name, recipient_name, sender_avatar, recipient_avatar, body, kind, item_id, item_name, media_url, anonymous)
    values (p_group_id, auth.uid(), p_recipient_id, v_sender, v_recipient, v_sav, v_rav, v_body, 'link', 'link', v_label, btrim(p_url), v_anon);

  select r.title, r.body into v_nt_t, v_nt_b from public.notif_render(case when v_anon then 'link_anon' else 'link' end, jsonb_build_object('actor', v_sender)) r;
  if v_nt_t is not null then
    insert into public.notifications(user_id, actor_id, type, title, body, group_id)
      values (p_recipient_id, case when v_anon then null else auth.uid() end, 'link', v_nt_t, v_nt_b, p_group_id);
  end if;
end;
$$;
grant execute on function public.use_link(uuid, uuid, text, text, text, boolean) to authenticated;

-- ── 폴라로이드 사진 ─────────────────────────────────────────
create or replace function public.use_polaroid_film(
  p_group_id uuid, p_recipient_id uuid, p_message text, p_urls jsonb, p_anonymous boolean default false
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_sender text; v_recipient text; v_sav text; v_rav text; v_body text; v_anon boolean;
  v_qty integer; v_ids uuid[]; v_note_id uuid; v_url text; i integer; v_nt_t text; v_nt_b text;
begin
  v_anon := coalesce(p_anonymous, false);
  if p_urls is null or jsonb_typeof(p_urls) <> 'array' or jsonb_array_length(p_urls) = 0 then
    raise exception '첨부할 사진이 없어요.'; end if;
  v_qty := jsonb_array_length(p_urls);
  if v_qty > 5 then raise exception '사진은 쪽지 하나에 최대 5장까지 첨부할 수 있어요.'; end if;
  if not public.is_group_member(p_group_id, auth.uid()) then raise exception '그룹 멤버만 사용할 수 있습니다.'; end if;
  if p_recipient_id = auth.uid() then raise exception '자기 자신에게는 보낼 수 없습니다.'; end if;
  if not public.is_group_member(p_group_id, p_recipient_id) then raise exception '받는 사람이 그룹 멤버가 아닙니다.'; end if;

  select array_agg(id) into v_ids from (
    select id from public.user_items where user_id = auth.uid() and item_id = 'polaroid-film' and status = 'active'
    order by created_at asc limit v_qty) t;
  if v_ids is null or array_length(v_ids, 1) < v_qty then raise exception '폴라로이드 필름이 부족해요.'; end if;
  update public.user_items set status = 'used', used_at = now() where id = any(v_ids);
  if v_anon then perform public.consume_one_eraser(); end if;

  v_sender    := coalesce(public.notif_member_name(p_group_id, auth.uid()), '');
  v_recipient := coalesce(public.notif_member_name(p_group_id, p_recipient_id), '');
  select avatar_url into v_sav from public.group_members where group_id = p_group_id and user_id = auth.uid();
  select avatar_url into v_rav from public.group_members where group_id = p_group_id and user_id = p_recipient_id;
  v_body := coalesce(nullif(btrim(p_message), ''), '사진을 보냈어요 📷');

  insert into public.notes(group_id, sender_id, recipient_id, sender_name, recipient_name, sender_avatar, recipient_avatar, body, kind, item_id, item_name, qty, anonymous)
    values (p_group_id, auth.uid(), p_recipient_id, v_sender, v_recipient, v_sav, v_rav, v_body, 'polaroid', 'polaroid-film', '폴라로이드 필름', v_qty, v_anon)
    returning id into v_note_id;

  i := 0;
  for v_url in select jsonb_array_elements_text(p_urls) loop
    insert into public.note_photos(note_id, url, sort_order) values (v_note_id, v_url, i);
    i := i + 1;
  end loop;

  select r.title, r.body into v_nt_t, v_nt_b from public.notif_render(case when v_anon then 'polaroid_anon' else 'polaroid' end, jsonb_build_object('actor', v_sender)) r;
  if v_nt_t is not null then
    insert into public.notifications(user_id, actor_id, type, title, body, group_id)
      values (p_recipient_id, case when v_anon then null else auth.uid() end, 'polaroid', v_nt_t, v_nt_b, p_group_id);
  end if;
  return v_note_id;
end;
$$;
grant execute on function public.use_polaroid_film(uuid, uuid, text, jsonb, boolean) to authenticated;

-- ── 전광판 게재 / 명찰 사용 ───────────────────────────────────
create or replace function public.use_ledboard(p_text text, p_color text)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.user_items; v_group uuid; v_color text;
        v_partner uuid; v_actor text; v_t text; v_b text;
begin
  if p_text is null or btrim(p_text) = '' then raise exception '문구를 입력해 주세요.'; end if;
  if char_length(btrim(p_text)) > 60 then raise exception '문구는 60자까지 입력할 수 있어요.'; end if;
  v_color := public.led_color_ok(p_color);

  select group_id into v_group from public.user_items
   where user_id = auth.uid() and item_id = 'couple-ring' and status = 'used' and group_id is not null
   order by used_at desc nulls last limit 1;
  if v_group is null then raise exception '커플 링을 장착한 커플만 사용할 수 있어요.'; end if;

  if exists (select 1 from public.led_banners where group_id = v_group and active and expires_at > now()) then
    raise exception '이미 게재 중인 전광판이 있어요.'; end if;

  select * into v_item from public.user_items
   where user_id = auth.uid() and item_id = 'ledboard' and status = 'active'
   order by created_at asc limit 1;
  if v_item.id is null then raise exception '사용할 수 있는 전광판이 없습니다.'; end if;
  update public.user_items set status = 'used', used_at = now() where id = v_item.id;

  insert into public.led_banners(group_id, owner_id, text, color, active, started_at, expires_at)
    values (v_group, auth.uid(), btrim(p_text), v_color, true, now(), now() + interval '24 hours');

  select user_id into v_partner from public.group_members
   where group_id = v_group and user_id <> auth.uid() and left_at is null limit 1;
  if v_partner is not null then
    select coalesce(nullif(gm.display_nickname, ''), '연인') into v_actor
      from public.group_members gm where gm.group_id = v_group and gm.user_id = auth.uid();
    select r.title, r.body into v_t, v_b
      from public.notif_render('ledboard', jsonb_build_object('actor', v_actor, 'text', btrim(p_text))) r;
    if v_t is not null then
      insert into public.notifications(user_id, actor_id, type, title, body, group_id)
      values (v_partner, auth.uid(), 'ledboard', v_t, v_b, v_group);
    end if;
  end if;
end;
$$;
grant execute on function public.use_ledboard(text, text) to authenticated;

create or replace function public.use_name_tag(p_group_id uuid, p_nickname text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_partner uuid; v_gm public.group_members; v_item public.user_items;
        v_active boolean; v_actor text; v_t text; v_b text;
begin
  if not public.is_couple_group(p_group_id) then raise exception '커플 그룹에서만 사용할 수 있어요.'; end if;
  if not public.is_group_member(p_group_id, v_uid) then raise exception '그룹 멤버가 아니에요.'; end if;
  if p_nickname is null or btrim(p_nickname) = '' then raise exception '변경할 이름을 입력해 주세요.'; end if;
  if char_length(btrim(p_nickname)) > 12 then raise exception '이름은 12자까지 정할 수 있어요.'; end if;

  select user_id into v_partner from public.group_members where group_id = p_group_id and user_id <> v_uid limit 1;
  if v_partner is null then raise exception '짝꿍을 찾을 수 없어요.'; end if;

  select * into v_gm from public.group_members where group_id = p_group_id and user_id = v_partner for update;
  v_active := v_gm.nick_locked_until is not null and v_gm.nick_locked_until > now() and v_gm.nick_locked_by = v_uid;

  if not v_active then
    select * into v_item from public.user_items
      where user_id = v_uid and item_id = 'name-tag' and status = 'active'
      order by created_at asc limit 1 for update;
    if v_item.id is null then raise exception '사용할 수 있는 명찰이 없어요.'; end if;
    update public.user_items set status = 'used', used_at = now() where id = v_item.id;
    update public.group_members set
      nick_original     = coalesce(nullif(nick_original, ''), display_nickname),
      display_nickname  = btrim(p_nickname),
      nick_locked_by    = v_uid,
      nick_locked_until = now() + interval '24 hours'
     where group_id = p_group_id and user_id = v_partner;

    select coalesce(nullif(gm.display_nickname, ''), '연인') into v_actor
      from public.group_members gm where gm.group_id = p_group_id and gm.user_id = v_uid;
    select r.title, r.body into v_t, v_b
      from public.notif_render('nametag', jsonb_build_object('actor', v_actor, 'nickname', btrim(p_nickname))) r;
    if v_t is not null then
      insert into public.notifications(user_id, actor_id, type, title, body, group_id)
      values (v_partner, v_uid, 'nametag', v_t, v_b, p_group_id);
    end if;
  else
    update public.group_members set display_nickname = btrim(p_nickname)
     where group_id = p_group_id and user_id = v_partner;
  end if;

  select * into v_gm from public.group_members where group_id = p_group_id and user_id = v_partner;
  return jsonb_build_object('target_id', v_partner, 'nickname', v_gm.display_nickname, 'until', v_gm.nick_locked_until);
end $$;
grant execute on function public.use_name_tag(uuid, text) to authenticated;

-- ── 확성기 ──────────────────────────────────────────────────
-- 본문은 사용자가 입력한 그대로 보내되(템플릿 본문 없음), 제목 템플릿이 없거나
-- 비활성이면 발송 자체를 건너뛴다(아이템 소모는 그대로 처리).
create or replace function public.megaphone_send(p_group uuid, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_item public.user_items;
        v_gname text; v_body text := btrim(coalesce(p_body, '')); v_title text; v_cnt int := 0;
begin
  if not public.is_group_member(p_group, v_uid) then raise exception '그룹 멤버가 아니에요.'; end if;
  if v_body = '' then raise exception '보낼 메시지를 입력해 주세요.'; end if;
  if char_length(v_body) > 500 then raise exception '메시지는 500자까지예요.'; end if;

  select name into v_gname from public.groups where id = p_group;
  select r.title into v_title from public.notif_render('megaphone', jsonb_build_object('group', coalesce(v_gname, '그룹'))) r;

  select * into v_item from public.user_items
    where user_id = v_uid and item_id = 'megaphone' and status = 'active'
    order by created_at asc limit 1 for update;
  if v_item.id is null then raise exception '사용할 수 있는 확성기가 없어요.'; end if;

  update public.user_items set status = 'used', used_at = now(), group_id = p_group where id = v_item.id;

  if v_title is not null then
    insert into public.notifications(user_id, actor_id, type, title, body, group_id)
    select m.user_id, v_uid, 'megaphone', v_title, v_body, p_group
    from public.group_members m
    where m.group_id = p_group and m.user_id <> v_uid;
    get diagnostics v_cnt = row_count;
  end if;

  return jsonb_build_object('sent', v_cnt, 'title', v_title);
end $$;
grant execute on function public.megaphone_send(uuid, text) to authenticated;

-- ── 푸린 마이크 ─────────────────────────────────────────────
create or replace function public.use_purin_mic(p_group_id uuid, p_image_url text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_partner uuid; v_row public.profile_graffiti; v_item public.user_items;
        v_active boolean; v_actor text; v_t text; v_b text;
begin
  if not public.is_couple_group(p_group_id) then raise exception '커플 그룹에서만 사용할 수 있어요.'; end if;
  if not public.is_group_member(p_group_id, v_uid) then raise exception '그룹 멤버가 아니에요.'; end if;
  if p_image_url is null or btrim(p_image_url) = '' then raise exception '낙서 이미지가 없어요.'; end if;

  select user_id into v_partner from public.group_members where group_id = p_group_id and user_id <> v_uid limit 1;
  if v_partner is null then raise exception '짝꿍을 찾을 수 없어요.'; end if;

  select * into v_row from public.profile_graffiti where group_id = p_group_id and target_user_id = v_partner for update;
  v_active := v_row.group_id is not null and v_row.artist_id = v_uid and v_row.expires_at > now();

  if not v_active then
    select * into v_item from public.user_items
      where user_id = v_uid and item_id = 'purin-mic' and status = 'active'
      order by created_at asc limit 1 for update;
    if v_item.id is null then raise exception '사용할 수 있는 푸린 마이크가 없어요.'; end if;
    update public.user_items set status = 'used', used_at = now() where id = v_item.id;

    insert into public.profile_graffiti(group_id, target_user_id, artist_id, image_url, expires_at)
      values (p_group_id, v_partner, v_uid, p_image_url, now() + interval '24 hours')
    on conflict (group_id, target_user_id) do update
      set artist_id = excluded.artist_id, image_url = excluded.image_url,
          updated_at = now(), expires_at = excluded.expires_at;

    update public.group_members set graffiti_locked_until = now() + interval '24 hours'
      where group_id = p_group_id and user_id = v_partner;

    select coalesce(nullif(gm.display_nickname, ''), '연인') into v_actor
      from public.group_members gm where gm.group_id = p_group_id and gm.user_id = v_uid;
    select r.title, r.body into v_t, v_b
      from public.notif_render('purin_mic', jsonb_build_object('actor', v_actor)) r;
    if v_t is not null then
      insert into public.notifications(user_id, actor_id, type, title, body, group_id)
        values (v_partner, v_uid, 'purin_mic', v_t, v_b, p_group_id);
    end if;
  else
    update public.profile_graffiti set image_url = p_image_url, updated_at = now()
      where group_id = p_group_id and target_user_id = v_partner;
    update public.group_members set graffiti_locked_until = v_row.expires_at
      where group_id = p_group_id and user_id = v_partner
        and graffiti_locked_until is distinct from v_row.expires_at;
  end if;

  select * into v_row from public.profile_graffiti where group_id = p_group_id and target_user_id = v_partner;
  return jsonb_build_object('target_id', v_row.target_user_id, 'image_url', v_row.image_url, 'until', v_row.expires_at);
end $$;
grant execute on function public.use_purin_mic(uuid, text) to authenticated;

-- ── 비밀 게시판(새 글 / 댓글 / 답글) ─────────────────────────
create or replace function public.board_create_post(p_group uuid, p_prefix uuid, p_title text, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_title text; v_prefix uuid; v_t text; v_b text;
begin
  if not public.board_access(p_group, auth.uid()) then raise exception '이 게시판에 글을 쓸 수 없어요.'; end if;
  v_title := btrim(coalesce(p_title, ''));
  if v_title = '' then raise exception '제목을 입력해 주세요.'; end if;
  if char_length(v_title) > 100 then raise exception '제목은 100자 이내로 입력해 주세요.'; end if;
  if char_length(coalesce(p_body, '')) > 5000 then raise exception '본문이 너무 길어요.'; end if;
  if p_prefix is not null then
    select id into v_prefix from public.board_prefixes where id = p_prefix and group_id = p_group;
  end if;
  insert into public.board_posts(group_id, author_id, prefix_id, title, body)
    values (p_group, auth.uid(), v_prefix, v_title, coalesce(p_body, ''))
    returning id into v_id;

  select r.title, r.body into v_t, v_b from public.notif_render('board_post', jsonb_build_object('title', v_title)) r;
  if v_t is not null then
    insert into public.notifications(user_id, actor_id, type, title, body, group_id, post_id)
    select gm.user_id, null, 'board_post', v_t, coalesce(nullif(v_b, ''), v_title), p_group, v_id
    from public.group_members gm
    where gm.group_id = p_group and gm.user_id <> auth.uid();
  end if;

  return v_id;
end $$;
grant execute on function public.board_create_post(uuid, uuid, text, text) to authenticated;

create or replace function public.board_add_comment(p_post uuid, p_parent uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_group uuid; v_id uuid; v_body text; v_parent uuid; v_pparent uuid;
        v_post_author uuid; v_target_author uuid; v_t text; v_b text;
begin
  select group_id, author_id into v_group, v_post_author from public.board_posts where id = p_post;
  if v_group is null then raise exception '글을 찾을 수 없어요.'; end if;
  if not public.board_access(v_group, auth.uid()) then raise exception '댓글을 쓸 수 없어요.'; end if;
  v_body := btrim(coalesce(p_body, ''));
  if v_body = '' then raise exception '내용을 입력해 주세요.'; end if;
  if char_length(v_body) > 2000 then raise exception '댓글이 너무 길어요.'; end if;
  if p_parent is not null then
    select parent_id, author_id into v_pparent, v_target_author from public.board_comments where id = p_parent and post_id = p_post;
    if v_target_author is null then raise exception '원 댓글을 찾을 수 없어요.'; end if;
    v_parent := p_parent;
    if v_pparent is not null then v_parent := v_pparent; end if;
  end if;
  insert into public.board_comments(post_id, group_id, author_id, parent_id, body)
    values (p_post, v_group, auth.uid(), v_parent, v_body)
    returning id into v_id;

  if p_parent is null then
    if v_post_author is not null and v_post_author <> auth.uid() then
      select r.title, r.body into v_t, v_b from public.notif_render('board_comment', jsonb_build_object('text', v_body)) r;
      if v_t is not null then
        insert into public.notifications(user_id, actor_id, type, title, body, group_id, post_id, board_comment_id)
          values (v_post_author, null, 'board_comment', v_t, coalesce(nullif(v_b, ''), v_body), v_group, p_post, v_id);
      end if;
    end if;
  else
    if v_target_author is not null and v_target_author <> auth.uid() then
      select r.title, r.body into v_t, v_b from public.notif_render('board_reply', jsonb_build_object('text', v_body)) r;
      if v_t is not null then
        insert into public.notifications(user_id, actor_id, type, title, body, group_id, post_id, board_comment_id)
          values (v_target_author, null, 'board_reply', v_t, coalesce(nullif(v_b, ''), v_body), v_group, p_post, v_id);
      end if;
    end if;
  end if;
  return v_id;
end $$;
grant execute on function public.board_add_comment(uuid, uuid, text) to authenticated;

-- ── 오류 리포트(제출/관리자 답장/유저 답장) ──────────────────
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
  if v_t is not null then
    insert into public.notifications(user_id, actor_id, type, title, body, report_id)
      select p.id, auth.uid(), 'error_report', v_t, v_b, r.id
        from public.profiles p where p.role = 'admin';
  end if;
  return r;
end;
$$;
grant execute on function public.submit_error_report(text, text) to authenticated;

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

  update public.notes set body = btrim(p_body), is_read = false, created_at = now()
   where report_id = p_report_id and is_anchor = true;
  if not found then
    v_first := true;
    insert into public.notes(recipient_id, sender_name, recipient_name, body, kind, report_id, is_anchor, is_read)
      values (v_rep, 'SYSTEM', '', btrim(p_body), 'system', p_report_id, true, false);
  end if;

  update public.error_reports set user_hidden = false where id = p_report_id;

  if v_first then
    select rr.title, rr.body into v_t, v_b from public.notif_render('system_note', jsonb_build_object()) rr;
    if v_t is not null then
      insert into public.notifications(user_id, type, title, body, report_id)
        values (v_rep, 'system_note', v_t, v_b, p_report_id);
    end if;
  else
    select rr.title, rr.body into v_t, v_b
      from public.notif_render('error_chat_admin', jsonb_build_object('text', btrim(p_body))) rr;
    if v_t is not null then
      insert into public.notifications(user_id, type, title, body, report_id, silent)
        values (v_rep, 'system_note', v_t, v_b, p_report_id, true);
    end if;
  end if;
end;
$$;
grant execute on function public.admin_send_error_report(uuid, text, jsonb, integer) to authenticated;

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

  update public.notes set body = btrim(p_body), created_at = now(), is_read = true
   where report_id = p_report_id and is_anchor = true;

  select nickname into v_name from public.profiles where id = auth.uid();
  select rr.title, rr.body into v_t, v_b
    from public.notif_render('error_chat_user',
           jsonb_build_object('actor', coalesce(v_name, '회원'), 'text', btrim(p_body), 'title', coalesce(v_title, ''))) rr;
  if v_t is not null then
    insert into public.notifications(user_id, actor_id, type, title, body, report_id, silent)
      select p.id, auth.uid(), 'error_report', v_t, v_b, p_report_id, true
        from public.profiles p where p.role = 'admin';
  end if;
end;
$$;
grant execute on function public.reply_error_report(uuid, text) to authenticated;

notify pgrst, 'reload schema';
