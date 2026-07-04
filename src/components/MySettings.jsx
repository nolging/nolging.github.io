import { useState } from 'react'
import { updateMyGroupMember } from '../lib/api'
import AvatarEditor from './AvatarEditor'

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
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

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
      <AvatarEditor value={form.avatar_url} name={form.display_nickname || me?.login_id}
        onChange={(v) => set({ avatar_url: v })} onError={setError} />

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
