import { useEffect, useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getMyProfile, getMyGrade, changeMyPassword } from '../lib/api'
import { OTT_BY_KEY } from '../lib/constants'
import { GRADE_LABEL, GRADE_SUB, GRADE_LONG, GRADE_AVATAR } from '../lib/membership'

export default function MemberInfo() {
  const { profile, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [loading, setLoading] = useState(true)
  const [info, setInfo] = useState(null)
  const [grade, setGrade] = useState(location.state?.grade || 'normal')
  const [error, setError] = useState('')

  // 비밀번호 변경
  const [pwOpen, setPwOpen] = useState(false)
  const [pw, setPw] = useState({ p1: '', p2: '' })
  const [pwBusy, setPwBusy] = useState(false)
  const [pwError, setPwError] = useState('')
  const [pwOk, setPwOk] = useState('')

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const [p, g] = await Promise.all([
          getMyProfile(),
          location.state?.grade ? Promise.resolve(location.state.grade) : getMyGrade(),
        ])
        if (!mounted) return
        setInfo(p)
        setGrade(g)
      } catch (err) { if (mounted) setError(err.message) }
      finally { if (mounted) setLoading(false) }
    })()
    return () => { mounted = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function changePw() {
    setPwError(''); setPwOk('')
    if (pw.p1.length < 6) { setPwError('비밀번호는 6자 이상이어야 합니다.'); return }
    if (pw.p1 !== pw.p2) { setPwError('두 비밀번호가 일치하지 않습니다.'); return }
    setPwBusy(true)
    try {
      await changeMyPassword(pw.p1)
      setPw({ p1: '', p2: '' }); setPwOpen(false); setPwOk('비밀번호가 변경되었습니다.')
    } catch (err) { setPwError(err.message) } finally { setPwBusy(false) }
  }
  async function handleLogout() { await logout(); navigate('/login') }

  const av = GRADE_AVATAR[grade] || GRADE_AVATAR.normal
  const birth = info?.birthdate ? String(info.birthdate).slice(0, 10) : ''
  const otts = Array.isArray(info?.subscribed_ott) ? info.subscribed_ott : []

  return (
    <div className="page mi-page">
      {loading ? (
        <div className="spinner" />
      ) : (
        <>
          {error && <div className="alert alert-error">{error}</div>}

          {/* 등급 아이덴티티 카드 */}
          <div className="mi-id-card">
            <span className="mi-avatar" style={{ background: av.bg }}>{av.emoji}</span>
            <div className="mi-id-main">
              <div className="mi-id-line">
                <span className="mi-id-name">{profile?.login_id || '—'}</span>
                <span className={`grade-badge grade-${grade}`}>{GRADE_LABEL[grade]}</span>
              </div>
              <div className="mi-id-sub">{GRADE_SUB[grade]}</div>
            </div>
          </div>

          {/* 정보 카드 */}
          <div className="mi-card">
            <div className="mi-row">
              <span className="mi-key">회원 등급</span>
              <span className="mi-val strong">{GRADE_LONG[grade]}</span>
            </div>
            <div className="mi-row">
              <span className="mi-key">아이디</span>
              <span className="mi-val strong">{profile?.login_id || '—'}</span>
            </div>
            <div className="mi-row">
              <span className="mi-key">연락처</span>
              <span className="mi-val">{info?.contact || '미등록'}</span>
            </div>
            <div className="mi-row">
              <span className="mi-key">생년월일</span>
              <span className="mi-val">{birth || '미등록'}</span>
            </div>
            <div className="mi-row">
              <span className="mi-key">구독 OTT</span>
              {otts.length ? (
                <span className="mi-ott">
                  {otts.map((k) => {
                    const o = OTT_BY_KEY[k]
                    return o ? <img key={k} src={o.logo} alt={o.label} title={o.label} /> : null
                  })}
                </span>
              ) : <span className="mi-val">없음</span>}
            </div>
          </div>

          {/* 비밀번호 변경 */}
          {!pwOpen ? (
            <button type="button" className="mi-pill-row" onClick={() => { setPwOpen(true); setPwOk('') }}>
              <span>비밀번호 변경</span>
              <svg width="18" viewBox="0 0 24 24" fill="none" stroke="#c3c0cf" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18" /></svg>
            </button>
          ) : (
            <div className="mi-card pw-box">
              <label className="field"><span>새 비밀번호</span>
                <input type="password" value={pw.p1} autoComplete="new-password" placeholder="6자 이상"
                  onChange={(e) => setPw((s) => ({ ...s, p1: e.target.value }))} /></label>
              <label className="field"><span>비밀번호 확인</span>
                <input type="password" value={pw.p2} autoComplete="new-password" placeholder="다시 입력"
                  onChange={(e) => setPw((s) => ({ ...s, p2: e.target.value }))} /></label>
              {pwError && <div className="alert alert-error">{pwError}</div>}
              <div className="row-gap">
                <button type="button" className="btn btn-primary" disabled={pwBusy} onClick={changePw}>
                  {pwBusy ? '변경 중…' : '확인'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => { setPwOpen(false); setPw({ p1: '', p2: '' }); setPwError('') }}>취소</button>
              </div>
            </div>
          )}
          {pwOk && <div className="alert alert-success">{pwOk}</div>}

          <Link to="/me/edit" state={{ grade }} className="mi-edit-btn">
            <svg width="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" /></svg>
            회원 정보 수정
          </Link>

          <div className="mp-logout">
            <button type="button" className="mp-logout-link" onClick={handleLogout}>로그아웃</button>
          </div>
        </>
      )}
    </div>
  )
}
