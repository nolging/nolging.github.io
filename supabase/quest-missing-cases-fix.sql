-- 랜덤 퀘스트 완료 판정 누락 수정: r_sticker(칭찬 스티커 붙여 주기) / r_nametag(명찰 빼앗기) /
-- r_ledboard(전광판 게재하기) / r_write_wish(위시 작성하기) / r_wish_ticket_present(소원권 선물하기).
-- 프런트(touchQuest)는 quest_events 테이블에 이벤트를 남기고 있었지만, _quest_done() 의
-- CASE 문에 이 5개 키의 분기가 아예 없어 항상 else false 로 떨어져 절대 완료 처리가 안 되고
-- 있었다. Supabase SQL Editor 에서 실행. 최종본은 schema-quests.sql 에도 반영돼 있음.

create or replace function public._quest_done(p_key text, p_since timestamptz)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  return case p_key
    when 'attend'      then true
    when 'visit'       then exists(select 1 from public.profiles where id = v_uid and last_group_visit_at >= p_since)
    when 'note'        then exists(select 1 from public.notes where sender_id = v_uid and created_at >= p_since)
    when 'r_wish'      then exists(select 1 from public.tasks where created_by = v_uid and created_at >= p_since)
    -- 강화 아이템 '사용'만 인정(아이템 선물 kind='gift' 는 제외):
    --   선물상자(link)/이어폰(cassette)/비디오(video)/블루레이(bluray)/폴라로이드필름(polaroid) → kind
    --   지우개 → 익명(anonymous=true) / 물풍선 폭탄 → 타이머(timer_seconds is not null)
    when 'r_item_note' then exists(select 1 from public.notes where sender_id = v_uid and created_at >= p_since
                                     and coalesce(kind, '') <> 'gift'
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
    -- 새로 추가: 아래 5개는 quest_events 에 이벤트는 쌓이고 있었지만 판정 분기가 없었다.
    when 'r_sticker'             then exists(select 1 from public.quest_events where user_id = v_uid and key = 'r_sticker' and at >= p_since)
    when 'r_nametag'             then exists(select 1 from public.quest_events where user_id = v_uid and key = 'r_nametag' and at >= p_since)
    when 'r_ledboard'            then exists(select 1 from public.quest_events where user_id = v_uid and key = 'r_ledboard' and at >= p_since)
    when 'r_write_wish'          then exists(select 1 from public.quest_events where user_id = v_uid and key = 'r_write_wish' and at >= p_since)
    when 'r_wish_ticket_present' then exists(select 1 from public.quest_events where user_id = v_uid and key = 'r_wish_ticket_present' and at >= p_since)
    else false end;
end $$;
