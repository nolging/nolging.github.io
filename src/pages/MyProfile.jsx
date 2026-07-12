import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getMyProfile, getMyCoinBalance } from '../lib/api'
import { OTT_BY_KEY } from '../lib/constants'

// 한국 전화번호 자동 하이픈 (표시용)
function formatPhone(value) {
  const d = String(value || '').replace(/\D/g, '').slice(0, 11)
  if (!d) return ''
  if (d.startsWith('02')) {
    if (d.length <= 2) return d
    if (d.length <= 5) return d.replace(/(\d{2})(\d+)/, '$1-$2')
    if (d.length <= 9) return d.replace(/(\d{2})(\d{3})(\d+)/, '$1-$2-$3')
    return d.replace(/(\d{2})(\d{4})(\d{4})/, '$1-$2-$3')
  }
  if (d.length <= 3) return d
  if (d.length <= 7) return d.replace(/(\d{3})(\d+)/, '$1-$2')
  if (d.length <= 10) return d.replace(/(\d{3})(\d{3})(\d+)/, '$1-$2-$3')
  return d.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3')
}

function CoinCat() {
  return (
    <svg className="mp-coin-cat" width="96" viewBox="0 0 64 34" aria-hidden="true">
      <path d="M8 27 L11.3 10 Q11.5 5.5 16 7.8 L30 17 Z" fill="#191722" />
      <path d="M56 27 L52.7 10 Q52.5 5.5 48 7.8 L34 17 Z" fill="#191722" />
      <path d="M6 34 A26 22 0 0 1 58 34 Z" fill="#191722" />
      <g className="login-cat-eye" style={{ transformOrigin: '23px 26px' }}>
        <circle cx="23" cy="26" r="6.5" fill="#ffd43b" /><circle cx="23.6" cy="26.6" r="4.6" fill="#191722" /><circle cx="20.6" cy="23.8" r="1.3" fill="#fff" />
      </g>
      <g className="login-cat-eye" style={{ transformOrigin: '41px 26px' }}>
        <circle cx="41" cy="26" r="6.5" fill="#ffd43b" /><circle cx="41.6" cy="26.6" r="4.6" fill="#191722" /><circle cx="38.6" cy="23.8" r="1.3" fill="#fff" />
      </g>
    </svg>
  )
}

export default function MyProfile() {
  const { profile, logout, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [info, setInfo] = useState({ contact: '', birthdate: '', subscribed_ott: [] })
  const [coin, setCoin] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const [p, b] = await Promise.all([getMyProfile(), getMyCoinBalance()])
        if (!mounted) return
        setInfo({
          contact: p?.contact ? formatPhone(p.contact) : '',
          birthdate: p?.birthdate ? String(p.birthdate).slice(0, 10) : '',
          subscribed_ott: Array.isArray(p?.subscribed_ott) ? p.subscribed_ott : [],
        })
        setCoin(b)
      } catch (err) {
        if (mounted) setError(err.message)
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  const ottList = info.subscribed_ott.map((k) => OTT_BY_KEY[k]).filter(Boolean)

  return (
    <div className="page">
      {loading ? (
        <div className="spinner" />
      ) : (
        <>
        {error && <div className="alert alert-error">{error}</div>}

        {/* 츄르 잔액 카드 */}
        <Link to="/me/coins" className="mp-coin" aria-label="적립·사용 내역">
          <div className="mp-coin-amount">
            <span className="mp-coin-num">{coin == null ? '—' : coin.toLocaleString('ko-KR')}</span>
            <span className="mp-coin-unit">츄르</span>
          </div>
          <span className="mp-coin-history">
            적립·사용 내역
            <svg width="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18" /></svg>
          </span>
          <CoinCat />
        </Link>

        {/* 내 정보 카드 */}
        <div className="card profile-view">
          <div className="pv-row">
            <span className="pv-label">아이디</span>
            <span className="pv-value">{profile?.login_id || '—'}</span>
          </div>
          <div className="pv-row">
            <span className="pv-label">연락처</span>
            <span className="pv-value">{info.contact || '—'}</span>
          </div>
          <div className="pv-row">
            <span className="pv-label">생년월일</span>
            <span className="pv-value">{info.birthdate || '—'}</span>
          </div>
          <div className="pv-row">
            <span className="pv-label">구독 OTT</span>
            <span className="pv-value">
              {ottList.length ? (
                <span className="pv-ott">
                  {ottList.map((o) => (
                    <img key={o.key} src={o.logo} alt={o.label} title={o.label} className="pv-ott-logo" />
                  ))}
                </span>
              ) : '—'}
            </span>
          </div>
        </div>

        <button type="button" className="btn mp-edit-btn" onClick={() => navigate('/me/edit')}>프로필 수정</button>

        {isAdmin && (
          <Link to="/admin" className="btn btn-block admin-entry">관리자 페이지</Link>
        )}

        <div className="mp-logout">
          <button type="button" className="mp-logout-link" onClick={handleLogout}>로그아웃</button>
        </div>
        </>
      )}
    </div>
  )
}
