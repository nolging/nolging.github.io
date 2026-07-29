-- 확성기 알림을 관리자 "알림 관리"에서 편집 가능하게 (제목/이모지/이모지 배경색).
--  · 본문(내용)은 사용자가 입력하므로 템플릿 본문은 사용하지 않는다(placeholder).
--  · 제목은 템플릿에서 렌더( {group} = 그룹명 ) → 관리자가 제목을 바꾸면 즉시 반영.
--  · 이모지/배경색은 프런트 알림센터가 type='megaphone' 로 notif_templates 에서 읽어 표시.
-- 적용: notif-templates.sql / notif-emoji.sql / notif-ledboard-nametag.sql(emoji_bg) 이후 실행.

insert into public.notif_templates (key, label, title, body, vars, emoji, sort_order) values
  ('megaphone', '확성기', '[{group}] 확성기가 켜졌어요', '(내용은 사용자가 입력)',
   '{group} = 그룹명 · 본문은 사용자가 입력', '📣', 101)
on conflict (key) do update set label = excluded.label, vars = excluded.vars, sort_order = excluded.sort_order;
-- 기본 이모지 배경색(빨강 계열) — 이미 값이 있으면 유지
update public.notif_templates set emoji_bg = coalesce(emoji_bg, '#fdeceb') where key = 'megaphone';

-- 확성기 발송: 제목은 템플릿에서 렌더(관리자 편집 반영), 본문은 사용자 입력 그대로.
create or replace function public.megaphone_send(p_group uuid, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_item public.user_items;
        v_gname text; v_body text := btrim(coalesce(p_body, '')); v_title text; v_cnt int := 0;
begin
  if not public.is_group_member(p_group, v_uid) then raise exception '그룹 멤버가 아니에요.'; end if;
  if v_body = '' then raise exception '보낼 메시지를 입력해 주세요.'; end if;
  if char_length(v_body) > 500 then raise exception '메시지는 500자까지예요.'; end if;

  select name into v_gname from public.groups where id = p_group;
  -- 제목: 관리자 편집 템플릿에서 렌더( {group} 치환 ), 없으면 기본 문구
  select r.title into v_title from public.notif_render('megaphone', jsonb_build_object('group', coalesce(v_gname, '그룹'))) r;
  v_title := coalesce(nullif(btrim(v_title), ''), '[' || coalesce(v_gname, '그룹') || '] 확성기가 켜졌어요');

  select * into v_item from public.user_items
    where user_id = v_uid and item_id = 'megaphone' and status = 'active'
    order by created_at asc limit 1 for update;
  if v_item.id is null then raise exception '사용할 수 있는 확성기가 없어요.'; end if;

  update public.user_items set status = 'used', used_at = now(), group_id = p_group where id = v_item.id;

  insert into public.notifications(user_id, actor_id, type, title, body, group_id)
  select m.user_id, v_uid, 'megaphone', v_title, v_body, p_group
  from public.group_members m
  where m.group_id = p_group and m.user_id <> v_uid;
  get diagnostics v_cnt = row_count;

  return jsonb_build_object('sent', v_cnt, 'title', v_title);
end $$;
grant execute on function public.megaphone_send(uuid, text) to authenticated;
