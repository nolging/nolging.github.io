-- 알림 명칭 통일: 모든 그룹에서 위시/약속/추억 사용('태스크' 폐기)
create or replace function public.notif_noun(p_type text)
returns text language sql immutable as $$
  select '위시';
$$;

-- 알림 치환자 안내 문구 수정: {noun} 값은 위시/약속/추억 (할 일 아님)
update public.notif_templates set vars = '{noun} = 위시/약속/추억, {title} = 항목 제목'
  where key = 'new_task';
update public.notif_templates set vars = '{noun} = 위시/약속/추억, {actor} = 작성자, {text} = 댓글 내용'
  where key = 'task_comment';
