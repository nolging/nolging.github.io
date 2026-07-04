import { Link, NavLink, Outlet, useMatch } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Brand from './Brand'

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function BackIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

export default function Layout() {
  const { profile, isAdmin } = useAuth()
  const settingsMatch = useMatch('/groups/:groupId/settings')
  const groupMatch = useMatch('/groups/:groupId')

  let topbar
  if (settingsMatch) {
    // 그룹 설정 페이지: 좌측 뒤로(그룹으로), 제목만
    const id = settingsMatch.params.groupId
    topbar = (
      <header className="topbar">
        <Link to={`/groups/${id}`} className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></Link>
        <span className="topbar-heading">설정</span>
      </header>
    )
  } else if (groupMatch) {
    // 그룹 상세 페이지: 좌측 뒤로(내 그룹), 우측 그룹 설정 톱니바퀴
    const id = groupMatch.params.groupId
    topbar = (
      <header className="topbar">
        <Link to="/" className="btn btn-ghost btn-sm icon-btn" aria-label="내 그룹" title="내 그룹"><BackIcon /></Link>
        <Link to={`/groups/${id}/settings`} className="btn btn-ghost btn-sm icon-btn push-right" aria-label="그룹 설정" title="그룹 설정"><GearIcon /></Link>
      </header>
    )
  } else {
    // 기본 상단바
    topbar = (
      <header className="topbar">
        <Link to="/" className="brand"><Brand /></Link>
        <nav className="topnav">
          <NavLink to="/" end>내 그룹</NavLink>
          <NavLink to="/join">그룹 가입</NavLink>
          {isAdmin && <NavLink to="/admin">관리자</NavLink>}
        </nav>
        <div className="topbar-right">
          <span className="me">
            {profile?.nickname}
            {isAdmin && <span className="badge badge-admin">관리자</span>}
          </span>
          <NavLink to="/me" className="btn btn-ghost btn-sm icon-btn" aria-label="내 정보" title="내 정보"><GearIcon /></NavLink>
        </div>
      </header>
    )
  }

  return (
    <div className="app-shell">
      {topbar}
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
