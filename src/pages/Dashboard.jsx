import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { listMyGroups } from '../lib/api'
import Avatar from '../components/Avatar'

export default function Dashboard() {
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [q, setQ] = useState('')
  const inputRef = useRef(null)
  const searchRef = useRef(null)

  async function load() {
    setLoading(true)
    try { setGroups(await listMyGroups()) }
    catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])
  useEffect(() => { if (searchOpen) inputRef.current?.focus() }, [searchOpen])

  const clearDom = () => { if (inputRef.current) inputRef.current.textContent = '' }

  // 검색창 밖을 누르면 접어서 돋보기만 남김 (검색어도 초기화)
  useEffect(() => {
    if (!searchOpen) return
    function onDown(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setSearchOpen(false); setQ(''); clearDom()
      }
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [searchOpen])

  function toggleSearch() {
    setSearchOpen((v) => {
      if (v) { setQ(''); clearDom() } // 닫을 때 검색어 초기화
      return !v
    })
  }
  function clearSearch() { setQ(''); clearDom(); inputRef.current?.focus() }
  function onSearchInput(e) {
    const t = e.currentTarget.textContent || ''
    if (!t) e.currentTarget.innerHTML = '' // 빈 <br> 잔여물 제거 → placeholder 노출
    setQ(t)
  }

  const query = q.trim().toLowerCase()
  const filtered = query
    ? groups.filter((g) =>
        (g.name || '').toLowerCase().includes(query) ||
        (g.description || '').toLowerCase().includes(query))
    : groups

  return (
    <div className="page">
      {error && <div className="alert alert-error">{error}</div>}

      <form ref={searchRef} className={`group-search ${searchOpen ? 'open' : ''}`}
        onSubmit={(e) => e.preventDefault()}>
        <button type="button" className="gs-btn" onClick={toggleSearch}
          aria-label={searchOpen ? '검색 닫기' : '그룹 검색'} aria-expanded={searchOpen}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
        {/* iOS 폼 어시스턴트 바(∧∨✓)를 피하려고 input 대신 contenteditable 사용 */}
        <div ref={inputRef} className="gs-input" contentEditable={searchOpen}
          role="searchbox" aria-label="그룹 검색" data-placeholder="그룹 검색"
          suppressContentEditableWarning onInput={onSearchInput}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.preventDefault()
            if (e.key === 'Escape') toggleSearch()
          }} />
        {searchOpen && q && (
          <button type="button" className="gs-clear" onClick={clearSearch}
            aria-label="검색어 지우기">×</button>
        )}
      </form>

      {loading ? (
        <div className="spinner" />
      ) : (
        <div className="group-grid">
          {/* 첫 칸: 위 그룹 만들기 / 아래 그룹 가입하기 (검색 중엔 숨김) */}
          {!query && (
            <div className="tile-actions">
              <Link to="/groups/new" className="tile-action">
                <span className="tile-action-ico" aria-hidden="true">+</span>
                <span>그룹 만들기</span>
              </Link>
              <Link to="/join" className="tile-action">
                <span className="tile-action-ico" aria-hidden="true">↳</span>
                <span>그룹 가입하기</span>
              </Link>
            </div>
          )}

          {filtered.map((g) => {
            const members = g.group_members || []
            const extra = members.length - 3
            return (
              <Link key={g.id} to={`/groups/${g.id}`} className="group-tile group-card">
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
