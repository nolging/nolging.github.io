-- 계정 삭제 시 그룹/쪽지 정리
--  요구사항:
--   1) 계정이 삭제되면 가입돼 있던 모든 그룹에서 자동 탈퇴
--   2) 그룹 소유자였다면 '다음 가입자(최초 가입 순)'에게 소유권 이전, 남은 멤버가 없으면 그룹 삭제
--   3) 이미 주고받은 쪽지에서도 답장 불가 → 탈퇴하면 is_group_member 가 false 라 모든 쪽지 RPC
--      (send_note, use_cassette/link/video/bluray, send_note_with_gifts, *_ring 등)가 자동 차단.
--   4) 탈퇴해도 그 사람이 쓴 위시/댓글/리뷰의 '닉네임·프로필 사진'은 계속 표시.
--
--  방식: '소프트 탈퇴' — group_members 행을 지우지 않고 left_at 만 기록한다.
--        · is_group_member(member-soft-leave.sql)는 left_at 있는 멤버를 제외 → 목록/권한/쪽지에서 빠짐
--        · group_member_cards 는 탈퇴자도 반환(display_nickname·avatar_url 보존) → 과거 글/댓글에
--          닉네임·프로필이 계속 뜬다.
--      (하드 삭제하면 행이 사라져 닉네임·프로필이 없어지므로 반드시 소프트 탈퇴)
--
--  주의: groups.owner_id 는 profiles(id) ON DELETE CASCADE 라, 소유자 프로필을 그냥 지우면
--        그룹 전체가 사라진다. 그래서 프로필/계정 삭제 '전에' 이 함수로 소유권을 먼저 이전한다.
--
--  전제: member-soft-leave.sql 적용(group_members.left_at, is_group_member, group_member_cards).
--  호출: Edge Function admin-create-user(action:'delete')에서 프로필/계정 삭제 직전에 호출.
--        관리자 검증은 Edge Function 이 수행하고, 이 함수는 service_role 로만 실행 가능.

create or replace function public.admin_purge_user_memberships(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare g record; v_next uuid;
begin
  if p_user is null then return; end if;

  -- 1) 이 사용자가 소유한 그룹: 다음 '활성' 가입자에게 소유권 이전(없으면 그룹 삭제)
  for g in select id from public.groups where owner_id = p_user loop
    select gm.user_id into v_next
      from public.group_members gm
      where gm.group_id = g.id and gm.user_id <> p_user and gm.left_at is null
      order by gm.joined_at asc, gm.user_id asc   -- 가장 먼저 가입한 다른 활성 멤버
      limit 1;
    if v_next is null then
      delete from public.groups where id = g.id;  -- 남은 활성 멤버 없음 → 그룹 삭제
    else
      update public.groups set owner_id = v_next where id = g.id;
      update public.group_members set role = 'owner' where group_id = g.id and user_id = v_next;
    end if;
  end loop;

  -- 2) 소프트 탈퇴: 행은 남기고 left_at 만 기록 → 쪽지/목록/권한에선 빠지되,
  --    작성한 글·댓글의 닉네임·프로필은 group_member_cards 로 계속 표시된다.
  update public.group_members set left_at = now()
    where user_id = p_user and left_at is null;
end $$;

revoke all on function public.admin_purge_user_memberships(uuid) from public;
revoke all on function public.admin_purge_user_memberships(uuid) from authenticated;
grant execute on function public.admin_purge_user_memberships(uuid) to service_role;
