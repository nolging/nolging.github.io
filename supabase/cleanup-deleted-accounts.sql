-- 이미 "삭제"했지만 그룹에 그대로 남아 있는 계정 정리(1회성 운영 쿼리)
--
--  배경: 구버전 삭제는 프로필/계정 행만 지우려다 콘텐츠 FK(tasks.created_by 등 RESTRICT)로
--        조용히 실패해서, 계정이 그룹 멤버·쪽지 수신자로 그대로 남아 있음. (삭제됐다는 표시가
--        DB에 따로 없으므로, 아래 [1]에서 닉네임으로 대상 계정을 직접 확인해 [2]에서 정리한다.)
--
--  전제: supabase/user-delete-cleanup.sql 이 먼저 적용돼 admin_purge_user_memberships() 가 있어야 함.
--        (SQL Editor 는 관리자 권한으로 실행되므로 함수 호출 가능)
--
--  효과(콘텐츠·닉네임·프로필 보존):
--   · 소유 그룹은 '다음 가입자(최초 가입 순)'에게 소유권 이전(없으면 그룹 삭제)
--   · 모든 그룹에서 '소프트 탈퇴'(left_at 기록) → 목록/권한/쪽지에서 빠지되, 작성한 위시/댓글/
--     리뷰의 닉네임·프로필 사진은 계속 표시됨(group_member_cards 가 탈퇴자도 반환)
--   · status='disabled' 로 로그인 차단(작성했던 위시/댓글/쪽지 내용도 그대로 남음)
--  전제: member-soft-leave.sql + (갱신된) user-delete-cleanup.sql 적용됨.

-- ── [1] 대상 확인: 현재 그룹에 속한 멤버 목록(닉네임/역할/소속 그룹) ─────────────
--    여기서 '삭제하려던' 계정의 nickname 을 확인한다.
select p.id as user_id, p.nickname, p.role, p.status,
       count(*)                                   as group_count,
       string_agg(g.name, ', ' order by g.name)   as groups
from public.group_members gm
join public.groups g        on g.id = gm.group_id
left join public.profiles p on p.id = gm.user_id
group by p.id, p.nickname, p.role, p.status
order by p.nickname;

-- ── [2] 정리 실행: 정리할 아이디(nickname)들을 배열에 넣고 한 번에 처리 ──────────
--    ↓ 'delete-me1','delete-me2' 자리에 실제 정리할 계정 아이디를 나열해서 실행.
do $$
declare u uuid;
begin
  for u in
    select id from public.profiles
    where nickname = any (array[
      'delete-me1', 'delete-me2'     -- ← 정리할 계정 아이디(닉네임)로 교체
    ])
  loop
    perform public.admin_purge_user_memberships(u);      -- 그룹 탈퇴 + 소유권 이전
    update public.profiles set status = 'disabled' where id = u;  -- 로그인 차단(콘텐츠 보존)
  end loop;
end $$;

-- ── [3] 확인: [1] 을 다시 실행해 해당 계정들이 그룹 목록에서 빠졌는지 확인 ────────
