-- =============================================================
--  상점 아이템 "신상" 배지용 — 유저에게 실제로 공개된(admin_only 해제된) 시점 기록.
--  · admin_only 로 숨겨 테스트하다가 나중에 공개 전환하는 아이템이 있어(멋쟁이 토마토 등),
--    "관리자가 등록한 시간"(created_at)이 아니라 "테스트 마치고 공개된 시간"이 필요하다.
--  · public_since 는 admin_only 가 false 인 채로 처음 저장되는 순간 한 번만 채워지고,
--    이후에는 값이 있으면 트리거가 건드리지 않는다(최초 공개 시점 고정).
--  · 이미 배포돼 있던(=이미 공개 상태인) 기존 행은 created_at 을 공개 시점으로 간주해 백필한다.
-- =============================================================

alter table public.store_items add column if not exists public_since timestamptz;

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

update public.store_items
  set public_since = created_at
  where public_since is null and not coalesce(admin_only, false);
