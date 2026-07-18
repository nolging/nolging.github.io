-- =============================================================
--  알림 이모지: 알림센터에 뜨는 각 알림의 이모지도 관리자에서 편집
--   · notif_templates.emoji 추가. admin_set_notif 로 함께 저장.
--   · 프런트 알림센터가 notif_emojis()(type→emoji)를 읽어 표시(없으면 내장 기본값).
--  적용: notif-templates.sql(및 gift/media) 실행 후 이 파일을 Supabase SQL Editor 에 실행.
-- =============================================================

alter table public.notif_templates add column if not exists emoji text;

-- 기존 키 기본 이모지 백필(이미 값이 있으면 유지)
update public.notif_templates set emoji = coalesce(emoji, v.e)
from (values
  ('new_member','👋'), ('new_task','📝'), ('task_comment','💬'), ('reply','↩︎'), ('mention','@'),
  ('gift','🎁'), ('gift_anon','🎁'),
  ('cassette','🎵'), ('cassette_anon','🎵'), ('video','📹'), ('video_anon','📹'),
  ('bluray','💿'), ('bluray_anon','💿'), ('link','🎁'), ('link_anon','🎁')
) as v(key, e)
where public.notif_templates.key = v.key;

-- 저장 RPC: 이모지 인자 추가(제공 시 갱신, null 이면 유지, 빈 문자열이면 해제)
drop function if exists public.admin_set_notif(text, text, text);
create or replace function public.admin_set_notif(p_key text, p_title text, p_body text, p_emoji text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception '권한이 없습니다.'; end if;
  if p_title is null or btrim(p_title) = '' then raise exception '제목을 입력해 주세요.'; end if;
  if p_body  is null or btrim(p_body)  = '' then raise exception '본문을 입력해 주세요.'; end if;
  update public.notif_templates
     set title = p_title,
         body  = p_body,
         emoji = case when p_emoji is null then emoji else nullif(btrim(p_emoji), '') end,
         updated_at = now()
   where key = p_key;
  if not found then raise exception '알림 템플릿을 찾을 수 없어요.'; end if;
end $$;
grant execute on function public.admin_set_notif(text, text, text, text) to authenticated;

-- 알림센터용 type→emoji 맵(로그인 사용자 누구나)
create or replace function public.notif_emojis()
returns jsonb language sql security definer set search_path = public stable as $$
  select coalesce(jsonb_object_agg(key, emoji) filter (where emoji is not null), '{}'::jsonb)
  from public.notif_templates;
$$;
grant execute on function public.notif_emojis() to authenticated;
