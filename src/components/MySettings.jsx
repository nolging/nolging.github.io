import { useRef, useState } from 'react'
import { updateMyGroupMember } from '../lib/api'
import { fileToSquareDataURL } from '../lib/image'
import Avatar from './Avatar'

// 그룹 내 내 설정: 프로필사진, 그룹내 닉네임, 연락처/생년월일 공개 토글
export default function MySettings({ group, me, onSaved, onClose }) {
  const [form, setForm] = useState({
    display_nickname: me?.display_nickname || '',
    avatar_url: me?.avatar_url || '',
    show_contact: !!me?.show_contact,
    show_birthdate: !!me?.show_birthdate,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef(null)
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  async function pickImage(e) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const dataUrl = await fileToSquareDataURL(file)
      set({ avatar_url: dataUrl })
    } catch (err) { setError(err.message) }
  }

  async function save(e) {
    e.preventDefault()
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
    <form onSubmit={save} className="form">
      <div className="avatar-edit">
        <Avatar src={form.avatar_url} name={form.display_nickname || me?.login_id} size={72} />
        <div className="row-gap">
          <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()}>사진 선택</button>
          {form.avatar_url && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => set({ avatar_url: '' })}>제거</button>
          )}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickImage} />
        </div>
      </div>
      <p className="muted sm">정방형 사진을 넣으면 원형으로 표시됩니다. (그룹 내에서만 사용)</p>

      <label className="field"><span>그룹 내 닉네임</span>
        <input value={form.display_nickname} onChange={(e) => set({ display_nickname: e.target.value })}
          placeholder={me?.login_id || '표시할 이름'} /></label>

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
      {!group.show_contact && !group.show_birthdate && (
        <p className="muted sm">이 그룹은 연락처/생년월일 공개가 꺼져 있어 공개 설정이 없습니다.</p>
      )}

      {error && <div className="alert alert-error">{error}</div>}
      <div className="row-gap">
        <button className="btn btn-primary" disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
        <button type="button" className="btn btn-ghost" onClick={onClose}>닫기</button>
      </div>
    </form>
  )
}
