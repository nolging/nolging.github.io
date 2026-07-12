import { useEffect, useRef, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { listMyGroups, unreadNotificationCount, listCoupleGroups, listFriendGroups, getMyLedBanner } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import Avatar from '../components/Avatar'
import GroupBadge from '../components/GroupBadge'
import PeekCat from '../components/PeekCat'
import ThemeHearts from '../components/ThemeHearts'
import LedBanner from '../components/LedBanner'
import { LedEditModal } from '../components/LedModals'
import InviteCodeSheet from '../components/InviteCodeSheet'
import { useNavigate } from 'react-router-dom'

function BellIcon() {
  return (
    <svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3.4a5.6 5.6 0 0 0-5.6 5.6c0 3-.7 4.7-1.6 5.9-.5.7 0 1.6.8 1.6h12.8c.8 0 1.3-.9.8-1.6-.9-1.2-1.6-2.9-1.6-5.9A5.6 5.6 0 0 0 12 3.4Z" />
      <path d="M10 20.6a2.4 2.4 0 0 0 4 0" />
    </svg>
  )
}

// 기념일부터 오늘까지 며칠째 (기념일이 1일차)
function daysSince(dateStr) {
  if (!dateStr) return null
  const [y, mo, d] = String(dateStr).split('-').map(Number)
  if (!y || !mo || !d) return null
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.floor((today - new Date(y, mo - 1, d)) / 86400000) + 1
}

function dayGreeting() {
  const d = new Date()
  const wd = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()]
  const h = d.getHours()
  const period = h < 6 ? '새벽' : h < 12 ? '오전' : h < 18 ? '오후' : '저녁'
  return `${wd}요일 ${period}`
}

export default function Dashboard() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [groups, setGroups] = useState([])
  const [premiumIds, setPremiumIds] = useState([])
  const [friendIds, setFriendIds] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [unread, setUnread] = useState(0)
  const [banner, setBanner] = useState(null) // 활성 전광판
  const [ledEditOpen, setLedEditOpen] = useState(false)
  const inputRef = useRef(null)
  const reloadBanner = () => getMyLedBanner().then(setBanner).catch(() => {})

  async function load() {
    setLoading(true)
    try { setGroups(await listMyGroups()) }
    catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])
  useEffect(() => { unreadNotificationCount().then(setUnread).catch(() => {}) }, [])
  useEffect(() => { reloadBanner() }, [])
  useEffect(() => {
    if (!profile?.id) return
    listCoupleGroups(profile.id).then(setPremiumIds).catch(() => {})
    listFriendGroups().then(setFriendIds).catch(() => {})
  }, [profile?.id])

  const premiumSet = new Set(premiumIds)
  const friendSet = new Set(friendIds)
  const query = q.trim().toLowerCase()
  const matched = query
    ? groups.filter((g) =>
        (g.name || '').toLowerCase().includes(query) ||
        (g.description || '').toLowerCase().includes(query))
    : groups
  // 커플링이 적용된 프리미엄 그룹을 항상 최상단으로 고정
  const filtered = [...matched].sort((a, b) => (premiumSet.has(b.id) ? 1 : 0) - (premiumSet.has(a.id) ? 1 : 0))

  return (
    <div className="page">
      <div className="dash-head">
        <div>
          <div className="dash-greet-when">{dayGreeting()}</div>
          <h1 className="dash-greet-title">오늘은 뭐 하고 놀징</h1>
        </div>
        <NavLink to="/notifications" className="dash-bell" aria-label="알림" title="알림">
          <BellIcon />
          {unread > 0 && <span className="dash-bell-badge">{unread > 99 ? '99+' : unread}</span>}
        </NavLink>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="dash-search">
        <div className="ds-box">
          <svg className="ds-icon" width="17" height="17" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input ref={inputRef} className="ds-input" type="text" value={q}
            onChange={(e) => setQ(e.target.value)} placeholder="그룹 검색"
            aria-label="그룹 검색" enterKeyHint="search"
            autoComplete="off" autoCorrect="off" autoCapitalize="none" />
          {q && (
            <button type="button" className="ds-clear"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { setQ(''); inputRef.current?.focus() }}
              aria-label="검색어 지우기">×</button>
          )}
        </div>
        <button type="button" className="ds-join" onClick={() => setInviteOpen(true)}
          aria-label="초대 코드로 가입하기" title="초대 코드로 가입하기">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" />
          </svg>
        </button>
      </div>

      {banner && (
        <div className={`dash-led ${banner.is_owner ? 'dash-led-click' : ''}`}
          role={banner.is_owner ? 'button' : undefined}
          onClick={banner.is_owner ? () => setLedEditOpen(true) : undefined}>
          <LedBanner text={banner.text} color={banner.color} />
        </div>
      )}

      {loading ? (
        <div className="spinner" />
      ) : (
        <div className="group-grid">
          {filtered.map((g) => {
            const members = g.group_members || []
            const extra = members.length - 3
            // 관리자는 미가입 그룹도 보임 → 내가 멤버가 아니면 카드 반투명 처리
            const isMember = members.some((m) => m.user_id === profile?.id)
            const premium = premiumSet.has(g.id)
            const friend = !premium && friendSet.has(g.id)
            // 아바타 영역 클릭 → 카드 이동 대신 멤버 목록 페이지로
            const goMembers = (e) => { e.preventDefault(); e.stopPropagation(); navigate(`/groups/${g.id}/members`) }
            const memberRow = members.length > 0 && (
              premium ? (
                <span className="task-parts tile-members tile-members-couple tile-members-link" role="button" tabIndex={0}
                  onClick={goMembers} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') goMembers(e) }}
                  aria-label="멤버 목록">
                  {members.slice(0, 2).map((m) => (
                    <Avatar key={m.user_id} src={m.avatar_url} name={m.display_nickname || '멤버'} size={24} />
                  ))}
                  <span className="tile-couple-heart" aria-hidden="true">♥</span>
                </span>
              ) : (
                <span className={`task-parts tile-members tile-members-link ${members.length > 1 ? 'multi' : ''}`} role="button" tabIndex={0}
                  onClick={goMembers} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') goMembers(e) }}
                  aria-label="멤버 목록">
                  {members.slice(0, 3).map((m) => (
                    <Avatar key={m.user_id} src={m.avatar_url} name={m.display_nickname || '멤버'} size={24} />
                  ))}
                  {extra > 0 && <span className="task-parts-more">+{extra}</span>}
                </span>
              )
            )
            return (
              <Link key={g.id} to={`/groups/${g.id}`}
                className={`group-tile group-card ${isMember ? '' : 'not-joined'} ${premium ? 'premium' : ''} ${friend ? 'friend' : ''}`}>
                <GroupBadge emoji={g.emoji} bg={g.emoji_bg} name={g.name} size={34} radius={12} />
                {premium && daysSince(g.anniversary) != null && (
                  <span className="tile-anniv">D+{daysSince(g.anniversary)}</span>
                )}
                <h3 className="tile-name">{g.name}</h3>
                {g.description && <p className="tile-desc muted">{g.description}</p>}
                {memberRow}
                {premium && <PeekCat className="tile-couple-cat" width={96} />}
                {g.deco_theme === 'heart' && <ThemeHearts />}
              </Link>
            )
          })}

          {!query && (
            <Link to="/groups/new" className="group-tile group-new">
              <span className="group-new-plus">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </span>
              <span className="group-new-label">새 그룹 만들기</span>
            </Link>
          )}
        </div>
      )}

      {!loading && query && filtered.length === 0 && (
        <p className="muted sm empty-hint">"{q.trim()}"에 해당하는 그룹이 없어요.</p>
      )}

      <LedEditModal open={ledEditOpen} onClose={() => setLedEditOpen(false)} banner={banner} onDone={reloadBanner} />
      <InviteCodeSheet open={inviteOpen} onClose={() => setInviteOpen(false)}
        onSuccess={(preview, code) => { setInviteOpen(false); navigate('/join', { state: { preview, code } }) }} />
    </div>
  )
}
