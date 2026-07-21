import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getGroup, getMyGroupMember, leaveGroup } from '../lib/api'
import MySettings from '../components/MySettings'

// 그룹 내 "설정" 페이지 (상단 내비게이션에 "설정" 표기)
export default function GroupSettingsPage({ groupId: groupIdProp, embedded = false, onClose }) {
  const params = useParams()
  const groupId = groupIdProp ?? params.groupId
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [group, setGroup] = useState(null)
  const [member, setMember] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const isOwner = group && group.owner_id === profile?.id
  // 실제 저장값(공개토글 포함)으로 초기화 — 카드 RPC 는 토글을 반환하지 않음
  const me = member && {
    user_id: profile.id,
    login_id: profile.login_id,
    display_nickname: member.display_nickname || '',
    avatar_url: member.avatar_url || '',
    show_contact: !!member.show_contact,
    show_birthdate: !!member.show_birthdate,
    show_ott: !!member.show_ott,
    nick_locked_until: member.nick_locked_until || null,
  }
  const backToGroup = () => { if (embedded && onClose) onClose(); else navigate(`/groups/${groupId}`) }

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [g, mm] = await Promise.all([getGroup(groupId), getMyGroupMember(groupId, profile?.id)])
      setGroup(g); setMember(mm)
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [groupId, profile?.id])

  useEffect(() => { load() }, [load])

  async function handleLeave() {
    if (!confirm('이 그룹에서 나가시겠습니까?')) return
    try { await leaveGroup(groupId, profile.id); navigate('/') }
    catch (err) { setError(err.message) }
  }

  if (loading) return <div className="page"><div className="spinner" /></div>
  if (error && !group) return <div className="page"><div className="alert alert-error">{error}</div></div>

  return (
    <>
      {error && <div className="page"><div className="alert alert-error">{error}</div></div>}
      {me && (
        <MySettings group={group} me={me} onSaved={backToGroup}
          secondary={isOwner
            ? null
            : { label: '그룹에서 나가기', danger: true, onClick: handleLeave }} />
      )}
    </>
  )
}
