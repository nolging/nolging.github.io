import { useRef, useState } from 'react'
import { updateMyGroupMember } from '../lib/api'
import { fileToSquareDataURL } from '../lib/image'
import Avatar from './Avatar'

// 그룹 내 내 설정: 프로필사진(원형/클릭 메뉴), 닉네임, 연락처/생일 공개 토글
export default function MySettings({ group, me, onSaved }) {
  const [form, setForm] = useState({
    display_nickname: me?.display_nickname || '',
    avatar_url: me?.avatar_url || '',
    show_contact: !!me?.show_contact,
    show_birthdate: !!me?.show_birthdate,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const fileRef = useRef(null)
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  async function pickImage(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // 같은 파일 다시 선택 가능하도록 초기화
    if (!file) return
    try {
      const dataUrl = await fileToSquareDataURL(file)
      set({ avatar_url: dataUrl })
    } catch (err) { setError(err.message) }
  }

  function chooseChange() { setMenuOpen(false); fileRef.current?.click() }
  function chooseRemove() { setMenuOpen(false); set({ avatar_url: '' }) }

  async function save() {
    setBusy(true); setError('')
    try {
      await updateMyGroupMember(group.id, me.user_id, {
        display_nickname: form.display_nickname.trim() || null,
        avatar_url: form.avatar_url || null,
        show_contact: form.show_contact,
        show_birthdate: form.show_birthdate,
      })
      onSaved()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <div className="form">
      {/* 프로필 사진: 원형·가운데, 클릭 시 변경/제거 메뉴 */}
      <div className="avatar-editor">
        <button type="button" className="avatar-btn" onClick={() => setMenuOpen((v) => !v)} aria-label="프로필 사진 변경">
          <Avatar src={form.avatar_url} name={form.display_nickname || me?.login_id} size={104} />
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
              {form.avatar_url && <button type="button" className="menu-danger" onClick={chooseRemove}>사진 제거</button>}
            </div>
          </>
        )}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickImage} />
      </div>

      <label className="field"><span>닉네임</span>
        <input value={form.display_nickname} onChange={(e) => set({ display_nickname: e.target.value })}
          placeholder="그룹 내에서 사용할 닉네임을 입력해 주세요" /></label>

      {group.show_contact && (
        <label className="check">
          <input type="checkbox" checked={form.show_contact} onChange={(e) => set({ show_contact: e.target.checked })} />
          이 그룹에 내 연락처 공개
        </label>
      )}
      {group.show_birthdate && (
        <label className="check">
          <input type="checkbox" checked={form.show_birthdate} onChange={(e) => set({ show_birthdate: e.target.checked })} />
          이 그룹에 내 생년월일 공개
        </label>
      )}

      {error && <div className="alert alert-error">{error}</div>}
      <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>{busy ? '저장 중…' : '저장'}</button>
    </div>
  )
}
