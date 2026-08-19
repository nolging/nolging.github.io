import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { adminListUsers, adminCoinBalances, adminCoinHistory, adminSetRole, adminSetStatus, adminDeleteUser, adminGrantCoin, adminSetPassword } from '../../lib/api'
import { formatCoin } from '../../lib/constants'
import { formatBirthDot } from '../../lib/birthday'
import { resolveItemText } from '../../lib/storeMeta'
import Modal from '../../components/Modal'
import { STATUS } from './adminMeta'
import { useScrollToTop } from '../../lib/useScrollRestore'

const DEFAULT_PW = 'nolging!'

const fmtHistDate = (iso) => {
  try {
    return new Date(iso).toLocaleString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

function SelectArrow() {
  return (
    <svg className="admin-detail-select-arrow" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

// 회원 상세 — 정보 조회 영역에서 역할/상태를 셀렉트로 즉시 변경, 보유 츄르 클릭 시 지급/차감 모달,
// 비밀번호 초기화·계정 삭제도 같은 영역에 모아둔다.
export default function AdminMemberDetail() {
  useScrollToTop() // 목록 스크롤 위치가 이어지지 않게 항상 맨 위에서 시작
  const { userId } = useParams()
  const nav = useNavigate()
  const [user, setUser] = useState(null)
  const [balance, setBalance] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const [grantOpen, setGrantOpen] = useState(false)
  const [grant, setGrant] = useState({ sign: 1, amount: '', reason: '' })
  const [pwOpen, setPwOpen] = useState(false)
  const [pw, setPw] = useState(DEFAULT_PW)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  // 비제어 입력(defaultValue)은 state 를 비워도 화면이 안 비므로, 성공 후 key 를 올려 리마운트
  const [formKey, setFormKey] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [us, bal] = await Promise.all([adminListUsers(), adminCoinBalances()])
      const u = us.find((x) => x.id === userId) || null
      setUser(u); setBalance(bal[userId] || 0)
      if (!u) setError('회원을 찾을 수 없어요.')
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [userId])
  useEffect(() => { load() }, [load])

  async function changeRole(newRole) {
    if (!user || newRole === user.role) return
    if (newRole === 'admin' && !confirm(`'${user.nickname}' 님을 관리자로 지정할까요?`)) return
    setError(''); setNotice(''); setBusy(true)
    try { await adminSetRole(userId, newRole); setNotice('역할을 변경했어요.'); await load() }
    catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  async function changeStatus(newStatus) {
    if (!user || newStatus === user.status) return
    if (newStatus === 'disabled' && !confirm(`'${user.nickname}' 계정을 비활성화할까요?`)) return
    setError(''); setNotice(''); setBusy(true)
    try { await adminSetStatus(userId, newStatus); setNotice('상태를 변경했어요.'); await load() }
    catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  function remove() {
    if (!confirm(`'${user.nickname}' 계정을 삭제할까요? (되돌릴 수 없어요)`)) return
    setError(''); setBusy(true)
    adminDeleteUser(userId)
      .then(() => nav('/admin/members', { replace: true }))
      .catch((err) => { setError(err.message); setBusy(false) })
  }
  async function resetPassword(e) {
    e.preventDefault(); setError(''); setNotice('')
    if (pw.trim().length < 6) { setError('비밀번호는 6자 이상이어야 해요.'); return }
    if (!confirm(`'${user.nickname}' 님의 비밀번호를 초기화할까요?`)) return
    setBusy(true)
    try {
      await adminSetPassword(userId, pw.trim())
      setNotice('비밀번호를 초기화했어요.')
      setPw(DEFAULT_PW); setFormKey((k) => k + 1); setPwOpen(false)
    }
    catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  async function openHistory() {
    setHistoryOpen(true); setHistoryLoading(true)
    try { setHistory(await adminCoinHistory(userId)) }
    catch (err) { setError(err.message) } finally { setHistoryLoading(false) }
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
      setGrant({ sign: 1, amount: '', reason: '' }); setBalance(bal); setFormKey((k) => k + 1); setGrantOpen(false)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  if (loading) return <div className="page admin-page"><div className="spinner" /></div>
  if (!user) return <div className="page admin-page"><div className="alert alert-error">{error || '회원을 찾을 수 없어요.'}</div></div>

  const grantMag = parseInt(grant.amount, 10)
  const grantAmountOk = Number.isInteger(grantMag) && grantMag > 0

  return (
    <div className="page admin-page">
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      <div className="card">
        <dl className="admin-detail">
          <div className="admin-detail-row"><dt>아이디</dt><dd>{user.nickname}</dd></div>
          <div className="admin-detail-row">
            <dt>역할</dt>
            <dd>
              <span className="admin-detail-select-wrap">
                <select className="admin-detail-select" value={user.role} disabled={busy}
                  onChange={(e) => changeRole(e.target.value)}>
                  <option value="member">멤버</option>
                  <option value="admin">관리자</option>
                </select>
                <SelectArrow />
              </span>
            </dd>
          </div>
          <div className="admin-detail-row">
            <dt>상태</dt>
            <dd>
              <span className="admin-detail-select-wrap">
                <select className="admin-detail-select" value={user.status === 'active' ? 'active' : 'disabled'} disabled={busy}
                  onChange={(e) => changeStatus(e.target.value)}>
                  <option value="active">{STATUS.active.label}</option>
                  <option value="disabled">{STATUS.disabled.label}</option>
                </select>
                <SelectArrow />
              </span>
            </dd>
          </div>
          <div className="admin-detail-row">
            <dt>보유 츄르</dt>
            <dd><button type="button" className="admin-detail-linkval" onClick={() => setGrantOpen(true)}>{formatCoin(balance)}</button></dd>
          </div>
          <div className="admin-detail-row"><dt>연락처</dt><dd>{user.contact || '—'}</dd></div>
          <div className="admin-detail-row"><dt>생년월일</dt><dd>{formatBirthDot(user.birthdate) || '—'}</dd></div>
        </dl>
      </div>

      <div className="admin-detail-actions">
        <button type="button" className="btn btn-primary btn-block admin-detail-histbtn" onClick={openHistory}>츄르 적립·사용 내역</button>
        <button type="button" className="btn btn-primary btn-block" onClick={() => setPwOpen(true)}>비밀번호 초기화</button>
        <button type="button" className="admin-detail-delete" disabled={busy} onClick={remove}>계정 삭제</button>
      </div>

      {/* 츄르 지급/차감 */}
      <Modal open={grantOpen} onClose={() => setGrantOpen(false)}>
        <form onSubmit={submitGrant} className="form admin-grant-form" key={`grant-${formKey}`}>
          <div className="seg-tabs">
            <button type="button" className={`seg-tab ${grant.sign === 1 ? 'active' : ''}`} onClick={() => setGrant((g) => ({ ...g, sign: 1 }))}>지급 +</button>
            <button type="button" className={`seg-tab ${grant.sign === -1 ? 'active' : ''}`} onClick={() => setGrant((g) => ({ ...g, sign: -1 }))}>차감 −</button>
          </div>
          <div className="admin-grant-row">
            <label htmlFor="md-amount">수량<span className="field-req">*</span></label>
            <div className="admin-grant-amount-wrap">
              <input id="md-amount" type="number" inputMode="numeric" min="1" defaultValue={grant.amount}
                onChange={(e) => setGrant((g) => ({ ...g, amount: e.target.value }))} placeholder="숫자 입력" />
              <span className="admin-grant-unit">츄르</span>
            </div>
          </div>
          <div className="admin-grant-row">
            <label htmlFor="md-reason">사유</label>
            <input id="md-reason" defaultValue={grant.reason} onChange={(e) => setGrant((g) => ({ ...g, reason: e.target.value }))}
              placeholder={grant.sign === 1 ? '관리자 지급' : '관리자 차감'} />
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={busy || !grantAmountOk}>{busy ? '처리 중…' : '확인'}</button>
        </form>
      </Modal>

      {/* 츄르 적립/사용 내역 */}
      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title="츄르 적립·사용 내역">
        {historyLoading ? <div className="spinner" /> : history.length === 0 ? (
          <p className="muted sm">내역이 없어요.</p>
        ) : (
          <div className="admin-coinhist-list">
            {history.map((r) => (
              <div key={r.id} className="coin-hist-row">
                <div className="chr-main">
                  <span className="chr-reason">{resolveItemText(r.reason) || '츄르 변동'}</span>
                  <span className="chr-date">{fmtHistDate(r.created_at)}</span>
                </div>
                <span className={`chr-delta ${r.delta >= 0 ? 'plus' : 'minus'}`}>
                  {r.delta >= 0 ? '+' : '−'}{Math.abs(r.delta)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* 비밀번호 초기화 */}
      <Modal open={pwOpen} onClose={() => setPwOpen(false)} title="비밀번호 초기화">
        <form onSubmit={resetPassword} className="form" key={`pw-${formKey}`}>
          <div className="field"><label htmlFor="md-pw">새 비밀번호</label>
            <input id="md-pw" type="text" defaultValue={pw} autoCapitalize="none" autoCorrect="off"
              onChange={(e) => setPw(e.target.value)} placeholder="6자 이상" /></div>
          <button type="submit" className="btn btn-primary btn-block" disabled={busy || pw.trim().length < 6}>{busy ? '처리 중…' : '확인'}</button>
        </form>
      </Modal>
    </div>
  )
}
