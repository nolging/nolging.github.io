-- 프리미엄 상점(프로필 꾸미기/머리 장식): 멋쟁이 토마토. 관리자 전용(테스트 후 정식 오픈은
-- admin_only = false 로 갱신). deco-* 접두사라 별도 RPC/프론트 배선 없이 기존 아바타 데코
-- 시스템(apply_avatar_deco 등)을 그대로 탄다 — 아트는 src/components/AvatarDeco.jsx 의 Tomato().
-- 적용: Supabase SQL Editor 에 그대로 실행.

insert into public.store_items (id, name, price, emoji, description, premium, tier, admin_only, deco_slot, sort_order, is_active) values
  ('deco-tomato', '멋쟁이 토마토', 20, '🍅', '머리 위에 토마토가 살짝 얹혀요', true, null, true, '머리', 46, true)
on conflict (id) do update set
  name = excluded.name, price = excluded.price, emoji = excluded.emoji,
  admin_only = excluded.admin_only, deco_slot = excluded.deco_slot, is_active = excluded.is_active;
