-- 물음표 공방: 포스팅 지칭을 "물음표"에서 "질문"으로 변경(사용자 노출 문구) +
-- 질문 목록 카드 미리보기(2a 시안)에 필요한 데이터(답변자 아바타 요약/선택지별 정확한 득표수) 추가.
-- Supabase SQL Editor 에서 실행. 최종본은 schema-qworkshop.sql / schema-notifications.sql 에도 반영돼 있음.

-- 1) 목록 카드 미리보기용 필드 추가(answerers/option_counts) — 반환 타입이 바뀌어 drop 후 재생성.
drop function if exists public.qworkshop_posts(uuid);
create or replace function public.qworkshop_posts(p_group uuid)
returns table(id uuid, type text, question text, body text, options jsonb,
              created_at timestamptz, updated_at timestamptz, edited boolean,
              author_id uuid, nickname text, avatar_url text,
              is_mine boolean, can_delete boolean, has_answered boolean,
              answer_count bigint, comment_count bigint,
              answerers jsonb, option_counts jsonb)
language sql stable security definer set search_path = public as $$
  select po.id, po.type, po.question, po.body, po.options,
         po.created_at, po.updated_at, (po.updated_at > po.created_at) as edited,
         po.author_id, coalesce(nullif(gm.display_nickname, ''), '멤버') as nickname, gm.avatar_url,
         (po.author_id = auth.uid()) as is_mine,
         (po.author_id = auth.uid() or public.qworkshop_can_manage(po.group_id, auth.uid())) as can_delete,
         exists(select 1 from public.qworkshop_answers a where a.post_id = po.id and a.author_id = auth.uid()) as has_answered,
         (select count(*) from public.qworkshop_answers a2 where a2.post_id = po.id) as answer_count,
         (select count(*) from public.qworkshop_comments c where c.post_id = po.id) as comment_count,
         (select coalesce(jsonb_agg(jsonb_build_object(
             'avatar_url', am.avatar_url,
             'nickname', coalesce(nullif(am.display_nickname, ''), '멤버'),
             'answer_text', a3.answer_text, 'option_idx', a3.option_idx
           ) order by a3.created_at desc), '[]'::jsonb)
          from (select * from public.qworkshop_answers a3b where a3b.post_id = po.id
                order by a3b.created_at desc limit 4) a3
          left join public.group_members am on am.group_id = po.group_id and am.user_id = a3.author_id
         ) as answerers,
         (case when po.type = 'qna' then null::jsonb else
           (select jsonb_agg(coalesce(cc.c, 0) order by g.ord)
            from generate_series(0, jsonb_array_length(po.options) - 1) as g(ord)
            left join (select option_idx, count(*) c from public.qworkshop_answers where post_id = po.id group by option_idx) cc
              on cc.option_idx = g.ord)
         end) as option_counts
  from public.qworkshop_posts po
  left join public.group_members gm on gm.group_id = po.group_id and gm.user_id = po.author_id
  where po.group_id = p_group and public.qworkshop_access(p_group, auth.uid())
  order by po.created_at desc;
$$;
grant execute on function public.qworkshop_posts(uuid) to authenticated;

-- 2) 사용자 노출 문구: "물음표" → "질문" (에러 메시지 + 알림 제목). "물음표 공방"(기능/장소 이름)은
--    그대로 둔다 — 바뀌는 건 "포스팅 한 건"을 가리키는 말뿐이다.
create or replace function public.qworkshop_create_post(p_group uuid, p_type text, p_question text, p_body text, p_options jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_q text; v_opts jsonb; v_n int; v_actor text; v_t text; v_b text;
begin
  if not public.qworkshop_access(p_group, auth.uid()) then raise exception '질문을 쓸 수 없어요.'; end if;
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

create or replace function public.qworkshop_add_comment(p_post uuid, p_parent uuid, p_body text, p_mentioned_ids uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_group uuid; v_post_author uuid; v_id uuid; v_body text;
  v_parent uuid; v_pparent uuid; v_target_author uuid; v_actor text;
begin
  select group_id, author_id into v_group, v_post_author from public.qworkshop_posts where id = p_post;
  if v_group is null then raise exception '질문을 찾을 수 없어요.'; end if;
  if not public.qworkshop_access(v_group, auth.uid()) then raise exception '댓글을 쓸 수 없어요.'; end if;
  v_body := btrim(coalesce(p_body, ''));
  if v_body = '' then raise exception '내용을 입력해 주세요.'; end if;
  if char_length(v_body) > 2000 then raise exception '댓글이 너무 길어요.'; end if;

  -- 답글은 1단계만: 부모가 또 답글이면 그 부모(최상위)에 붙인다.
  if p_parent is not null then
    select parent_id, author_id into v_pparent, v_target_author
      from public.qworkshop_comments where id = p_parent and post_id = p_post;
    if v_target_author is null then raise exception '원 댓글을 찾을 수 없어요.'; end if;
    v_parent := p_parent;
    if v_pparent is not null then v_parent := v_pparent; end if;
  end if;

  insert into public.qworkshop_comments(post_id, group_id, author_id, parent_id, body, mentioned_ids)
    values (p_post, v_group, auth.uid(), v_parent, v_body, p_mentioned_ids)
    returning id into v_id;

  v_actor := coalesce(public.notif_member_name(v_group, auth.uid()), '');

  if p_parent is null then
    if v_post_author is not null and v_post_author <> auth.uid() then
      insert into public.notifications(user_id, actor_id, type, title, body, group_id, qworkshop_post_id, qworkshop_comment_id)
        values (v_post_author, auth.uid(), 'qworkshop_comment', '내 질문에 댓글이 달렸어요', v_actor || ': ' || v_body, v_group, p_post, v_id);
    end if;
  else
    if v_target_author is not null and v_target_author <> auth.uid() then
      insert into public.notifications(user_id, actor_id, type, title, body, group_id, qworkshop_post_id, qworkshop_comment_id)
        values (v_target_author, auth.uid(), 'qworkshop_reply', '내 댓글에 답글이 달렸어요', v_actor || ': ' || v_body, v_group, p_post, v_id);
    end if;
  end if;

  if p_mentioned_ids is not null then
    insert into public.notifications(user_id, actor_id, type, title, body, group_id, qworkshop_post_id, qworkshop_comment_id)
    select distinct u, auth.uid(), 'mention', v_actor || ' 님이 회원님을 언급했어요', v_actor || ': ' || v_body, v_group, p_post, v_id
    from unnest(p_mentioned_ids) as u
    where u <> auth.uid()
      and public.is_group_member(v_group, u)
      and u is distinct from v_post_author
      and u is distinct from v_target_author;
  end if;

  return v_id;
end $$;
grant execute on function public.qworkshop_add_comment(uuid, uuid, text, uuid[]) to authenticated;

-- 3) 이미 배포돼 있는 notif_templates 행은 title/body 를 덮어쓰지 않는(label/vars/sort_order 만 갱신하는)
--    on-conflict 규칙 때문에 시드 재실행만으로는 문구가 안 바뀐다 — 명시적으로 업데이트한다.
update public.notif_templates set title = '새 질문이 도착했어요', label = '물음표 공방 새 질문'
  where key = 'qworkshop_post';
update public.notif_templates set title = '내 질문에 댓글이 달렸어요', label = '물음표 공방 내 질문 댓글'
  where key = 'qworkshop_comment';
