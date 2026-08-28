-- 랜덤 퀘스트 "쪽지 강화 아이템 사용하기"(r_item_note) 완료 판정 수정.
-- 지우개(익명)나 물풍선 폭탄(타이머)으로 쪽지를 보내면서 아이템까지 동봉하면 notes.kind 가
-- 'gift' 로 찍히는데, r_item_note 판정에 있던 "kind <> 'gift'" 배제 조건 때문에 실제로
-- 강화 아이템을 썼는데도 완료 처리가 안 되던 버그. Supabase SQL Editor 에서 실행.
-- 최종본은 schema-quests.sql 에도 반영돼 있음.

create or replace function public._quest_done(p_key text, p_since timestamptz)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  return case p_key
    when 'attend'      then true
    when 'visit'       then exists(select 1 from public.profiles where id = v_uid and last_group_visit_at >= p_since)
    when 'note'        then exists(select 1 from public.notes where sender_id = v_uid and created_at >= p_since)
    when 'r_wish'      then exists(select 1 from public.tasks where created_by = v_uid and created_at >= p_since)
    -- 강화 아이템 '사용'을 인정한다:
    --   선물상자(link)/이어폰(cassette)/비디오(video)/블루레이(bluray)/폴라로이드필름(polaroid) → kind
    --   지우개 → 익명(anonymous=true) / 물풍선 폭탄 → 타이머(timer_seconds is not null)
    -- 새로 수정: "kind <> 'gift'" 배제 조건을 제거했다. 순수 선물만 있는 kind='gift' 쪽지는
    -- kind in(...) 목록에 'gift' 가 없고 anonymous/timer_seconds 도 false 라 이 조건 없이도
    -- 원래 안 걸린다 — 있으나 마나였다. 그런데 지우개/물풍선 폭탄으로 보낸 쪽지에 아이템까지
    -- 동봉하면 kind 가 'gift' 로 찍히면서 이 배제 조건 때문에 완료 처리가 안 됐다.
    when 'r_item_note' then exists(select 1 from public.notes where sender_id = v_uid and created_at >= p_since
                                     and (kind in ('cassette','video','bluray','link','polaroid') or anonymous = true or timer_seconds is not null))
    -- 긁는 '행동'으로 판정(당첨/꽝 무관): 냥피또가 used 로 소모됐는지
    when 'r_nyangpito' then exists(select 1 from public.user_items where user_id = v_uid and item_id = 'nyangpito' and status = 'used' and used_at >= p_since)
    when 'r_buy'       then exists(select 1 from public.coin_ledger where user_id = v_uid and ref_type = 'purchase' and created_at >= p_since)
    when 'r_spend10'   then coalesce((select -sum(delta) from public.coin_ledger
                                        where user_id = v_uid and delta < 0 and created_at >= p_since), 0) >= 10
    when 'r_game_win'  then exists(select 1 from public.coin_ledger where user_id = v_uid and delta > 0
                                     and ref_type in ('omok','catchmind','rps') and created_at >= p_since)
    when 'r_poke'      then exists(select 1 from public.notifications where actor_id = v_uid and type = 'poke' and created_at >= p_since)
    when 'r_date'          then exists(select 1 from public.quest_events where user_id = v_uid and key = 'r_date' and at >= p_since)
    when 'r_doodle'        then exists(select 1 from public.group_drawings where author = v_uid and created_at >= p_since)
    when 'r_kiss'          then exists(select 1 from public.quest_events where user_id = v_uid and key = 'r_kiss' and at >= p_since)
    when 'r_accept'        then exists(select 1 from public.tasks where assignee_id = v_uid and accepted_at >= p_since)
    when 'r_waterbomb'     then exists(select 1 from public.notes where sender_id = v_uid and timer_seconds is not null and created_at >= p_since)
    when 'r_eraser'        then exists(select 1 from public.notes where sender_id = v_uid and anonymous = true and created_at >= p_since)
    when 'r_deco'          then exists(select 1 from public.user_items where user_id = v_uid and item_id like 'deco-%' and status = 'used' and used_at >= p_since)
    when 'r_premium_shop'  then exists(select 1 from public.quest_events where user_id = v_uid and key = 'r_premium_shop' and at >= p_since)
    when 'r_review'        then exists(select 1 from public.task_reviews where author_id = v_uid and created_at >= p_since)
    when 'r_first_comment' then exists(select 1 from public.task_comments c where c.author_id = v_uid and c.created_at >= p_since
                                         and not exists(select 1 from public.task_comments c2 where c2.task_id = c.task_id and c2.created_at < c.created_at))
    when 'r_schedule'      then exists(select 1 from public.quest_events where user_id = v_uid and key = 'r_schedule' and at >= p_since)
    when 'r_item_present'  then exists(select 1 from public.notes where sender_id = v_uid and kind = 'gift' and created_at >= p_since)
    when 'r_purin_mic'     then exists(select 1 from public.user_items where user_id = v_uid and item_id = 'purin-mic' and status = 'used' and used_at >= p_since)
    when 'r_sticker'             then exists(select 1 from public.quest_events where user_id = v_uid and key = 'r_sticker' and at >= p_since)
    when 'r_nametag'             then exists(select 1 from public.quest_events where user_id = v_uid and key = 'r_nametag' and at >= p_since)
    when 'r_ledboard'            then exists(select 1 from public.quest_events where user_id = v_uid and key = 'r_ledboard' and at >= p_since)
    when 'r_write_wish'          then exists(select 1 from public.quest_events where user_id = v_uid and key = 'r_write_wish' and at >= p_since)
    when 'r_wish_ticket_present' then exists(select 1 from public.quest_events where user_id = v_uid and key = 'r_wish_ticket_present' and at >= p_since)
    else false end;
end $$;
