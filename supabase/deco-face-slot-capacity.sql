-- =============================================================
--  얼굴(face/얼굴) 슬롯은 한 번에 최대 2개까지 동시 장착 가능하게.
--  · avatar-decos.sql, deco-slot-column.sql(, deco-slot-labels.sql) 적용 후 실행.
--  · 기존엔 슬롯(유형)이 완전 배타(1개)였음 — apply_avatar_deco 가 새 아이템을
--    장착하면 같은 슬롯의 기존 아이템을 무조건 해제했다. 이제 슬롯별 정원
--    (capacity)을 두고, 정원을 넘길 때만 가장 오래 장착한 것부터 해제한다.
--  · deco_slot 값은 관리자가 자유 문자열로 설정하므로(현재 얼굴 계열은 'face'
--    또는 deco-slot-labels.sql 적용 후 '얼굴') 두 표기 다 얼굴 슬롯으로 인식한다.
-- =============================================================

create or replace function public.deco_slot_capacity(p_slot text)
returns int language sql immutable as $$
  select case when p_slot in ('face', '얼굴') then 2 else 1 end;
$$;

create or replace function public.apply_avatar_deco(p_item_id text, p_group_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.user_items; v_slot text; v_cap int;
begin
  v_slot := public.deco_slot(p_item_id);
  if v_slot is null then raise exception '아바타 꾸미기 아이템이 아니에요.'; end if;
  if not (public.is_couple_group(p_group_id) or public.is_friend_group(p_group_id)) then
    raise exception '프리미엄 그룹에만 적용할 수 있어요.'; end if;
  if not public.is_group_member(p_group_id, auth.uid()) then
    raise exception '그룹 멤버만 적용할 수 있어요.'; end if;

  -- 내 해당 아이템 하나 선택(미적용=active 우선, 없으면 적용중=used 를 옮김)
  select * into v_item from public.user_items
    where user_id = auth.uid() and item_id = p_item_id and status in ('active', 'used')
    order by (status = 'active') desc, created_at asc limit 1 for update;
  if v_item.id is null then raise exception '보유한 아이템이 없어요.'; end if;

  v_cap := public.deco_slot_capacity(v_slot);

  -- 같은 그룹·같은 슬롯에 정원(capacity)을 넘겨 장착 중이면, 가장 오래 장착한 것부터
  -- 해제해 자리를 만든다(최근 것 (capacity-1)개는 유지) — 정원 이내면 아무것도 안 건드림.
  update public.user_items
     set status = 'active', group_id = null, used_at = null
   where id in (
     select id from public.user_items
      where user_id = auth.uid() and status = 'used' and group_id = p_group_id
        and id <> v_item.id and public.deco_slot(item_id) = v_slot
      order by used_at desc nulls last
      offset greatest(v_cap - 1, 0)
   );

  update public.user_items set status = 'used', group_id = p_group_id, used_at = now() where id = v_item.id;
end;
$$;
grant execute on function public.apply_avatar_deco(text, uuid) to authenticated;

-- 그룹 멤버들의 장착 데코 조회에 used_at 도 함께 반환(클라이언트가 "정원 초과 시 어느 게
-- 해제될지" 미리 보여줄 수 있게). 반환 컬럼이 늘어나므로 기존 함수를 먼저 드롭해야 한다.
drop function if exists public.list_group_avatar_decos(uuid);
create or replace function public.list_group_avatar_decos(p_group_id uuid)
returns table(user_id uuid, item_id text, tf jsonb, used_at timestamptz)
language sql security definer set search_path = public stable as $$
  select ui.user_id, ui.item_id, ui.deco_tf, ui.used_at
  from public.user_items ui
  where ui.group_id = p_group_id and ui.status = 'used' and ui.item_id like 'deco-%'
    -- 멤버 또는 앱 관리자(미가입 그룹 조회 시에도 꾸미기가 보이도록)
    and (public.is_group_member(p_group_id, auth.uid()) or public.is_admin(auth.uid()));
$$;
grant execute on function public.list_group_avatar_decos(uuid) to authenticated;
