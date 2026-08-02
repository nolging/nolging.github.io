import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminCreateUser } from '../../lib/api'
import BirthdayInput from '../../components/BirthdayInput'

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
        {/* label 은 htmlFor 로만 연결하고 텍스트 입력은 defaultValue (관리자 폼 공통 규칙) */}
        <form onSubmit={handleCreate} className="form">
          <div className="field"><label htmlFor="mn-nick">아이디 *</label>
            <input id="mn-nick" defaultValue={form.nickname} onChange={set('nickname')} placeholder="영문 소문자/숫자/._-" autoCapitalize="none" /></div>
          <div className="field"><label htmlFor="mn-pw">비밀번호 *</label>
            <input id="mn-pw" type="text" defaultValue={form.password} onChange={set('password')} placeholder="6자 이상" /></div>
          <div className="field"><label htmlFor="mn-role">역할</label>
            <select id="mn-role" value={form.role} onChange={set('role')}>
              <option value="member">멤버</option>
              <option value="admin">관리자</option>
            </select></div>
          <div className="field"><label htmlFor="mn-contact">연락처 (선택)</label>
            <input id="mn-contact" defaultValue={form.contact} onChange={set('contact')} placeholder="010-1234-5678" /></div>
          <div className="field"><label htmlFor="mn-birth">생년월일 (선택)</label>
            <BirthdayInput value={form.birthdate} onChange={(v) => setForm((f) => ({ ...f, birthdate: v }))} /></div>
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? '생성 중…' : '계정 생성'}</button>
        </form>
      </div>
    </div>
  )
}
