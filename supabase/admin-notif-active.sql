-- =============================================================
--  알림 메시지 관리: 활성/비활성 토글 추가.
--   · 기존 템플릿은 이미 실제로 쓰이고 있으므로 컬럼 추가 시 기본값 true(활성) 유지.
--   · 새로 만드는 템플릿은 관리자 화면에서 기본값을 비활성으로 시작(admin_create_notif).
--   · 주의: active=false 는 관리자 목록에서 흐리게 표시하는 용도일 뿐, 실제 알림
--     발송 트리거는 이 값을 확인하지 않는다(발송 억제는 별도 작업 필요).
--  적용: Supabase SQL Editor 에 그대로 실행 (admin-notif-create.sql 이후).
-- =============================================================

alter table public.notif_templates add column if not exists active boolean not null default true;

-- 저장 RPC: 활성 여부 인자 추가. null = 기존 값 유지.
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

-- 생성 RPC: 활성 여부 인자 추가(기본 false = 비활성).
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
