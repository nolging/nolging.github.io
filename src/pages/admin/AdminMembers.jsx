import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { adminListUsers, adminCoinBalances } from '../../lib/api'
import { formatCoin } from '../../lib/constants'
import useScrollRestore from '../../lib/useScrollRestore'

// 회원 관리(퀘스트 관리와 동일한 카드 스타일). 가입 요청(pending)은 별도 섹션 없이 목록
// 최상단에 그라데이션 테두리 카드로 섞어 보여주고, 카드 클릭 → 상세에서 승인/거절.
// 비활성 계정은 상점 관리 "비매품" 카드와 동일한 흐림 처리(.aq-card.inactive).
export default function AdminMembers() {
  const nav = useNavigate()
  const [users, setUsers] = useState([])
  const [balances, setBalances] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 회원 검색: 원형 돋보기 버튼 → 한 줄 다 차지하는 검색창으로 확장. 엔터 쳐야 실제 검색(실시간 X).
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [term, setTerm] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [us, bal] = await Promise.all([adminListUsers(), adminCoinBalances()])
      setUsers(us); setBalances(bal)
    }
    catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])
  useScrollRestore(!loading) // 상세 → 뒤로가기 시 목록 스크롤 위치 복원

  const pending = users.filter((u) => u.status === 'pending')
  const others = users.filter((u) => u.status !== 'pending')
  const t = term.trim().toLowerCase()
  const rows = [...pending, ...others].filter((u) => !t || (u.nickname || '').toLowerCase().includes(t))

  return (
    <div className="page admin-page aq-page admin-members-page">
      {error && <div className="alert alert-error">{error}</div>}

      <section>
        <div className="aq-section-head">
          {!searchOpen && <span className="aq-section-title">회원</span>}
          {!searchOpen && <span className="aq-count">{rows.length}</span>}
          <div className={`sched-search ${searchOpen ? 'open' : ''}`}>
            <button type="button" className="sched-search-btn" aria-label="회원 검색" title="회원 검색"
              onClick={() => setSearchOpen(true)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
            <input className="sched-search-input" autoFocus={searchOpen} placeholder="회원 검색" enterKeyHint="search"
              value={query} onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); setTerm(query.trim()) } }}
              tabIndex={searchOpen ? 0 : -1} />
            {searchOpen && (
              <button type="button" className="sched-search-clear" aria-label="검색 닫기"
                onClick={() => { setSearchOpen(false); setQuery(''); setTerm('') }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        </div>
        {loading ? <div className="spinner" /> : rows.length === 0 ? (
          <p className="muted sm">{t ? '검색 결과가 없어요.' : '회원이 없습니다.'}</p>
        ) : (
          <div className="aq-cards">
            {rows.map((u) => {
              const pendingRow = u.status === 'pending'
              const disabled = u.status === 'disabled'
              return (
                <button key={u.id} type="button"
                  className={`aq-card${pendingRow ? ' am-pending' : ''}${disabled ? ' inactive' : ''}`}
                  onClick={() => nav(`/admin/members/${u.id}`)}>
                  <span className="aq-card-body">
                    <span className="aq-card-title-row">
                      <span className="aq-card-name">{u.nickname}</span>
                      {!pendingRow && (
                        <span className={`badge ${u.role === 'admin' ? 'badge-admin' : 'badge'}`}>{u.role === 'admin' ? '관리자' : '멤버'}</span>
                      )}
                    </span>
                  </span>
                  {pendingRow ? (
                    <span className="aq-card-badges">
                      <span className="badge badge-pending-req">가입 요청</span>
                    </span>
                  ) : (
                    <span className="aq-card-reward">{formatCoin(balances[u.id] || 0)}</span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </section>

      <Link to="/admin/members/new" className="aq-fab" aria-label="계정 생성">
        <svg width="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </Link>
    </div>
  )
}
