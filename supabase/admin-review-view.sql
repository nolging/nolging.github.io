-- 관리자 리뷰 열람 허용: 미가입 그룹도 아이템 없이 리뷰 확인 가능
-- task_reviews_view RPC 에 관리자 바이패스 추가:
--   1) 그룹 멤버 검사에 is_admin 허용
--   2) 관리자는 v_reveal = true (코멘트 항상 공개, 망원경 불필요)
-- 적용: Supabase SQL Editor 에 그대로 실행.

create or replace function public.task_reviews_view(p_task_id uuid)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare v_gid uuid; v_part boolean; v_reviewed boolean; v_reveal boolean; v_revealed boolean; v_reviews jsonb;
  v_is_admin boolean;
begin
  select group_id into v_gid from public.tasks where id = p_task_id;
  if v_gid is null then raise exception '존재하지 않는 항목입니다.'; end if;

  v_is_admin := public.is_admin(auth.uid());

  if not (public.is_group_member(v_gid, auth.uid()) or v_is_admin) then
    raise exception '그룹 멤버만 조회할 수 있습니다.'; end if;

  v_part     := public.is_task_participant(p_task_id, auth.uid());
  v_reviewed := exists (select 1 from public.task_reviews r
                        where r.task_id = p_task_id and r.author_id = auth.uid());
  v_revealed := exists (select 1 from public.review_reveals rr
                        where rr.user_id = auth.uid() and rr.task_id = p_task_id);
  v_reveal   := (v_part and v_reviewed) or v_revealed or v_is_admin;

  select coalesce(jsonb_agg(obj order by ord), '[]'::jsonb) into v_reviews
  from (
    select jsonb_build_object(
      'id', r.id,
      'author_id', r.author_id,
      'nickname',  coalesce(nullif(gm.display_nickname, ''), '멤버'),
      'avatar_url', gm.avatar_url,
      'rating', r.rating,
      'comment', case when v_reveal or r.author_id = auth.uid() then r.comment else null end,
      'comment_len', char_length(r.comment) + char_length(regexp_replace(r.comment, '[^가-힣一-鿿ぁ-ゟァ-ヿ]', '', 'g')),
      'is_self', (r.author_id = auth.uid()),
      'created_at', r.created_at
    ) as obj, r.created_at as ord
    from public.task_reviews r
    join public.profiles p on p.id = r.author_id
    left join public.group_members gm on gm.group_id = v_gid and gm.user_id = r.author_id
    where r.task_id = p_task_id
  ) sub;

  return jsonb_build_object(
    'is_participant', v_part,
    'has_reviewed', v_reviewed,
    'revealed', v_revealed or v_is_admin,
    'reviews', v_reviews
  );
end;
$$;
grant execute on function public.task_reviews_view(uuid) to authenticated;
