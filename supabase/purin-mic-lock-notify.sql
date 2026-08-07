-- =============================================================
--  푸린 마이크 추가: 낙서 적용 중엔 대상이 자기 프로필 사진을 못 바꾸게 + 사용 알림.
--  명찰(_block_locked_nick, nick_locked_until)과 정확히 같은 패턴 —
--  group_members 에 만료 시각을 그대로 미러링해두고(graffiti_locked_until),
--  프론트는 이미 쓰던 getMyGroupMember 한 번으로 잠금 여부를 알 수 있다.
--  적용: Supabase SQL Editor 에 그대로 실행. (purin-mic.sql 이후)
-- =============================================================

-- 1) group_members 에 낙서 잠금 만료 시각 미러 컬럼 추가
alter table public.group_members add column if not exists graffiti_locked_until timestamptz;

-- 2) 알림 템플릿(관리자 페이지에서 문구 수정 가능)
insert into public.notif_templates (key, label, title, body, vars, sort_order) values
  ('purin_mic', '연인이 푸린 마이크 사용', '연인이 내 프로필 사진에 낙서했어요', '24시간 동안 낙서가 남아 있어요',
   '{actor} = 사용한 사람 닉네임', 62)
on conflict (key) do update set label = excluded.label, vars = excluded.vars, sort_order = excluded.sort_order;

-- 3) use_purin_mic: 새로 카운트다운이 시작될 때만(재수정 시엔 X) group_members.graffiti_locked_until
--    갱신 + 대상에게 알림.
create or replace function public.use_purin_mic(p_group_id uuid, p_image_url text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_partner uuid; v_row public.profile_graffiti; v_item public.user_items;
        v_active boolean; v_actor text; v_t text; v_b text;
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

    update public.group_members set graffiti_locked_until = now() + interval '24 hours'
      where group_id = p_group_id and user_id = v_partner;

    -- 카운트다운이 시작되는 이 시점에만 대상에게 알림(이후 낙서만 고칠 땐 조용히) — 명찰과 동일한 규칙
    select coalesce(nullif(gm.display_nickname, ''), '연인') into v_actor
      from public.group_members gm where gm.group_id = p_group_id and gm.user_id = v_uid;
    select r.title, r.body into v_t, v_b
      from public.notif_render('purin_mic', jsonb_build_object('actor', v_actor)) r;
    insert into public.notifications(user_id, actor_id, type, title, body, group_id)
      values (v_partner, v_uid, 'purin_mic',
              coalesce(v_t, '연인이 내 프로필 사진에 낙서했어요'),
              coalesce(v_b, '24시간 동안 낙서가 남아 있어요'), p_group_id);
  else
    update public.profile_graffiti set image_url = p_image_url, updated_at = now()
      where group_id = p_group_id and target_user_id = v_partner;
  end if;

  select * into v_row from public.profile_graffiti where group_id = p_group_id and target_user_id = v_partner;
  return jsonb_build_object('target_id', v_row.target_user_id, 'image_url', v_row.image_url, 'until', v_row.expires_at);
end $$;
grant execute on function public.use_purin_mic(uuid, text) to authenticated;

-- 4) purin_mic_state: 조회 시점에 만료된 잠금도 같이 정리(명찰의 nametag_state 와 동일)
create or replace function public.purin_mic_state(p_group_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_active jsonb;
begin
  if not public.is_group_member(p_group_id, v_uid) then raise exception '그룹 멤버가 아니에요.'; end if;
  delete from public.profile_graffiti where group_id = p_group_id and expires_at <= now();
  update public.group_members set graffiti_locked_until = null
    where group_id = p_group_id and graffiti_locked_until is not null and graffiti_locked_until <= now();

  select jsonb_build_object('target_id', pg.target_user_id, 'image_url', pg.image_url, 'until', pg.expires_at)
    into v_active from public.profile_graffiti pg
   where pg.group_id = p_group_id and pg.artist_id = v_uid and pg.expires_at > now() limit 1;

  return jsonb_build_object('active', v_active);
end $$;
grant execute on function public.purin_mic_state(uuid) to authenticated;

-- 5) 만료 자동 정리에도 graffiti_locked_until 해제 포함
create or replace function public.dispatch_purin_mic_reverts()
returns integer language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.profile_graffiti where expires_at <= now();
  update public.group_members set graffiti_locked_until = null
    where graffiti_locked_until is not null and graffiti_locked_until <= now();
  get diagnostics n = row_count;
  return n;
end;
$$;

-- 6) 낙서 적용 중엔 본인 프로필 사진 변경 차단 — 명찰의 _block_locked_nick 과 정확히 같은 패턴.
--    같은 트리거 함수 안에서 두 필드(닉네임/사진)를 각각 독립적으로 검사(다른 필드는 그대로 허용).
create or replace function public._block_locked_nick() returns trigger
language plpgsql set search_path = public as $$
begin
  if TG_OP = 'UPDATE' and auth.uid() = OLD.user_id then
    if OLD.nick_locked_until is not null and OLD.nick_locked_until > now()
       and NEW.display_nickname is distinct from OLD.display_nickname then
      raise exception '명찰 효과가 끝난 뒤에 닉네임을 바꿀 수 있어요.';
    end if;
    if OLD.graffiti_locked_until is not null and OLD.graffiti_locked_until > now()
       and NEW.avatar_url is distinct from OLD.avatar_url then
      raise exception '푸린 마이크 효과가 끝난 뒤에 사진을 바꿀 수 있어요.';
    end if;
  end if;
  return NEW;
end $$;
-- 트리거 자체는 이미 있음(premium-items.sql) — 함수만 교체하면 그대로 적용된다.

-- 7) 내 잠금 상태를 한 번의 조회로 알 수 있게 select 목록에 추가
--    (src/lib/api.js 의 getMyGroupMember 도 함께 갱신 — 이 파일과 세트로 배포)
