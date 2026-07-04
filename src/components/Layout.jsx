import { useEffect } from 'react'
import { Link, NavLink, Outlet, useMatch, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { taskTerms } from '../lib/constants'
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

const tabSvg = (children) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
)
const GroupsIcon = () => tabSvg(<>
  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
  <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
</>)
const JoinIcon = () => tabSvg(<>
  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" />
  <line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" />
</>)
const AdminIcon = () => tabSvg(<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />)

export default function Layout() {
  const { profile, isAdmin } = useAuth()
  const location = useLocation()
  const groupConfigMatch = useMatch('/groups/:groupId/settings/group')
  const settingsMatch = useMatch('/groups/:groupId/settings')
  const membersMatch = useMatch('/groups/:groupId/members')
  const taskNewMatch = useMatch('/groups/:groupId/tasks/new')
  const taskEditMatch = useMatch('/groups/:groupId/tasks/:taskId/edit')
  const taskDetailMatch = useMatch('/groups/:groupId/tasks/:taskId')
  const groupMatch = useMatch('/groups/:groupId')

  // 안전영역(상단 상태바 / 하단 홈 인디케이터)이 콘텐츠와 다른 색으로 "띠"처럼
  // 보이지 않도록, 화면 하단 색과 body 배경을 맞춘다.
  // - 그룹 상세/설정 등(하단이 회색 콘텐츠): body 회색
  // - 그 외(하단이 흰색 탭바): body 흰색
  const isGroupView = !!(groupConfigMatch || settingsMatch || membersMatch || taskNewMatch || taskEditMatch || taskDetailMatch || groupMatch)
  useEffect(() => {
    document.body.style.background = isGroupView ? 'var(--bg)' : 'var(--surface)'
    return () => { document.body.style.background = '' }
  }, [isGroupView])


  let topbar
  if (groupConfigMatch) {
    // 그룹 설정 페이지: 좌측 뒤로(설정으로), 제목 "그룹 설정"
    const id = groupConfigMatch.params.groupId
    topbar = (
      <header className="topbar">
        <Link to={`/groups/${id}/settings`} className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></Link>
        <span className="topbar-heading">그룹 설정</span>
      </header>
    )
  } else if (settingsMatch) {
    // 설정 페이지: 좌측 뒤로(그룹으로), 제목 "설정"
    const id = settingsMatch.params.groupId
    topbar = (
      <header className="topbar">
        <Link to={`/groups/${id}`} className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></Link>
        <span className="topbar-heading">설정</span>
      </header>
    )
  } else if (membersMatch) {
    // 멤버 페이지: 좌측 뒤로(그룹으로), 제목 "멤버"
    const id = membersMatch.params.groupId
    topbar = (
      <header className="topbar">
        <Link to={`/groups/${id}`} className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></Link>
        <span className="topbar-heading">멤버</span>
      </header>
    )
  } else if (taskNewMatch) {
    // 태스크 작성 페이지: 좌측 뒤로(그룹으로), 제목은 유형별 명칭 + 작성
    const id = taskNewMatch.params.groupId
    topbar = (
      <header className="topbar">
        <Link to={`/groups/${id}`} className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></Link>
        <span className="topbar-heading">{taskTerms(location.state?.groupType).noun} 작성</span>
      </header>
    )
  } else if (taskEditMatch) {
    // 태스크 편집 페이지: 좌측 뒤로(그룹으로), 제목은 유형별 명칭 + 편집
    const id = taskEditMatch.params.groupId
    topbar = (
      <header className="topbar">
        <Link to={`/groups/${id}`} className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></Link>
        <span className="topbar-heading">{taskTerms(location.state?.groupType).noun} 편집</span>
      </header>
    )
  } else if (taskDetailMatch) {
    // 태스크 상세 페이지: 좌측 뒤로(그룹으로), 제목은 유형별 명칭
    const id = taskDetailMatch.params.groupId
    topbar = (
      <header className="topbar">
        <Link to={`/groups/${id}`} className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></Link>
        <span className="topbar-heading">{taskTerms(location.state?.groupType).noun}</span>
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

  // 기본(메인) 화면에서만 하단 내비게이션 노출 (모바일 전용, CSS로 제어)
  const showBottomNav = !isGroupView

  return (
    <div className="app-shell">
      {topbar}
      <main className="content">
        <Outlet />
      </main>
      {showBottomNav && (
        <nav className="bottomnav">
          <NavLink to="/" end><GroupsIcon /><span>내 그룹</span></NavLink>
          <NavLink to="/join"><JoinIcon /><span>그룹 가입</span></NavLink>
          {isAdmin && <NavLink to="/admin"><AdminIcon /><span>관리</span></NavLink>}
        </nav>
      )}
      {/* 페이지가 Portal 로 하단 고정 바(댓글 입력 등)를 넣는 슬롯 */}
      <div id="app-bottom" className="app-bottom" />
    </div>
  )
}
