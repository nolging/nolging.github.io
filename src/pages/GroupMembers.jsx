import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { listMemberCards } from '../lib/api'
import Avatar from '../components/Avatar'

export default function GroupMembers() {
  const { groupId } = useParams()
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setMembers(await listMemberCards(groupId)) }
    catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [groupId])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="page"><div className="spinner" /></div>

  return (
    <div className="page">
      {error && <div className="alert alert-error">{error}</div>}
      <div className="card">
        <ul className="member-list">
          {members.map((m) => (
            <li key={m.user_id}>
              <Avatar src={m.avatar_url} name={m.display_nickname} size={36} />
              <div className="member-info">
                <div className="member-name">
                  {m.display_nickname}
                  {m.is_self && <span className="muted sm"> (나)</span>}
                  {m.role === 'owner' && <span className="badge">소유자</span>}
                </div>
                {(m.contact || m.birthdate) && (
                  <div className="member-meta muted sm">
                    {m.contact && <span>{m.contact}</span>}
                    {m.birthdate && <span>· {m.birthdate}</span>}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
