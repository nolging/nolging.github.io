-- 알림 치환자 안내 문구 수정: {noun} 값은 위시/약속/추억 (할 일 아님)
update public.notif_templates set vars = '{noun} = 위시/약속/추억, {title} = 항목 제목'
  where key = 'new_task';
update public.notif_templates set vars = '{noun} = 위시/약속/추억, {actor} = 작성자, {text} = 댓글 내용'
  where key = 'task_comment';
