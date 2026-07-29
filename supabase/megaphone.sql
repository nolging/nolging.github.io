-- 확성기(megaphone): 그룹 멤버 전원(본인 제외)에게 직접 작성한 메시지로 알림을 보내는 일회용 아이템.
--  · 제목 고정: "[{그룹명}] 확성기가 켜졌어요", 본문 = 사용자 입력.
--  · notifications insert → 기존 Database Webhook(send-push) 가 자동으로 푸시 발송.
--  · type='megaphone' 은 send-push 의 group_id 폴백으로 그룹 홈(/groups/{id})으로 이동.

create or replace function public.megaphone_send(p_group uuid, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_item public.user_items;
        v_gname text; v_body text := btrim(coalesce(p_body, '')); v_title text; v_cnt int := 0;
begin
  if not public.is_group_member(p_group, v_uid) then raise exception '그룹 멤버가 아니에요.'; end if;
  if v_body = '' then raise exception '보낼 메시지를 입력해 주세요.'; end if;
  if char_length(v_body) > 500 then raise exception '메시지는 500자까지예요.'; end if;

  select name into v_gname from public.groups where id = p_group;
  v_title := '[' || coalesce(v_gname, '그룹') || '] 확성기가 켜졌어요';

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
