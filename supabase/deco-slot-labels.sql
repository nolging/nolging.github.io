-- 꾸미기 유형(슬롯) 값을 '상점에 보일 이름'으로 통일(코드→한글 표시명).
--  이후 deco_slot 값이 곧 상점/인벤토리에 표시되는 유형명이 된다.
--  (apply_avatar_deco 는 문자열이 같은 유형끼리만 배타 → 한글이어도 동일 동작)
--  적용: Supabase SQL Editor 에 그대로 실행. (deco-slot-column.sql 이후)

update public.store_items set deco_slot = '머리' where id like 'deco-%' and btrim(coalesce(deco_slot,'')) = 'head';
update public.store_items set deco_slot = '얼굴' where id like 'deco-%' and btrim(coalesce(deco_slot,'')) = 'face';
update public.store_items set deco_slot = '안경' where id like 'deco-%' and btrim(coalesce(deco_slot,'')) = 'glasses';

select id, name, deco_slot from public.store_items where id like 'deco-%' order by sort_order;
