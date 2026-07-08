import { useState } from 'react'
import { Link, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// 입력창 위로 빼꼼 보이는 깜냥이 두 마리 (눈 깜빡임)
function CatPeek() {
  return (
    <svg className="login-cat" width="80" viewBox="0 0 64 34" aria-hidden="true">
      <path d="M8 27 L11.3 10 Q11.5 5.5 16 7.8 L30 17 Z" fill="#191722" />
      <path d="M56 27 L52.7 10 Q52.5 5.5 48 7.8 L34 17 Z" fill="#191722" />
      <path d="M6 34 A26 22 0 0 1 58 34 Z" fill="#191722" />
      <g className="login-cat-eye" style={{ transformOrigin: '23px 26px' }}>
        <circle cx="23" cy="26" r="6.5" fill="#ffd43b" />
        <circle cx="23.6" cy="26.6" r="4.6" fill="#191722" />
        <circle cx="20.6" cy="23.8" r="1.3" fill="#fff" />
      </g>
      <g className="login-cat-eye" style={{ transformOrigin: '41px 26px' }}>
        <circle cx="41" cy="26" r="6.5" fill="#ffd43b" />
        <circle cx="41.6" cy="26.6" r="4.6" fill="#191722" />
        <circle cx="38.6" cy="23.8" r="1.3" fill="#fff" />
      </g>
    </svg>
  )
}

function PawIcon() {
  return (
    <svg width="16" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
      <circle cx="7" cy="7" r="2.4" />
      <circle cx="12" cy="5.4" r="2.4" />
      <circle cx="17" cy="7" r="2.4" />
      <path d="M12 10c3.4 0 6 2.4 6 5.2 0 2-1.7 3.3-3.4 2.7-1-.4-1.7-.6-2.6-.6s-1.6.2-2.6.6C7.7 18.5 6 17.2 6 15.2 6 12.4 8.6 10 12 10Z" />
    </svg>
  )
}

export default function Login() {
  const { login, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to={location.state?.from || '/'} replace />

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(nickname, password)
      const to = location.state?.from || '/'
      navigate(to, { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-inner">
        <div className="login-head">
          <div className="login-logo">놀깅<span>.</span></div>
          <h1 className="login-title">다시 만나서 반가워요<br />오늘도 같이 놀아요</h1>
          <p className="login-sub">심심하면 놀기 신청</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-fieldwrap">
            <CatPeek />
            <div className="login-fields">
              <input
                autoFocus
                className="login-input"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="아이디"
                aria-label="아이디"
                autoComplete="username"
              />
              <input
                type="password"
                className="login-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호"
                aria-label="비밀번호"
                autoComplete="current-password"
              />
            </div>
          </div>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="login-btn" disabled={busy}>
            <PawIcon />
            {busy ? '로그인 중…' : '로그인'}
          </button>
        </form>

        <p className="login-foot">
          계정이 없나요? <Link to="/request-access">가입 요청하기</Link>
        </p>
      </div>
    </div>
  )
}
