import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { listMemberCards } from '../lib/api'
import CrownIcon from '../components/CrownIcon'

function joinLabel(iso) {
  try {
    return `${new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })} 가입`
  } catch { return '' }
}
function telHref(s) {
  const cleaned = String(s).replace(/[^\d+]/g, '')
  const digits = cleaned.replace(/\D/g, '')
  return digits.length >= 3 ? `tel:${cleaned}` : ''
}
function birthLabel(s) {
  if (!s) return ''
  const [y, mo, d] = s.split('-')
  return `${y}년 ${Number(mo)}월 ${Number(d)}일`
}

export default function MemberDetail() {
  const { groupId, userId } = useParams()
  const [member, setMember] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const cards = await listMemberCards(groupId)
      setMember(cards.find((m) => m.user_id === userId) || null)
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [groupId, userId])
  useEffect(() => { load() }, [load])

  if (loading) return <div className="page"><div className="spinner" /></div>
  if (error) return <div className="page"><div className="alert alert-error">{error}</div></div>
  if (!member) return <div className="page"><div className="empty"><p className="muted">멤버를 찾을 수 없어요.</p></div></div>

  const initial = (member.display_nickname || '?').trim()[0]?.toUpperCase() || '?'
  const hasInfo = member.contact || member.birthdate

  return (
    <div className="page member-detail">
      <div className="mp-join">{joinLabel(member.joined_at)}</div>

      <div className={`mp-photo ${member.avatar_url ? 'has-img' : ''}`}
        style={member.avatar_url ? { backgroundImage: `url(${member.avatar_url})` } : undefined}>
        {!member.avatar_url && <span className="mp-initial">{initial}</span>}
        {member.role === 'owner' && (
          <span className="mp-owner" title="소유자"><CrownIcon size={16} /></span>
        )}
        <div className="mp-scrim" />
        <div className="mp-name">
          {member.display_nickname}
          {member.is_self && <span className="mp-me">나</span>}
        </div>
      </div>

      <div className="mp-info">
        {hasInfo ? (
          <>
            {member.contact && (
              <div className="mp-row">
                <span className="mp-k">연락처</span>
                {telHref(member.contact)
                  ? <a className="mp-v mp-tel" href={telHref(member.contact)}>{member.contact}</a>
                  : <span className="mp-v">{member.contact}</span>}
              </div>
            )}
            {member.birthdate && (
              <div className="mp-row"><span className="mp-k">생년월일</span><span className="mp-v">{birthLabel(member.birthdate)}</span></div>
            )}
          </>
        ) : (
          <p className="muted sm mp-empty">공개된 정보가 없어요.</p>
        )}
      </div>
    </div>
  )
}
