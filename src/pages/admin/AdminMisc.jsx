import { useNavigate } from 'react-router-dom'

// 관리자: 기타 관리 — 하위 관리 화면으로 가는 카드 목록
export default function AdminMisc() {
  const nav = useNavigate()
  return (
    <div className="page admin-page">
      <div className="card">
        <div className="admin-list-head">
          <h3 className="card-title" style={{ margin: 0 }}>기타 관리</h3>
        </div>
        <ul className="admin-rows">
          <li>
            <button type="button" className="admin-row" onClick={() => nav('/admin/reports')}>
              <span className="admin-row-main">오류 리포트 관리</span>
              <span className="admin-row-side"><span className="admin-row-caret" aria-hidden="true">›</span></span>
            </button>
          </li>
          <li>
            <button type="button" className="admin-row" onClick={() => nav('/admin/misc/groups')}>
              <span className="admin-row-main">그룹별 사용량 제어</span>
              <span className="admin-row-side"><span className="admin-row-caret" aria-hidden="true">›</span></span>
            </button>
          </li>
        </ul>
      </div>
    </div>
  )
}
