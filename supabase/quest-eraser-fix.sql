-- =============================================================
--  랜덤 퀘스트 'r_eraser'(익명 쪽지 보내기, 지우개 사용) 완료 판정 누락 수정.
--  · 증상: 지우개(익명 쪽지)를 써서 쪽지를 보내도 절대 완료 처리가 안 됐다.
--    물풍선 폭탄(r_waterbomb)과 동시에 뜬 상태에서 같은 쪽지 하나로 익명+타이머를
--    둘 다 걸어 보내면 r_waterbomb 만 완료되고 r_eraser 는 안 되는 걸로 발견됨.
--  · 원인: _quest_done() 의 CASE 문에 'r_eraser' 항목 자체가 없었다(빠짐) — 프론트
--    (MyProfile.jsx)에는 r_eraser 퀘스트의 이동 경로/아이콘 매핑이 있고 관리자 페이지에서
--    직접 등록도 됐지만(quest_defs 행 존재), 완료 판정 로직만 누락된 상태였다.
--    다른 모든 case 에 안 걸리면 else false 로 떨어지니 항상 미완료로 보였다.
--  · 수정: r_waterbomb(타이머) 와 대칭으로 anonymous=true 쪽지를 확인하는 case 추가.
--  적용: Supabase SQL Editor 에 그대로 실행(quest-purin-mic-active-exclude.sql 이후 아무 때나).
-- =============================================================

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
    -- 관리자가 관리자 페이지에서 직접 등록한 퀘스트(r_item_present/r_purin_mic 와 동일 패턴).
    -- 지금까지 이 case 가 빠져 있어서 always false 였음 — 익명(지우개) 쪽지를 보내도
    -- 절대 완료 처리가 안 되던 버그(물풍선 폭탄과 동시에 떠서 같은 쪽지로 둘 다 조건을
    -- 채웠을 때도 r_waterbomb 만 완료되고 이건 안 됐던 원인).
    when 'r_eraser'        then exists(select 1 from public.notes where sender_id = v_uid and anonymous = true and created_at >= p_since)
    when 'r_deco'          then exists(select 1 from public.user_items where user_id = v_uid and item_id like 'deco-%' and status = 'used' and used_at >= p_since)
    when 'r_premium_shop'  then exists(select 1 from public.quest_events where user_id = v_uid and key = 'r_premium_shop' and at >= p_since)
    when 'r_review'        then exists(select 1 from public.task_reviews where author_id = v_uid and created_at >= p_since)
    when 'r_first_comment' then exists(select 1 from public.task_comments c where c.author_id = v_uid and c.created_at >= p_since
                                         and not exists(select 1 from public.task_comments c2 where c2.task_id = c.task_id and c2.created_at < c.created_at))
    when 'r_schedule'      then exists(select 1 from public.quest_events where user_id = v_uid and key = 'r_schedule' and at >= p_since)
    -- 관리자가 관리자 페이지에서 직접 등록한 퀘스트(quest_defs 시드 없이 앱에서 생성됨)
    when 'r_item_present'  then exists(select 1 from public.notes where sender_id = v_uid and kind = 'gift' and created_at >= p_since)
    when 'r_purin_mic'     then exists(select 1 from public.user_items where user_id = v_uid and item_id = 'purin-mic' and status = 'used' and used_at >= p_since)
    else false end;
end $$;
