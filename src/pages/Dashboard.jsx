import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { listMyGroups, createGroup } from '../lib/api'

export default function Dashboard() {
  const { profile } = useAuth()
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    try {
      setGroups(await listMyGroups())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleCreate(e) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    setError('')
    try {
      await createGroup({ name: name.trim(), description: description.trim(), ownerId: profile.id })
      setName('')
      setDescription('')
      setShowForm(false)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>내 그룹</h1>
        <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? '취소' : '+ 그룹 만들기'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card form-inline">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="그룹 이름"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="설명 (선택)"
          />
          <button className="btn btn-primary" disabled={busy}>
            {busy ? '생성 중…' : '만들기'}
          </button>
        </form>
      )}

      {error && <div className="alert alert-error">{error}</div>}

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
