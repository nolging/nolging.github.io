import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { adminListUsers, adminSetStatus, adminDeleteUser } from '../../lib/api'
import { STATUS } from './adminMeta'

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

  async function act(fn, okMsg) {
    setError(''); setNotice('')
    try { await fn(); if (okMsg) setNotice(okMsg); await load() }
    catch (err) { setError(err.message) }
  }

  const pending = users.filter((u) => u.status === 'pending')
  const others = users.filter((u) => u.status !== 'pending')

  return (
    <div className="page admin-page">
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

      {/* 회원 목록 */}
      <div className="card">
        <div className="admin-list-head">
          <h3 className="card-title" style={{ margin: 0 }}>회원 목록 <span className="muted">({others.length})</span></h3>
          <Link to="/admin/members/new" className="btn btn-sm btn-primary">계정 생성</Link>
        </div>
        {loading ? <div className="spinner" /> : others.length === 0 ? (
          <p className="muted sm">회원이 없습니다.</p>
        ) : (
          <ul className="admin-rows">
            {others.map((u) => (
              <li key={u.id}>
                <button type="button" className="admin-row" onClick={() => nav(`/admin/members/${u.id}`)}>
                  <span className="admin-row-main">{u.nickname}</span>
                  <span className="admin-row-side">
                    <span className={`badge ${u.role === 'admin' ? 'badge-admin' : 'badge'}`}>{u.role === 'admin' ? '관리자' : '멤버'}</span>
                    <span className={`badge ${STATUS[u.status]?.cls}`}>{STATUS[u.status]?.label}</span>
                    <span className="admin-row-caret" aria-hidden="true">›</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
