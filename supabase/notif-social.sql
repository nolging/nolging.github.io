-- =============================================================
--  푸시 알림 템플릿 연결: 참여 확정(accept) · 콕 찌르기(poke) · 우심뽀까 부르기(touch_call)
--   · 각 알림 문구/이모지를 notif_templates 로 관리(없으면 기존 문구 폴백).
--   · poke 는 본문이 없으므로 admin_set_notif 의 본문 필수 검증을 완화.
--  적용: notif-templates.sql / notif-emoji.sql 실행 후 이 파일을 Supabase SQL Editor 에 실행.
-- =============================================================

insert into public.notif_templates (key, label, title, body, vars, emoji, sort_order) values
  ('accept',     '놀기 신청(참여 확정)', '{actor} 님의 놀기 신청!',              '{title}', '{actor} = 신청자, {title} = 항목 제목', '🙌', 80),
  ('poke',       '콕 찌르기',            '{actor} 님이 콕 찔렀어요!',            '',        '{actor} = 콕 찌른 사람', '👉', 81),
  ('touch_call', '우심뽀까 부르기',       '{actor} 님이 입술 내밀고 기다리고 있어요!', 'ㅡ 3ㅡ', '{actor} = 부른 사람', '💋', 82)
on conflict (key) do update set label = excluded.label, vars = excluded.vars, sort_order = excluded.sort_order;

-- 본문 필수 검증 완화(poke 처럼 본문 없는 알림 허용). 제목만 필수.
create or replace function public.admin_set_notif(p_key text, p_title text, p_body text, p_emoji text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception '권한이 없습니다.'; end if;
  if p_title is null or btrim(p_title) = '' then raise exception '제목을 입력해 주세요.'; end if;
  update public.notif_templates
     set title = p_title,
         body  = coalesce(p_body, ''),
         emoji = case when p_emoji is null then emoji else nullif(btrim(p_emoji), '') end,
         updated_at = now()
   where key = p_key;
  if not found then raise exception '알림 템플릿을 찾을 수 없어요.'; end if;
end $$;
grant execute on function public.admin_set_notif(text, text, text, text) to authenticated;

-- ── 놀기 신청(accept) ──────────────────────────────────────
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
  insert into public.notifications(user_id, actor_id, type, title, body, group_id, task_id)
  select tp.user_id, auth.uid(), 'accept',
         coalesce(v_nt_t, v_actor || ' 님의 놀기 신청!'),
         coalesce(v_nt_b, r.title), v_gid, p_task_id
  from public.task_participants tp
  where tp.task_id = p_task_id and tp.user_id <> auth.uid();

  return r;
end; $$;
grant execute on function public.schedule_task(uuid, timestamptz, boolean, text, date, int, uuid[]) to authenticated;

-- ── 콕 찌르기(poke) ────────────────────────────────────────
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
  insert into public.notifications(user_id, actor_id, type, title, body, group_id)
    values (p_target, auth.uid(), 'poke',
            coalesce(v_nt_t, v_actor || ' 님이 콕 찔렀어요!'),
            nullif(v_nt_b, ''), p_group_id);
end;
$$;
grant execute on function public.poke_member(uuid, uuid) to authenticated;

-- ── 우심뽀까 부르기(touch_call) ────────────────────────────
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
  insert into public.notifications(user_id, actor_id, type, title, body, group_id)
    values (p_target, auth.uid(), 'touch_call',
            coalesce(v_nt_t, v_actor || ' 님이 입술 내밀고 기다리고 있어요!'),
            coalesce(v_nt_b, 'ㅡ 3ㅡ'), p_group_id);
end;
$$;
grant execute on function public.summon_to_touch(uuid, uuid) to authenticated;
