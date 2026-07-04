import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getGroup, deleteGroup } from '../lib/api'
import GroupSettings from '../components/GroupSettings'

// 그룹 설정 페이지 (소유자 전용): 그룹명/유형/테마/공개 허용 + 그룹 삭제
export default function GroupConfigPage() {
  const { groupId } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [group, setGroup] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const backToSettings = () => navigate(`/groups/${groupId}/settings`)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setGroup(await getGroup(groupId)) }
    catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [groupId])

  useEffect(() => { load() }, [load])

  // 소유자가 아니면 설정 페이지로 되돌림
  useEffect(() => {
    if (group && profile && group.owner_id !== profile.id) {
      navigate(`/groups/${groupId}/settings`, { replace: true })
    }
  }, [group, profile, groupId, navigate])

  async function handleDelete() {
    if (!confirm('그룹을 삭제하면 모든 태스크가 사라집니다. 삭제할까요?')) return
    try { await deleteGroup(groupId); navigate('/') }
    catch (err) { setError(err.message) }
  }

  if (loading) return <div className="page"><div className="spinner" /></div>
  if (error && !group) return <div className="page"><div className="alert alert-error">{error}</div></div>
  if (!group || group.owner_id !== profile?.id) return <div className="page"><div className="spinner" /></div>

  return (
    <div className="page">
      {error && <div className="alert alert-error">{error}</div>}
      <GroupSettings group={group} onSaved={backToSettings} />
      <button type="button" className="btn btn-danger btn-block" onClick={handleDelete}>그룹 삭제</button>
    </div>
  )
}
