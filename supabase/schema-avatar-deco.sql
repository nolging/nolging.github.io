-- =============================================================
--  schema-avatar-deco.sql — 아바타 꾸미기(deco-*) 시스템 통합본
-- =============================================================
--  이 파일은 아래 23개의 개별 증분 SQL 파일에 나뉘어 있던 내용을 하나로
--  합친 것입니다(레포 정리 작업의 일부로 생성). 각 함수/테이블은 그 이름이
--  여러 파일에서 반복 재정의된 것 중 "가장 마지막(최신) 버전"만 담았습니다.
--
--   avatar-decos.sql, deco-angel-ring.sql, deco-bandage.sql, deco-bubble.sql,
--   deco-bunny-bear.sql, deco-devil-horn-anchor-position.sql,
--   deco-devil-horn-anchor-resize.sql, deco-face-slot-capacity.sql,
--   deco-gum-open.sql, deco-gum.sql, deco-halo.sql,
--   deco-head-slot-capacity.sql, deco-heart-shades.sql,
--   deco-pixel-shades-open.sql, deco-slot-column.sql, deco-slot-labels.sql,
--   deco-split-lr.sql, deco-sunglasses.sql, deco-tf-anchor-clamp.sql,
--   deco-tomato.sql, deco-transform.sql, deco-unapply-group.sql,
--   deco-unapply-reset-tf.sql
--
--  적용 순서: schema.sql, schema-v2.sql 다음에 실행하면 되는 "새 환경 기준
--  최신 상태"입니다. 이미 운영 중인(라이브) DB는 위 23개 파일을 통해 이미
--  이 내용이 순차 반영돼 있으므로 이 파일을 다시 실행할 필요는 없습니다 —
--  이 파일은 문서화 및 재해복구/새 환경 셋업 용도입니다.
-- =============================================================


-- =============================================================
-- 1. 테이블 컬럼 (모두 additive, 등장 순서대로)
-- =============================================================

-- 상점: 관리자 전용 노출 플래그 (avatar-decos.sql)
alter table public.store_items add column if not exists admin_only boolean not null default false;

-- 상점: 꾸미기 아이템의 유형(슬롯) — 관리자가 자유 문자열로 설정 (deco-slot-column.sql)
alter table public.store_items add column if not exists deco_slot text;

-- 장착 행(user_items: status='used' + group_id)의 위치/크기/각도 조정값.
--  { "s": 배율, "x": 좌우, "y": 위아래, "r": 각도, "left": {...}, "right": {...} }
--  좌표 단위는 아바타 SVG viewBox(0~100) 기준. null/미설정이면 기본 위치.
--  (deco-transform.sql)
alter table public.user_items add column if not exists deco_tf jsonb;


-- =============================================================
-- 2. 함수 — 헬퍼 먼저, 이를 호출하는 함수는 뒤에
-- =============================================================

-- ---- deco_slot(item): 아이템의 유형(슬롯) 판별 -----------------------------
--  store_items.deco_slot 컬럼값 우선, 없으면 접두사 규칙(deco-*→head)으로
--  폴백한다. 컬럼을 읽으므로 immutable 이 아니라 stable.
--  (최신 버전: deco-slot-column.sql. 그 이전엔 avatar-decos.sql →
--  deco-sunglasses.sql → deco-bandage.sql → deco-gum.sql →
--  deco-heart-shades.sql 순으로 하드코딩 CASE 목록에 아이템을 하나씩
--  추가해가는 방식이었으나, 컬럼 기반으로 완전히 대체되었다.)
create or replace function public.deco_slot(p_item_id text)
returns text language sql stable set search_path = public as $$
  select coalesce(
    (select nullif(btrim(s.deco_slot), '') from public.store_items s where s.id = p_item_id),
    case when p_item_id like 'deco-%' then 'head' else null end
  );
$$;

-- ---- deco_slot_capacity(slot): 슬롯별 동시 장착 정원 ------------------------
--  얼굴(face/얼굴)·머리(head/머리) 슬롯은 최대 2개, 그 외는 1개(완전 배타).
--  (최신 버전: deco-head-slot-capacity.sql. deco-face-slot-capacity.sql 이
--  얼굴만 2개로 먼저 넓혔고, 이 파일이 머리도 2개로 넓혔다.)
create or replace function public.deco_slot_capacity(p_slot text)
returns int language sql immutable as $$
  select case when p_slot in ('face', '얼굴', 'head', '머리') then 2 else 1 end;
$$;

-- ---- deco_anchor(item): 위치 조정의 기준점(anchor) 좌표 --------------------
--  아이템별 기본 표시 위치(아바타 SVG viewBox 0~100 기준 중심점). 조정값
--  범위 클램프(deco_tf_norm)가 "오프셋"이 아니라 "기준점+오프셋의 최종
--  위치"를 절대 범위로 제한하는 데 쓰인다.
--  (최신 버전: deco-devil-horn-anchor-position.sql. deco-tf-anchor-clamp.sql
--  에서 처음 도입된 뒤 deco-devil-horn-anchor-resize.sql → 이 파일까지
--  deco-devil-horn 항목의 y좌표만 갱신되며 재정의되어 왔다. 이 CASE 목록엔
--  이 번들 밖의 다른 데코 아이템(angel-wing/devil-wing/kitty-ribbon/
--  bow-tie/party-hat/chupa-chups/cherry-cream)도 포함돼 있는데, 그 아이템의
--  store_items 등록(INSERT)은 다른 번들 파일 소관이라 여기엔 없다 — 함수는
--  통째로 최신본을 가져오라는 원칙에 따라 그대로 유지.)
create or replace function public.deco_anchor(p_item_id text)
returns numeric[] language sql immutable as $$
  select case p_item_id
    when 'deco-sprout'       then array[50, -5]
    when 'deco-jaguar'       then array[50, 6]
    when 'deco-wolf'         then array[50, 7]
    when 'deco-blush'        then array[50, 65]
    when 'deco-anger'        then array[81, 18]
    when 'deco-pixel-shades' then array[50, 46.5]
    when 'deco-alien-shades' then array[50, 46]
    when 'deco-bandage'      then array[82, 63]
    when 'deco-gum'          then array[50, 81]
    when 'deco-heart-shades' then array[50, 46.5]
    when 'deco-halo'         then array[50, 50]
    when 'deco-angel-ring'   then array[50, -1]
    when 'deco-bubble'       then array[50, 50]
    when 'deco-tomato'       then array[50, 2.5]
    when 'deco-bunny'        then array[50, -5.5]
    when 'deco-bear'         then array[50, 10.5]
    when 'deco-angel-wing'   then array[50, 61.5]
    when 'deco-devil-wing'   then array[50, 61.5]
    when 'deco-devil-horn'   then array[50, 9]
    when 'deco-kitty-ribbon' then array[76.5, 9]
    when 'deco-bow-tie'      then array[50, 101.5]
    when 'deco-party-hat'    then array[50, -5.5]
    when 'deco-chupa-chups'  then array[66.5, 88]
    when 'deco-cherry-cream' then array[49.5, -4.5]
    else array[50, 50]
  end::numeric[];
$$;

-- ---- deco_split_anchor(item, side): 좌우 분리 아이템의 좌/우 기준점 --------
--  동물 귀·악마 뿔·부힛부힛·천사/악마 날개처럼 좌우로 나뉜 아이템은
--  왼쪽('l')/오른쪽('r')을 따로 조정할 수 있다. AvatarDeco.jsx 의
--  SPLIT_ANCHOR 와 정확히 같은 값(둘 다 바뀌면 같이 갱신). (deco-split-lr.sql)
create or replace function public.deco_split_anchor(p_item_id text, p_side text)
returns numeric[] language sql immutable as $$
  select case p_item_id || ':' || p_side
    when 'deco-jaguar:l'     then array[21.73, 6.06]
    when 'deco-jaguar:r'     then array[78.27, 6.06]
    when 'deco-wolf:l'       then array[21.68, 6.37]
    when 'deco-wolf:r'       then array[78.32, 6.37]
    when 'deco-bunny:l'      then array[44.34, -5.82]
    when 'deco-bunny:r'      then array[55.66, -5.82]
    when 'deco-bear:l'       then array[17.49, 9.97]
    when 'deco-bear:r'       then array[82.51, 9.97]
    when 'deco-devil-horn:l' then array[20.92, 8.74]
    when 'deco-devil-horn:r' then array[79.08, 8.74]
    when 'deco-blush:l'      then array[19, 64]
    when 'deco-blush:r'      then array[81, 64]
    when 'deco-angel-wing:l' then array[-5.19, 62.13]
    when 'deco-angel-wing:r' then array[105.19, 62.13]
    when 'deco-devil-wing:l' then array[-4.11, 61.75]
    when 'deco-devil-wing:r' then array[104.11, 61.75]
    else null
  end::numeric[];
$$;

-- ---- deco_tf_norm_at(tf, ax, ay): 기준점 하나 기준으로 { s,x,y,r } 클램프 ---
--  최종 위치(기준점 + 오프셋)가 항상 절대 범위 [-30,130] 안에 들어오도록
--  클램프. 배율은 0.4~2.5, 각도는 -180~180. (deco-split-lr.sql)
create or replace function public.deco_tf_norm_at(p_tf jsonb, v_ax numeric, v_ay numeric)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    's', round(least(2.5, greatest(0.4, coalesce((p_tf->>'s')::numeric, 1)))::numeric, 3),
    'x', round(least(130 - v_ax, greatest(-30 - v_ax, coalesce((p_tf->>'x')::numeric, 0)))::numeric, 2),
    'y', round(least(130 - v_ay, greatest(-30 - v_ay, coalesce((p_tf->>'y')::numeric, 0)))::numeric, 2),
    'r', round(least(180, greatest(-180, coalesce((p_tf->>'r')::numeric, 0)))::numeric, 1)
  );
$$;

-- ---- deco_tf_is_identity(tf): 항등값(s=1,x=0,y=0,r=0) 여부 -----------------
--  좌/우 값이 항등값이면 아예 안 실어 저장을 가볍게 유지하는 데 쓰인다.
--  (deco-split-lr.sql)
create or replace function public.deco_tf_is_identity(p_tf jsonb)
returns boolean language sql immutable as $$
  select p_tf is null
     or (coalesce((p_tf->>'s')::numeric, 1) = 1
     and coalesce((p_tf->>'x')::numeric, 0) = 0
     and coalesce((p_tf->>'y')::numeric, 0) = 0
     and coalesce((p_tf->>'r')::numeric, 0) = 0);
$$;

-- ---- deco_tf_norm(item, tf): 조정값 정규화(클램프 + 좌우 분리 지원) --------
--  잘못된 입력은 기본값으로 떨어진다. 좌우 분리 대상 아이템은 tf.left /
--  tf.right 서브 값도 각각의 기준점 기준으로 클램프해 함께 저장한다.
--  (최신 버전: deco-split-lr.sql. 이전 버전 계보: deco-transform.sql —
--  단일 인자 deco_tf_norm(jsonb), 고정폭 ±40 클램프 → deco-tf-anchor-clamp.sql
--  — deco_anchor 도입, 2-인자 deco_tf_norm(item, tf) 로 교체, 기준점 상대
--  절대범위 클램프로 변경(옛 1-인자 버전은 drop) → deco-split-lr.sql — 좌/우
--  서브 값 지원 추가. 시그니처가 (jsonb) → (text, jsonb) 로 바뀌었으므로
--  옛 시그니처를 명시적으로 drop 한다.)
drop function if exists public.deco_tf_norm(jsonb);

create or replace function public.deco_tf_norm(p_item_id text, p_tf jsonb)
returns jsonb language plpgsql immutable as $$
declare
  v_anchor numeric[] := public.deco_anchor(p_item_id);
  v_l numeric[] := public.deco_split_anchor(p_item_id, 'l');
  v_r numeric[] := public.deco_split_anchor(p_item_id, 'r');
  v_out jsonb;
  v_left jsonb;
  v_right jsonb;
begin
  if p_tf is null or jsonb_typeof(p_tf) <> 'object' then return null; end if;
  v_out := public.deco_tf_norm_at(p_tf, v_anchor[1], v_anchor[2]);
  if v_l is not null then
    v_left := public.deco_tf_norm_at(p_tf->'left', v_l[1], v_l[2]);
    if not public.deco_tf_is_identity(v_left) then
      v_out := v_out || jsonb_build_object('left', v_left);
    end if;
  end if;
  if v_r is not null then
    v_right := public.deco_tf_norm_at(p_tf->'right', v_r[1], v_r[2]);
    if not public.deco_tf_is_identity(v_right) then
      v_out := v_out || jsonb_build_object('right', v_right);
    end if;
  end if;
  return v_out;
end;
$$;

-- ---- apply_avatar_deco(item, group): 프리미엄 그룹의 내 아바타에 장착 -----
--  같은 그룹·같은 슬롯에 정원(deco_slot_capacity)을 넘겨 장착 중이면 가장
--  오래 장착한 것부터 해제해 자리를 만든다(정원 이내면 아무것도 안 건드림).
--  강제로 해제되는 아이템은 deco_tf 조정값도 함께 초기화한다.
--  (최신 버전: deco-unapply-reset-tf.sql. 이전 계보: avatar-decos.sql —
--  슬롯 완전 배타(1개), 조정값 초기화 없음 → deco-face-slot-capacity.sql —
--  정원(capacity) 기반으로 교체, 조정값 초기화 없음 → 이 파일 — 강제 해제
--  시 deco_tf = null 로 함께 초기화.)
create or replace function public.apply_avatar_deco(p_item_id text, p_group_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.user_items; v_slot text; v_cap int;
begin
  v_slot := public.deco_slot(p_item_id);
  if v_slot is null then raise exception '아바타 꾸미기 아이템이 아니에요.'; end if;
  if not (public.is_couple_group(p_group_id) or public.is_friend_group(p_group_id)) then
    raise exception '프리미엄 그룹에만 적용할 수 있어요.'; end if;
  if not public.is_group_member(p_group_id, auth.uid()) then
    raise exception '그룹 멤버만 적용할 수 있어요.'; end if;

  -- 내 해당 아이템 하나 선택(미적용=active 우선, 없으면 적용중=used 를 옮김)
  select * into v_item from public.user_items
    where user_id = auth.uid() and item_id = p_item_id and status in ('active', 'used')
    order by (status = 'active') desc, created_at asc limit 1 for update;
  if v_item.id is null then raise exception '보유한 아이템이 없어요.'; end if;

  v_cap := public.deco_slot_capacity(v_slot);

  -- 같은 그룹·같은 슬롯에 정원(capacity)을 넘겨 장착 중이면, 가장 오래 장착한 것부터
  -- 해제해 자리를 만든다(최근 것 (capacity-1)개는 유지) — 정원 이내면 아무것도 안 건드림.
  update public.user_items
     set status = 'active', group_id = null, used_at = null, deco_tf = null
   where id in (
     select id from public.user_items
      where user_id = auth.uid() and status = 'used' and group_id = p_group_id
        and id <> v_item.id and public.deco_slot(item_id) = v_slot
      order by used_at desc nulls last
      offset greatest(v_cap - 1, 0)
   );

  update public.user_items set status = 'used', group_id = p_group_id, used_at = now() where id = v_item.id;
end;
$$;

-- ---- unapply_avatar_deco(item, group?): 장착 해제 --------------------------
--  p_group_id 를 넘기면 정확히 그 그룹의 장착만 해제(동일 아이템을 여러
--  개 보유해 여러 그룹에 동시 적용 중일 때도 안전). 안 넘기면 가장 최근
--  장착한 것을 해제(기존 호출부 호환). 해제 시 deco_tf 조정값도 초기화.
--  (최신 버전: deco-unapply-reset-tf.sql. 이전 계보: avatar-decos.sql —
--  item_id 만으로 판단(그룹 구분 없음), 조정값 초기화 없음 →
--  deco-unapply-group.sql — p_group_id 파라미터 추가(시그니처 변경, 옛
--  1-인자 버전은 drop), 조정값 초기화 없음 → 이 파일 — 해제 시
--  deco_tf = null 로 함께 초기화.)
drop function if exists public.unapply_avatar_deco(text);

create or replace function public.unapply_avatar_deco(p_item_id text, p_group_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.user_items;
begin
  select * into v_item from public.user_items
    where user_id = auth.uid() and item_id = p_item_id and status = 'used'
      and (p_group_id is null or group_id = p_group_id)
    order by used_at desc nulls last limit 1 for update;
  if v_item.id is null then raise exception '장착 중인 아이템이 없어요.'; end if;
  update public.user_items set status = 'active', group_id = null, used_at = null, deco_tf = null where id = v_item.id;
end;
$$;

-- ---- list_group_avatar_decos(group): 그룹 멤버들의 장착 데코 조회 ---------
--  (user_id, item_id, tf, used_at) 목록. 멤버 또는 앱 관리자만 조회 가능
--  (미가입 그룹 조회 시에도 꾸미기가 보이도록 관리자는 허용).
--  (최신 버전: deco-face-slot-capacity.sql. 이전 계보: avatar-decos.sql —
--  (user_id, item_id) 만 반환 → deco-transform.sql — tf(jsonb) 반환 추가
--  (반환 타입이 바뀌므로 옛 함수 drop 후 재생성) → 이 파일 — used_at 도
--  함께 반환(정원 초과 시 어느 게 해제될지 클라이언트가 미리 보여줄 수
--  있게). 반환 타입이 계속 바뀌었으므로 옛 시그니처를 drop 한다.)
drop function if exists public.list_group_avatar_decos(uuid);

create or replace function public.list_group_avatar_decos(p_group_id uuid)
returns table(user_id uuid, item_id text, tf jsonb, used_at timestamptz)
language sql security definer set search_path = public stable as $$
  select ui.user_id, ui.item_id, ui.deco_tf, ui.used_at
  from public.user_items ui
  where ui.group_id = p_group_id and ui.status = 'used' and ui.item_id like 'deco-%'
    -- 멤버 또는 앱 관리자(미가입 그룹 조회 시에도 꾸미기가 보이도록)
    and (public.is_group_member(p_group_id, auth.uid()) or public.is_admin(auth.uid()));
$$;

-- ---- set_avatar_deco_tf(item, group, tf): 조정값 저장 ---------------------
--  내가 그 그룹에 장착 중인 데코에만 쓸 수 있다. p_tf 가 null 이면 조정값을
--  지운다(기본 위치로 복귀). (최신 버전: deco-tf-anchor-clamp.sql —
--  deco_tf_norm(item, tf) 호출로 교체. 이전 버전(deco-transform.sql)은
--  deco_tf_norm(tf) 단일 인자 버전을 호출했다.)
create or replace function public.set_avatar_deco_tf(p_item_id text, p_group_id uuid, p_tf jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if public.deco_slot(p_item_id) is null then
    raise exception '프로필 꾸미기 아이템이 아니에요.'; end if;
  if not public.is_group_member(p_group_id, auth.uid()) then
    raise exception '그룹 멤버만 조정할 수 있어요.'; end if;

  select id into v_id from public.user_items
   where user_id = auth.uid() and item_id = p_item_id
     and status = 'used' and group_id = p_group_id
   order by used_at desc nulls last limit 1 for update;
  if v_id is null then raise exception '이 그룹에 장착 중인 아이템이 없어요.'; end if;

  update public.user_items set deco_tf = public.deco_tf_norm(p_item_id, p_tf) where id = v_id;
end;
$$;


-- =============================================================
-- 3. 시드 데이터 — 아이템 등록(store_items) + 슬롯 백필
-- =============================================================

-- 기본 5종: 새싹/재규어인 척/늑대인 척/부힛부힛/빠직 (avatar-decos.sql)
-- 얼굴(blush·anger) 외 deco-* 는 머리 슬롯 — 아래 deco_slot 백필에서 반영.
insert into public.store_items (id, name, price, emoji, description, premium, tier, admin_only, sort_order, is_active) values
  ('deco-sprout', '자라나는 새싹', 20, '🌱', '머리 위로 새싹이 뿅',                                              true, null, false, 30, true),
  ('deco-jaguar', '재규어인 척',   30, '🐆', E'놀라지 마세요\n재규어 같아 보이지만 사실 고양이예요',              true, null, false, 31, true),
  ('deco-wolf',   '늑대인 척',     30, '🐺', E'늑대인 척하지만 사실 강아지예요\n본인은 정말 늑대인 줄 알아요',    true, null, false, 32, true),
  ('deco-blush',  '부힛부힛',       20, '☺️', '부힛부힛 사rrrrr',                                               true, null, false, 33, true),
  ('deco-anger',  '빠직',           20, '💢', '심기 불편',                                                     true, null, false, 34, true)
on conflict (id) do update set
  name = excluded.name, price = excluded.price, emoji = excluded.emoji, description = excluded.description,
  premium = excluded.premium, tier = excluded.tier, admin_only = excluded.admin_only,
  sort_order = excluded.sort_order, is_active = excluded.is_active;

-- 얼굴 장식: 픽셀 선글라스(정식 오픈) / 왹져 선글라스(관리자 전용) (deco-sunglasses.sql)
insert into public.store_items (id, name, price, emoji, description, premium, tier, admin_only, sort_order, is_active) values
  ('deco-pixel-shades', '픽셀 선글라스', 20, '🕶️', '시력 포기 간지 폭풍 썬구리', true, null, false, 35, true),
  ('deco-alien-shades', '왹져 선글라스', 20, '👽', '간지 포기 인싸 썬구리',       true, null, true, 36, true)
on conflict (id) do update set
  name = excluded.name, price = excluded.price, emoji = excluded.emoji, description = excluded.description,
  premium = excluded.premium, tier = excluded.tier, admin_only = excluded.admin_only,
  sort_order = excluded.sort_order, is_active = excluded.is_active;

-- 픽셀 선글라스 정식 오픈 확정(admin_only = false / 왹져는 계속 관리자 전용). (deco-pixel-shades-open.sql)
update public.store_items
   set admin_only = false,
       is_active  = true,
       premium    = true,
       tier       = null        -- 프리미엄 그룹이면 커플/우정 구분 없이 노출
 where id = 'deco-pixel-shades';

-- 얼굴 장식: 반창고 (deco-bandage.sql)
insert into public.store_items (id, name, price, emoji, description, premium, tier, admin_only, sort_order, is_active) values
  ('deco-bandage', '반창고', 20, '🩹', '냥아치 코스프레', true, null, true, 37, true)
on conflict (id) do update set
  name = excluded.name, price = excluded.price, emoji = excluded.emoji, description = excluded.description,
  premium = excluded.premium, tier = excluded.tier, admin_only = excluded.admin_only,
  sort_order = excluded.sort_order, is_active = excluded.is_active;

-- 얼굴 장식: 풍선껌 (deco-gum.sql)
insert into public.store_items (id, name, price, emoji, description, premium, tier, admin_only, sort_order, is_active) values
  ('deco-gum', '풍선껌', 20, '🩷', '와우', true, null, true, 38, true)
on conflict (id) do update set
  name = excluded.name, price = excluded.price, emoji = excluded.emoji, description = excluded.description,
  premium = excluded.premium, tier = excluded.tier, admin_only = excluded.admin_only,
  sort_order = excluded.sort_order, is_active = excluded.is_active;

-- 풍선껌 정식 오픈(admin_only = false → 관리자 외 일반 사용자에게도 노출). (deco-gum-open.sql)
update public.store_items
   set admin_only = false,
       is_active  = true,
       premium    = true,
       tier       = null        -- 프리미엄 그룹이면 커플/우정 구분 없이 노출
 where id = 'deco-gum';

-- 얼굴 장식: 하트 선글라스 (deco-heart-shades.sql)
insert into public.store_items (id, name, price, emoji, description, premium, tier, admin_only, sort_order, is_active) values
  ('deco-heart-shades', '하트 선글라스', 20, '😎', '', true, null, true, 39, true)
on conflict (id) do update set
  name = excluded.name, price = excluded.price, emoji = excluded.emoji,
  premium = excluded.premium, tier = excluded.tier, admin_only = excluded.admin_only,
  sort_order = excluded.sort_order, is_active = excluded.is_active;
  -- description 은 관리자 편집 보존을 위해 갱신하지 않음

-- 위 아이템들의 deco_slot 컬럼 백필(당시 하드코딩 규칙과 동일: 얼굴류는
-- face, 그 외 deco-* 는 head). 컬럼이 비어있을 때만 채운다. (deco-slot-column.sql)
update public.store_items set deco_slot = 'face'
  where id in ('deco-blush','deco-anger','deco-pixel-shades','deco-alien-shades','deco-bandage','deco-gum','deco-heart-shades')
    and coalesce(nullif(btrim(deco_slot), ''), '') = '';
update public.store_items set deco_slot = 'head'
  where id like 'deco-%' and coalesce(nullif(btrim(deco_slot), ''), '') = '';

-- 슬롯 표시값을 한글로 통일(코드→한글 표시명). 이후 등록되는 아이템은
-- deco_slot 을 처음부터 한글('머리'/'얼굴'/'테두리')로 채운다. (deco-slot-labels.sql)
update public.store_items set deco_slot = '머리' where id like 'deco-%' and btrim(coalesce(deco_slot,'')) = 'head';
update public.store_items set deco_slot = '얼굴' where id like 'deco-%' and btrim(coalesce(deco_slot,'')) = 'face';
update public.store_items set deco_slot = '안경' where id like 'deco-%' and btrim(coalesce(deco_slot,'')) = 'glasses';

-- 테두리 장식: 후광 (deco-halo.sql)
insert into public.store_items (id, name, price, emoji, description, premium, tier, admin_only, deco_slot, sort_order, is_active) values
  ('deco-halo', '후광', 20, '😇', '', true, null, true, '테두리', 40, true)
on conflict (id) do update set
  name = excluded.name, price = excluded.price, emoji = excluded.emoji,
  premium = excluded.premium, tier = excluded.tier, admin_only = excluded.admin_only,
  is_active = excluded.is_active;
  -- deco_slot, description, sort_order 는 관리자 편집 보존을 위해 갱신하지 않음

-- 머리 장식: 천사 링 (deco-angel-ring.sql)
insert into public.store_items (id, name, price, emoji, description, premium, tier, admin_only, deco_slot, sort_order, is_active) values
  ('deco-angel-ring', '천사 링', 20, '😇', '머리 위로 빛나는 링이 둥실둥실', true, null, true, '머리', 41, true)
on conflict (id) do update set
  name = excluded.name, price = excluded.price, emoji = excluded.emoji,
  premium = excluded.premium, tier = excluded.tier, admin_only = excluded.admin_only,
  is_active = excluded.is_active;
  -- deco_slot, description, sort_order 는 관리자 편집 보존을 위해 갱신하지 않음

-- 테두리 장식: 비눗방울 (deco-bubble.sql)
insert into public.store_items (id, name, price, emoji, description, premium, tier, admin_only, deco_slot, sort_order, is_active) values
  ('deco-bubble', '비눗방울', 30, '🫧', '무지갯빛 비눗방울 속에 둥실', true, null, true, '테두리', 42, true)
on conflict (id) do update set
  name = excluded.name, price = excluded.price, emoji = excluded.emoji,
  premium = excluded.premium, tier = excluded.tier, admin_only = excluded.admin_only,
  is_active = excluded.is_active;
  -- deco_slot, description, sort_order 는 관리자 편집 보존을 위해 갱신하지 않음

-- 머리 장식: 멋쟁이 토마토 (deco-tomato.sql)
insert into public.store_items (id, name, price, emoji, description, premium, tier, admin_only, deco_slot, sort_order, is_active) values
  ('deco-tomato', '멋쟁이 토마토', 20, '🍅', '머리 위에 토마토가 살짝 얹혀요', true, null, true, '머리', 46, true)
on conflict (id) do update set
  name = excluded.name, price = excluded.price, emoji = excluded.emoji,
  admin_only = excluded.admin_only, deco_slot = excluded.deco_slot, is_active = excluded.is_active;

-- 머리 장식: 토깽이 · 곰돌이 한 마리 (deco-bunny-bear.sql)
insert into public.store_items (id, name, price, emoji, description, premium, tier, admin_only, deco_slot, sort_order, is_active) values
  ('deco-bunny', '토깽이', 20, '🐰', '머리 위로 토끼 귀가 쫑긋', true, null, true, '머리', 47, true),
  ('deco-bear', '곰돌이 한 마리', 20, '🐻', '머리 양옆으로 곰 귀가 쏙', true, null, true, '머리', 48, true)
on conflict (id) do update set
  name = excluded.name, price = excluded.price, emoji = excluded.emoji,
  admin_only = excluded.admin_only, deco_slot = excluded.deco_slot, is_active = excluded.is_active;

-- 참고: deco-devil-horn 아이템의 store_items 등록(INSERT)은 이 번들 밖의
-- 다른 SQL 파일 소관이라 여기 없음 — deco_anchor/deco_split_anchor 함수의
-- CASE 항목으로만 이 파일에 등장한다(deco-devil-horn-anchor-position.sql /
-- deco-devil-horn-anchor-resize.sql 은 위치 조정값만 갱신하는 파일이었다).


-- =============================================================
-- 4. 권한
-- =============================================================
grant execute on function public.apply_avatar_deco(text, uuid) to authenticated;
grant execute on function public.unapply_avatar_deco(text, uuid) to authenticated;
grant execute on function public.list_group_avatar_decos(uuid) to authenticated;
grant execute on function public.set_avatar_deco_tf(text, uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
