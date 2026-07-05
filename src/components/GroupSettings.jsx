import { useState } from 'react'
import { updateGroup } from '../lib/api'

export default function GroupSettings({ group, onSaved }) {
  const [form, setForm] = useState({
    name: group.name,
    description: group.description || '',
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
