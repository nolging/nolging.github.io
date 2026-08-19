import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { adminListSystemNotices } from '../../lib/api'
import { timeAgo } from '../../lib/notifNav'
import useScrollRestore from '../../lib/useScrollRestore'

const fmtSchedule = (iso) => {
  try {
    return new Date(iso).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

// 시스템 공지 관리 — 발송 내역을 알림센터 카드 형태로 보여준다.
// 예약 대기 중인 공지는 비활성 카드로 표시되고, 클릭하면 수정 페이지로 이동한다.
// 이미 발송된 공지는 카드 클릭이 동작하지 않는다(수정 불가).
export default function AdminSystemNotices() {
  const nav = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try { setRows(await adminListSystemNotices()) }
    catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])
  useScrollRestore(!loading) // 수정 → 뒤로가기 시 목록 스크롤 위치 복원

  return (
    <div className="page admin-page aq-page">
      {error && <div className="alert alert-error">{error}</div>}
      <section>
        <div className="aq-section-head">
          <span className="aq-section-title">시스템 공지</span>
          <span className="aq-count">{rows.length}</span>
        </div>
        {loading ? <div className="spinner" /> : rows.length === 0 ? (
          <p className="muted sm">발송된 공지가 없습니다.</p>
        ) : (
          <div className="aq-cards">
            {rows.map((r) => {
              const pending = !r.sent_at
              const timeText = pending ? `${fmtSchedule(r.scheduled_at)} 예약` : timeAgo(r.sent_at)
              const Tag = pending ? 'button' : 'div'
              return (
                <Tag
                  key={r.id}
                  type={pending ? 'button' : undefined}
                  className={`aq-card${pending ? ' inactive' : ''}`}
                  onClick={pending ? () => nav(`/admin/misc/notices/${r.id}`) : undefined}
                >
                  <span className="aq-card-icon" style={r.emoji_bg ? { background: r.emoji_bg } : undefined} aria-hidden="true">{r.emoji || '📢'}</span>
                  <span className="aq-card-body">
                    <span className="aq-card-name">{r.title}</span>
                    <span className="aq-card-desc">{r.body}</span>
                  </span>
                  <span className="aq-card-time">{timeText}</span>
                </Tag>
              )
            })}
          </div>
        )}
      </section>

      <Link to="/admin/misc/notices/new" className="aq-fab" aria-label="시스템 공지 발송">
        <svg width="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </Link>
    </div>
  )
}
