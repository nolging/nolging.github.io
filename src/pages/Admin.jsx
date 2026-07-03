import { useEffect, useState, useCallback } from 'react'
import {
  adminCreateUser, listUsers, setUserStatus,
  listAccessRequests, setAccessRequestStatus,
} from '../lib/api'

export default function Admin() {
  const [users, setUsers] = useState([])
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('member')
  const [requestId, setRequestId] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [u, r] = await Promise.all([listUsers(), listAccessRequests()])
      setUsers(u)
      setRequests(r)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleCreate(e) {
    e.preventDefault()
    setError(''); setNotice('')
    setBusy(true)
    try {
      await adminCreateUser({ nickname, password, role, requestId })
      setNotice(`'${nickname.trim().toLowerCase()}' 계정을 생성했습니다.`)
      setNickname(''); setPassword(''); setRole('member'); setRequestId(null)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function prefillFromRequest(req) {
    setNickname(req.nickname)
    setRequestId(req.id)
    setNotice(`가입 요청 '${req.nickname}' 을(를) 폼에 채웠습니다. 비밀번호를 정해 생성하세요.`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function reject(req) {
    try { await setAccessRequestStatus(req.id, 'rejected'); await load() }
    catch (err) { setError(err.message) }
  }

  async function toggleStatus(u) {
    const next = u.status === 'active' ? 'disabled' : 'active'
    try { await setUserStatus(u.id, next); await load() }
    catch (err) { setError(err.message) }
  }

  const pending = requests.filter((r) => r.status === 'pending')

  return (
    <div className="page">
      <div className="page-head"><h1>관리자</h1></div>

      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      <div className="two-col">
        <section className="col-main">
          <div className="card">
            <h3 className="card-title">사용자 생성 / 승인</h3>
            <form onSubmit={handleCreate} className="form">
              <div className="field-row">
                <label className="field">
                  <span>닉네임</span>
                  <input value={nickname} onChange={(e) => setNickname(e.target.value)}
                    placeholder="영문 소문자/숫자/._-" />
                </label>
                <label className="field">
                  <span>비밀번호</span>
                  <input type="text" value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="6자 이상" />
                </label>
                <label className="field field-narrow">
                  <span>역할</span>
                  <select value={role} onChange={(e) => setRole(e.target.value)}>
                    <option value="member">멤버</option>
                    <option value="admin">관리자</option>
                  </select>
                </label>
              </div>
              {requestId && <p className="muted sm">가입 요청과 연결됨 · 생성 시 자동 승인됩니다.</p>}
              <button className="btn btn-primary" disabled={busy}>
                {busy ? '생성 중…' : '계정 생성'}
              </button>
            </form>
          </div>

          <div className="card">
            <h3 className="card-title">사용자 목록 <span className="muted">({users.length})</span></h3>
            {loading ? <div className="spinner" /> : (
              <table className="table">
                <thead>
                  <tr><th>닉네임</th><th>역할</th><th>상태</th><th></th></tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>{u.nickname}</td>
                      <td>{u.role === 'admin' ? '관리자' : '멤버'}</td>
                      <td>
                        <span className={`badge ${u.status === 'active' ? 'badge-done' : 'badge-open'}`}>
                          {u.status === 'active' ? '활성' : '비활성'}
                        </span>
                      </td>
                      <td className="ta-right">
                        <button className="btn btn-sm btn-ghost" onClick={() => toggleStatus(u)}>
                          {u.status === 'active' ? '비활성화' : '활성화'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <aside className="col-side">
          <div className="card">
            <h3 className="card-title">가입 요청 <span className="muted">({pending.length})</span></h3>
            {pending.length === 0 ? (
              <p className="muted sm">대기 중인 요청이 없습니다.</p>
            ) : (
              <ul className="request-list">
                {pending.map((r) => (
                  <li key={r.id}>
                    <div className="request-head">
                      <strong>{r.nickname}</strong>
                    </div>
                    {r.note && <p className="muted sm">{r.note}</p>}
                    <div className="row-gap">
                      <button className="btn btn-sm btn-primary" onClick={() => prefillFromRequest(r)}>승인</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => reject(r)}>거절</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
