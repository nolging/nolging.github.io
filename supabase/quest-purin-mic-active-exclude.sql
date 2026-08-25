-- =============================================================
--  랜덤 퀘스트 '이미 사용 중인 아이템'은 새로 배정되지 않도록 _quest_pick 에서 제외.
--   · r_purin_mic("얼굴에 낙서하기"): 푸린 마이크 24시간 낙서 효과가 아직 살아있는 동안
--   · r_nametag("명찰 빼앗기"): 명찰 24시간 잠금 효과가 아직 살아있는 동안
--  적용: Supabase SQL Editor 에 그대로 실행(quests-v2.sql 이후 아무 때나).
-- =============================================================

create or replace function public._quest_pick(p_exclude text[])
returns text language plpgsql security definer set search_path = public as $$
declare
  v_g text := public._quest_user_grade();
  v_uid uuid := auth.uid();
  v_key text;
  v_purin_active boolean := exists(
    select 1 from public.profile_graffiti where artist_id = v_uid and expires_at > now()
  );
  v_nametag_active boolean := exists(
    select 1 from public.group_members where nick_locked_by = v_uid and nick_locked_until > now()
  );
begin
  select d.id into v_key from public.quest_defs d
  where d.active and public._quest_grade_ok(d.grade, v_g)
    and not (d.id = any(coalesce(p_exclude, array[]::text[])))
    and not (d.id = 'r_purin_mic' and v_purin_active)
    and not (d.id = 'r_nametag' and v_nametag_active)
  order by random() limit 1;
  if v_key is null then
    select d.id into v_key from public.quest_defs d
    where d.active and public._quest_grade_ok(d.grade, v_g)
      and not (d.id = 'r_purin_mic' and v_purin_active)
      and not (d.id = 'r_nametag' and v_nametag_active)
    order by random() limit 1;
  end if;
  return v_key;
end $$;
