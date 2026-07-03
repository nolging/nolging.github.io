import { useEffect, useState, useCallback } from 'react'
import { adminCreateUser, adminListUsers, adminSetStatus, adminDeleteUser } from '../lib/api'

const STATUS = {
  active: { label: '활성', cls: 'badge-done' },
  pending: { label: '승인 대기', cls: 'badge-open' },
  disabled: { label: '비활성', cls: 'badge' },
}

export default function Admin() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [form, setForm] = useState({ nickname: '', password: '', role: 'member', contact: '', birthdate: '' })
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setUsers(await adminListUsers())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleCreate(e) {
    e.preventDefault()
    setError(''); setNotice(''); setBusy(true)
    try {
      await adminCreateUser({
        nickname: form.nickname, password: form.password, role: form.role,
        contact: form.contact, birthdate: form.birthdate || null,
      })
      setNotice(`'${form.nickname.trim().toLowerCase()}' 계정을 생성했습니다.`)
      setForm({ nickname: '', password: '', role: 'member', contact: '', birthdate: '' })
      await load()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  async function act(fn, okMsg) {
    setError(''); setNotice('')
    try { await fn(); if (okMsg) setNotice(okMsg); await load() }
    catch (err) { setError(err.message) }
  }

  const pending = users.filter((u) => u.status === 'pending')
  const others = users.filter((u) => u.status !== 'pending')

  return (
    <div className="page">
      <div className="page-head"><h1>관리자</h1></div>
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      {/* 가입 요청 (승인 대기) */}
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

      {/* 사용자 직접 생성 */}
      <div className="card">
        <h3 className="card-title">사용자 생성</h3>
        <form onSubmit={handleCreate} className="form">
          <div className="field-row">
            <label className="field"><span>아이디 *</span>
              <input value={form.nickname} onChange={set('nickname')} placeholder="영문 소문자/숫자/._-" /></label>
            <label className="field"><span>비밀번호 *</span>
              <input type="text" value={form.password} onChange={set('password')} placeholder="6자 이상" /></label>
            <label className="field field-narrow"><span>역할</span>
              <select value={form.role} onChange={set('role')}>
                <option value="member">멤버</option>
                <option value="admin">관리자</option>
              </select></label>
          </div>
          <div className="field-row">
            <label className="field"><span>연락처 (선택)</span>
              <input value={form.contact} onChange={set('contact')} placeholder="010-1234-5678" /></label>
            <label className="field"><span>생년월일 (선택)</span>
              <input type="date" value={form.birthdate} onChange={set('birthdate')} /></label>
          </div>
          <button className="btn btn-primary" disabled={busy}>{busy ? '생성 중…' : '계정 생성'}</button>
        </form>
      </div>

      {/* 사용자 목록 */}
      <div className="card">
        <h3 className="card-title">사용자 목록 <span className="muted">({others.length})</span></h3>
        {loading ? <div className="spinner" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>아이디</th><th>역할</th><th>연락처</th><th>생년월일</th><th>상태</th><th></th></tr>
              </thead>
              <tbody>
                {others.map((u) => (
                  <tr key={u.id}>
                    <td>{u.nickname}</td>
                    <td>{u.role === 'admin' ? '관리자' : '멤버'}</td>
                    <td className="muted">{u.contact || '—'}</td>
                    <td className="muted">{u.birthdate || '—'}</td>
                    <td><span className={`badge ${STATUS[u.status]?.cls}`}>{STATUS[u.status]?.label}</span></td>
                    <td className="ta-right row-gap" style={{ justifyContent: 'flex-end' }}>
                      <button className="btn btn-sm btn-ghost"
                        onClick={() => act(() => adminSetStatus(u.id, u.status === 'active' ? 'disabled' : 'active'))}>
                        {u.status === 'active' ? '비활성화' : '활성화'}
                      </button>
                      {u.role !== 'admin' && (
                        <button className="btn btn-sm btn-icon" title="삭제"
                          onClick={() => { if (confirm(`'${u.nickname}' 계정을 삭제할까요?`)) act(() => adminDeleteUser(u.id)) }}>✕</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
