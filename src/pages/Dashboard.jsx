import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listMyGroups } from '../lib/api'

export default function Dashboard() {
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    try { setGroups(await listMyGroups()) }
    catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  return (
    <div className="page">
      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="spinner" />
      ) : (
        <div className="group-grid">
          {/* 첫 칸: 그룹 만들기 (그룹 카드와 동일 사이즈) */}
          <Link to="/groups/new" className="group-tile group-tile-new">
            <span className="tile-plus" aria-hidden="true">+</span>
            <span>그룹 만들기</span>
          </Link>

          {groups.map((g) => (
            <Link key={g.id} to={`/groups/${g.id}`} className="group-tile group-card">
              <h3 className="tile-name">{g.name}</h3>
              {g.description && <p className="tile-desc muted">{g.description}</p>}
              <code className="code-chip tile-code">{g.invite_code}</code>
            </Link>
          ))}
        </div>
      )}

      {!loading && groups.length === 0 && (
        <p className="muted sm empty-hint">초대 코드가 있다면 <Link to="/join">가입</Link>할 수도 있어요.</p>
      )}
    </div>
  )
}
