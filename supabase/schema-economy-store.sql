-- =============================================================
--  Nolging · schema-economy-store.sql
--  (schema-v2.sql 정리 분리본 — 츄르 경제 / 상점·인벤토리 / 쪽지 기본 테이블 / 추억 리뷰)
--
--  schema-v2.sql(2767줄)가 그 자체로 거대한 단일 파일이 되어, 기존에 122개
--  개별 마이그레이션을 13개 도메인 번들 파일로 정리한 것과 같은 취지로
--  schema-v2.sql 본체도 도메인별로 쪼갠다. 이 파일은 그중
--  "츄르(coin) 경제 + 상점/인벤토리 기본 테이블 + 쪽지(notes) 기본 테이블 +
--   추억(완료된 약속) 리뷰 + 천체 망원경(리뷰 블러 해제)" 도메인만 담는다.
--
--  포함:
--    · task_reviews  (추억 리뷰: 별점 + 코멘트) 테이블/RLS + is_task_participant /
--      delete_review / group_review_counts / revert_to_appointment
--    · coin_ledger   (츄르 원장) 테이블/RLS + 리뷰 보상 중복방지 unique index +
--      my_coin_balance / admin_coin_balances
--    · notes         (쪽지) 기본 테이블/RLS — 선물·소원권 등에서 쓰는 컬럼 포함,
--      단 "쪽지 보내기/선물" RPC 는 제외(아래 참고)
--    · store_items   (상점 아이템 카탈로그) 기본 테이블/RLS + 초기 시드 데이터 +
--      premium/tier/public_since 컬럼
--    · user_items    (인벤토리) 기본 테이블/RLS + status 체크 제약 + deco_tf 컬럼
--    · item_gifts    (선물 기록) 기본 테이블/RLS
--    · review_reveals(천체 망원경으로 블러 해제한 리뷰 기록) 테이블/RLS + use_telescope
--    · purchase_item (상점 구매: 츄르 차감 + 인벤토리 적립)
--
--  schema-v2.sql 에는 이후 다른 122개 마이그레이션을 거치며 더 발전된 "구버전"
--  함수가 섞여 있었는데, 그 최신본은 이미 13개 도메인 번들에 들어있으므로
--  이 파일에는 절대 포함하지 않는다. 제외한 함수와 실제로 사는 곳:
--    · submit_review, task_reviews_view
--        → 관리자 리뷰 열람 바이패스가 추가된 최종본이 schema-admin.sql 에 있고,
--          알림 발송이 추가된 submit_review 최종본은 schema-notifications.sql 에 있다.
--    · admin_grant_coin        → schema-admin.sql
--    · store_items_set_public_since (+ 트리거) → schema-store.sql
--          (컬럼 public_since 자체는 이 파일에 포함. 트리거/함수만 schema-store.sql 소유)
--    · send_note                → schema-notes.sql (또는 schema-notifications.sql 계열)
--    · gift_item, gift_owned_item, send_gift_note → schema-notes.sql
--          (note_items 테이블 기반의 "여러 아이템 묶음 선물" 최종본이 여기 있다)
--    · claim_gift (이 파일 옛 버전, note.item_id/qty 단일모델) 도 함께 제외했다 —
--        schema-notes.sql 에서 note_items 테이블 기반의 claim_gift_item /
--        claim_gift_note 로 이름이 바뀌며 더 발전했다(다건 아이템 개별 수령 지원).
--        이름이 달라 사전 제외 목록엔 없었지만 완전히 대체된 구버전이라 제외했다.
--    · _quest_done               → 아직 다른 번들에 통합되지 않은 quests*.sql 계열
--        마이그레이션 소관(schema-quests.sql 쪽 후속 정리 대상). 이 파일 범위 밖.
--    · scratch_nyangpito 등 미니게임에서 coin_ledger/user_items 를 다루는 함수들
--        (omok/catchmind 베팅 정산 포함) → schema-realtime-games.sql
--
--  적용 순서: schema.sql 이후, 13개 도메인 번들과는 서로 독립적으로 실행 가능하다
--  (이 파일은 번들들에 의존하지 않음. 반대로 schema-admin.sql / schema-notifications.sql /
--  schema-notes.sql 의 일부 함수가 이 파일의 task_reviews / coin_ledger / notes /
--  store_items / user_items / item_gifts / is_task_participant 를 참조한다).
--  이미 운영 DB에는 반영되어 있으므로 실제 운영 DB에 다시 실행할 필요는 없다
--  (코드 정리 목적의 분리본 — 문서화 / 재해복구 / 신규 환경 구축용).
-- =============================================================

-- =============================================================
--  task_reviews : 추억(완료된 약속)에 대한 리뷰 (별점 + 코멘트)
--  - 약속 참여자(task_participants)만 작성 가능, 태스크당 1인 1리뷰
--  - 열람 게이팅: 본인이 리뷰를 작성한 참여자만 남의 코멘트를 볼 수 있음.
--    비참여자/미작성자에겐 코멘트를 서버에서 null 로 가려 전송(프론트 블러).
--  => 직접 SELECT 는 본인 것만 허용하고, 열람은 task_reviews_view RPC 로만
--     (최종본은 schema-admin.sql 에 있음).
-- =============================================================
create table if not exists public.task_reviews (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks(id)    on delete cascade,
  group_id   uuid not null references public.groups(id)   on delete cascade,
  author_id  uuid not null references public.profiles(id),
  rating     numeric(2,1) not null check (rating >= 0.5 and rating <= 5 and (rating * 2) = floor(rating * 2)), -- 0.5 단위
  comment    text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (task_id, author_id)
);
create index if not exists idx_task_reviews_task on public.task_reviews(task_id);
alter table public.task_reviews enable row level security;

-- 본인 리뷰만 직접 조회 가능(그 외 열람은 RPC 경유). 쓰기는 정의자 RPC 로만.
drop policy if exists trv_select on public.task_reviews;
create policy trv_select on public.task_reviews
  for select to authenticated
  using (author_id = auth.uid() or public.is_admin(auth.uid()));

-- 참여자 판정: task_participants 에 등록된 멤버만 (위시 작성자라도 미참여면 제외)
create or replace function public.is_task_participant(p_task_id uuid, p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.task_participants tp
    where tp.task_id = p_task_id and tp.user_id = p_uid
  );
$$;
grant execute on function public.is_task_participant(uuid, uuid) to authenticated;

-- 리뷰 삭제: 관리자만. (RLS 상 직접 삭제 불가 → 정의자 RPC 경유)
create or replace function public.delete_review(p_review_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception '관리자만 삭제할 수 있습니다.';
  end if;
  delete from public.task_reviews where id = p_review_id;
end;
$$;
grant execute on function public.delete_review(uuid) to authenticated;

-- 그룹 내 태스크별 리뷰 개수 (추억 '약속으로 되돌리기' 노출 여부 판단용).
-- task_reviews SELECT 는 본인/관리자만 허용되므로 정의자 RPC 로 집계. 그룹 멤버/관리자만.
create or replace function public.group_review_counts(p_group_id uuid)
returns table(task_id uuid, cnt integer)
language plpgsql security definer stable set search_path = public as $$
begin
  if not (public.is_group_member(p_group_id, auth.uid()) or public.is_admin(auth.uid())) then
    return;
  end if;
  return query
    select r.task_id, count(*)::int from public.task_reviews r
    where r.group_id = p_group_id group by r.task_id;
end;
$$;
grant execute on function public.group_review_counts(uuid) to authenticated;

-- 추억(완료된 약속)을 다시 약속(accepted)으로 되돌리기. 리뷰가 하나라도 있으면 불가.
create or replace function public.revert_to_appointment(p_task_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t public.tasks;
begin
  select * into t from public.tasks where id = p_task_id;
  if t.id is null then raise exception '존재하지 않는 항목입니다.'; end if;
  if not (public.is_group_member(t.group_id, auth.uid()) or public.is_admin(auth.uid())) then
    raise exception '권한이 없습니다.'; end if;
  if t.status <> 'done' then raise exception '추억만 약속으로 되돌릴 수 있습니다.'; end if;
  if exists (select 1 from public.task_reviews where task_id = p_task_id) then
    raise exception '리뷰가 있는 추억은 되돌릴 수 없어요.'; end if;
  update public.tasks set status = 'accepted', completed_at = null where id = p_task_id;
end;
$$;
grant execute on function public.revert_to_appointment(uuid) to authenticated;

-- =============================================================
--  coin(화폐) : UI 표기는 "츄르", 시스템 네이밍은 coin
--  - 원장(ledger) 기반: 모든 적립/사용은 coin_ledger 에 append.
--    잔액 = sum(delta). (적립 +, 사용 -)
--  - 직접 쓰기 불가(RLS): 조회만 본인/관리자. 지급/차감은 SECURITY DEFINER 함수 경유.
-- =============================================================
create table if not exists public.coin_ledger (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  delta      integer not null,                              -- 적립 +, 사용 -
  reason     text not null default '',                       -- 사유(표시용)
  ref_type   text,                                           -- 연관 도메인(task/review/admin 등)
  ref_id     uuid,                                           -- 연관 레코드 id
  created_by uuid references public.profiles(id),            -- 지급/차감 주체(관리자/시스템)
  created_at timestamptz not null default now()
);
create index if not exists idx_coin_ledger_user on public.coin_ledger(user_id, created_at desc);
alter table public.coin_ledger enable row level security;

-- 본인(또는 관리자) 원장만 조회. 직접 insert/update/delete 정책은 없음 → 정의자 RPC 로만 기록.
drop policy if exists coin_ledger_select on public.coin_ledger;
create policy coin_ledger_select on public.coin_ledger
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid()));

-- 리뷰 작성 보상 중복 지급 방지: (사용자, 태스크)당 review_reward 1건만.
-- submit_review 최종본(schema-notifications.sql)의 `on conflict do nothing` 이
-- 이 인덱스를 전제로 하므로 반드시 함께 있어야 한다.
create unique index if not exists uq_coin_review_reward
  on public.coin_ledger(user_id, ref_id) where ref_type = 'review_reward';

-- 내 잔액(츄르) 조회. 원장이 없으면 0.
create or replace function public.my_coin_balance()
returns integer language sql security definer stable set search_path = public as $$
  select coalesce(sum(delta), 0)::integer
  from public.coin_ledger where user_id = auth.uid();
$$;
grant execute on function public.my_coin_balance() to authenticated;

-- ---- 관리자: 사용자별 잔액 목록 (사용자 목록/지급 화면용) -----
create or replace function public.admin_coin_balances()
returns table (user_id uuid, balance integer)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception '관리자만 조회할 수 있습니다.'; end if;
  return query
    select p.id, coalesce(sum(cl.delta), 0)::integer
    from public.profiles p
    left join public.coin_ledger cl on cl.user_id = p.id
    group by p.id;
end;
$$;
grant execute on function public.admin_coin_balances() to authenticated;

-- =============================================================
--  쪽지 (notes) — 기본 테이블만
--  그룹 멤버끼리 주고받는 짧은 메모(최대 150자) + 선물/소원권/카세트/링크/비디오/
--  블루레이 등 여러 아이템 사용 흐름이 함께 쓰는 공용 테이블.
--  - 보낸/받는 사람의 "그룹 내 표시 닉네임"을 스냅샷으로 저장.
--  - 직접 INSERT 불가(RLS): 각 아이템 RPC(정의자) 로만 기록.
--  - 조회는 본인이 보낸/받은 것만.
--  ⚠️ "쪽지 보내기(send_note)"·"아이템 선물(gift_item/gift_owned_item/send_gift_note)"
--     RPC 는 이 파일에 없다 — 최종본이 schema-notes.sql 에 있다(선물은 note_items
--     테이블 기반 다건 모델로 더 발전했다). 여기서는 그 RPC 들이 공통으로 쓰는
--     기본 테이블/컬럼/RLS 만 소유한다.
-- =============================================================
create table if not exists public.notes (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references public.groups(id)   on delete cascade,
  sender_id     uuid not null references public.profiles(id) on delete cascade,
  recipient_id  uuid not null references public.profiles(id) on delete cascade,
  sender_name   text not null,   -- 보낸 사람의 그룹 내 닉네임(스냅샷)
  recipient_name text not null,  -- 받는 사람의 그룹 내 닉네임(스냅샷)
  sender_avatar    text,         -- 보낸 사람의 그룹 내 아바타(스냅샷)
  recipient_avatar text,         -- 받는 사람의 그룹 내 아바타(스냅샷)
  body          text not null,
  kind          text not null default 'note',  -- note | wish (소원권 사용)
  is_read       boolean not null default false,
  created_at    timestamptz not null default now()
);
-- 기존 설치 대상 컬럼 추가
alter table public.notes add column if not exists sender_avatar    text;
alter table public.notes add column if not exists recipient_avatar text;
alter table public.notes add column if not exists kind             text not null default 'note';
-- 커플 링/선물(쪽지함 수령형): 대상 아이템 + 수령/거절 여부
alter table public.notes add column if not exists item_id          text;
alter table public.notes add column if not exists item_name        text;   -- 선물 아이템명 스냅샷
alter table public.notes add column if not exists claimed          boolean not null default false;
alter table public.notes add column if not exists rejected         boolean not null default false;
alter table public.notes add column if not exists media_url        text;   -- 카세트 테이프: 음악 링크(유튜브/사운드클라우드)
alter table public.notes add column if not exists qty              integer not null default 1;  -- 선물 수량(여러 개를 쪽지 하나에 묶어 보낼 때)
create index if not exists idx_notes_recipient on public.notes(recipient_id, created_at desc);
create index if not exists idx_notes_sender    on public.notes(sender_id, created_at desc);
alter table public.notes enable row level security;

-- 본인이 보내거나 받은 쪽지만 조회. INSERT 는 각 아이템 RPC(정의자)만.
drop policy if exists notes_select on public.notes;
create policy notes_select on public.notes
  for select to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid());
-- 받은 쪽지 읽음 처리(본인 수신분만)
drop policy if exists notes_update on public.notes;
create policy notes_update on public.notes
  for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

-- =============================================================
--  상점 아이템 (store_items) — 단일 소스
--  이름/가격/이모지/설명/선물전용 을 DB 에서 관리. 프론트는 이 표를 조회.
--  조회는 로그인 사용자 전체, 편집(추가/수정/삭제)은 관리자만.
--  구매/선물 RPC 는 이 표에서 정가를 읽어 검증(클라이언트 값 신뢰 안 함).
-- =============================================================
create table if not exists public.store_items (
  id          text primary key,                 -- 'wish', 'couple-ring', ...
  name        text not null,
  price       integer not null check (price >= 0),
  emoji       text not null default '',          -- 임시 이미지(이모지). 추후 교체.
  description text not null default '',
  gift_only   boolean not null default false,    -- 구매 불가, 선물만 가능
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table public.store_items enable row level security;

drop policy if exists store_items_select on public.store_items;
create policy store_items_select on public.store_items
  for select to authenticated using (true);
-- 편집은 관리자만 (직접 편집/관리자 UI 대비)
drop policy if exists store_items_write on public.store_items;
create policy store_items_write on public.store_items
  for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- 초기 6종 시드. 이미 있으면 유지(관리자 편집 보존) → do nothing.
insert into public.store_items (id, name, price, emoji, description, gift_only, sort_order) values
  ('couple-ring', '커플 링',     5000, '💍', E'연인과 나눠 끼면 특별한 능력이 생겨요\n*프리미엄 기능 오픈',            false, 1),
  ('friend-ring', '우정 링',     3000, '🤝', E'친구들과 나눠 끼면 특별한 능력이 생겨요\n*프리미엄 기능 오픈',          false, 2),
  ('wish',        '소원권',      5,    '🎫', E'상대방이 소원을 적어서 나에게 보내면 무엇이든 들어줘야 해요\n*선물만 가능', true,  3),
  ('link',        '선물 상자',    3,    '🎁', 'URL을 담아 선물 상자로 보내요. 상자를 열면 링크로 이동해요.',          false, 4),
  ('cassette',    '카세트 테이프', 5,  '📼', '쪽지와 함께 음악을 선물해 보세요',                                     false, 5),
  ('video',       '비디오 테이프', 10, '📹', '쪽지와 함께 영상을 선물해 보세요',                                     false, 6),
  ('telescope',   '천체 망원경', 3,    '🔭', '블러 처리된 리뷰를 볼 수 있어요',                                      false, 9),
  ('eraser',      '지우개',      3,    '🧽', '내 이름을 지우고 쪽지를 보내 보세요',                                  false, 8),
  ('ledboard',    '전광판',      50, '📟', E'커플만 쓸 수 있는 프리미엄 전광판\n*24시간 동안 노출',                 false, 11)
on conflict (id) do nothing;

-- 프리미엄관: premium(프리미엄 전용 아이템) + tier(요구 링: couple/friend/NULL=아무 프리미엄)
alter table public.store_items add column if not exists premium boolean not null default false;
alter table public.store_items add column if not exists tier text;   -- 'couple' | 'friend' | null
-- 전광판 = 커플 전용 프리미엄
update public.store_items set premium = true, tier = 'couple' where id = 'ledboard';

-- "신상" 배지용: admin_only 로 숨겨 테스트하다 공개 전환한 시점(최초 1회만 기록).
-- 자동 기록 트리거(store_items_set_public_since)는 schema-store.sql 소유 — 컬럼만 여기서 추가.
alter table public.store_items add column if not exists public_since timestamptz;

-- 냥피또(스크래치 복권): 5츄르에 구매 → 긁으면 랜덤 츄르 당첨(꽝 포함). 일반 상점.
-- (사용 RPC scratch_nyangpito 는 schema-realtime-games.sql 소유)
insert into public.store_items (id, name, price, emoji, description, gift_only, sort_order) values
  ('nyangpito', '냥피또', 5, '🐱', E'동전으로 긁으면 츄르가 쏟아질지도?\n*긁어서 즉시 당첨 확인', false, 10)
on conflict (id) do nothing;
-- theme-heart 프리미엄 테마는 프리미엄관 마지막(12)

-- 그룹 테마(꾸미기): 프리미엄 그룹 전용. 적용하면 그룹 카드·상세에 테마 효과.
insert into public.store_items (id, name, price, emoji, description, gift_only, sort_order) values
  ('theme-heart', '하트 뿅뿅', 30, '💕', E'프리미엄 그룹에 적용하는 꾸미기 테마\n*그룹 카드·상세에 하트가 뿅뿅', false, 11)
on conflict (id) do nothing;
update public.store_items set premium = true, tier = null where id = 'theme-heart';

-- 블루레이: 비디오 테이프와 유사(쪽지+영상)하되 시네마 플레이어 + 인앱 PIP 지원.
insert into public.store_items (id, name, price, emoji, description, gift_only, sort_order) values
  ('bluray', '블루레이', 12, '💿', '쪽지와 함께 영상을 선물해요 (PIP 지원)', false, 7)
on conflict (id) do nothing;

-- 상점/인벤토리 노출 순서(sort_order) 확정 — 기존 행에도 반영(재실행 안전).
-- 커플 링, 우정 링, 소원권, 링크, 카세트, 비디오, 블루레이, 지우개, 천체 망원경, 냥피또
update public.store_items set sort_order = 1  where id = 'couple-ring';
update public.store_items set sort_order = 2  where id = 'friend-ring';
update public.store_items set sort_order = 3  where id = 'wish';
update public.store_items set sort_order = 4  where id = 'link';
update public.store_items set sort_order = 5  where id = 'cassette';
update public.store_items set sort_order = 6  where id = 'video';
update public.store_items set sort_order = 7  where id = 'bluray';
update public.store_items set sort_order = 8  where id = 'eraser';
update public.store_items set sort_order = 9  where id = 'telescope';
update public.store_items set sort_order = 10 where id = 'nyangpito';
update public.store_items set sort_order = 11 where id = 'ledboard';
update public.store_items set sort_order = 12 where id = 'theme-heart';

-- =============================================================
--  인벤토리 (user_items) — 내가 구매/선물받아 보유한 아이템
--  구매(purchase) 또는 선물(gift)로 획득. 선물은 준 사람 정보를 스냅샷.
--  직접 INSERT 불가(RLS): 구매/선물/사용 RPC(정의자)만 기록. 조회는 본인 것만.
-- =============================================================
create table if not exists public.user_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,  -- 소유자
  item_id      text not null,
  item_name    text not null,
  source       text not null check (source in ('purchase', 'gift')),
  from_user_id uuid references public.profiles(id) on delete set null,          -- 선물한 사람(구매는 null)
  from_name    text,                                                            -- 선물한 사람 표시명(스냅샷)
  from_avatar  text,                                                            -- 선물한 사람 아바타(스냅샷)
  group_id     uuid references public.groups(id) on delete set null,            -- 선물 맥락 그룹
  status       text not null default 'active' check (status in ('active', 'used', 'pending')),
  used_at      timestamptz,
  created_at   timestamptz not null default now(),
  deco_tf      jsonb                                                             -- 프로필 꾸미기 조정값 { s, x, y, r }
);
-- 기존 설치 대상: 커플 링 '수락 대기(pending)' 상태 허용하도록 제약 갱신
alter table public.user_items drop constraint if exists user_items_status_check;
alter table public.user_items add  constraint user_items_status_check
  check (status in ('active', 'used', 'pending'));
-- 기존 설치 대상: 프로필 꾸미기 위치·크기·각도 조정값 (deco-transform.sql 참고)
alter table public.user_items add column if not exists deco_tf jsonb;
create index if not exists idx_user_items_owner on public.user_items(user_id, status, created_at desc);
alter table public.user_items enable row level security;

drop policy if exists user_items_select on public.user_items;
create policy user_items_select on public.user_items
  for select to authenticated using (user_id = auth.uid());

-- =============================================================
--  상점 선물 (item_gifts) — 기본 테이블만
--  같은 그룹의 다른 멤버에게 아이템을 선물한 기록(원장). 값은 보내는 사람 츄르에서 차감.
--  ⚠️ "아이템 선물" RPC(gift_item/gift_owned_item/send_gift_note)는 schema-notes.sql 에
--     있다. 여기서는 그 RPC 들이 공통으로 쓰는 기본 테이블/RLS 만 소유한다.
-- =============================================================
create table if not exists public.item_gifts (
  id             uuid primary key default gen_random_uuid(),
  group_id       uuid not null references public.groups(id)   on delete cascade,
  sender_id      uuid not null references public.profiles(id) on delete cascade,
  recipient_id   uuid not null references public.profiles(id) on delete cascade,
  item_id        text not null,
  item_name      text not null,
  sender_name    text not null,   -- 보낸 사람의 그룹 내 닉네임(스냅샷)
  recipient_name text not null,   -- 받는 사람의 그룹 내 닉네임(스냅샷)
  created_at     timestamptz not null default now()
);
create index if not exists idx_item_gifts_recipient on public.item_gifts(recipient_id, created_at desc);
alter table public.item_gifts enable row level security;

-- 본인이 주고받은 선물만 조회. INSERT 는 gift_item 계열 RPC(정의자, schema-notes.sql)만.
drop policy if exists item_gifts_select on public.item_gifts;
create policy item_gifts_select on public.item_gifts
  for select to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid());

-- =============================================================
--  천체 망원경: 블러 처리된(남이 작성한) 추억 리뷰를 열람. 아이템 1개 소모.
--  review_reveals 에 기록되면 task_reviews_view(schema-admin.sql) 에서 코멘트가 공개된다.
-- =============================================================
create table if not exists public.review_reveals (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  task_id    uuid not null references public.tasks(id)    on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, task_id)
);
alter table public.review_reveals enable row level security;
drop policy if exists rr_select on public.review_reveals;
create policy rr_select on public.review_reveals
  for select to authenticated using (user_id = auth.uid());

-- =============================================================
--  상점 구매 (츄르 차감)
--  정가/선물전용은 store_items 에서 읽어 검증. 성공 시 coin_ledger 에 -가격 기록.
-- =============================================================
drop function if exists public.purchase_item(text);
create or replace function public.purchase_item(p_item_id text, p_qty integer default 1)
returns integer language plpgsql security definer set search_path = public as $$
declare it public.store_items; v_balance integer; v_qty integer; v_total integer; i integer;
begin
  v_qty := greatest(1, coalesce(p_qty, 1));
  select * into it from public.store_items where id = p_item_id and is_active;
  if it.id is null then raise exception '존재하지 않는 아이템입니다.'; end if;
  if it.gift_only then raise exception '선물만 가능한 아이템입니다.'; end if;
  -- 커플 링은 1개만 보유 가능
  if p_item_id = 'couple-ring' then
    if v_qty > 1 then raise exception '커플 링은 한 개만 구매할 수 있어요.'; end if;
    if exists (select 1 from public.user_items where user_id = auth.uid() and item_id = 'couple-ring') then
      raise exception '이미 커플 링을 보유하고 있어요.'; end if;
  end if;
  -- 전광판은 커플 링을 장착한 커플만 구매 가능
  if p_item_id = 'ledboard' and not exists (
       select 1 from public.user_items where user_id = auth.uid() and item_id = 'couple-ring' and status = 'used') then
    raise exception '커플 링을 장착한 커플만 구매할 수 있어요.'; end if;

  v_total := it.price * v_qty;
  select coalesce(sum(delta), 0)::integer into v_balance
    from public.coin_ledger where user_id = auth.uid();
  if v_balance < v_total then raise exception '츄르가 부족해요.'; end if;

  insert into public.coin_ledger(user_id, delta, reason, ref_type)
    values (auth.uid(), -v_total, it.name || ' 구매' || case when v_qty > 1 then ' ×' || v_qty else '' end, 'purchase');
  -- 인벤토리에 수량만큼 추가
  for i in 1..v_qty loop
    insert into public.user_items(user_id, item_id, item_name, source)
      values (auth.uid(), it.id, it.name, 'purchase');
  end loop;

  return v_balance - v_total;
end;
$$;
grant execute on function public.purchase_item(text, integer) to authenticated;

-- 천체 망원경 사용: 남이 작성한 리뷰 코멘트를 review_reveals 에 기록해 블러 해제.
create or replace function public.use_telescope(p_task_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.user_items; v_gid uuid;
begin
  select group_id into v_gid from public.tasks where id = p_task_id;
  if v_gid is null then raise exception '존재하지 않는 항목입니다.'; end if;
  if not public.is_group_member(v_gid, auth.uid()) then raise exception '그룹 멤버만 사용할 수 있습니다.'; end if;

  -- 이미 볼 수 있으면 소모 방지
  if exists (select 1 from public.review_reveals where user_id = auth.uid() and task_id = p_task_id) then
    raise exception '이미 리뷰를 볼 수 있어요.'; end if;
  if public.is_task_participant(p_task_id, auth.uid())
     and exists (select 1 from public.task_reviews where task_id = p_task_id and author_id = auth.uid()) then
    raise exception '이미 리뷰를 볼 수 있어요.'; end if;
  -- 남이 작성한 리뷰가 있어야 사용 가능
  if not exists (select 1 from public.task_reviews where task_id = p_task_id and author_id <> auth.uid()) then
    raise exception '아직 볼 수 있는 리뷰가 없어요.'; end if;

  select * into v_item from public.user_items
   where user_id = auth.uid() and item_id = 'telescope' and status = 'active'
   order by created_at asc limit 1;
  if v_item.id is null then raise exception '사용할 수 있는 천체 망원경이 없습니다.'; end if;
  update public.user_items set status = 'used', used_at = now() where id = v_item.id;

  insert into public.review_reveals(user_id, task_id) values (auth.uid(), p_task_id)
    on conflict do nothing;
end;
$$;
grant execute on function public.use_telescope(uuid) to authenticated;
