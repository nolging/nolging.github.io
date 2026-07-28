import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { getSavedAccounts, upsertAccount, removeAccount, hasAdminSaved, switchToAccount } from '../lib/accountSwitch'

// 관리자 전용 계정 전환. 일반 사용자에겐 노출되지 않는다:
//  - 현재 관리자이거나, 이 기기에 저장된 관리자 계정이 있을 때만 렌더.
//  - 저장 계정은 관리자가 직접 '추가'해야만 생기므로 일반 사용자 기기엔 아무 것도 안 뜬다.
export default function AccountSwitcher({ onClose }) {
  const { session, profile, isAdmin, login } = useAuth()
  const navigate = useNavigate()
  const [accounts, setAccounts] = useState(getSavedAccounts)
  const [adding, setAdding] = useState(false)
  const [id, setId] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [relogin, setRelogin] = useState(null) // 재로그인 필요: { id, login_id }
  const [rePw, setRePw] = useState('')

  if (!(isAdmin || hasAdminSaved())) return null

  const others = accounts.filter((a) => a.id !== profile?.id)

  // 로그인 성공 직후, 새 활성 계정을 목록에 저장(세션+프로필)
  async function saveCurrentAfterLogin() {
    const { data } = await supabase.auth.getSession()
    const { data: mine } = await supabase.rpc('my_profile')
    const row = Array.isArray(mine) ? mine[0] : mine
    if (data.session && row) upsertAccount(data.session, { ...row, login_id: row.login_id ?? row.nickname })
  }

  async function doAdd(e) {
    e.preventDefault()
    if (!id.trim() || !pw || busy) return
    setBusy(true); setErr('')
    try {
      upsertAccount(session, profile) // 현재 계정 보관
      await login(id.trim(), pw)      // 새 계정 로그인(활성 세션 교체)
      await saveCurrentAfterLogin()
      onClose?.(); navigate('/')
    } catch (e2) { setErr(e2.message); setBusy(false) }
  }

  async function doSwitch(a) {
    if (busy) return
    setBusy(true); setErr('')
    try {
      const r = await switchToAccount(a.id)
      if (r.needPassword) { setRelogin({ id: a.id, login_id: r.login_id }); setRePw(''); setBusy(false); return }
      onClose?.(); navigate('/')
    } catch (e2) { setErr(e2.message); setBusy(false) }
  }

  async function doRelogin(e) {
    e.preventDefault()
    if (!rePw || busy) return
    setBusy(true); setErr('')
    try {
      upsertAccount(session, profile)
      await login(relogin.login_id, rePw)
      await saveCurrentAfterLogin()
      onClose?.(); navigate('/')
    } catch (e2) { setErr(e2.message); setBusy(false) }
  }

  function doRemove(aid) { removeAccount(aid); setAccounts(getSavedAccounts()) }

  const initial = (s) => (s || '?').trim().slice(0, 1).toUpperCase()

  return (
    <div className="acct-panel">
      <div className="acct-switch-head">
        <span className="acct-title">계정 전환</span>
        <span className="acct-switch-tag">관리자 전용</span>
      </div>

      <ul className="acct-list">
        {profile && (
          <li className="acct-item is-current">
            <span className="acct-ava">{initial(profile.nickname || profile.login_id)}</span>
            <span className="acct-info">
              <span className="acct-name">{profile.login_id || '—'}</span>
              {isAdmin && <span className="acct-role">관리자</span>}
            </span>
            <span className="acct-cur">현재</span>
          </li>
        )}
        {others.map((a) => (
          <li key={a.id} className="acct-item">
            <span className="acct-ava">{initial(a.nickname || a.login_id)}</span>
            <span className="acct-info">
              <span className="acct-name">{a.login_id}</span>
              {a.role === 'admin' && <span className="acct-role">관리자</span>}
            </span>
            {relogin?.id === a.id ? (
              <form className="acct-relogin" onSubmit={doRelogin}>
                <input type="password" className="acct-pw" placeholder="비밀번호 다시 입력" value={rePw}
                  onChange={(e) => setRePw(e.target.value)} autoFocus />
                <button className="btn btn-primary btn-sm" disabled={busy || !rePw}>확인</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRelogin(null)}>취소</button>
              </form>
            ) : (
              <span className="acct-actions">
                <button type="button" className="acct-go" disabled={busy} onClick={() => doSwitch(a)}>전환</button>
                <button type="button" className="acct-x" aria-label="목록에서 제거" title="목록에서 제거"
                  onClick={() => doRemove(a.id)}>✕</button>
              </span>
            )}
          </li>
        ))}
      </ul>

      {err && <div className="acct-err">{err}</div>}

      {adding ? (
        <form className="acct-add" onSubmit={doAdd}>
          <input className="acct-in" placeholder="아이디" value={id} autoCapitalize="none" autoCorrect="off"
            onChange={(e) => setId(e.target.value)} autoFocus />
          <input type="password" className="acct-in" placeholder="비밀번호" value={pw}
            onChange={(e) => setPw(e.target.value)} />
          <div className="acct-add-row">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setAdding(false); setErr('') }}>취소</button>
            <button className="btn btn-primary btn-sm" disabled={busy || !id.trim() || !pw}>
              {busy ? '로그인 중…' : '추가 후 전환'}
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="acct-add-btn" onClick={() => { setAdding(true); setId(''); setPw(''); setErr('') }}>
          + 다른 계정 추가
        </button>
      )}
      <p className="acct-note">세션만 저장돼요. 비밀번호는 기기에 저장하지 않아요.</p>
    </div>
  )
}
