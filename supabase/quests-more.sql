-- =============================================================
--  랜덤 퀘스트 추가분 (10종) — 완료 판정 + 정의(quest_defs)
--  · quests.sql / quests-v2.sql 적용 후 실행.
--  · 방문/접촉형(데이트·뽀뽀·프리미엄상점·일정)은 기존 데이터가 없어
--    quest_events 에 이벤트를 기록해 판정한다(프런트에서 touch_quest 호출).
--  · 그 외는 기존 테이블(tasks/notes/task_reviews/task_comments/group_drawings/user_items)로 판정.
-- =============================================================

-- 방문/행동 이벤트 기록 (키별 마지막 발생 시각)
create table if not exists public.quest_events (
  user_id uuid not null references public.profiles(id) on delete cascade,
  key     text not null,
  at      timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.quest_events enable row level security;
drop policy if exists qe_self on public.quest_events;
create policy qe_self on public.quest_events for select to authenticated using (user_id = auth.uid());

create or replace function public.touch_quest(p_key text)
returns void language sql security definer set search_path = public as $$
  insert into public.quest_events(user_id, key, at) values (auth.uid(), p_key, now())
  on conflict (user_id, key) do update set at = now();
$$;
grant execute on function public.touch_quest(text) to authenticated;

-- 완료 판정(기존 키 + 추가 키). p_since 이후의 행동 기준.
create or replace function public._quest_done(p_key text, p_since timestamptz)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  return case p_key
    when 'attend'      then true
    when 'visit'       then exists(select 1 from public.profiles where id = v_uid and last_group_visit_at >= p_since)
    when 'note'        then exists(select 1 from public.notes where sender_id = v_uid and created_at >= p_since)
    when 'r_wish'      then exists(select 1 from public.tasks where created_by = v_uid and created_at >= p_since)
    when 'r_item_note' then exists(select 1 from public.notes where sender_id = v_uid and created_at >= p_since
                                     and (item_id is not null or kind in ('cassette','video','bluray','link','gift')))
    when 'r_nyangpito' then exists(select 1 from public.coin_ledger where user_id = v_uid and ref_type = 'nyangpito' and created_at >= p_since)
    when 'r_buy'       then exists(select 1 from public.coin_ledger where user_id = v_uid and ref_type = 'purchase' and created_at >= p_since)
    when 'r_spend10'   then coalesce((select -sum(delta) from public.coin_ledger
                                        where user_id = v_uid and delta < 0 and created_at >= p_since), 0) >= 10
    when 'r_game_win'  then exists(select 1 from public.coin_ledger where user_id = v_uid and delta > 0
                                     and ref_type in ('omok','catchmind','rps') and created_at >= p_since)
    when 'r_poke'      then exists(select 1 from public.notifications where actor_id = v_uid and type = 'poke' and created_at >= p_since)
    -- 추가분
    when 'r_date'          then exists(select 1 from public.quest_events where user_id = v_uid and key = 'r_date' and at >= p_since)
    when 'r_doodle'        then exists(select 1 from public.group_drawings where author = v_uid and created_at >= p_since)
    when 'r_kiss'          then exists(select 1 from public.quest_events where user_id = v_uid and key = 'r_kiss' and at >= p_since)
    when 'r_accept'        then exists(select 1 from public.tasks where assignee_id = v_uid and accepted_at >= p_since)
    when 'r_waterbomb'     then exists(select 1 from public.notes where sender_id = v_uid and timer_seconds is not null and created_at >= p_since)
    when 'r_deco'          then exists(select 1 from public.user_items where user_id = v_uid and item_id like 'deco-%' and status = 'used' and used_at >= p_since)
    when 'r_premium_shop'  then exists(select 1 from public.quest_events where user_id = v_uid and key = 'r_premium_shop' and at >= p_since)
    when 'r_review'        then exists(select 1 from public.task_reviews where author_id = v_uid and created_at >= p_since)
    when 'r_first_comment' then exists(select 1 from public.task_comments c where c.author_id = v_uid and c.created_at >= p_since
                                         and not exists(select 1 from public.task_comments c2 where c2.task_id = c.task_id and c2.created_at < c.created_at))
    when 'r_schedule'      then exists(select 1 from public.quest_events where user_id = v_uid and key = 'r_schedule' and at >= p_since)
    else false end;
end $$;

-- 정의(quest_defs) 시드. 이미 있으면 유지.
insert into public.quest_defs (id, title, body, emoji, reward, grade, active, sort_order) values
  ('r_date',         '데이트하러 가기', '보고 싶어서 괜히 기웃기웃',        '💖', 2, 'vvip',    true, 10),
  ('r_doodle',       '낙서 끄적거리기', '텔레파시 보내면 누군가 나타날지도?','✏️', 3, 'premium', true, 11),
  ('r_kiss',         '쪽 쪽 뽀갈',      '박력 있게 벽치기 쾅',              '💋', 5, 'vvip',    true, 12),
  ('r_accept',       '놀기 신청',       '함께하는 일정을 만들어 봐요',      '📆', 3, 'all',     true, 13),
  ('r_waterbomb',    '워터밤 즐기기',   '물풍선 폭탄을 던져 볼까요?',        '💦', 7, 'all',     true, 14),
  ('r_deco',         '오늘 느낌 꾸꾸꾸', '프로필 꾸미기로 단장해 봐요',      '✨', 3, 'premium', true, 15),
  ('r_premium_shop', '프리미엄 상점 입장','프리미엄 등급의 특권을 누려요',   '💍', 2, 'premium', true, 16),
  ('r_review',       '리뷰 작성하기',   '함께한 추억에 리뷰를 남겨 주세요', '⭐️', 3, 'all',     true, 17),
  ('r_first_comment','첫 댓글 달기',    '무플방지위원회에서 나왔습니다',     '💬', 3, 'all',     true, 18),
  ('r_schedule',     '일정 확인하기',   '이번 달 일정을 확인해 보세요',      '🗓', 2, 'all',     true, 19)
on conflict (id) do nothing;
