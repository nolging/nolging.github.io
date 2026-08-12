-- =============================================================
--  프로필 꾸미기(deco-*) 위치/크기/각도 미세 조정
--   · 장착 행(user_items: status='used' + group_id)에 deco_tf jsonb 를 붙여
--     그룹별 프로필 사진에 맞게 조정값을 따로 저장한다.
--       { "s": 배율(0.4~2.5), "x": 좌우, "y": 위아래, "r": 각도(-180~180) } (x/y 범위는 deco-tf-range.sql 참고)
--     좌표 단위는 아바타 SVG viewBox(0~100) 기준. null/미설정이면 기본 위치.
--   · 같은 아이템을 다른 그룹에 옮기면 그 그룹의 조정값으로 다시 잡으면 된다
--     (행이 곧 "그 그룹의 장착"이므로 그룹을 옮길 때 조정값은 초기화된다).
--  적용: Supabase SQL Editor 에 그대로 실행.
-- =============================================================

alter table public.user_items add column if not exists deco_tf jsonb;

-- 조정값 정규화(범위 클램프 + 숫자화). 잘못된 입력은 기본값으로 떨어진다.
create or replace function public.deco_tf_norm(p_tf jsonb)
returns jsonb language sql immutable as $$
  select case when p_tf is null or jsonb_typeof(p_tf) <> 'object' then null else
    jsonb_build_object(
      's', round(least(2.5,  greatest(0.4,  coalesce((p_tf->>'s')::numeric, 1)))::numeric, 3),
      'x', round(least(40,   greatest(-40,  coalesce((p_tf->>'x')::numeric, 0)))::numeric, 2),
      'y', round(least(40,   greatest(-40,  coalesce((p_tf->>'y')::numeric, 0)))::numeric, 2),
      'r', round(least(180,  greatest(-180, coalesce((p_tf->>'r')::numeric, 0)))::numeric, 1)
    )
  end;
$$;

-- 조정값 저장: 내가 그 그룹에 장착 중인 데코에만 쓸 수 있다.
-- p_tf 가 null 이면 조정값을 지운다(기본 위치로 복귀).
create or replace function public.set_avatar_deco_tf(p_item_id text, p_group_id uuid, p_tf jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if public.deco_slot(p_item_id) is null then
    raise exception '프로필 꾸미기 아이템이 아니에요.'; end if;
  if not public.is_group_member(p_group_id, auth.uid()) then
    raise exception '그룹 멤버만 조정할 수 있어요.'; end if;

  select id into v_id from public.user_items
   where user_id = auth.uid() and item_id = p_item_id
     and status = 'used' and group_id = p_group_id
   order by used_at desc nulls last limit 1 for update;
  if v_id is null then raise exception '이 그룹에 장착 중인 아이템이 없어요.'; end if;

  update public.user_items set deco_tf = public.deco_tf_norm(p_tf) where id = v_id;
end;
$$;
grant execute on function public.set_avatar_deco_tf(text, uuid, jsonb) to authenticated;

-- 그룹 멤버들의 장착 데코 조회에 조정값(tf)을 함께 반환.
-- 반환 컬럼이 늘어나므로 기존 함수를 먼저 드롭해야 한다.
drop function if exists public.list_group_avatar_decos(uuid);
create or replace function public.list_group_avatar_decos(p_group_id uuid)
returns table(user_id uuid, item_id text, tf jsonb)
language sql security definer set search_path = public stable as $$
  select ui.user_id, ui.item_id, ui.deco_tf
  from public.user_items ui
  where ui.group_id = p_group_id and ui.status = 'used' and ui.item_id like 'deco-%'
    -- 멤버 또는 앱 관리자(미가입 그룹 조회 시에도 꾸미기가 보이도록)
    and (public.is_group_member(p_group_id, auth.uid()) or public.is_admin(auth.uid()));
$$;
grant execute on function public.list_group_avatar_decos(uuid) to authenticated;

-- 확인
select id, item_id, group_id, deco_tf from public.user_items
 where item_id like 'deco-%' and status = 'used' order by used_at desc nulls last limit 20;
