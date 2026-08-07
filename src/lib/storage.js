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

// 퍼즐 이미지 업로드 (avatars 버킷 재사용). public URL 반환.
// 퍼즐은 그룹 단위라 같은 그룹 멤버는 누구나 초기화(삭제)할 수 있어야 하므로
// puzzles/{groupId}/ 폴더에 저장한다(스토리지 정책이 그룹 멤버 쓰기/삭제 허용).
// 스토리지 정책 미적용 환경에선 개인 폴더로 폴백(만든 사람만 삭제 가능).
export async function uploadPuzzleImage(blob, groupId, userId) {
  const opts = { contentType: 'image/jpeg', cacheControl: '3600', upsert: true }
  const groupPath = `puzzles/${groupId}/${Date.now()}.jpg`
  const { error } = await supabase.storage.from(BUCKET).upload(groupPath, blob, opts)
  let path = groupPath
  if (error) {
    const uidPath = `${userId}/puzzle-${Date.now()}.jpg`
    const { error: e2 } = await supabase.storage.from(BUCKET).upload(uidPath, blob, opts)
    if (e2) throw new Error(`이미지 업로드 실패: ${error.message}`)
    path = uidPath
  }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}

// 폴라로이드 필름 사진 업로드 (avatars 버킷 재사용, 아바타와 같은 본인 폴더 패턴).
// n 은 같은 쪽지 안에서의 순번(0~4) — 같은 밀리초에 여러 장을 올려도 경로가 겹치지 않게.
export async function uploadPolaroidPhoto(blob, userId, n = 0) {
  const path = `${userId}/polaroid-${Date.now()}-${n}.jpg`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/jpeg', cacheControl: '3600', upsert: true,
  })
  if (error) throw new Error(`사진 업로드 실패: ${error.message}`)
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}

// 푸린 마이크 낙서 업로드 (avatars 버킷 재사용, 아바타와 같은 본인 폴더 패턴). 투명 배경을
// 살려야 해서 PNG. 그룹당 매번 새 경로(타임스탬프)로 올려 CDN 캐시로 인한 이전 낙서 잔상 방지.
export async function uploadGraffitiImage(blob, userId, groupId) {
  const path = `${userId}/graffiti-${groupId}-${Date.now()}.png`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/png', cacheControl: '3600', upsert: true,
  })
  if (error) throw new Error(`낙서 업로드 실패: ${error.message}`)
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}

// 이미지 파일을 최대 변 길이 max 로 축소한 JPEG blob 으로 변환.
export function resizeToJpeg(file, max) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      let { width: w, height: h } = img
      if (Math.max(w, h) > max) { const k = max / Math.max(w, h); w = Math.round(w * k); h = Math.round(h * k) }
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h
      cv.getContext('2d').drawImage(img, 0, 0, w, h)
      cv.toBlob((blob) => { URL.revokeObjectURL(url); blob ? resolve({ blob, w, h }) : reject(new Error('이미지 변환 실패')) }, 'image/jpeg', 0.86)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지를 읽을 수 없어요')) }
    img.src = url
  })
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
// 그룹 폴더(puzzles/{groupId}/)에 저장된 이미지는 스토리지 정책상 그룹 멤버 누구나 삭제 가능.
export async function deletePuzzleImageByUrl(url) {
  const path = storagePathFromUrl(url)
  if (!path) return
  try { await supabase.storage.from(BUCKET).remove([path]) } catch { /* noop */ }
}
