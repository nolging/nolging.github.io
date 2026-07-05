import { useRef, useState } from 'react'
import { fileToSquareBlob } from '../lib/image'
import { uploadAvatar, deleteAvatarByUrl } from '../lib/storage'
import Avatar from './Avatar'

// 원형·가운데 프로필 사진 + 클릭 시 변경/제거 메뉴 (설정/가입/생성 공용)
// 선택 즉시 스토리지에 업로드하고 public URL 을 onChange 로 전달한다.
export default function AvatarEditor({ value, onChange, name, userId, onError }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)
  const lastUploadRef = useRef(null) // 이 세션에서 방금 올린 파일(교체/제거 시 정리)

  async function pickImage(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // 같은 파일 다시 선택 가능하도록 초기화
    if (!file) return
    setBusy(true)
    onError?.('')
    try {
      const blob = await fileToSquareBlob(file)
      const url = await uploadAvatar(blob, userId)
      if (lastUploadRef.current) deleteAvatarByUrl(lastUploadRef.current)
      lastUploadRef.current = url
      onChange(url)
    } catch (err) { onError?.(err.message) } finally { setBusy(false) }
  }
  function chooseChange() { setMenuOpen(false); fileRef.current?.click() }
  function chooseRemove() {
    setMenuOpen(false)
    if (lastUploadRef.current) { deleteAvatarByUrl(lastUploadRef.current); lastUploadRef.current = null }
    onChange('')
  }

  return (
    <div className="avatar-editor">
      <button type="button" className="avatar-btn" disabled={busy}
        onClick={() => setMenuOpen((v) => !v)} aria-label="프로필 사진 변경">
        <Avatar src={value} name={name} size={104} />
        <span className="avatar-cam" aria-hidden="true">
          {busy ? (
            <span className="avatar-cam-spin" />
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          )}
        </span>
      </button>
      {menuOpen && (
        <>
          <div className="menu-backdrop" onClick={() => setMenuOpen(false)} />
          <div className="avatar-menu" role="menu">
            <button type="button" onClick={chooseChange}>사진 변경</button>
            {value && <button type="button" className="menu-danger" onClick={chooseRemove}>사진 제거</button>}
          </div>
        </>
      )}
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickImage} />
    </div>
  )
}
