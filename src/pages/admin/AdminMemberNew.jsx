import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminCreateUser } from '../../lib/api'

// 신규 계정 생성 페이지
export default function AdminMemberNew() {
  const nav = useNavigate()
  const [form, setForm] = useState({ nickname: '', password: '', role: 'member', contact: '', birthdate: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function handleCreate(e) {
    e.preventDefault(); setError(''); setBusy(true)
    try {
      await adminCreateUser({
        nickname: form.nickname, password: form.password, role: form.role,
        contact: form.contact, birthdate: form.birthdate || null,
      })
      nav('/admin/members', { replace: true })
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <div className="page admin-page">
      {error && <div className="alert alert-error">{error}</div>}
      <div className="card">
        <h3 className="card-title">계정 생성</h3>
        <form onSubmit={handleCreate} className="form">
          <label className="field"><span>아이디 *</span>
            <input value={form.nickname} onChange={set('nickname')} placeholder="영문 소문자/숫자/._-" autoCapitalize="none" /></label>
          <label className="field"><span>비밀번호 *</span>
            <input type="text" value={form.password} onChange={set('password')} placeholder="6자 이상" /></label>
          <label className="field"><span>역할</span>
            <select value={form.role} onChange={set('role')}>
              <option value="member">멤버</option>
              <option value="admin">관리자</option>
            </select></label>
          <label className="field"><span>연락처 (선택)</span>
            <input value={form.contact} onChange={set('contact')} placeholder="010-1234-5678" /></label>
          <label className="field"><span>생년월일 (선택)</span>
            <input type="date" value={form.birthdate} onChange={set('birthdate')} /></label>
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? '생성 중…' : '계정 생성'}</button>
        </form>
      </div>
    </div>
  )
}
