import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { listMemberCards } from '../lib/api'
import Avatar from '../components/Avatar'

export default function GroupMembers() {
  const { groupId } = useParams()
  const navigate = useNavigate()
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
      <ul className="member-cards">
        {members.map((m) => {
          const info = [m.contact, m.birthdate].filter(Boolean).join(' · ')
          return (
            <li key={m.user_id}>
              <button type="button" className="member-card"
                onClick={() => navigate(`/groups/${groupId}/members/${m.user_id}`)}>
                <Avatar src={m.avatar_url} name={m.display_nickname} size={48} />
                <div className="member-card-info">
                  <div className="member-card-name">
                    <span className="member-card-nick">{m.display_nickname}</span>
                    {m.is_self && <span className="muted sm">나</span>}
                    {m.role === 'owner' && <span className="badge">소유자</span>}
                  </div>
                  {info && <div className="muted sm member-card-sub">{info}</div>}
                </div>
                <span className="member-card-chev" aria-hidden="true">›</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
