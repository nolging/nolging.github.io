import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminListErrorReports } from '../../lib/api'

// 관리자: 오류 리포트 목록 — 제목 / 회원 아이디 / 해결 여부
export default function AdminReports() {
  const nav = useNavigate()
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try { setReports(await adminListErrorReports()) }
    catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  return (
    <div className="page admin-page">
      {error && <div className="alert alert-error">{error}</div>}
      <div className="card">
        <div className="admin-list-head">
          <h3 className="card-title" style={{ margin: 0 }}>오류 리포트 <span className="muted">({reports.length})</span></h3>
        </div>
        {loading ? <div className="spinner" /> : reports.length === 0 ? (
          <p className="muted sm">접수된 리포트가 없습니다.</p>
        ) : (
          <ul className="admin-rows">
            {reports.map((r) => (
              <li key={r.id}>
                <button type="button" className="admin-row" onClick={() => nav(`/admin/reports/${r.id}`)}>
                  <span className="admin-row-main">{r.title}</span>
                  <span className="admin-row-side">
                    <span className="admin-row-reporter">{r.reporter_login}</span>
                    <span className={`badge ${r.resolved ? 'badge-done' : 'badge-open'}`}>{r.resolved ? '해결 완료' : '미해결'}</span>
                    <span className="admin-row-caret" aria-hidden="true">›</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
