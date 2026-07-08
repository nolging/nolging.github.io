import { useState } from 'react'
import { updateGroup } from '../lib/api'
import { DEFAULT_GROUP_BG } from '../lib/constants'
import GroupEmojiField from './GroupEmojiField'
import Switch from './Switch'

export default function GroupSettings({ group, onSaved }) {
  const [form, setForm] = useState({
    name: group.name,
    description: group.description || '',
    emoji: group.emoji || '',
    emoji_bg: group.emoji_bg || DEFAULT_GROUP_BG,
    show_contact: group.show_contact,
    show_birthdate: group.show_birthdate,
    show_ott: group.show_ott,
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
        emoji: form.emoji || null,
        emoji_bg: form.emoji_bg || null,
        show_contact: form.show_contact,
        show_birthdate: form.show_birthdate,
        show_ott: form.show_ott,
      })
      onSaved(saved)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <form onSubmit={save} className="form">
      <label className="field"><span>그룹명</span>
        <input value={form.name} maxLength={9} onChange={(e) => set({ name: e.target.value })} placeholder="최대 9자" /></label>
      <label className="field"><span>설명</span>
        <input value={form.description} maxLength={14} onChange={(e) => set({ description: e.target.value })} placeholder="최대 14자" /></label>

      <GroupEmojiField emoji={form.emoji} bg={form.emoji_bg} name={form.name}
        onChange={({ emoji, bg }) => set({ emoji, emoji_bg: bg })} />

      <div className="switch-row">
        <span>연락처 공개 허용</span>
        <Switch checked={form.show_contact} onChange={(v) => set({ show_contact: v })} />
      </div>
      <div className="switch-row">
        <span>생년월일 공개 허용</span>
        <Switch checked={form.show_birthdate} onChange={(v) => set({ show_birthdate: v })} />
      </div>
      <div className="switch-row">
        <span>멤버 보유 OTT 공개 허용</span>
        <Switch checked={form.show_ott} onChange={(v) => set({ show_ott: v })} />
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      <button className="btn btn-primary" disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
    </form>
  )
}
