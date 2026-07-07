import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getMyProfile } from '../lib/api'
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

export default function MyProfile() {
  const { profile, logout, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [info, setInfo] = useState({ contact: '', birthdate: '', subscribed_ott: [] })
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const p = await getMyProfile()
        if (!mounted) return
        setInfo({
          contact: p?.contact ? formatPhone(p.contact) : '',
          birthdate: p?.birthdate ? String(p.birthdate).slice(0, 10) : '',
          subscribed_ott: Array.isArray(p?.subscribed_ott) ? p.subscribed_ott : [],
        })
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

  const ottLabels = info.subscribed_ott.map((k) => OTT_BY_KEY[k]?.label).filter(Boolean)

  return (
    <div className="page">
      {loading ? (
        <div className="spinner" />
      ) : (
        <>
        {error && <div className="alert alert-error">{error}</div>}

        {/* 내 정보 조회 카드 */}
        <div className="card profile-view">
          <div className="pv-row">
            <span className="pv-label">아이디</span>
            <span className="pv-value">{profile?.nickname || '—'}</span>
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
              {ottLabels.length ? (
                <span className="pv-chips">
                  {ottLabels.map((l) => <span key={l} className="pv-chip">{l}</span>)}
                </span>
              ) : '—'}
            </span>
          </div>

          <button type="button" className="btn btn-primary btn-block" onClick={() => navigate('/me/edit')}>
            프로필 수정
          </button>
        </div>

        {isAdmin && (
          <Link to="/admin" className="btn btn-block admin-entry">관리자 페이지</Link>
        )}

        <div className="logout-bar">
          <button type="button" className="btn btn-danger btn-block" onClick={handleLogout}>
            로그아웃
          </button>
        </div>
        </>
      )}
    </div>
  )
}
