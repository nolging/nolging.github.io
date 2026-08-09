-- 프리미엄 상점(프로필 꾸미기/머리 장식): 토깽이 · 곰돌이 한 마리. 관리자 전용(테스트 후
-- 정식 오픈은 admin_only = false 로 갱신). deco-* 접두사라 별도 RPC/프론트 배선 없이 기존
-- 아바타 데코 시스템(apply_avatar_deco 등)을 그대로 탄다 — 아트는
-- src/components/AvatarDeco.jsx 의 BunnyEars()/BearEars().
-- 적용: Supabase SQL Editor 에 그대로 실행. (avatar-decos.sql 이후)

insert into public.store_items (id, name, price, emoji, description, premium, tier, admin_only, deco_slot, sort_order, is_active) values
  ('deco-bunny', '토깽이', 20, '🐰', '머리 위로 토끼 귀가 쫑긋', true, null, true, '머리', 47, true),
  ('deco-bear', '곰돌이 한 마리', 20, '🐻', '머리 양옆으로 곰 귀가 쏙', true, null, true, '머리', 48, true)
on conflict (id) do update set
  name = excluded.name, price = excluded.price, emoji = excluded.emoji,
  admin_only = excluded.admin_only, deco_slot = excluded.deco_slot, is_active = excluded.is_active;
