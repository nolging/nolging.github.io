-- =============================================================
--  랜덤 퀘스트(quest_defs)에도 이모지 배경색 추가
--  · quests-v2.sql, quest-daily-defs.sql 적용 후 실행.
-- =============================================================

alter table public.quest_defs add column if not exists emoji_bg text not null default '#eef0f2';

-- get_quests(): 슬롯 퀘스트에도 emoji_bg 함께 반환
create or replace function public.get_quests()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'Asia/Seoul')::date;
  v_day_start timestamptz := (v_day::timestamp at time zone 'Asia/Seoul');
  v_bal int; v_grade text; v_daily jsonb; v_slots jsonb; i int;
begin
  select coalesce(sum(delta),0) into v_bal from public.coin_ledger where user_id = v_uid;
  v_grade := public._quest_user_grade();

  select jsonb_agg(jsonb_build_object('key',d.key,'label',d.title,'reward',d.reward,
      'emoji', d.emoji, 'emoji_bg', d.emoji_bg,
      'done', public._quest_done(d.key, v_day_start),
      'claimed', exists(select 1 from public.quest_daily_claims c where c.user_id=v_uid and c.quest_key=d.key and c.day=v_day)) order by d.sort_order)
    into v_daily
  from public.quest_daily_defs d where d.active;

  -- 슬롯 보장 + 노출 상태 슬롯의 무효 퀘스트(비활성/삭제/등급불일치) 교체
  for i in 1..5 loop
    if not exists (select 1 from public.quest_slots where user_id=v_uid and slot=i) then
      insert into public.quest_slots(user_id, slot, quest_key, assigned_at, available_at)
        values (v_uid, i, public._quest_pick(array(select quest_key from public.quest_slots where user_id=v_uid)), now(), now())
        on conflict do nothing;
    else
      update public.quest_slots s set
        quest_key = public._quest_pick(array(select quest_key from public.quest_slots where user_id=v_uid and slot<>i)),
        assigned_at = now(), available_at = now()
      where s.user_id=v_uid and s.slot=i and s.available_at <= now()
        and not exists (select 1 from public.quest_defs d
                        where d.id=s.quest_key and d.active and public._quest_grade_ok(d.grade, v_grade));
    end if;
  end loop;

  -- 쿨다운 중에도 '다음 퀘스트' 내용은 노출(진행은 available_at 이후 가능)
  select jsonb_agg(jsonb_build_object(
      'slot', s.slot,
      'cooldown_until', case when s.available_at > now() then s.available_at else null end,
      'assigned_at', s.assigned_at,
      'key',    s.quest_key,
      'title',  dq.title,
      'body',   dq.body,
      'emoji',  dq.emoji,
      'emoji_bg', dq.emoji_bg,
      'reward', dq.reward,
      'done',   case when s.available_at <= now() then public._quest_done(s.quest_key, s.assigned_at) else false end
    ) order by s.slot)
    into v_slots
  from public.quest_slots s left join public.quest_defs dq on dq.id = s.quest_key
  where s.user_id = v_uid;

  return jsonb_build_object('balance',v_bal,'grade',v_grade,'daily',coalesce(v_daily,'[]'::jsonb),'slots',coalesce(v_slots,'[]'::jsonb));
end $$;
grant execute on function public.get_quests() to authenticated;
