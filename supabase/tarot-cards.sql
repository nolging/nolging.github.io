-- =============================================================
--  타로 카페 — 카드 데이터를 DB 로 이관 (tarot_cards)
--   · 지금까지 프론트(src/lib/tarot.js MAJOR)에 하드코딩돼 있던 22장을 테이블로.
--   · image_url: 나중에 카드 그림을 이미지 파일로 올려서 쓰기 위한 칸(지금은 null → 이모지 폴백).
--   · sort_order: 덱 인덱스(0~21). 양쪽 기기가 같은 순서로 불러와야 궁합 인덱스가 맞다.
--   · 조회는 로그인 사용자 누구나(게임 콘텐츠), 수정/추가/삭제는 관리자만(RLS).
--  적용: Supabase SQL Editor 에 그대로 실행.
-- =============================================================

create table if not exists public.tarot_cards (
  id          text primary key,                 -- 'major-0' ... 'major-21' (안정적 키)
  sort_order  int  not null,                     -- 덱 인덱스(0~21)
  rank        text not null,                     -- '0','I',... (카드 번호 표기)
  name        text not null,                     -- 한국어 이름
  name_en     text,
  emoji       text,                              -- 그림(이모지) — 이미지 없을 때 폴백
  image_url   text,                              -- 카드 그림 이미지 URL(선택, 나중에 업로드)
  element     text not null check (element in ('fire', 'earth', 'air', 'water')),
  love        int  not null check (love between 0 and 10),
  meaning_up  text not null,                     -- 정방향 해설
  meaning_rev text not null,                     -- 역방향 해설
  is_active   boolean not null default true,
  updated_at  timestamptz not null default now()
);
create index if not exists idx_tarot_cards_order on public.tarot_cards(sort_order);

alter table public.tarot_cards enable row level security;
-- 조회: 로그인 사용자 누구나
drop policy if exists tarot_cards_select on public.tarot_cards;
create policy tarot_cards_select on public.tarot_cards for select to authenticated using (true);
-- 쓰기(추가/수정/삭제): 관리자만
drop policy if exists tarot_cards_admin on public.tarot_cards;
create policy tarot_cards_admin on public.tarot_cards for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- updated_at 자동 갱신
create or replace function public.tarot_cards_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists trg_tarot_cards_touch on public.tarot_cards;
create trigger trg_tarot_cards_touch before update on public.tarot_cards
  for each row execute function public.tarot_cards_touch();

-- 시드(22장). 재실행 시 이름/해설/원소/점수는 갱신하되, 관리자가 올린 image_url 은 보존.
insert into public.tarot_cards
  (id, sort_order, rank, name, name_en, emoji, image_url, element, love, meaning_up, meaning_rev, is_active)
values
  ('major-0', 0, '0', '바보', 'The Fool', '🃏', null, 'air', 6, '겁내지 않고 첫걸음을 떼는 날. 재고 따지기보다 마음이 가는 대로 움직여도 좋아요.', '설레는 마음이 앞서 준비가 덜 됐어요. 한 박자만 늦춰도 훨씬 편해집니다.', true),
  ('major-1', 1, 'I', '마법사', 'The Magician', '✨', null, 'air', 7, '마음먹은 걸 이룰 재료가 이미 손에 있어요. 먼저 말을 꺼내는 쪽이 흐름을 잡습니다.', '말과 마음이 조금 어긋나요. 꾸미지 않은 한 문장이 제일 잘 통합니다.', true),
  ('major-2', 2, 'II', '여사제', 'The High Priestess', '🌙', null, 'water', 5, '말보다 눈치로 아는 날. 조용히 곁에 있어 주는 것만으로 충분해요.', '혼자 삼키고 있는 말이 있죠. 감춘 만큼 오해도 같이 자랍니다.', true),
  ('major-3', 3, 'III', '여황제', 'The Empress', '🌷', null, 'earth', 9, '넉넉하게 품어 주는 시기. 챙겨 주는 마음이 그대로 되돌아옵니다.', '아끼는 마음이 지나쳐 참견이 될 수 있어요. 조금은 내버려 두세요.', true),
  ('major-4', 4, 'IV', '황제', 'The Emperor', '👑', null, 'fire', 6, '기준을 세우면 편해지는 날. 약속을 정해 두면 다툴 일이 줄어요.', '내 방식만 옳다고 밀어붙이는 중. 한 발 물러서면 상대가 다가옵니다.', true),
  ('major-5', 5, 'V', '교황', 'The Hierophant', '🕊️', null, 'earth', 7, '둘만의 규칙이 단단해지는 시기. 오래 가는 관계는 이런 데서 만들어져요.', '늘 하던 대로가 답답해졌어요. 익숙한 코스를 한 번 벗어나 보세요.', true),
  ('major-6', 6, 'VI', '연인', 'The Lovers', '💞', null, 'air', 10, '서로를 고르는 날. 망설이던 마음에 확신이 서고, 함께 있는 게 답이 됩니다.', '둘 중 하나는 결정을 미루고 있어요. 미룬 만큼 마음이 식습니다.', true),
  ('major-7', 7, 'VII', '전차', 'The Chariot', '🏇', null, 'water', 6, '같은 방향으로 힘껏 나아가는 날. 미뤄 둔 계획을 오늘 밀어붙여도 좋아요.', '각자 다른 데를 보고 달리는 중. 속도를 맞추는 게 먼저입니다.', true),
  ('major-8', 8, 'VIII', '힘', 'Strength', '🦁', null, 'fire', 8, '부드럽게 이기는 날. 큰 소리 대신 다정함이 상대를 움직입니다.', '참다 참다 터질 것 같아요. 작게 자주 말하는 편이 낫습니다.', true),
  ('major-9', 9, 'IX', '은둔자', 'The Hermit', '🕯️', null, 'earth', 3, '혼자 정리할 시간이 필요해요. 거리를 두는 게 멀어지는 건 아닙니다.', '너무 오래 혼자 있었어요. 먼저 연락하는 쪽이 훨씬 가벼워집니다.', true),
  ('major-10', 10, 'X', '운명의 수레바퀴', 'Wheel of Fortune', '🎡', null, 'fire', 7, '흐름이 바뀌는 날. 뜻밖의 연락이나 우연이 관계를 한 칸 옮겨 놓습니다.', '같은 자리를 도는 느낌. 반복되는 패턴 하나만 바꿔 보세요.', true),
  ('major-11', 11, 'XI', '정의', 'Justice', '⚖️', null, 'air', 6, '공평하게 나누면 풀리는 날. 미뤄 둔 이야기를 담담하게 꺼내 보세요.', '한쪽만 애쓰고 있어요. 기울어진 걸 알아채는 게 시작입니다.', true),
  ('major-12', 12, 'XII', '매달린 사람', 'The Hanged Man', '🙃', null, 'water', 4, '멈춰서 다르게 보는 날. 서둘러 답을 내지 않아도 괜찮아요.', '괜한 고집으로 시간을 쓰고 있어요. 놓아 주면 바로 편해집니다.', true),
  ('major-13', 13, 'XIII', '죽음', 'Death', '🦋', null, 'water', 4, '끝나는 게 아니라 바뀌는 거예요. 낡은 방식 하나를 오늘 정리해 보세요.', '끝난 걸 붙잡고 있어요. 미련은 미련일 뿐, 새 계절이 기다립니다.', true),
  ('major-14', 14, 'XIV', '절제', 'Temperance', '🍶', null, 'fire', 8, '적당한 온도가 오래 갑니다. 서로의 속도를 섞어 딱 좋은 지점을 찾는 날.', '한쪽으로 쏠렸어요. 너무 뜨겁거나 너무 미지근합니다.', true),
  ('major-15', 15, 'XV', '악마', 'The Devil', '😈', null, 'earth', 4, '끊기 어려운 끌림. 달콤하지만 어디까지인지 선은 정해 두세요.', '묶여 있던 데서 벗어나는 중. 놓는 순간 숨이 트입니다.', true),
  ('major-16', 16, 'XVI', '탑', 'The Tower', '🗼', null, 'fire', 2, '갑작스러운 흔들림. 무너지는 건 대체로 무너져야 했던 것들입니다.', '터질 뻔한 걸 겨우 넘겼어요. 미룬 문제는 아직 그대로 있습니다.', true),
  ('major-17', 17, 'XVII', '별', 'The Star', '⭐', null, 'air', 9, '조용히 희망이 차오르는 날. 바라던 말이 오늘 들려올 수 있어요.', '기대가 커서 실망도 커졌어요. 눈높이를 조금 낮추면 다시 반짝입니다.', true),
  ('major-18', 18, 'XVIII', '달', 'The Moon', '🌕', null, 'water', 4, '안개 속을 걷는 날. 확실하지 않은 건 확실해질 때까지 판단을 아껴요.', '오해가 걷히는 중. 물어보면 별일 아니었다는 걸 알게 됩니다.', true),
  ('major-19', 19, 'XIX', '태양', 'The Sun', '☀️', null, 'fire', 10, '숨길 것 없이 환한 날. 웃는 얼굴 하나로 다 해결되는 시기입니다.', '억지로 밝은 척하고 있어요. 안 괜찮으면 안 괜찮다고 해도 됩니다.', true),
  ('major-20', 20, 'XX', '심판', 'Judgement', '📯', null, 'fire', 6, '결론을 낼 때가 됐어요. 지나온 걸 돌아보면 답이 이미 나와 있습니다.', '스스로를 너무 몰아세우고 있어요. 판결은 조금 미뤄도 괜찮습니다.', true),
  ('major-21', 21, 'XXI', '세계', 'The World', '🌍', null, 'earth', 9, '한 바퀴를 잘 돌았어요. 함께한 시간이 제자리를 찾는 날입니다.', '마지막 한 걸음이 남았어요. 거의 다 왔으니 마무리만 하면 됩니다.', true)
on conflict (id) do update set
  sort_order = excluded.sort_order, rank = excluded.rank, name = excluded.name, name_en = excluded.name_en,
  emoji = excluded.emoji, element = excluded.element, love = excluded.love,
  meaning_up = excluded.meaning_up, meaning_rev = excluded.meaning_rev, is_active = excluded.is_active;
  -- image_url 은 의도적으로 덮어쓰지 않음(관리자가 올린 그림 유지)

-- 확인
select sort_order, rank, name, element, love, (image_url is not null) as has_image
  from public.tarot_cards order by sort_order;
