import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { adminListUsers, adminCoinBalances, adminSetRole, adminSetStatus, adminDeleteUser, adminGrantCoin } from '../../lib/api'
import { formatCoin } from '../../lib/constants'
import { STATUS } from './adminMeta'

// 회원 상세 — 정보 나열 + 역할 수정(관리자 부여) + 츄르 지급/차감 + 삭제
export default function AdminMemberDetail() {
  const { userId } = useParams()
  const nav = useNavigate()
  const [user, setUser] = useState(null)
  const [balance, setBalance] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const [role, setRole] = useState('member')
  const [grant, setGrant] = useState({ sign: 1, amount: '', reason: '' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [us, bal] = await Promise.all([adminListUsers(), adminCoinBalances()])
      const u = us.find((x) => x.id === userId) || null
      setUser(u); setRole(u?.role || 'member'); setBalance(bal[userId] || 0)
      if (!u) setError('회원을 찾을 수 없어요.')
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [userId])
  useEffect(() => { load() }, [load])

  async function saveRole() {
    if (!user || role === user.role) return
    setError(''); setNotice(''); setBusy(true)
    try { await adminSetRole(userId, role); setNotice('역할을 변경했어요.'); await load() }
    catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  async function toggleStatus() {
    setError(''); setNotice(''); setBusy(true)
    try { await adminSetStatus(userId, user.status === 'active' ? 'disabled' : 'active'); await load() }
    catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  function remove() {
    if (!confirm(`'${user.nickname}' 계정을 삭제할까요? (되돌릴 수 없어요)`)) return
    setError(''); setBusy(true)
    adminDeleteUser(userId)
      .then(() => nav('/admin/members', { replace: true }))
      .catch((err) => { setError(err.message); setBusy(false) })
  }
  async function submitGrant(e) {
    e.preventDefault(); setError(''); setNotice('')
    const mag = parseInt(grant.amount, 10)
    if (!Number.isInteger(mag) || mag <= 0) { setError('수량(1 이상 정수)을 입력해 주세요.'); return }
    const amount = grant.sign * mag
    setBusy(true)
    try {
      const bal = await adminGrantCoin({ userId, amount, reason: grant.reason })
      setNotice(`${amount > 0 ? `+${amount}` : amount} 츄르 → 잔액 ${formatCoin(bal)}`)
      setGrant({ sign: 1, amount: '', reason: '' }); setBalance(bal)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  if (loading) return <div className="page admin-page"><div className="spinner" /></div>
  if (!user) return <div className="page admin-page"><div className="alert alert-error">{error || '회원을 찾을 수 없어요.'}</div></div>

  const rows = [
    ['아이디', user.nickname],
    ['역할', user.role === 'admin' ? '관리자' : '멤버'],
    ['상태', STATUS[user.status]?.label || user.status],
    ['보유 츄르', formatCoin(balance)],
    ['연락처', user.contact || '—'],
    ['생년월일', user.birthdate || '—'],
  ]

  return (
    <div className="page admin-page">
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      <div className="card">
        <h3 className="card-title">{user.nickname}</h3>
        <dl className="admin-detail">
          {rows.map(([k, v]) => (
            <div key={k} className="admin-detail-row"><dt>{k}</dt><dd>{v}</dd></div>
          ))}
        </dl>
      </div>

      {/* 역할 수정 */}
      <div className="card">
        <h3 className="card-title">역할</h3>
        <div className="row-gap" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label className="field" style={{ flex: 1, minWidth: 140 }}><span>역할</span>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="member">멤버</option>
              <option value="admin">관리자</option>
            </select></label>
          <button type="button" className="btn btn-primary" disabled={busy || role === user.role} onClick={saveRole}>변경 저장</button>
        </div>
      </div>

      {/* 츄르 지급/차감 */}
      <div className="card">
        <h3 className="card-title">츄르 지급</h3>
        <form onSubmit={submitGrant} className="form">
          <div className="field-row">
            <div className="field"><span>구분 *</span>
              <div className="toggle-group">
                <button type="button" className={`toggle ${grant.sign === 1 ? 'active' : ''}`} onClick={() => setGrant((g) => ({ ...g, sign: 1 }))}>지급 +</button>
                <button type="button" className={`toggle ${grant.sign === -1 ? 'active' : ''}`} onClick={() => setGrant((g) => ({ ...g, sign: -1 }))}>차감 −</button>
              </div>
            </div>
            <label className="field field-narrow"><span>수량 *</span>
              <input type="number" inputMode="numeric" min="1" value={grant.amount}
                onChange={(e) => setGrant((g) => ({ ...g, amount: e.target.value }))} placeholder="예: 10" /></label>
          </div>
          <label className="field"><span>사유 (선택)</span>
            <input value={grant.reason} onChange={(e) => setGrant((g) => ({ ...g, reason: e.target.value }))} placeholder="예: 이벤트 보상" /></label>
          <button className="btn btn-primary" disabled={busy}>{busy ? '처리 중…' : '지급/차감'}</button>
        </form>
      </div>

      {/* 상태 / 삭제 */}
      <div className="card">
        <h3 className="card-title">계정 관리</h3>
        <div className="row-gap" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={toggleStatus}>
            {user.status === 'active' ? '비활성화' : '활성화'}
          </button>
          <button type="button" className="btn btn-danger" disabled={busy} onClick={remove}>계정 삭제</button>
        </div>
      </div>
    </div>
  )
}
