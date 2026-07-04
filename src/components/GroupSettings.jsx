import { useState } from 'react'
import { GROUP_TYPES, THEMES_BY_TYPE, normalizeTheme } from '../lib/constants'
import { updateGroup } from '../lib/api'

export default function GroupSettings({ group, onSaved }) {
  const [form, setForm] = useState({
    name: group.name,
    description: group.description || '',
    group_type: group.group_type,
    theme: group.theme,
    show_contact: group.show_contact,
    show_birthdate: group.show_birthdate,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  async function save(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const saved = await updateGroup(group.id, {
        name: form.name.trim(),
        description: form.description.trim(),
        group_type: form.group_type,
        theme: form.theme,
        show_contact: form.show_contact,
        show_birthdate: form.show_birthdate,
      })
      onSaved(saved)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <form onSubmit={save} className="form">
      <label className="field"><span>그룹명</span>
        <input value={form.name} onChange={(e) => set({ name: e.target.value })} /></label>
      <label className="field"><span>설명</span>
        <input value={form.description} onChange={(e) => set({ description: e.target.value })} /></label>

      <div className="field"><span>그룹 유형</span>
        <div className="toggle-group">
          {GROUP_TYPES.map((t) => (
            <button type="button" key={t.value}
              className={`toggle ${form.group_type === t.value ? 'active' : ''}`}
              onClick={() => set({ group_type: t.value, theme: normalizeTheme(t.value, form.theme) })}>{t.label}</button>
          ))}
        </div>
      </div>

      <div className="field"><span>그룹 테마</span>
        <div className="toggle-group">
          {THEMES_BY_TYPE[form.group_type].map((t) => (
            <button type="button" key={t.value}
              className={`toggle ${form.theme === t.value ? 'active' : ''}`}
              onClick={() => set({ theme: t.value })}>{t.label}</button>
          ))}
        </div>
      </div>

      <label className="check">
        <input type="checkbox" checked={form.show_contact} onChange={(e) => set({ show_contact: e.target.checked })} />
        연락처 공개 허용
      </label>
      <label className="check">
        <input type="checkbox" checked={form.show_birthdate} onChange={(e) => set({ show_birthdate: e.target.checked })} />
        생년월일 공개 허용
      </label>

      {error && <div className="alert alert-error">{error}</div>}
      <button className="btn btn-primary" disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
    </form>
  )
}
