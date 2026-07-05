import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useMatch, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { taskTerms } from '../lib/constants'
import { unreadNotificationCount } from '../lib/api'
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

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
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
const CalendarIcon = () => tabSvg(<>
  <rect x="3" y="4" width="18" height="18" rx="2" />
  <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
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
  const taskScheduleMatch = useMatch('/groups/:groupId/tasks/:taskId/schedule')
  const taskDetailMatch = useMatch('/groups/:groupId/tasks/:taskId')
  const newGroupMatch = useMatch('/groups/new')
  const groupMatch = useMatch('/groups/:groupId')

  // 태스크 상세가 알려주는 동적 제목/뒤로가기 경로 (상태별 명칭, 상태 탭 복귀)
  const [taskHeading, setTaskHeading] = useState(null)
  const [taskBackTo, setTaskBackTo] = useState(null)
  // 페이지가 상단바 뒤로가기 동작을 가로챌 수 있게 (예: 그룹 만들기 2단계 → 1단계)
  const [backHandler, setBackHandler] = useState(null)

  // 안읽은 알림 개수: 마운트 시 + 라우트 이동 시 + 60초 주기로 갱신
  const [unread, setUnread] = useState(0)
  const refreshUnread = () => unreadNotificationCount().then(setUnread).catch(() => {})
  useEffect(() => {
    refreshUnread()
    const iv = setInterval(refreshUnread, 60000)
    return () => clearInterval(iv)
  }, [])
  useEffect(() => { refreshUnread() }, [location.pathname])

  // 안전영역(상단 상태바 / 하단 홈 인디케이터)이 콘텐츠와 다른 색으로 "띠"처럼
  // 보이지 않도록, 화면 하단 색과 body 배경을 맞춘다.
  // - 그룹 상세/설정 등(하단이 회색 콘텐츠): body 회색
  // - 그 외(하단이 흰색 탭바): body 흰색
  const isGroupView = !!(newGroupMatch || groupConfigMatch || settingsMatch || membersMatch || taskNewMatch || taskEditMatch || taskScheduleMatch || taskDetailMatch || groupMatch)
  useEffect(() => {
    document.body.style.background = isGroupView ? 'var(--bg)' : 'var(--surface)'
    return () => { document.body.style.background = '' }
  }, [isGroupView])

  // 키보드가 올라오면 앱 셸을 보이는 영역(visual viewport)에 맞춰 축소한다.
  // → 하단 입력창이 키보드 위로 올라오고, 본문은 그 영역 안에 맞춰진다.
  const shellRef = useRef(null)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const apply = () => {
      const el = shellRef.current
      if (!el) return
      el.style.height = `${vv.height}px`
      el.style.top = `${vv.offsetTop}px`
    }
    vv.addEventListener('resize', apply)
    vv.addEventListener('scroll', apply)
    apply()
    return () => {
      vv.removeEventListener('resize', apply)
      vv.removeEventListener('scroll', apply)
      const el = shellRef.current
      if (el) { el.style.height = ''; el.style.top = '' }
    }
  }, [])


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
  } else if (taskScheduleMatch) {
    // 약속 잡기 페이지: 좌측 뒤로(태스크 상세로), 제목 "약속 잡기"
    const { groupId: gid, taskId: tid } = taskScheduleMatch.params
    topbar = (
      <header className="topbar">
        <Link to={`/groups/${gid}/tasks/${tid}`} className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></Link>
        <span className="topbar-heading">약속 잡기</span>
      </header>
    )
  } else if (taskDetailMatch) {
    // 태스크 상세 페이지: 좌측 뒤로(상태 탭으로), 제목은 진행 상태별 명칭
    const id = taskDetailMatch.params.groupId
    topbar = (
      <header className="topbar">
        <Link to={taskBackTo || `/groups/${id}`} className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></Link>
        <span className="topbar-heading">{taskHeading || taskTerms(location.state?.groupType).noun}</span>
      </header>
    )
  } else if (newGroupMatch) {
    // 그룹 만들기 페이지: 좌측 뒤로 — 페이지가 핸들러를 주면 그걸(2단계→1단계), 아니면 내 그룹으로
    topbar = (
      <header className="topbar">
        {backHandler
          ? <button type="button" onClick={backHandler} className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></button>
          : <Link to="/" className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></Link>}
        <span className="topbar-heading">그룹 만들기</span>
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
          <NavLink to="/notifications" className="btn btn-ghost btn-sm icon-btn bell-btn" aria-label="알림" title="알림">
            <BellIcon />
            {unread > 0 && <span className="bell-badge">{unread > 99 ? '99+' : unread}</span>}
          </NavLink>
          <NavLink to="/me" className="btn btn-ghost btn-sm icon-btn" aria-label="내 정보" title="내 정보"><GearIcon /></NavLink>
        </div>
      </header>
    )
  }

  // 기본(메인) 화면에서만 하단 내비게이션 노출 (모바일 전용, CSS로 제어)
  const showBottomNav = !isGroupView

  return (
    <div className="app-shell" ref={shellRef}>
      {topbar}
      <main className="content">
        <Outlet context={{ setTaskHeading, setTaskBackTo, setBackHandler }} />
      </main>
      {showBottomNav && (
        <nav className="bottomnav">
          <NavLink to="/" end><GroupsIcon /><span>그룹</span></NavLink>
          <NavLink to="/schedule"><CalendarIcon /><span>일정</span></NavLink>
          {isAdmin && <NavLink to="/admin"><AdminIcon /><span>관리</span></NavLink>}
        </nav>
      )}
      {/* 페이지가 Portal 로 하단 고정 바(댓글 입력 등)를 넣는 슬롯 */}
      <div id="app-bottom" className="app-bottom" />
    </div>
  )
}
