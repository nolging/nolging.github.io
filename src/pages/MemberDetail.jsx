import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { listMemberCards, isCoupleGroup, isFriendGroup, pokeMember, getGroup, leaveGroup, getGroupDecoMap } from '../lib/api'
import { openCompose } from '../lib/composeWindow'
import MemberAvatar from '../components/MemberAvatar'
import OttBadges from '../components/OttBadges'

function telHref(s) {
  const cleaned = String(s).replace(/[^\d+]/g, '')
  const digits = cleaned.replace(/\D/g, '')
  return digits.length >= 3 ? `tel:${cleaned}` : ''
}
function birthLabel(s) {
  if (!s) return ''
  const [y, mo, d] = String(s).split('-')
  return `${y}년 ${Number(mo)}월 ${Number(d)}일`
}

function PaperPlane() {
  return (
    <svg width="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
  )
}
function PokeHand() {
  return (
    <svg width="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 14a8 8 0 0 1-8 8" /><path d="M18 11v-1a2 2 0 0 0-2-2 2 2 0 0 0-2 2" />
      <path d="M14 10V9a2 2 0 0 0-2-2 2 2 0 0 0-2 2v1" /><path d="M10 9.5V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v10" />
      <path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </svg>
  )
}
function LockIcon() {
  return (
    <svg width="16" viewBox="0 0 24 24" fill="none" stroke="#c9c6d6" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
  )
}

export default function MemberDetail({ groupId: groupIdProp, userId: userIdProp, embedded = false, onClose }) {
  // PC 모달로 뜰 땐 groupId/userId 를 props 로 받는다(라우트 파라미터 폴백).
  const params = useParams()
  const groupId = groupIdProp ?? params.groupId
  const userId = userIdProp ?? params.userId
  const navigate = useNavigate()
  const [member, setMember] = useState(null)
  const [group, setGroup] = useState(null)
  const [premium, setPremium] = useState(false) // 커플/우정 링 → 콕 찌르기 가능
  const [iAmOwner, setIAmOwner] = useState(false)
  const [meCard, setMeCard] = useState(null) // 내 그룹내 닉네임·아바타 (쪽지 From)
  const [poking, setPoking] = useState(false)
  const [toast, setToast] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [decoMap, setDecoMap] = useState({})

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [cards, g, couple, friend, decos] = await Promise.all([
        listMemberCards(groupId),
        getGroup(groupId).catch(() => null),
        isCoupleGroup(groupId).catch(() => false),
        isFriendGroup(groupId).catch(() => false),
        getGroupDecoMap(groupId).catch(() => ({})),
      ])
      setDecoMap(decos || {})
      const self = cards.find((m) => m.is_self)
      setMember(cards.find((m) => m.user_id === userId) || null)
      setIAmOwner((self || {}).role === 'owner')
      setMeCard(self || null)
      setGroup(g)
      setPremium(couple || friend)
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [groupId, userId])
  useEffect(() => { load() }, [load])

  async function poke() {
    if (poking) return
    setPoking(true); setError('')
    try {
      await pokeMember(groupId, userId)
      setToast('콕 찔렀어요!'); setTimeout(() => setToast(''), 1600)
    } catch (err) { setError(err.message) } finally { setPoking(false) }
  }

  function sendNote() {
    openCompose(navigate, {
      reply: {
        recipient: { groupId, groupName: group?.name || '', userId, name: member.display_nickname, avatar: member.avatar_url },
        me: { name: meCard?.display_nickname || '', avatar: meCard?.avatar_url || null },
      },
    })
  }

  async function kick() {
    if (!confirm(`${member.display_nickname} 님을 그룹에서 내보낼까요?`)) return
    try { await leaveGroup(groupId, userId); if (embedded && onClose) onClose(); else navigate(`/groups/${groupId}/members`) }
    catch (err) { setError(err.message) }
  }

  if (loading) return <div className="page"><div className="spinner" /></div>
  if (error && !member) return <div className="page"><div className="alert alert-error">{error}</div></div>
  if (!member) return <div className="page"><div className="empty"><p className="muted">멤버를 찾을 수 없어요.</p></div></div>

  if (member.is_left) {
    return (
      <div className="page md-page">
        <div className="md-profile">
          <MemberAvatar src={member.avatar_url} name={member.display_nickname} seed={member.user_id} size={104} fontScale={0.33} deco={decoMap[member.user_id]} />
          <div className="md-name">{member.display_nickname}</div>
          <div className="md-left-badge">탈퇴한 멤버</div>
        </div>
        <div className="md-empty-hint" style={{ textAlign: 'center' }}>그룹을 나간 멤버예요.<br />남긴 글과 댓글은 그대로 남아 있어요.</div>
      </div>
    )
  }

  const ott = Array.isArray(member.subscribed_ott) ? member.subscribed_ott : []
  const hasContact = !!member.contact
  const hasBirth = !!member.birthdate
  const hasOtt = ott.length > 0
  const nothingShared = !hasContact && !hasBirth && !hasOtt
  const tel = hasContact ? telHref(member.contact) : ''

  return (
    <div className="page md-page">
      {/* 내 정보(모달)일 때: 우측 상단 톱니(내 정보 수정) */}
      {embedded && member.is_self && (
        <button type="button" className="md-gear" onClick={() => navigate(`/groups/${groupId}/settings`)}
          aria-label="내 정보 수정" title="내 정보 수정">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      )}
      {/* 프로필 */}
      <div className="md-profile">
        <MemberAvatar src={member.avatar_url} name={member.display_nickname} seed={member.user_id} size={104} fontScale={0.33} deco={decoMap[member.user_id]} />
        <div className="md-name">{member.display_nickname}{member.is_self && <span className="md-me">나</span>}</div>
        {!member.is_self && (
          <div className="md-actions">
            <button type="button" className="md-btn md-btn-primary" onClick={sendNote}><PaperPlane /> 쪽지 보내기</button>
            {premium && (
              <button type="button" className="md-btn md-btn-ghost" disabled={poking} onClick={poke}><PokeHand /> 콕 찌르기</button>
            )}
          </div>
        )}
      </div>

      {/* 공개된 정보 */}
      <div className="md-info">
        <div className="md-info-label">공개된 정보</div>
        <div className="md-card">
          {/* 연락처 */}
          <div className="md-row">
            <span className={`md-row-icon ${hasContact ? '' : 'off'}`} style={hasContact ? { background: '#e6eefd' } : undefined}>📞</span>
            <div className="md-row-main">
              <div className={`md-row-k ${hasContact ? '' : 'off'}`}>연락처</div>
              {hasContact
                ? <div className="md-row-v">{member.contact}</div>
                : <div className="md-row-v hidden">비공개</div>}
            </div>
            {hasContact
              ? (tel && <a className="md-call" href={tel} aria-label="전화" title="전화">
                  <svg width="16" viewBox="0 0 24 24" fill="none" stroke="#191722" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                </a>)
              : <LockIcon />}
          </div>
          {/* 생년월일 */}
          <div className="md-row">
            <span className={`md-row-icon ${hasBirth ? '' : 'off'}`} style={hasBirth ? { background: '#fde8ee' } : undefined}>🎂</span>
            <div className="md-row-main">
              <div className={`md-row-k ${hasBirth ? '' : 'off'}`}>생년월일</div>
              {hasBirth
                ? <div className="md-row-v">{birthLabel(member.birthdate)}</div>
                : <div className="md-row-v hidden">비공개</div>}
            </div>
            {!hasBirth && <LockIcon />}
          </div>
          {/* 구독 OTT */}
          <div className={`md-row ${hasOtt ? 'md-row-top' : ''}`}>
            <span className={`md-row-icon ${hasOtt ? '' : 'off'}`} style={hasOtt ? { background: '#eeebfe' } : undefined}>📺</span>
            <div className="md-row-main">
              <div className={`md-row-k ${hasOtt ? '' : 'off'}`}>구독 OTT</div>
              {hasOtt
                ? <div className="md-row-ott"><OttBadges list={ott} /></div>
                : <div className="md-row-v hidden">비공개</div>}
            </div>
            {!hasOtt && <LockIcon />}
          </div>
        </div>

        {nothingShared && (
          <div className="md-empty-hint">아직 공개한 정보가 없어요. 멤버가 공개한 정보만 볼 수 있어요.</div>
        )}
      </div>

      {/* 내보내기 (소유자 전용, 본인 제외) */}
      {iAmOwner && !member.is_self && (
        <div className="md-footer">
          <button type="button" className="md-kick" onClick={kick}>
            <svg width="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18.36 6.64a9 9 0 1 1-12.73 0" /><line x1="12" y1="2" x2="12" y2="12" /></svg>
            그룹에서 내보내기
          </button>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
