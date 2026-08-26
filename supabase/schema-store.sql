-- =============================================================
--  schema-store.sql — 상점/카탈로그 관리자 메타데이터 통합본
--
--  아래 4개의 개별 SQL 파일을 하나로 합친 것입니다(저장소 정리 작업):
--    · store-item-category.sql       — 아이템 카테고리 필드
--    · store-item-images.sql         — 아이템 썸네일 이미지(SVG)/배경색
--    · store-item-public-since.sql   — "공개된 시점" 기록(신상 배지 기준)
--    · store-new-badge.sql           — 하단 탭 "신상" 점 표시(상점 확인 여부)
--
--  schema.sql + schema-v2.sql 적용 이후, 새 환경에 그대로 실행하면 됩니다.
--  이미 운영 DB 에는 원본 파일들로 순차 적용되어 있으므로, 이 파일을
--  운영 DB 에 다시 실행할 필요는 없습니다. 문서화 / 재해복구 / 신규
--  환경 구축용으로 존재합니다.
-- =============================================================


-- -------------------------------------------------------------
-- 1. store_items 테이블 컬럼 추가 (원본 파일 순서대로, 모두 additive)
-- -------------------------------------------------------------

-- 상점 아이템 카테고리를 관리자에서 직접 지정.
--  · category 값: 'special' | 'feature' | 'avatar' | 'theme' | 'etc' (null 이면 기존 ID 규칙 자동 분류)
--  · 정렬(sort_order)은 관리자 목록의 ▲▼ 로 섹션 내에서 조정(숫자 직접 입력 없음).
alter table public.store_items add column if not exists category text;

-- 상점 아이템 이미지 업로드/배경색 지원.
--  · image_svg : 업로드한 SVG 원본(문자열). 클라이언트는 <img src="data:image/svg+xml,..."> 로 렌더(스크립트 실행 안 됨).
--  · image_bg  : 썸네일 배경색(CSS color/gradient). 비어 있으면 기존 기본 배경 사용.
-- 관리자 화면(아이템 추가/수정)에서 파일을 올리면 파일명과 무관하게 아이템 ID 기준으로 이 컬럼에 저장된다.
-- 쓰기 권한은 기존 store_items RLS(관리자만)를 그대로 따른다. 새 정책 추가 불필요.
alter table public.store_items add column if not exists image_svg text;
alter table public.store_items add column if not exists image_bg  text;

-- 상점 아이템 "신상" 배지용 — 유저에게 실제로 공개된(admin_only 해제된) 시점 기록.
--  · admin_only 로 숨겨 테스트하다가 나중에 공개 전환하는 아이템이 있어(멋쟁이 토마토 등),
--    "관리자가 등록한 시간"(created_at)이 아니라 "테스트 마치고 공개된 시간"이 필요하다.
--  · public_since 는 admin_only 가 false 인 채로 처음 저장되는 순간 한 번만 채워지고,
--    이후에는 값이 있으면 트리거가 건드리지 않는다(최초 공개 시점 고정).
--  · 이미 배포돼 있던(=이미 공개 상태인) 기존 행은 created_at 을 공개 시점으로 간주해 백필한다.
alter table public.store_items add column if not exists public_since timestamptz;


-- -------------------------------------------------------------
-- 2. public_since 자동 기록 트리거
-- -------------------------------------------------------------

create or replace function public.store_items_set_public_since()
returns trigger language plpgsql as $$
begin
  if not coalesce(new.admin_only, false) and new.public_since is null then
    new.public_since := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_store_items_public_since on public.store_items;
create trigger trg_store_items_public_since
  before insert or update on public.store_items
  for each row execute function public.store_items_set_public_since();

-- 이미 배포돼 있던(=이미 공개 상태인) 기존 행 백필.
update public.store_items
  set public_since = created_at
  where public_since is null and not coalesce(admin_only, false);


-- -------------------------------------------------------------
-- 3. store_seen — 상점 탭 "신상 확인" 여부 기록
-- -------------------------------------------------------------
--  상점에 신상이 뜨면 하단 탭 "상점" 메뉴에 보라색 점을 찍는다. 일반/프리미엄
--  상점 중 어느 쪽이든 5일 이내 공개(public_since, Store.jsx 의 "신상" 배지와
--  동일 기준)된 아이템이 있고 아직 그 탭을 확인 안 했으면 뜬다. 두 상점 다
--  신상이 있으면 둘 다 확인해야(각 탭에 한 번씩 들어가야) 점이 없어진다.

create table if not exists public.store_seen (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  general_at timestamptz,
  premium_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.store_seen enable row level security;

drop policy if exists store_seen_select on public.store_seen;
create policy store_seen_select on public.store_seen
  for select to authenticated using (user_id = auth.uid());
drop policy if exists store_seen_insert on public.store_seen;
create policy store_seen_insert on public.store_seen
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists store_seen_update on public.store_seen;
create policy store_seen_update on public.store_seen
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());


-- -------------------------------------------------------------
-- 4. 함수
-- -------------------------------------------------------------

-- 일반/프리미엄 중 하나라도 "5일 이내 공개 + 아직 그 탭 확인 안 함" 인 아이템이 있으면 true.
create or replace function public.has_new_store_items()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.store_items si
    left join public.store_seen ss on ss.user_id = auth.uid()
    where si.is_active
      and si.public_since is not null
      and si.public_since > now() - interval '5 days'
      and si.public_since > coalesce(
        case when si.premium then ss.premium_at else ss.general_at end,
        '-infinity'::timestamptz
      )
  );
$$;

-- 일반/프리미엄 탭에 들어가면 그 탭만 "확인함"으로 기록(다른 탭은 그대로 둔다).
create or replace function public.mark_store_seen(p_kind text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_kind not in ('general', 'premium') then raise exception '잘못된 상점 구분입니다.'; end if;
  insert into public.store_seen(user_id, general_at, premium_at)
    values (auth.uid(),
      case when p_kind = 'general' then now() end,
      case when p_kind = 'premium' then now() end)
  on conflict (user_id) do update
    set general_at = case when p_kind = 'general' then now() else public.store_seen.general_at end,
        premium_at = case when p_kind = 'premium' then now() else public.store_seen.premium_at end,
        updated_at = now();
end;
$$;


-- -------------------------------------------------------------
-- 5. 권한 부여
-- -------------------------------------------------------------

grant execute on function public.has_new_store_items() to authenticated;
grant execute on function public.mark_store_seen(text) to authenticated;

notify pgrst, 'reload schema';
