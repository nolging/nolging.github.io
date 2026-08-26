-- =============================================================
--  schema-admin.sql — 관리자 도구 통합본
--
--  아래 8개의 개별 SQL 파일에 흩어져 있던 "관리자 전용" 기능들을
--  하나로 합친 파일입니다 (저장소 정리 작업의 일환으로 생성됨):
--    - admin-drawboard-view.sql          (관리자 낙서장 열람 허용)
--    - admin-error-reports-body.sql      (오류 리포트 목록 본문 미리보기)
--    - admin-grant-coin-reason.sql       (츄르 지급/차감 사유 분기)
--    - admin-group-overview-blocked-flag.sql (그룹 개요에 "제어 중" 플래그)
--    - admin-group-usage-control.sql     (그룹별 기능 사용량 제어)
--    - admin-notif-active.sql            (알림 템플릿 활성/비활성 토글)
--    - admin-notif-create.sql            (알림 템플릿 생성 RPC — 최초 버전)
--    - admin-review-view.sql             (관리자 리뷰 열람 허용)
--
--  같은 함수/뷰를 여러 파일이 재정의하는 경우 최신 버전만 남겼습니다
--  (예: admin_group_overview, admin_create_notif). 테이블은 최초 생성 +
--  이후 모든 alter 를 시간순으로 누적했습니다.
--
--  적용 대상: schema.sql, schema-v2.sql 적용 이후의 "새 환경"에 한 번에
--  적용할 때 사용합니다 (신규 개발 환경 구성 / 재해복구 / 문서화 목적).
--  주의: 운영(prod) DB는 이미 원본 파일들을 통해 순차적으로 적용이
--  끝난 상태이므로, 이 파일을 운영 DB에 다시 실행할 필요는 없습니다.
--  (다만 모든 구문이 create or replace / if not exists / drop-then-create
--  가드를 쓰고 있어 재실행해도 안전합니다.)
-- =============================================================


-- =============================================================
--  1. 테이블
-- =============================================================

-- ---- group_feature_blocks: 그룹별 기능 차단 -------------------
--  행이 있으면 그 기능은 해당 그룹에서 차단(Off). 기본은 모두 허용(행 없음 = On).
--  (출처: admin-group-usage-control.sql)
create table if not exists public.group_feature_blocks (
  group_id   uuid not null references public.groups(id) on delete cascade,
  feature    text not null check (feature in ('touch', 'draw', 'catchmind', 'davinci', 'puzzle', 'rps', 'omok')),
  created_at timestamptz not null default now(),
  primary key (group_id, feature)
);
alter table public.group_feature_blocks enable row level security;

-- ---- notif_templates: 활성/비활성 토글 컬럼 -------------------
--  테이블 자체는 다른 번들(알림 도메인)에서 생성됨. 여기서는 관리자 화면의
--  활성/비활성 토글을 위한 컬럼만 추가한다. 기존 템플릿은 이미 실제로
--  쓰이고 있으므로 기본값 true(활성) 유지.
--  (출처: admin-notif-active.sql)
alter table public.notif_templates add column if not exists active boolean not null default true;


-- =============================================================
--  2. RLS 정책
-- =============================================================

-- ---- group_drawings: 관리자 낙서장(DrawBoard) 열람 허용 --------
--  실시간 접속자가 없어도 기존에 저장된 그림(listDrawingStrokes)이
--  관리자에게 보이도록 is_admin 바이패스 추가.
--  (출처: admin-drawboard-view.sql)
drop policy if exists gd_select on public.group_drawings;
create policy gd_select on public.group_drawings for select
  using (public.is_group_member(group_id, auth.uid()) or public.is_admin(auth.uid()));

-- ---- group_feature_blocks: 조회 정책 --------------------------
--  그룹 멤버(버튼 비활성화 판단용) + 관리자만 조회 가능.
--  (출처: admin-group-usage-control.sql)
drop policy if exists gfb_select on public.group_feature_blocks;
create policy gfb_select on public.group_feature_blocks
  for select to authenticated
  using (public.is_group_member(group_id, auth.uid()) or public.is_admin(auth.uid()));


-- =============================================================
--  3. 함수
-- =============================================================

-- ---- 오류 리포트 목록 (본문 미리보기 포함) ---------------------
--  반환 컬럼이 늘어나 create or replace 로는 안 되므로 drop 후 재생성.
--  (출처: admin-error-reports-body.sql)
drop function if exists public.admin_list_error_reports();

create function public.admin_list_error_reports()
returns table(id uuid, title text, body text, reporter_login text, resolved boolean, created_at timestamptz)
language sql security definer set search_path = public stable as $$
  select r.id, r.title, r.body, p.nickname, r.resolved, r.created_at
    from public.error_reports r
    join public.profiles p on p.id = r.reporter_id
   where public.is_admin(auth.uid())
   order by r.resolved asc, r.created_at desc;
$$;
grant execute on function public.admin_list_error_reports() to authenticated;

-- ---- 츄르 지급/차감 (사유 자동 분기) ---------------------------
--  사유를 입력하지 않은 경우, 차감이어도 항상 "관리자 지급"으로 표기되던 것을
--  방향에 맞게 "관리자 지급"/"관리자 차감"으로 분기.
--  (출처: admin-grant-coin-reason.sql)
create or replace function public.admin_grant_coin(p_user_id uuid, p_amount integer, p_reason text)
returns integer language plpgsql security definer set search_path = public as $$
declare v_balance integer;
begin
  if not public.is_admin(auth.uid()) then
    raise exception '관리자만 지급할 수 있습니다.'; end if;
  if p_amount is null or p_amount = 0 then
    raise exception '지급/차감 수량을 입력해 주세요.'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception '존재하지 않는 사용자입니다.'; end if;

  insert into public.coin_ledger(user_id, delta, reason, ref_type, created_by)
    values (p_user_id, p_amount,
      coalesce(nullif(btrim(p_reason), ''), case when p_amount > 0 then '관리자 지급' else '관리자 차감' end),
      'admin_grant', auth.uid());

  select coalesce(sum(delta), 0)::integer into v_balance
    from public.coin_ledger where user_id = p_user_id;
  return v_balance;
end;
$$;
grant execute on function public.admin_grant_coin(uuid, integer, text) to authenticated;

-- ---- 그룹별 사용량 제어: 차단/해제 RPC -------------------------
--  (출처: admin-group-usage-control.sql)
create or replace function public.admin_set_group_feature(p_group_id uuid, p_feature text, p_blocked boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception '관리자만 사용할 수 있어요.'; end if;
  if p_blocked then
    insert into public.group_feature_blocks(group_id, feature) values (p_group_id, p_feature)
    on conflict do nothing;
  else
    delete from public.group_feature_blocks where group_id = p_group_id and feature = p_feature;
  end if;
end;
$$;
grant execute on function public.admin_set_group_feature(uuid, text, boolean) to authenticated;

-- ---- 그룹 개요 (전체 그룹 개요 목록 RPC, "제어 중" 플래그 포함) --
--  admin-group-usage-control.sql 에서 최초 도입되었고, admin-group-overview-
--  blocked-flag.sql 이 has_blocked_features 컬럼을 추가하며 재정의했다.
--  (두 파일이 같은 커밋으로 함께 도입되었으나, blocked-flag 버전이 usage-
--  control 에서 만든 group_feature_blocks 테이블을 참조하므로 논리적으로
--  더 나중 버전이다.) 반환 컬럼이 늘어나 create or replace 로는 안 되므로
--  drop 후 재생성.
--  (출처: admin-group-overview-blocked-flag.sql, 최신)
drop function if exists public.admin_group_overview();

create or replace function public.admin_group_overview()
returns table(
  group_id uuid, name text, emoji text, emoji_bg text,
  is_couple boolean, is_friend boolean, members jsonb,
  has_blocked_features boolean
) language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception '관리자만 사용할 수 있어요.'; end if;
  return query
    select g.id, g.name, g.emoji, g.emoji_bg,
      exists(select 1 from public.user_items ui where ui.group_id = g.id and ui.item_id = 'couple-ring' and ui.status = 'used'),
      exists(select 1 from public.user_items ui where ui.group_id = g.id and ui.item_id = 'friend-ring' and ui.status = 'used'),
      coalesce((
        select jsonb_agg(jsonb_build_object('user_id', gm.user_id, 'nickname', gm.display_nickname, 'avatar_url', gm.avatar_url) order by gm.joined_at)
        from public.group_members gm where gm.group_id = g.id and gm.left_at is null
      ), '[]'::jsonb) as members,
      exists(select 1 from public.group_feature_blocks gfb where gfb.group_id = g.id) as has_blocked_features
    from public.groups g
    order by g.created_at desc;
end;
$$;
grant execute on function public.admin_group_overview() to authenticated;

-- ---- 알림 템플릿: 수정 RPC (활성 여부 인자 포함) ----------------
--  admin-notif-create.sql 에는 admin_set_notif 정의가 없었고, 이후
--  admin-notif-active.sql 에서 활성 여부 인자를 추가한 최초/최신 버전.
--  null = 기존 값 유지.
--  (출처: admin-notif-active.sql)
drop function if exists public.admin_set_notif(text, text, text, text, text);
create or replace function public.admin_set_notif(
  p_key text, p_title text, p_body text,
  p_emoji text default null, p_emoji_bg text default null, p_active boolean default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception '권한이 없습니다.'; end if;
  if p_title is null or btrim(p_title) = '' then raise exception '제목을 입력해 주세요.'; end if;
  if p_body  is null or btrim(p_body)  = '' then raise exception '본문을 입력해 주세요.'; end if;
  if p_emoji_bg is not null and btrim(p_emoji_bg) <> ''
     and btrim(p_emoji_bg) !~* '^#[0-9a-f]{6}$' then
    raise exception '배경색은 #RRGGBB 형식으로 입력해 주세요.';
  end if;
  update public.notif_templates
     set title    = p_title,
         body     = p_body,
         emoji    = case when p_emoji    is null then emoji    else nullif(btrim(p_emoji), '')    end,
         emoji_bg = case when p_emoji_bg is null then emoji_bg else nullif(btrim(p_emoji_bg), '') end,
         active   = coalesce(p_active, active),
         updated_at = now()
   where key = p_key;
  if not found then raise exception '알림 템플릿을 찾을 수 없어요.'; end if;
end $$;
grant execute on function public.admin_set_notif(text, text, text, text, text, boolean) to authenticated;

-- ---- 알림 템플릿: 생성 RPC (활성 여부 인자 포함, 최신) ----------
--  admin-notif-create.sql 이 6개 인자짜리 최초 버전을 만들었고,
--  admin-notif-active.sql 이 그 시그니처를 drop 한 뒤 p_active 인자를
--  추가한 7개 인자 버전으로 재정의했다(기본 false = 비활성 시작).
--  (출처: admin-notif-active.sql, 최신)
drop function if exists public.admin_create_notif(text, text, text, text, text, text);
create or replace function public.admin_create_notif(
  p_key text, p_label text, p_title text, p_body text,
  p_emoji text default null, p_emoji_bg text default null, p_active boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_key text := btrim(coalesce(p_key, ''));
  v_sort int;
begin
  if not public.is_admin(auth.uid()) then raise exception '권한이 없습니다.'; end if;
  if v_key = '' then raise exception '키를 입력해 주세요.'; end if;
  if v_key !~ '^[a-z0-9_]+$' then raise exception '키는 영문 소문자/숫자/밑줄(_)만 사용할 수 있어요.'; end if;
  if p_label is null or btrim(p_label) = '' then raise exception '이름을 입력해 주세요.'; end if;
  if p_title is null or btrim(p_title) = '' then raise exception '제목을 입력해 주세요.'; end if;
  if p_body  is null or btrim(p_body)  = '' then raise exception '본문을 입력해 주세요.'; end if;
  if p_emoji_bg is not null and btrim(p_emoji_bg) <> ''
     and btrim(p_emoji_bg) !~* '^#[0-9a-f]{6}$' then
    raise exception '배경색은 #RRGGBB 형식으로 입력해 주세요.';
  end if;
  if exists (select 1 from public.notif_templates where key = v_key) then
    raise exception '이미 존재하는 키예요.';
  end if;

  select coalesce(max(sort_order), 0) + 10 into v_sort from public.notif_templates;

  insert into public.notif_templates (key, label, title, body, emoji, emoji_bg, active, sort_order)
  values (
    v_key, btrim(p_label), p_title, p_body,
    nullif(btrim(coalesce(p_emoji, '')), ''),
    nullif(btrim(coalesce(p_emoji_bg, '')), ''),
    coalesce(p_active, false),
    v_sort
  );
end $$;
grant execute on function public.admin_create_notif(text, text, text, text, text, text, boolean) to authenticated;

-- ---- 리뷰 열람: 관리자 바이패스 --------------------------------
--  미가입 그룹도 아이템 없이 리뷰 확인 가능하도록:
--    1) 그룹 멤버 검사에 is_admin 허용
--    2) 관리자는 v_reveal = true (코멘트 항상 공개, 망원경 불필요)
--  (출처: admin-review-view.sql)
create or replace function public.task_reviews_view(p_task_id uuid)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare v_gid uuid; v_part boolean; v_reviewed boolean; v_reveal boolean; v_revealed boolean; v_reviews jsonb;
  v_is_admin boolean;
begin
  select group_id into v_gid from public.tasks where id = p_task_id;
  if v_gid is null then raise exception '존재하지 않는 항목입니다.'; end if;

  v_is_admin := public.is_admin(auth.uid());

  if not (public.is_group_member(v_gid, auth.uid()) or v_is_admin) then
    raise exception '그룹 멤버만 조회할 수 있습니다.'; end if;

  v_part     := public.is_task_participant(p_task_id, auth.uid());
  v_reviewed := exists (select 1 from public.task_reviews r
                        where r.task_id = p_task_id and r.author_id = auth.uid());
  v_revealed := exists (select 1 from public.review_reveals rr
                        where rr.user_id = auth.uid() and rr.task_id = p_task_id);
  v_reveal   := (v_part and v_reviewed) or v_revealed or v_is_admin;

  select coalesce(jsonb_agg(obj order by ord), '[]'::jsonb) into v_reviews
  from (
    select jsonb_build_object(
      'id', r.id,
      'author_id', r.author_id,
      'nickname',  coalesce(nullif(gm.display_nickname, ''), '멤버'),
      'avatar_url', gm.avatar_url,
      'rating', r.rating,
      'comment', case when v_reveal or r.author_id = auth.uid() then r.comment else null end,
      'comment_len', char_length(r.comment) + char_length(regexp_replace(r.comment, '[^가-힣一-鿿ぁ-ゟァ-ヿ]', '', 'g')),
      'is_self', (r.author_id = auth.uid()),
      'created_at', r.created_at
    ) as obj, r.created_at as ord
    from public.task_reviews r
    join public.profiles p on p.id = r.author_id
    left join public.group_members gm on gm.group_id = v_gid and gm.user_id = r.author_id
    where r.task_id = p_task_id
  ) sub;

  return jsonb_build_object(
    'is_participant', v_part,
    'has_reviewed', v_reviewed,
    'revealed', v_revealed or v_is_admin,
    'reviews', v_reviews
  );
end;
$$;
grant execute on function public.task_reviews_view(uuid) to authenticated;
