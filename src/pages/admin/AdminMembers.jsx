import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { adminListUsers } from '../../lib/api'
import { STATUS } from './adminMeta'
import useScrollRestore from '../../lib/useScrollRestore'

// 회원 관리(퀘스트 관리와 동일한 카드 스타일). 가입 요청(pending)은 별도 섹션 없이 목록
// 최상단에 그라데이션 테두리 카드로 섞어 보여주고, 카드 클릭 → 상세에서 승인/거절.
export default function AdminMembers() {
  const nav = useNavigate()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try { setUsers(await adminListUsers()) }
    catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])
  useScrollRestore(!loading) // 상세 → 뒤로가기 시 목록 스크롤 위치 복원

  const pending = users.filter((u) => u.status === 'pending')
  const others = users.filter((u) => u.status !== 'pending')
  const rows = [...pending, ...others]

  return (
    <div className="page admin-page aq-page admin-members-page">
      {error && <div className="alert alert-error">{error}</div>}

      <section>
        <div className="aq-section-head">
          <span className="aq-section-title">회원</span>
          <span className="aq-count">{rows.length}</span>
        </div>
        {loading ? <div className="spinner" /> : rows.length === 0 ? (
          <p className="muted sm">회원이 없습니다.</p>
        ) : (
          <div className="aq-cards">
            {rows.map((u) => (
              <button key={u.id} type="button" className={`aq-card${u.status === 'pending' ? ' am-pending' : ''}`}
                onClick={() => nav(`/admin/members/${u.id}`)}>
                <span className="aq-card-body">
                  <span className="aq-card-name">{u.nickname}</span>
                </span>
                <span className="aq-card-badges">
                  {u.status === 'pending' ? (
                    <span className="badge badge-pending-req">가입 요청</span>
                  ) : (
                    <>
                      <span className={`badge ${u.role === 'admin' ? 'badge-admin' : 'badge'}`}>{u.role === 'admin' ? '관리자' : '멤버'}</span>
                      <span className={`badge ${STATUS[u.status]?.cls}`}>{STATUS[u.status]?.label}</span>
                    </>
                  )}
                </span>
              </button>
            ))}
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
