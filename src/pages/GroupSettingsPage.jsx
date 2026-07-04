import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getGroup, listMemberCards, leaveGroup, deleteGroup } from '../lib/api'
import GroupSettings from '../components/GroupSettings'
import MySettings from '../components/MySettings'

// 그룹 관련 설정 전용 페이지 (내비게이션 톱니바퀴로 진입)
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
  async function handleDeleteGroup() {
    if (!confirm('그룹을 삭제하면 모든 태스크가 사라집니다. 삭제할까요?')) return
    try { await deleteGroup(groupId); navigate('/') }
    catch (err) { setError(err.message) }
  }

  if (loading) return <div className="page"><div className="spinner" /></div>
  if (error && !group) {
    return <div className="page"><div className="alert alert-error">{error}</div></div>
  }

  return (
    <div className="page">
      <div className="page-head"><div><h1>{group.name} · 설정</h1></div></div>

      {error && <div className="alert alert-error">{error}</div>}

      {me && (
        <div className="card"><h3 className="card-title">내 설정 (이 그룹)</h3>
          <MySettings group={group} me={me} onClose={backToGroup} onSaved={backToGroup} />
        </div>
      )}

      {isOwner && (
        <div className="card"><h3 className="card-title">그룹 설정</h3>
          <GroupSettings group={group} onClose={backToGroup} onSaved={backToGroup} />
        </div>
      )}

      <div className="card">
        <h3 className="card-title">기타</h3>
        {isOwner
          ? <button className="btn btn-danger btn-block" onClick={handleDeleteGroup}>그룹 삭제</button>
          : <button className="btn btn-danger btn-block" onClick={handleLeave}>그룹에서 나가기</button>}
      </div>
    </div>
  )
}
