import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { listMyGroups, createGroup } from '../lib/api'
import { DEFAULT_THEME } from '../lib/constants'

const EMPTY = { name: '', description: '', showContact: false, showBirthdate: false }

export default function Dashboard() {
  const { profile } = useAuth()
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  async function load() {
    setLoading(true)
    try { setGroups(await listMyGroups()) }
    catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  async function handleCreate(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    setBusy(true); setError('')
    try {
      await createGroup({
        ...form, name: form.name.trim(), description: form.description.trim(),
        ownerId: profile.id, groupType: 'nolging', theme: DEFAULT_THEME,
      })
      setForm(EMPTY); setShowForm(false)
      await load()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <div className="page">
      <div className="page-actions">
        <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? '취소' : '+ 그룹 만들기'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card form">
          <label className="field"><span>그룹명 *</span>
            <input autoFocus value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="그룹 이름" /></label>
          <label className="field"><span>설명 (선택)</span>
            <input value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="설명" /></label>

          <div className="field-row">
            <label className="check">
              <input type="checkbox" checked={form.showContact} onChange={(e) => set({ showContact: e.target.checked })} />
              연락처 공개 허용
            </label>
            <label className="check">
              <input type="checkbox" checked={form.showBirthdate} onChange={(e) => set({ showBirthdate: e.target.checked })} />
              생년월일 공개 허용
            </label>
          </div>

          {error && <div className="alert alert-error">{error}</div>}
          <button className="btn btn-primary" disabled={busy}>{busy ? '생성 중…' : '만들기'}</button>
        </form>
      )}

      {error && !showForm && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="spinner" />
      ) : groups.length === 0 ? (
        <div className="empty">
          <p>아직 속한 그룹이 없습니다.</p>
          <p className="muted">그룹을 만들거나 초대 코드로 <Link to="/join">가입</Link>하세요.</p>
        </div>
      ) : (
        <div className="grid">
          {groups.map((g) => (
            <Link key={g.id} to={`/groups/${g.id}`} className="card group-card">
              <h3>{g.name}</h3>
              {g.description && <p className="muted">{g.description}</p>}
              <div className="group-card-foot">
                <code className="code-chip">{g.invite_code}</code>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
