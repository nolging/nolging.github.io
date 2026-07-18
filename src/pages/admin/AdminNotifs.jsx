import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { listNotifTemplates } from '../../lib/api'

// 푸시 알림 메시지 관리 — 알림 종류 목록. 행 클릭 → 제목/본문 수정.
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
    <div className="page admin-page">
      {error && <div className="alert alert-error">{error}</div>}
      <div className="card">
        <div className="admin-list-head">
          <h3 className="card-title" style={{ margin: 0 }}>푸시 알림 메시지 <span className="muted">({rows.length})</span></h3>
        </div>
        <p className="muted sm" style={{ margin: '0 0 10px' }}>
          알림별 제목·본문 문구를 바꿀 수 있어요. {'{닉네임}'} 같은 표시는 발송 때 실제 값으로 채워져요.
        </p>
        {loading ? <div className="spinner" /> : rows.length === 0 ? (
          <p className="muted sm">등록된 알림이 없습니다.</p>
        ) : (
          <ul className="admin-rows">
            {rows.map((r) => (
              <li key={r.key}>
                <button type="button" className="admin-row" onClick={() => nav(`/admin/notifs/${r.key}`)}>
                  <span className="admin-row-emoji" aria-hidden="true">{r.emoji || '🔔'}</span>
                  <span className="admin-row-main">
                    {r.label}
                    <span className="muted sm" style={{ display: 'block' }}>{r.title}</span>
                  </span>
                  <span className="admin-row-side"><span className="admin-row-caret" aria-hidden="true">›</span></span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
