-- =============================================================
--  관리자 페이지에서 새 알림 템플릿(notif_templates)을 직접 만들 수 있게.
--  주의: 여기서 만든 템플릿은 관리자 화면에서 제목/본문/이모지만 편집 가능한
--        "데이터"일 뿐, 실제로 알림이 발송되려면 그 key 를 사용하는 트리거/함수
--        코드가 따로 있어야 한다(다른 notif_templates 행들처럼). 이 함수는 UI 를
--        위한 것으로, 새로 만든 키가 자동으로 어딘가에서 발송되게 하지는 않는다.
--  적용: Supabase SQL Editor 에 그대로 실행.
-- =============================================================

create or replace function public.admin_create_notif(
  p_key text, p_label text, p_title text, p_body text,
  p_emoji text default null, p_emoji_bg text default null)
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

  insert into public.notif_templates (key, label, title, body, emoji, emoji_bg, sort_order)
  values (
    v_key, btrim(p_label), p_title, p_body,
    nullif(btrim(coalesce(p_emoji, '')), ''),
    nullif(btrim(coalesce(p_emoji_bg, '')), ''),
    v_sort
  );
end $$;
grant execute on function public.admin_create_notif(text, text, text, text, text, text) to authenticated;
