import { useRef, useState } from 'react'
import { fileToSquareDataURL } from '../lib/image'
import Avatar from './Avatar'

// 원형·가운데 프로필 사진 + 클릭 시 변경/제거 메뉴 (설정/가입 공용)
export default function AvatarEditor({ value, onChange, name, onError }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const fileRef = useRef(null)

  async function pickImage(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // 같은 파일 다시 선택 가능하도록 초기화
    if (!file) return
    try { onChange(await fileToSquareDataURL(file)) }
    catch (err) { onError?.(err.message) }
  }
  function chooseChange() { setMenuOpen(false); fileRef.current?.click() }
  function chooseRemove() { setMenuOpen(false); onChange('') }

  return (
    <div className="avatar-editor">
      <button type="button" className="avatar-btn" onClick={() => setMenuOpen((v) => !v)} aria-label="프로필 사진 변경">
        <Avatar src={value} name={name} size={104} />
        <span className="avatar-cam" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
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
