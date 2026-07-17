-- =============================================================
--  퍼즐 이미지 스토리지 정책 (avatars 버킷)
--  · 퍼즐은 그룹 단위 → 같은 그룹 멤버는 누가 초기화하든 이미지를 삭제할 수 있어야 함.
--  · 그래서 퍼즐 이미지는 puzzles/{groupId}/{timestamp}.jpg 경로에 저장하고,
--    그 폴더에 대해 "그룹 멤버 쓰기/삭제"를 허용한다.
--  · 기존 아바타 정책(본인 폴더)은 그대로 두고 아래 정책을 추가(정책은 OR 로 합쳐짐).
--  · group_id 비교는 uuid 캐스팅 오류 방지를 위해 text 로 비교(아바타 경로에서도 안전).
--  Supabase SQL Editor 에서 실행.
-- =============================================================

-- 업로드: 그룹 멤버는 puzzles/{groupId}/ 아래에 넣을 수 있음
drop policy if exists "puzzle images: group members write" on storage.objects;
create policy "puzzle images: group members write"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = 'puzzles'
  and exists (
    select 1 from public.group_members gm
    where gm.group_id::text = (storage.foldername(name))[2]
      and gm.user_id = auth.uid()
  )
);

-- 삭제: 그룹 멤버는 puzzles/{groupId}/ 아래 파일을 지울 수 있음(누가 초기화하든 정리)
drop policy if exists "puzzle images: group members delete" on storage.objects;
create policy "puzzle images: group members delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = 'puzzles'
  and exists (
    select 1 from public.group_members gm
    where gm.group_id::text = (storage.foldername(name))[2]
      and gm.user_id = auth.uid()
  )
);
