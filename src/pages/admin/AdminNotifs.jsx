import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { listNotifTemplates } from '../../lib/api'

// 알림 메시지 관리 — 알림 종류 목록. 카드 클릭 → 제목/본문 수정.
export default function AdminNotifs() {
  const nav = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try { setRows(await listNotifTemplates()) }
    catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  return (
    <div className="page admin-page aq-page">
      {error && <div className="alert alert-error">{error}</div>}
      <div className="aq-section-head">
        <span className="aq-section-title">알림 메시지</span>
        <span className="aq-count">{rows.length}</span>
      </div>
      {loading ? <div className="spinner" /> : rows.length === 0 ? (
        <p className="muted sm">등록된 알림이 없습니다.</p>
      ) : (
        <div className="aq-cards">
          {rows.map((r) => (
            <button key={r.key} type="button" className="aq-card" onClick={() => nav(`/admin/notifs/${r.key}`)}>
              <span className="aq-card-icon" style={r.emoji_bg ? { background: r.emoji_bg } : undefined} aria-hidden="true">{r.emoji || '🔔'}</span>
              <span className="aq-card-body">
                <span className="aq-card-name">{r.label}</span>
                <span className="aq-card-desc">{r.title}</span>
              </span>
              <span className="aq-card-chevron" aria-hidden="true">›</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
