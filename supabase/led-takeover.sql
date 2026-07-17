-- =============================================================
--  전광판 게재 권한 가져오기(takeover)
--  · 상대가 게재 중일 때, 남은 시간만큼 츄르를 상대에게 배상하고 내 전광판으로 교체.
--  · 비용 = 남은 시간(시간 단위 올림) × 2 츄르. (예: 23h20m → 24h → 48)
--  · my_led_banner 에 owner_name(게재자 표시 닉네임) 추가.
--  Supabase SQL Editor 에서 실행.
-- =============================================================

-- 게재자 닉네임을 함께 반환하도록 확장 (반환 컬럼 추가 → drop 후 재생성)
drop function if exists public.my_led_banner();
create or replace function public.my_led_banner()
returns table (id uuid, group_id uuid, owner_id uuid, owner_name text, "text" text, color text, expires_at timestamptz, is_owner boolean)
language sql security definer stable set search_path = public as $$
  select b.id, b.group_id, b.owner_id,
         public.notif_member_name(b.group_id, b.owner_id),
         b.text, b.color, b.expires_at, (b.owner_id = auth.uid())
  from public.led_banners b
  where b.active and b.expires_at > now()
    and public.is_group_member(b.group_id, auth.uid())
  order by b.started_at desc
  limit 1;
$$;
grant execute on function public.my_led_banner() to authenticated;

-- 전광판 게재 권한 가져오기: 상대 배너 내림 + 배상 적립 + 내 전광판 게재(아이템 1개 소모)
create or replace function public.takeover_ledboard(p_text text, p_color text)
returns integer language plpgsql security definer set search_path = public as $$
declare v_group uuid; v_color text; v_banner public.led_banners; v_cost int; v_bal int; v_item public.user_items;
begin
  if p_text is null or btrim(p_text) = '' then raise exception '문구를 입력해 주세요.'; end if;
  if char_length(btrim(p_text)) > 60 then raise exception '문구는 60자까지 입력할 수 있어요.'; end if;
  v_color := public.led_color_ok(p_color);

  -- 내 커플 그룹
  select group_id into v_group from public.user_items
   where user_id = auth.uid() and item_id = 'couple-ring' and status = 'used' and group_id is not null
   order by used_at desc nulls last limit 1;
  if v_group is null then raise exception '커플 링을 장착한 커플만 사용할 수 있어요.'; end if;

  -- 현재 게재 중인 배너(상대 것)
  select * into v_banner from public.led_banners
   where group_id = v_group and active and expires_at > now()
   order by started_at desc limit 1;
  if v_banner.id is null then raise exception '게재 중인 전광판이 없어요. 그냥 게재해 주세요.'; end if;
  if v_banner.owner_id = auth.uid() then raise exception '이미 내가 전광판을 게재 중이에요.'; end if;

  -- 비용 = 남은 시간(시간 올림) × 2
  v_cost := ceil(extract(epoch from (v_banner.expires_at - now())) / 3600.0)::int * 2;

  -- 게재할 전광판 아이템 보유 확인
  select * into v_item from public.user_items
   where user_id = auth.uid() and item_id = 'ledboard' and status = 'active'
   order by created_at asc limit 1;
  if v_item.id is null then raise exception '사용할 수 있는 전광판이 없습니다.'; end if;

  -- 잔액 확인
  select coalesce(sum(delta), 0) into v_bal from public.coin_ledger where user_id = auth.uid();
  if v_bal < v_cost then raise exception '츄르가 부족해요.'; end if;

  -- 상대 배너 내림
  update public.led_banners set active = false where id = v_banner.id;

  -- 츄르 이동: 나 차감 → 상대 배상 적립
  if v_cost > 0 then
    insert into public.coin_ledger(user_id, delta, reason, ref_type)
      values (auth.uid(), -v_cost, '전광판 게재 권한 가져오기', 'ledboard_takeover');
    insert into public.coin_ledger(user_id, delta, reason, ref_type)
      values (v_banner.owner_id, v_cost, '전광판 게재 조기 종료 배상', 'ledboard_takeover');
  end if;

  -- 내 전광판 아이템 소모 + 24시간 게재
  update public.user_items set status = 'used', used_at = now() where id = v_item.id;
  insert into public.led_banners(group_id, owner_id, text, color, active, started_at, expires_at)
    values (v_group, auth.uid(), btrim(p_text), v_color, true, now(), now() + interval '24 hours');

  return v_cost;
end $$;
grant execute on function public.takeover_ledboard(text, text) to authenticated;
