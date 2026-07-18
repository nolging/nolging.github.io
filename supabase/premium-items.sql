-- =============================================================
--  프리미엄 아이템: 명찰(name-tag) · 타임머신(time-machine)
--   · 명찰(커플 전용): 24시간 동안 연인의 그룹 닉네임을 내 마음대로 설정.
--       사용 순간부터 24h. 그동안 상대는 자기 닉네임 수정 불가(다른 정보는 가능). 만료 시 원복.
--   · 타임머신: 물풍선 폭탄이 터진 쪽지를 처음 열었을 때로 1회 되돌림(타이머 재시작).
--   · 일단 프리미엄 상점에서 "관리자만" 노출(admin_only). 이미지는 store 에 등록돼 있음.
--  적용: Supabase SQL Editor 에 그대로 실행.
-- =============================================================

-- 1) 상점 노출 플래그(관리자 전용 프리미엄). 이미 admin 페이지에서 등록해 둔 행을 갱신.
update public.store_items set is_active = true, admin_only = true, premium = true, tier = 'couple' where id = 'name-tag';
update public.store_items set is_active = true, admin_only = true, premium = true, tier = null     where id = 'time-machine';

-- 2) group_members: 명찰 닉네임 오버라이드
alter table public.group_members add column if not exists nick_original     text;
alter table public.group_members add column if not exists nick_locked_by    uuid;
alter table public.group_members add column if not exists nick_locked_until timestamptz;

-- 3) 잠금 중 본인 닉네임 변경 차단(다른 필드는 허용). 정의자 함수(설정/원복)는 auth.uid()≠대상 또는 만료 후라 통과.
create or replace function public._block_locked_nick() returns trigger
language plpgsql set search_path = public as $$
begin
  if TG_OP = 'UPDATE'
     and OLD.nick_locked_until is not null and OLD.nick_locked_until > now()
     and NEW.display_nickname is distinct from OLD.display_nickname
     and auth.uid() = OLD.user_id then
    raise exception '명찰 효과가 끝난 뒤에 닉네임을 바꿀 수 있어요.';
  end if;
  return NEW;
end $$;
drop trigger if exists trg_block_locked_nick on public.group_members;
create trigger trg_block_locked_nick before update on public.group_members
  for each row execute function public._block_locked_nick();

-- 4) 명찰 사용: 상대(짝꿍) 닉네임을 설정. 미사용이면 명찰 1개 소모 + 24h 시작, 사용 중이면 이름만 갱신(타이머 유지).
create or replace function public.use_name_tag(p_group_id uuid, p_nickname text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_partner uuid; v_gm public.group_members; v_item public.user_items; v_active boolean;
begin
  if not public.is_couple_group(p_group_id) then raise exception '커플 그룹에서만 사용할 수 있어요.'; end if;
  if not public.is_group_member(p_group_id, v_uid) then raise exception '그룹 멤버가 아니에요.'; end if;
  if p_nickname is null or btrim(p_nickname) = '' then raise exception '변경할 이름을 입력해 주세요.'; end if;
  if char_length(btrim(p_nickname)) > 12 then raise exception '이름은 12자까지 정할 수 있어요.'; end if;

  select user_id into v_partner from public.group_members where group_id = p_group_id and user_id <> v_uid limit 1;
  if v_partner is null then raise exception '짝꿍을 찾을 수 없어요.'; end if;

  select * into v_gm from public.group_members where group_id = p_group_id and user_id = v_partner for update;
  v_active := v_gm.nick_locked_until is not null and v_gm.nick_locked_until > now() and v_gm.nick_locked_by = v_uid;

  if not v_active then
    select * into v_item from public.user_items
      where user_id = v_uid and item_id = 'name-tag' and status = 'active'
      order by created_at asc limit 1 for update;
    if v_item.id is null then raise exception '사용할 수 있는 명찰이 없어요.'; end if;
    update public.user_items set status = 'used', used_at = now() where id = v_item.id;
    update public.group_members set
      nick_original     = coalesce(nullif(nick_original, ''), display_nickname),
      display_nickname  = btrim(p_nickname),
      nick_locked_by    = v_uid,
      nick_locked_until = now() + interval '24 hours'
     where group_id = p_group_id and user_id = v_partner;
  else
    update public.group_members set display_nickname = btrim(p_nickname)
     where group_id = p_group_id and user_id = v_partner;
  end if;

  select * into v_gm from public.group_members where group_id = p_group_id and user_id = v_partner;
  return jsonb_build_object('target_id', v_partner, 'nickname', v_gm.display_nickname, 'until', v_gm.nick_locked_until);
end $$;
grant execute on function public.use_name_tag(uuid, text) to authenticated;

-- 5) 명찰 상태 조회 + 만료 자동 원복(이 그룹). 인벤토리/프로필에서 호출.
create or replace function public.nametag_state(p_group_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_active jsonb; v_mine jsonb;
begin
  if not public.is_group_member(p_group_id, v_uid) then raise exception '그룹 멤버가 아니에요.'; end if;
  -- 만료된 잠금 원복
  update public.group_members
     set display_nickname = coalesce(nullif(nick_original, ''), display_nickname),
         nick_original = null, nick_locked_by = null, nick_locked_until = null
   where group_id = p_group_id and nick_locked_until is not null and nick_locked_until <= now();

  select jsonb_build_object('target_id', gm.user_id, 'nickname', gm.display_nickname, 'until', gm.nick_locked_until)
    into v_active from public.group_members gm
   where gm.group_id = p_group_id and gm.nick_locked_by = v_uid
     and gm.nick_locked_until is not null and gm.nick_locked_until > now() limit 1;

  select jsonb_build_object('until', gm.nick_locked_until) into v_mine
    from public.group_members gm
   where gm.group_id = p_group_id and gm.user_id = v_uid
     and gm.nick_locked_until is not null and gm.nick_locked_until > now() limit 1;

  return jsonb_build_object('active', v_active, 'mine', v_mine);
end $$;
grant execute on function public.nametag_state(uuid) to authenticated;

-- 6) 타임머신 사용: 물풍선 쪽지의 opened_at 을 현재로 재설정(타이머 재시작) + 타임머신 1개 소모.
create or replace function public.use_time_machine(p_note_id uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare n public.notes; v_item public.user_items; v_now timestamptz := now();
begin
  select * into n from public.notes where id = p_note_id;
  if n.id is null or n.recipient_id <> auth.uid() then raise exception '쪽지를 찾을 수 없어요.'; end if;
  if n.timer_seconds is null then raise exception '물풍선 쪽지가 아니에요.'; end if;
  select * into v_item from public.user_items
    where user_id = auth.uid() and item_id = 'time-machine' and status = 'active'
    order by created_at asc limit 1 for update;
  if v_item.id is null then raise exception '사용할 수 있는 타임머신이 없어요.'; end if;
  update public.user_items set status = 'used', used_at = v_now where id = v_item.id;
  update public.notes set opened_at = v_now where id = n.id;
  return v_now;
end $$;
grant execute on function public.use_time_machine(uuid) to authenticated;
