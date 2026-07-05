import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listMyGroups } from '../lib/api'
import Avatar from '../components/Avatar'

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

          {groups.map((g) => {
            const members = g.group_members || []
            const extra = members.length - 3
            return (
              <Link key={g.id} to={`/groups/${g.id}`} className="group-tile group-card">
                <h3 className="tile-name">{g.name}</h3>
                {g.description && <p className="tile-desc muted">{g.description}</p>}
                <span className={`task-parts tile-members ${members.length > 1 ? 'multi' : ''}`}>
                  {members.slice(0, 3).map((m) => (
                    <Avatar key={m.user_id} src={m.avatar_url} name={m.display_nickname || m.profiles?.nickname} size={26} />
                  ))}
                  {extra > 0 && <span className="task-parts-more">+{extra}</span>}
                </span>
              </Link>
            )
          })}
        </div>
      )}

      {!loading && groups.length === 0 && (
        <p className="muted sm empty-hint">초대 코드가 있다면 <Link to="/join">가입</Link>할 수도 있어요.</p>
      )}
    </div>
  )
}
