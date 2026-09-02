import { useNavigate } from 'react-router-dom'

// 관리자: 기타 관리 — 하위 관리 화면으로 가는 카드 목록(퀘스트 관리와 동일한 카드 스타일)
export default function AdminMisc() {
  const nav = useNavigate()
  return (
    <div className="page admin-page aq-page">
      <div className="aq-cards">
        <button type="button" className="aq-card" onClick={() => nav('/admin/reports')}>
          <span className="aq-card-icon" style={{ background: '#fde8ee' }} aria-hidden="true">🐞</span>
          <span className="aq-card-body">
            <span className="aq-card-name">오류 리포트 관리</span>
            <span className="aq-card-desc aq-card-desc-desktop">사용자가 제보한 오류를 확인하고 처리해요.</span>
          </span>
          <span className="aq-card-chevron always" aria-hidden="true">›</span>
        </button>
        <button type="button" className="aq-card" onClick={() => nav('/admin/misc/groups')}>
          <span className="aq-card-icon" style={{ background: '#eeebfe' }} aria-hidden="true">🎛️</span>
          <span className="aq-card-body">
            <span className="aq-card-name">그룹별 사용량 제어</span>
            <span className="aq-card-desc aq-card-desc-desktop">그룹별로 기능 사용을 켜고 끌 수 있어요.</span>
          </span>
          <span className="aq-card-chevron always" aria-hidden="true">›</span>
        </button>
        <button type="button" className="aq-card" onClick={() => nav('/admin/misc/notices')}>
          <span className="aq-card-icon" style={{ background: '#e6eefd' }} aria-hidden="true">📢</span>
          <span className="aq-card-body">
            <span className="aq-card-name">시스템 공지</span>
            <span className="aq-card-desc aq-card-desc-desktop">유저에게 푸시 알림으로 공지를 보내요.</span>
          </span>
          <span className="aq-card-chevron always" aria-hidden="true">›</span>
        </button>
        <button type="button" className="aq-card" onClick={() => nav('/admin/misc/lotto')}>
          <span className="aq-card-icon" style={{ background: '#fff0d6' }} aria-hidden="true">🎱</span>
          <span className="aq-card-body">
            <span className="aq-card-name">로또 당첨 관리</span>
            <span className="aq-card-desc aq-card-desc-desktop">회차별 응모를 확인하고 당첨 룰·번호를 관리해요.</span>
          </span>
          <span className="aq-card-chevron always" aria-hidden="true">›</span>
        </button>
      </div>
    </div>
  )
}
