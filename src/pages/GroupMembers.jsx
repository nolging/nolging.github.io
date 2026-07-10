import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { listMemberCards, getGroup, isCoupleGroup } from '../lib/api'
import MemberAvatar from '../components/MemberAvatar'
import BottomSheet from '../components/BottomSheet'

function OwnerBadge() {
  return (
    <span className="mlist-owner" title="방장" aria-label="방장">
      <svg width="12" height="11" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 17.5V8l4.4 3.4L12 5.5l4.6 5.9L21 8v9.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" fill="#7363e8" />
      </svg>
    </span>
  )
}
function Chevron() {
  return (
    <svg className="mlist-chev" width="18" viewBox="0 0 24 24" fill="none" stroke="#c9c6d6"
      strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18" /></svg>
  )
}

function birthLabel(s) {
  if (!s) return null
  const [y, mo, d] = String(s).split('-')
  return `${y}.${Number(mo)}.${Number(d)}`
}

export default function GroupMembers() {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const [members, setMembers] = useState([])
  const [group, setGroup] = useState(null)
  const [couple, setCouple] = useState(false)
  const [query, setQuery] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [cards, g, c] = await Promise.all([
        listMemberCards(groupId),
        getGroup(groupId).catch(() => null),
        isCoupleGroup(groupId).catch(() => false),
      ])
      setMembers(cards); setGroup(g); setCouple(c)
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [groupId])
  useEffect(() => { load() }, [load])

  function copyCode() {
    if (!group?.invite_code) return
    navigator.clipboard?.writeText(group.invite_code)
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }

  if (loading) return <div className="page"><div className="spinner" /></div>

  const q = query.trim().toLowerCase()
  const shown = q ? members.filter((m) => (m.display_nickname || '').toLowerCase().includes(q)) : members

  return (
    <div className="page mlist-page">
      {error && <div className="alert alert-error">{error}</div>}

      {/* 검색 */}
      <div className="mlist-search">
        <svg width="17" viewBox="0 0 24 24" fill="none" stroke="#9a96a8" strokeWidth="2.2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="멤버 검색" />
      </div>

      {/* 멤버 초대 (커플 그룹 제외) */}
      {!couple && group?.invite_code && (
        <button type="button" className="mlist-invite" onClick={() => setInviteOpen(true)}>
          <svg width="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" /></svg>
          멤버 초대
        </button>
      )}

      {/* 목록 */}
      <div className="mlist">
        {shown.map((m, i) => {
          const contact = m.contact || null
          const birth = birthLabel(m.birthdate)
          return (
            <div key={m.user_id}>
              {i > 0 && <div className="mlist-div" />}
              <button type="button" className="mlist-row"
                onClick={() => navigate(`/groups/${groupId}/members/${m.user_id}`)}>
                <MemberAvatar src={m.avatar_url} name={m.display_nickname} seed={m.user_id} size={46} />
                <div className="mlist-main">
                  <div className="mlist-name">
                    <span className="mlist-nick">{m.display_nickname}</span>
                    {m.is_self && <span className="mlist-me">나</span>}
                    {m.role === 'owner' && <OwnerBadge />}
                  </div>
                  <div className="mlist-meta">
                    <span className={contact ? '' : 'hidden-v'}>{contact || '비공개'}</span>
                    <span className="mlist-dot" />
                    <span className={birth ? '' : 'hidden-v'}>{birth || '비공개'}</span>
                  </div>
                </div>
                <Chevron />
              </button>
            </div>
          )
        })}
        {shown.length === 0 && <p className="comment-empty">멤버를 찾을 수 없어요.</p>}
      </div>

      <BottomSheet open={inviteOpen} onClose={() => setInviteOpen(false)}>
        <h3 className="sheet-title">함께할 멤버를 초대해 보세요.</h3>
        <div className="invite-box">
          <code className="mono">{group?.invite_code}</code>
          <button className="btn btn-sm" onClick={copyCode}>{copied ? '복사됨!' : '복사'}</button>
        </div>
      </BottomSheet>
    </div>
  )
}
