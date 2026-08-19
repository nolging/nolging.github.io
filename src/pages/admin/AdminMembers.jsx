import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { adminListUsers, adminSetStatus, adminDeleteUser } from '../../lib/api'
import { STATUS } from './adminMeta'
import useScrollRestore from '../../lib/useScrollRestore'

// 회원 관리 — 가입 승인 + 회원 목록(모바일: 아이디/역할/상태만). 행 클릭 → 상세.
export default function AdminMembers() {
  const nav = useNavigate()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try { setUsers(await adminListUsers()) }
    catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])
  useScrollRestore(!loading) // 상세 → 뒤로가기 시 목록 스크롤 위치 복원

  async function act(fn, okMsg) {
    setError(''); setNotice('')
    try { await fn(); if (okMsg) setNotice(okMsg); await load() }
    catch (err) { setError(err.message) }
  }

  const pending = users.filter((u) => u.status === 'pending')
  const others = users.filter((u) => u.status !== 'pending')

  return (
    <div className="page admin-page aq-page admin-members-page">
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      {/* 가입 요청 */}
      <div className="card">
        <h3 className="card-title">가입 요청 <span className="muted">({pending.length})</span></h3>
        {pending.length === 0 ? (
          <p className="muted sm">대기 중인 요청이 없습니다.</p>
        ) : (
          <ul className="request-list">
            {pending.map((u) => (
              <li key={u.id}>
                <div className="request-head">
                  <strong>{u.nickname}</strong>
                  {u.contact && <span className="muted sm">· {u.contact}</span>}
                  {u.birthdate && <span className="muted sm">· {u.birthdate}</span>}
                </div>
                <div className="row-gap">
                  <button className="btn btn-sm btn-primary"
                    onClick={() => act(() => adminSetStatus(u.id, 'active'), `'${u.nickname}' 승인 완료`)}>승인</button>
                  <button className="btn btn-sm btn-ghost"
                    onClick={() => { if (confirm(`'${u.nickname}' 요청을 거절(삭제)할까요?`)) act(() => adminDeleteUser(u.id), '요청을 거절했습니다.') }}>거절</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 회원 목록(퀘스트 관리와 동일한 카드 스타일) */}
      <section>
        <div className="aq-section-head">
          <span className="aq-section-title">회원</span>
          <span className="aq-count">{others.length}</span>
        </div>
        {loading ? <div className="spinner" /> : others.length === 0 ? (
          <p className="muted sm">회원이 없습니다.</p>
        ) : (
          <div className="aq-cards">
            {others.map((u) => (
              <button key={u.id} type="button" className="aq-card" onClick={() => nav(`/admin/members/${u.id}`)}>
                <span className="aq-card-body">
                  <span className="aq-card-name">{u.nickname}</span>
                </span>
                <span className="aq-card-badges">
                  <span className={`badge ${u.role === 'admin' ? 'badge-admin' : 'badge'}`}>{u.role === 'admin' ? '관리자' : '멤버'}</span>
                  <span className={`badge ${STATUS[u.status]?.cls}`}>{STATUS[u.status]?.label}</span>
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
