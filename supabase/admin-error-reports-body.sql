-- =============================================================
--  관리자: 오류 리포트 목록 카드에 내용(본문) 미리보기를 표시하기 위해
--  admin_list_error_reports() 반환에 body 컬럼 추가. 반환 컬럼이 늘어나
--  create or replace 로는 안 되므로 drop 후 재생성한다.
-- =============================================================
drop function if exists public.admin_list_error_reports();

create function public.admin_list_error_reports()
returns table(id uuid, title text, body text, reporter_login text, resolved boolean, created_at timestamptz)
language sql security definer set search_path = public stable as $$
  select r.id, r.title, r.body, p.nickname, r.resolved, r.created_at
    from public.error_reports r
    join public.profiles p on p.id = r.reporter_id
   where public.is_admin(auth.uid())
   order by r.resolved asc, r.created_at desc;
$$;
grant execute on function public.admin_list_error_reports() to authenticated;
