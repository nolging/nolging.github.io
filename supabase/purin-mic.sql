-- =============================================================
--  프리미엄 아이템: 푸린 마이크(purin-mic, 커플 전용)
--   · 24시간 동안 짝꿍 프로필 사진에 낙서(투명 PNG)를 얹을 수 있다.
--   · 사용 순간부터 24h. 그동안은 다시 사용해도 아이템을 추가로 쓰지 않고 그림만 갱신(만료 연장 없음).
--   · 만료되면 낙서는 자동으로 사라지고(pg_cron), 인벤토리에서도 "사용 중" 표시가 사라진다
--     (명찰과 동일하게 소모된 행 자체는 남지만 만료 후엔 조회에서 제외돼 목록에 안 보임).
--   · 낙서 그림 자체(PNG)는 Storage(avatars 버킷)에 업로드하고, 이 테이블엔 URL만 저장한다.
--   · 프리미엄 상점에 관리자 전용으로 등록(테스트 후 admin_only=false 로 정식 오픈).
--  적용: Supabase SQL Editor 에 그대로 실행.
-- =============================================================

-- 1) 상점 등록
insert into public.store_items (id, name, price, emoji, description, premium, tier, admin_only, category, sort_order, is_active) values
  ('purin-mic', '푸린 마이크', 30, '🎤', '24시간 동안 짝꿍 프로필 사진에 낙서할 수 있어요', true, 'couple', true, 'feature', 47, true)
on conflict (id) do update set
  name = excluded.name, price = excluded.price, emoji = excluded.emoji,
  admin_only = excluded.admin_only, category = excluded.category, is_active = excluded.is_active;

-- 2) 낙서 저장 테이블 (그룹당 최대 2행 — 각 파트너가 상대 사진에 그린 것)
create table if not exists public.profile_graffiti (
  group_id uuid not null references public.groups(id) on delete cascade,
  target_user_id uuid not null,
  artist_id uuid not null,
  image_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (group_id, target_user_id)
);
alter table public.profile_graffiti enable row level security;
-- 정책 없음 = 직접 테이블 접근은 전부 막고, 아래 SECURITY DEFINER 함수로만 읽고 쓴다.

-- 3) 사용/수정 RPC: 커플 그룹에서만, 짝꿍 사진에 낙서.
create or replace function public.use_purin_mic(p_group_id uuid, p_image_url text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_partner uuid; v_row public.profile_graffiti; v_item public.user_items; v_active boolean;
begin
  if not public.is_couple_group(p_group_id) then raise exception '커플 그룹에서만 사용할 수 있어요.'; end if;
  if not public.is_group_member(p_group_id, v_uid) then raise exception '그룹 멤버가 아니에요.'; end if;
  if p_image_url is null or btrim(p_image_url) = '' then raise exception '낙서 이미지가 없어요.'; end if;

  select user_id into v_partner from public.group_members where group_id = p_group_id and user_id <> v_uid limit 1;
  if v_partner is null then raise exception '짝꿍을 찾을 수 없어요.'; end if;

  select * into v_row from public.profile_graffiti where group_id = p_group_id and target_user_id = v_partner for update;
  v_active := v_row.group_id is not null and v_row.artist_id = v_uid and v_row.expires_at > now();

  if not v_active then
    select * into v_item from public.user_items
      where user_id = v_uid and item_id = 'purin-mic' and status = 'active'
      order by created_at asc limit 1 for update;
    if v_item.id is null then raise exception '사용할 수 있는 푸린 마이크가 없어요.'; end if;
    update public.user_items set status = 'used', used_at = now() where id = v_item.id;

    insert into public.profile_graffiti(group_id, target_user_id, artist_id, image_url, expires_at)
      values (p_group_id, v_partner, v_uid, p_image_url, now() + interval '24 hours')
    on conflict (group_id, target_user_id) do update
      set artist_id = excluded.artist_id, image_url = excluded.image_url,
          updated_at = now(), expires_at = excluded.expires_at;
  else
    update public.profile_graffiti set image_url = p_image_url, updated_at = now()
      where group_id = p_group_id and target_user_id = v_partner;
  end if;

  select * into v_row from public.profile_graffiti where group_id = p_group_id and target_user_id = v_partner;
  return jsonb_build_object('target_id', v_row.target_user_id, 'image_url', v_row.image_url, 'until', v_row.expires_at);
end $$;
grant execute on function public.use_purin_mic(uuid, text) to authenticated;

-- 4) 내 상태 조회(수정 모달 진입용). 조회 시점에 만료된 행도 겸사겸사 정리.
create or replace function public.purin_mic_state(p_group_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_active jsonb;
begin
  if not public.is_group_member(p_group_id, v_uid) then raise exception '그룹 멤버가 아니에요.'; end if;
  delete from public.profile_graffiti where group_id = p_group_id and expires_at <= now();

  select jsonb_build_object('target_id', pg.target_user_id, 'image_url', pg.image_url, 'until', pg.expires_at)
    into v_active from public.profile_graffiti pg
   where pg.group_id = p_group_id and pg.artist_id = v_uid and pg.expires_at > now() limit 1;

  return jsonb_build_object('active', v_active);
end $$;
grant execute on function public.purin_mic_state(uuid) to authenticated;

-- 5) 그룹의 낙서 전체 조회(아바타 렌더링용) — 데코와 동일하게 그룹 멤버면 조회 가능.
create or replace function public.list_group_graffiti(p_group_id uuid)
returns table(target_user_id uuid, image_url text) language sql stable security definer set search_path = public as $$
  select pg.target_user_id, pg.image_url
    from public.profile_graffiti pg
   where pg.group_id = p_group_id and pg.expires_at > now()
     and (public.is_group_member(p_group_id, auth.uid()) or public.is_admin(auth.uid()));
$$;
grant execute on function public.list_group_graffiti(uuid) to authenticated;

-- 6) 만료 자동 정리(페이지 방문 없이도 낙서가 사라지게) — 명찰(nametag-auto-revert.sql)과 동일한 패턴.
create or replace function public.dispatch_purin_mic_reverts()
returns integer language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.profile_graffiti where expires_at <= now();
  get diagnostics n = row_count;
  return n;
end;
$$;

create extension if not exists pg_cron;
do $$
begin
  perform cron.unschedule('nolging-purin-mic-revert');
exception when others then null;
end $$;
select cron.schedule('nolging-purin-mic-revert', '* * * * *', $$select public.dispatch_purin_mic_reverts()$$);
