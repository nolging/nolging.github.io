-- =============================================================
--  푸린 마이크: group_members.graffiti_locked_until 미러 컬럼 자가 치유.
--  원인: use_purin_mic 는 "새로 잠글 때"(v_active = false)만 미러 컬럼을 썼다.
--  마이그레이션(purin-mic-lock-notify.sql) 적용 시점 전에 이미 사용 중이던 낙서는
--  그 뒤로 재수정(else 분기)만 타면서 미러가 한 번도 채워지지 않았고, 그 결과
--  profile_graffiti(원본)는 정상인데 group_members.graffiti_locked_until 만 비어 있어
--  MySettings 의 사진 잠금 문구가 안 뜨는 상태가 됐다.
--  → 재수정 시 + purin_mic_state 조회 시 둘 다에서 원본과 어긋나면 항상 맞춰 쓰도록 강화.
--  적용: Supabase SQL Editor 에 그대로 실행. (purin-mic-lock-notify.sql 이후)
-- =============================================================

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
    -- 재수정 시에도 미러 컬럼이 원본과 어긋나 있으면(과거 사용분 등) 맞춰 둔다 — 자가 치유.
    update public.group_members set graffiti_locked_until = v_row.expires_at
      where group_id = p_group_id and user_id = v_partner
        and graffiti_locked_until is distinct from v_row.expires_at;
  end if;

  select * into v_row from public.profile_graffiti where group_id = p_group_id and target_user_id = v_partner;
  return jsonb_build_object('target_id', v_row.target_user_id, 'image_url', v_row.image_url, 'until', v_row.expires_at);
end $$;
grant execute on function public.use_purin_mic(uuid, text) to authenticated;

create or replace function public.purin_mic_state(p_group_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_active jsonb;
begin
  if not public.is_group_member(p_group_id, v_uid) then raise exception '그룹 멤버가 아니에요.'; end if;
  delete from public.profile_graffiti where group_id = p_group_id and expires_at <= now();
  update public.group_members set graffiti_locked_until = null
    where group_id = p_group_id and graffiti_locked_until is not null and graffiti_locked_until <= now();

  -- 활성 낙서가 있는데 미러 컬럼이 비어있거나 어긋나 있으면(과거 사용분 등) 맞춰 둔다 — 자가 치유.
  update public.group_members gm set graffiti_locked_until = pg.expires_at
    from public.profile_graffiti pg
   where pg.group_id = p_group_id and pg.target_user_id = gm.user_id and pg.expires_at > now()
     and gm.graffiti_locked_until is distinct from pg.expires_at;

  select jsonb_build_object('target_id', pg.target_user_id, 'image_url', pg.image_url, 'until', pg.expires_at)
    into v_active from public.profile_graffiti pg
   where pg.group_id = p_group_id and pg.artist_id = v_uid and pg.expires_at > now() limit 1;

  return jsonb_build_object('active', v_active);
end $$;
grant execute on function public.purin_mic_state(uuid) to authenticated;

-- 매분 도는 만료 정리 크론도 동일하게 자가 치유(어떤 그룹이든 방문 없이도 맞춰짐)
create or replace function public.dispatch_purin_mic_reverts()
returns integer language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.profile_graffiti where expires_at <= now();
  update public.group_members set graffiti_locked_until = null
    where graffiti_locked_until is not null and graffiti_locked_until <= now();
  update public.group_members gm set graffiti_locked_until = pg.expires_at
    from public.profile_graffiti pg
   where pg.target_user_id = gm.user_id and pg.expires_at > now()
     and gm.graffiti_locked_until is distinct from pg.expires_at;
  get diagnostics n = row_count;
  return n;
end;
$$;
