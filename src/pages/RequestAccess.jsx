import { useState } from 'react'
import { Link } from 'react-router-dom'
import { requestAccess } from '../lib/api'
import Brand from '../components/Brand'

export default function RequestAccess() {
  const [form, setForm] = useState({ nickname: '', password: '', contact: '', birthdate: '' })
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const nick = form.nickname.trim().toLowerCase()
    if (!/^[a-z0-9._-]{2,32}$/.test(nick)) {
      setError('아이디는 영문 소문자/숫자/._- 2~32자여야 합니다.')
      return
    }
    if (form.password.length < 6) {
      setError('비밀번호는 6자 이상이어야 합니다.')
      return
    }
    setBusy(true)
    try {
      await requestAccess({
        nickname: nick,
        password: form.password,
        contact: form.contact.trim(),
        birthdate: form.birthdate || null,
      })
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo">가입 요청</div>
        {done ? (
          <>
            <div className="alert alert-success">
              요청이 접수되었습니다. 관리자가 승인하면 <Brand /> 로 로그인할 수 있어요.
            </div>
            <p className="auth-foot"><Link to="/login">로그인으로 돌아가기</Link></p>
          </>
        ) : (
          <>
            <p className="auth-sub">관리자 승인 후 로그인할 수 있습니다. (<b>아이디·비밀번호</b>는 필수)</p>
            <form onSubmit={handleSubmit} className="form">
              <label className="field">
                <span>아이디 *</span>
                <input autoFocus value={form.nickname} onChange={set('nickname')}
                  placeholder="영문 소문자/숫자/._-" autoComplete="username" />
              </label>
              <label className="field">
                <span>비밀번호 *</span>
                <input type="password" value={form.password} onChange={set('password')}
                  placeholder="6자 이상" autoComplete="new-password" />
              </label>
              <label className="field">
                <span>연락처 (선택)</span>
                <input value={form.contact} onChange={set('contact')} placeholder="예: 010-1234-5678" />
              </label>
              <label className="field">
                <span>생년월일 (선택)</span>
                <input type="date" value={form.birthdate} onChange={set('birthdate')} />
              </label>
              {error && <div className="alert alert-error">{error}</div>}
              <button className="btn btn-primary btn-block" disabled={busy}>
                {busy ? '전송 중…' : '가입 요청 보내기'}
              </button>
            </form>
            <p className="auth-foot"><Link to="/login">로그인으로 돌아가기</Link></p>
          </>
        )}
      </div>
    </div>
  )
}
