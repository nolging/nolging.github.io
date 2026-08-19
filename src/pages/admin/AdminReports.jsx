import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminListErrorReports } from '../../lib/api'
import useScrollRestore from '../../lib/useScrollRestore'

// 관리자: 오류 리포트 목록 (퀘스트 관리와 동일한 카드 스타일) — 좌측 제목/내용, 우측 아이디/해결 여부 배지
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
  useScrollRestore(!loading) // 상세 → 뒤로가기 시 목록 스크롤 위치 복원

  return (
    <div className="page admin-page aq-page">
      {error && <div className="alert alert-error">{error}</div>}
      <div className="aq-section-head">
        <span className="aq-section-title">리포트</span>
        <span className="aq-count">{reports.length}</span>
      </div>
      {loading ? <div className="spinner" /> : reports.length === 0 ? (
        <p className="muted sm">접수된 리포트가 없습니다.</p>
      ) : (
        <div className="aq-cards">
          {reports.map((r) => (
            <button key={r.id} type="button" className="aq-card" onClick={() => nav(`/admin/reports/${r.id}`)}>
              <span className="aq-card-body">
                <span className="aq-card-name">{r.title}</span>
                {r.body && <span className="aq-card-desc">{r.body}</span>}
              </span>
              <span className="aq-card-badges">
                <span className="aq-badge-target">{r.reporter_login}</span>
                <span className={`aq-badge-status ${r.resolved ? 'on' : ''}`}>{r.resolved ? '해결 완료' : '미해결'}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
