-- 프로필 꾸미기(deco) 아이템의 '유형(슬롯)'을 store_items 컬럼으로 관리 → 관리자 페이지에서 설정.
--  · 슬롯은 자유 문자열(head/face 외 커스텀 추가 가능).
--  · apply_avatar_deco 는 deco_slot() 로 판단하므로, 같은 슬롯끼리만 자동 해제(=중복 장착 불가),
--    다른 슬롯은 동시 장착 가능. (백엔드 변경만으로 유형별 배타 동작)
--  적용: Supabase SQL Editor 에 그대로 실행.

alter table public.store_items add column if not exists deco_slot text;

-- 기존 아이템 슬롯 백필(현재 하드코딩 규칙과 동일)
update public.store_items set deco_slot = 'face'
  where id in ('deco-blush','deco-anger','deco-pixel-shades','deco-alien-shades','deco-bandage','deco-gum','deco-heart-shades')
    and coalesce(nullif(btrim(deco_slot), ''), '') = '';
update public.store_items set deco_slot = 'head'
  where id like 'deco-%' and coalesce(nullif(btrim(deco_slot), ''), '') = '';

-- deco_slot(item): store_items.deco_slot 우선, 없으면 접두사 규칙(deco-*→head) 폴백.
--  (컬럼을 읽으므로 immutable → stable 로 변경)
create or replace function public.deco_slot(p_item_id text)
returns text language sql stable set search_path = public as $$
  select coalesce(
    (select nullif(btrim(s.deco_slot), '') from public.store_items s where s.id = p_item_id),
    case when p_item_id like 'deco-%' then 'head' else null end
  );
$$;

-- 확인
select id, name, deco_slot, public.deco_slot(id) as effective_slot
  from public.store_items where id like 'deco-%' order by sort_order;
