-- =============================================================
--  퍼즐 진행 시간(누적) + 조각 '건드림' 표시
--  · elapsed_ms: 퍼즐판에 사람이 있는 동안만 누적되는 진행 시간(ms).
--    접속자 중 대표 1명이 주기적으로 갱신하고, 모두 나가면 갱신이 멈춰 시간도 멈춘다.
--    (재입장하면 저장된 값부터 이어서 흐름)
--  · positions 의 각 조각에는 m:1(누가 옮긴 조각) 플래그가 추가로 들어간다 → 정렬 시
--    건드린 조각은 그대로 두고, 안 건드린 조각만 빈 공간에 정리하기 위함. (스키마 변경 없음)
--  적용: Supabase SQL Editor 에 그대로 실행.
-- =============================================================

alter table public.group_puzzles add column if not exists elapsed_ms bigint not null default 0;

comment on column public.group_puzzles.elapsed_ms is
  '퍼즐판에 사람이 있는 동안만 누적되는 진행 시간(ms). 모두 나가면 멈춤.';
