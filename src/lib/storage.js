import { supabase } from './supabase'

const BUCKET = 'avatars'
const PUBLIC_MARKER = `/storage/v1/object/public/${BUCKET}/`

// 스토리지 avatars 버킷에 아바타 업로드 후 public URL 반환.
// 경로 첫 세그먼트를 사용자 uid 로 두어 Storage RLS(본인 폴더만 쓰기)와 맞춘다.
// 파일명에 타임스탬프를 넣어 매 업로드마다 고유 → CDN 캐시로 인한 이전 이미지 잔상 방지.
export async function uploadAvatar(blob, userId) {
  const path = `${userId}/${Date.now()}.jpg`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    cacheControl: '3600',
    upsert: true,
  })
  if (error) throw new Error(`사진 업로드 실패: ${error.message}`)
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}

// 퍼즐 이미지 업로드 (avatars 버킷 재사용, 본인 폴더). public URL 반환.
export async function uploadPuzzleImage(blob, userId) {
  const path = `${userId}/puzzle-${Date.now()}.jpg`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/jpeg', cacheControl: '3600', upsert: true,
  })
  if (error) throw new Error(`이미지 업로드 실패: ${error.message}`)
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}

// avatar_url 이 우리 스토리지 URL 이면 해당 객체 경로를 추출 (아니면 null — 레거시 data URI 등)
export function storagePathFromUrl(url) {
  if (typeof url !== 'string') return null
  const i = url.indexOf(PUBLIC_MARKER)
  if (i === -1) return null
  return url.slice(i + PUBLIC_MARKER.length).split('?')[0]
}

// 스토리지에 있던 이전 아바타 정리 (best-effort; 실패는 무시)
export async function deleteAvatarByUrl(url) {
  const path = storagePathFromUrl(url)
  if (!path) return
  try { await supabase.storage.from(BUCKET).remove([path]) } catch { /* noop */ }
}

// 더 이상 필요 없는 퍼즐 이미지 정리 (avatars 버킷, best-effort).
// 스토리지 RLS 상 본인 폴더의 파일만 삭제되므로, 만든 사람이 새로 시작/초기화할 때 정리된다.
export async function deletePuzzleImageByUrl(url) {
  const path = storagePathFromUrl(url)
  if (!path) return
  try { await supabase.storage.from(BUCKET).remove([path]) } catch { /* noop */ }
}
