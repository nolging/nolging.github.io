import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getGroup, listMemberCards, leaveGroup } from '../lib/api'
import MySettings from '../components/MySettings'

// 그룹 내 "설정" 페이지 (상단 내비게이션에 "설정" 표기)
export default function GroupSettingsPage() {
  const { groupId } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [group, setGroup] = useState(null)
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const isOwner = group && group.owner_id === profile?.id
  const me = useMemo(() => members.find((m) => m.user_id === profile?.id), [members, profile])
  const backToGroup = () => navigate(`/groups/${groupId}`)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [g, m] = await Promise.all([getGroup(groupId), listMemberCards(groupId)])
      setGroup(g); setMembers(m)
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [groupId])

  useEffect(() => { load() }, [load])

  async function handleLeave() {
    if (!confirm('이 그룹에서 나가시겠습니까?')) return
    try { await leaveGroup(groupId, profile.id); navigate('/') }
    catch (err) { setError(err.message) }
  }

  if (loading) return <div className="page"><div className="spinner" /></div>
  if (error && !group) return <div className="page"><div className="alert alert-error">{error}</div></div>

  return (
    <div className="page">
      {error && <div className="alert alert-error">{error}</div>}

      {me && <MySettings group={group} me={me} onSaved={backToGroup} />}

      {isOwner ? (
        <button type="button" className="btn btn-block" onClick={() => navigate(`/groups/${groupId}/settings/group`)}>
          그룹 설정
        </button>
      ) : (
        <button type="button" className="btn btn-danger btn-block" onClick={handleLeave}>
          그룹에서 나가기
        </button>
      )}
    </div>
  )
}
