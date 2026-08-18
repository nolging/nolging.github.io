-- =============================================================
--  커플 공간: "다음 기념일" 커스텀 지정
--  기본은 자동(다음 100일 단위 또는 다음 N주년 중 더 가까운 쪽). 그룹 멤버가
--  직접 "다음 기념일"을 N일 또는 N주년으로 지정할 수 있게 한다.
--  지정한 날짜가 지나면 프론트(resolveNextAnniv)에서 자동으로 무시하고
--  다시 자동 계산으로 돌아가므로, 만료 시 별도 초기화(DB 갱신)가 필요 없다.
-- =============================================================
alter table public.groups add column if not exists next_anniv_kind text check (next_anniv_kind in ('days', 'years'));
alter table public.groups add column if not exists next_anniv_value integer check (next_anniv_value > 0);

-- 그룹 update 는 소유자만 가능하므로, 멤버 누구나 설정할 수 있게 RPC 제공.
-- p_kind = null 이면 자동으로 되돌림(커스텀 해제).
create or replace function public.set_group_next_anniv(p_group_id uuid, p_kind text, p_value integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_group_member(p_group_id, auth.uid()) then
    raise exception 'not authorized';
  end if;
  if p_kind is null then
    update public.groups set next_anniv_kind = null, next_anniv_value = null where id = p_group_id;
  else
    if p_kind not in ('days', 'years') then raise exception 'invalid kind'; end if;
    if p_value is null or p_value <= 0 then raise exception 'invalid value'; end if;
    update public.groups set next_anniv_kind = p_kind, next_anniv_value = p_value where id = p_group_id;
  end if;
end;
$$;
grant execute on function public.set_group_next_anniv(uuid, text, integer) to authenticated;
