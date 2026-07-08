import { useEffect, useRef, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { listMyGroups, unreadNotificationCount } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import Avatar from '../components/Avatar'
import GroupBadge from '../components/GroupBadge'

function BellIcon() {
  return (
    <svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3.4a5.6 5.6 0 0 0-5.6 5.6c0 3-.7 4.7-1.6 5.9-.5.7 0 1.6.8 1.6h12.8c.8 0 1.3-.9.8-1.6-.9-1.2-1.6-2.9-1.6-5.9A5.6 5.6 0 0 0 12 3.4Z" />
      <path d="M10 20.6a2.4 2.4 0 0 0 4 0" />
    </svg>
  )
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
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [q, setQ] = useState('')
  const [unread, setUnread] = useState(0)
  const inputRef = useRef(null)

  async function load() {
    setLoading(true)
    try { setGroups(await listMyGroups()) }
    catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])
  useEffect(() => { unreadNotificationCount().then(setUnread).catch(() => {}) }, [])
  useEffect(() => { if (searchOpen) inputRef.current?.focus() }, [searchOpen])

  // 접힘은 blur 로 처리 → iOS 어디를 누르든(포커스 해제) 안정적으로 닫힌다.
  // blur 직후 카드 클릭이 먼저 처리되도록 약간 지연 + 재포커스 시엔 닫지 않음.
  function openSearch() { setSearchOpen(true) }
  function closeSearch() {
    if (document.activeElement === inputRef.current) return
    setSearchOpen(false); setQ('')
  }
  function onSearchBlur() { setTimeout(closeSearch, 120) }
  function clearSearch() { setQ(''); inputRef.current?.focus() }

  const query = q.trim().toLowerCase()
  const filtered = query
    ? groups.filter((g) =>
        (g.name || '').toLowerCase().includes(query) ||
        (g.description || '').toLowerCase().includes(query))
    : groups

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

      <div className={`group-search ${searchOpen ? 'open' : ''}`}>
        <button type="button" className="gs-btn"
          onMouseDown={(e) => e.preventDefault()} onClick={openSearch}
          aria-label="그룹 검색" aria-expanded={searchOpen}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>

        <span className="gs-spacer" aria-hidden="true" />

        {/* 우측: 그룹 만들기(+) / 그룹 가입하기(편지지) — 검색창 열리면 입력창이 덮어 가림 */}
        <div className="gs-actions">
          <Link to="/groups/new" className="gs-act" aria-label="그룹 만들기" title="그룹 만들기">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </Link>
          <Link to="/join" className="gs-act" aria-label="그룹 가입하기" title="그룹 가입하기">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" />
            </svg>
          </Link>
        </div>

        {/* placeholder 는 열렸을 때만 — iOS 에서 placeholder 가 접힘 후 잔상으로 남는 버그 방지 */}
        <input ref={inputRef} className="gs-input" type="text" value={q}
          onChange={(e) => setQ(e.target.value)} placeholder={searchOpen ? '그룹 검색' : ''}
          aria-label="그룹 검색" enterKeyHint="search"
          autoComplete="off" autoCorrect="off" autoCapitalize="none"
          tabIndex={searchOpen ? 0 : -1}
          onBlur={onSearchBlur}
          onKeyDown={(e) => e.key === 'Escape' && inputRef.current?.blur()} />
        {searchOpen && q && (
          <button type="button" className="gs-clear"
            onMouseDown={(e) => e.preventDefault()} onClick={clearSearch}
            aria-label="검색어 지우기">×</button>
        )}
      </div>

      {loading ? (
        <div className="spinner" />
      ) : (
        <div className="group-grid">
          {filtered.map((g) => {
            const members = g.group_members || []
            const extra = members.length - 3
            // 관리자는 미가입 그룹도 보임 → 내가 멤버가 아니면 카드 반투명 처리
            const isMember = members.some((m) => m.user_id === profile?.id)
            return (
              <Link key={g.id} to={`/groups/${g.id}`}
                className={`group-tile group-card ${isMember ? '' : 'not-joined'}`}>
                <GroupBadge emoji={g.emoji} bg={g.emoji_bg} name={g.name} size={40} />
                <h3 className="tile-name">{g.name}</h3>
                {g.description && <p className="tile-desc muted">{g.description}</p>}
                <span className={`task-parts tile-members ${members.length > 1 ? 'multi' : ''}`}>
                  {members.slice(0, 3).map((m) => (
                    <Avatar key={m.user_id} src={m.avatar_url} name={m.display_nickname || m.profiles?.nickname} size={26} />
                  ))}
                  {extra > 0 && <span className="task-parts-more">+{extra}</span>}
                </span>
              </Link>
            )
          })}
        </div>
      )}

      {!loading && query && filtered.length === 0 && (
        <p className="muted sm empty-hint">"{q.trim()}"에 해당하는 그룹이 없어요.</p>
      )}
      {!loading && !query && groups.length === 0 && (
        <p className="muted sm empty-hint">초대 코드가 있다면 <Link to="/join">가입</Link>할 수도 있어요.</p>
      )}
    </div>
  )
}
