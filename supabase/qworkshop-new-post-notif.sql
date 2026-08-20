-- =============================================================
--  물음표 공방에 새 물음표가 올라오면 그룹의 다른 멤버들에게 알림을 보낸다.
--  기존 댓글/답글/멘션 알림(qworkshop_comment/qworkshop_reply/mention)과 같은 패턴이고,
--  notif-strict-templates-2.sql 이후 확립된 규칙대로 템플릿이 없거나 비활성이면
--  발송 자체를 건너뛴다(하드코딩 폴백 없음).
--  적용: Supabase SQL Editor 에 그대로 실행.
--  (qworkshop-content.sql, notif-strict-templates-2.sql 이후)
-- =============================================================

insert into public.notif_templates (key, label, title, body, vars, emoji, sort_order) values
  ('qworkshop_post', '물음표 공방 새 물음표', '새 물음표가 도착했어요', '{actor}: {question}', '{actor} = 작성자, {question} = 질문 내용', '❓', 114)
on conflict (key) do update set label = excluded.label, vars = excluded.vars, sort_order = excluded.sort_order;

create or replace function public.qworkshop_create_post(p_group uuid, p_type text, p_question text, p_body text, p_options jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_q text; v_opts jsonb; v_n int; v_actor text; v_t text; v_b text;
begin
  if not public.qworkshop_access(p_group, auth.uid()) then raise exception '물음표를 쓸 수 없어요.'; end if;
  if p_type not in ('vs', 'poll', 'qna') then raise exception '유형이 올바르지 않아요.'; end if;
  v_q := btrim(coalesce(p_question, ''));
  if v_q = '' then raise exception '질문을 입력해 주세요.'; end if;
  if char_length(v_q) > 100 then raise exception '질문은 100자 이내로 입력해 주세요.'; end if;
  if char_length(coalesce(p_body, '')) > 2000 then raise exception '내용이 너무 길어요.'; end if;

  if p_type = 'qna' then
    v_opts := '[]'::jsonb;
  else
    if p_options is null or jsonb_typeof(p_options) <> 'array' then raise exception '선택지를 입력해 주세요.'; end if;
    select jsonb_agg(btrim(x)) filter (where btrim(x) <> '') into v_opts
      from jsonb_array_elements_text(p_options) x;
    v_opts := coalesce(v_opts, '[]'::jsonb);
    v_n := jsonb_array_length(v_opts);
    if p_type = 'vs' and v_n <> 2 then raise exception 'VS는 선택지 2개가 필요해요.'; end if;
    if p_type = 'poll' and (v_n < 2 or v_n > 10) then raise exception '고르기는 선택지 2~10개가 필요해요.'; end if;
  end if;

  insert into public.qworkshop_posts(group_id, author_id, type, question, body, options)
    values (p_group, auth.uid(), p_type, v_q, coalesce(p_body, ''), v_opts)
    returning id into v_id;

  v_actor := coalesce(public.notif_member_name(p_group, auth.uid()), '');
  select r.title, r.body into v_t, v_b from public.notif_render('qworkshop_post', jsonb_build_object('actor', v_actor, 'question', v_q)) r;
  if v_t is not null then
    insert into public.notifications(user_id, actor_id, type, title, body, group_id, qworkshop_post_id)
    select gm.user_id, auth.uid(), 'qworkshop_post', v_t, v_b, p_group, v_id
    from public.group_members gm
    where gm.group_id = p_group and gm.user_id <> auth.uid() and gm.left_at is null;
  end if;

  return v_id;
end $$;
grant execute on function public.qworkshop_create_post(uuid, text, text, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
