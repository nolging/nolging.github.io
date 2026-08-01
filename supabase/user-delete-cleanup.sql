-- 계정 삭제 시 그룹/쪽지 정리
--  요구사항:
--   1) 계정이 삭제되면 가입돼 있던 모든 그룹에서 자동 탈퇴
--   2) 그룹 소유자였다면 '다음 가입자(최초 가입 순)'에게 소유권 이전, 남은 멤버가 없으면 그룹 삭제
--   3) 이미 주고받은 쪽지에서도 답장 불가 → group_members 에서 빠지면 모든 쪽지 RPC(send_note,
--      use_cassette/link/video/bluray, send_note_with_gifts, *_ring 등)가 is_group_member 검사로
--      자동 차단되므로, 별도 처리 없이 '멤버십 제거'만으로 발송·답장이 모두 막힌다.
--
--  주의: groups.owner_id 는 profiles(id) ON DELETE CASCADE 라, 소유자 프로필을 그냥 지우면
--        그룹 전체가 사라진다. 그래서 프로필/계정 삭제 '전에' 이 함수로 소유권을 먼저 이전한다.
--
--  호출: Edge Function admin-create-user(action:'delete')에서 프로필/계정 삭제 직전에 호출.
--        관리자 검증은 Edge Function 이 수행하고, 이 함수는 service_role 로만 실행 가능.

create or replace function public.admin_purge_user_memberships(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare g record; v_next uuid;
begin
  if p_user is null then return; end if;

  -- 1) 이 사용자가 소유한 그룹: 다음 가입자에게 소유권 이전(없으면 그룹 삭제)
  for g in select id from public.groups where owner_id = p_user loop
    select gm.user_id into v_next
      from public.group_members gm
      where gm.group_id = g.id and gm.user_id <> p_user
      order by gm.joined_at asc, gm.user_id asc   -- 가장 먼저 가입한 다른 멤버
      limit 1;
    if v_next is null then
      delete from public.groups where id = g.id;  -- 남은 멤버 없음 → 그룹 삭제(하위 데이터 cascade)
    else
      update public.groups set owner_id = v_next where id = g.id;
      update public.group_members set role = 'owner' where group_id = g.id and user_id = v_next;
    end if;
  end loop;

  -- 2) 모든 그룹에서 탈퇴(남아 있던 멤버십 제거) → 이후 쪽지 발송/답장 자동 차단
  delete from public.group_members where user_id = p_user;
end $$;

revoke all on function public.admin_purge_user_memberships(uuid) from public;
revoke all on function public.admin_purge_user_memberships(uuid) from authenticated;
grant execute on function public.admin_purge_user_memberships(uuid) to service_role;
