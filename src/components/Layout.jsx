import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useMatch, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { taskTerms } from '../lib/constants'
import { unreadNotificationCount, getMyCoinBalance } from '../lib/api'
import Brand from './Brand'
import PushPrompt from './PushPrompt'
import MiniPlayer from './MiniPlayer'

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

function FilterIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  )
}

function InviteIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 7L2 7" />
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
const MyIcon = () => tabSvg(<>
  <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
</>)
// 상점: 쇼핑백 (시안)
const StoreIcon = () => tabSvg(<>
  <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
  <line x1="3" y1="6" x2="21" y2="6" />
  <path d="M16 10a4 4 0 0 1-8 0" />
</>)
// 쪽지: 말풍선 (시안)
const NoteIcon = () => tabSvg(<>
  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
</>)

export default function Layout() {
  const { profile, isAdmin } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const groupConfigMatch = useMatch('/groups/:groupId/settings/group')
  const settingsMatch = useMatch('/groups/:groupId/settings')
  const membersMatch = useMatch('/groups/:groupId/members')
  const memberDetailMatch = useMatch('/groups/:groupId/members/:userId')
  const taskNewMatch = useMatch('/groups/:groupId/tasks/new')
  const taskEditMatch = useMatch('/groups/:groupId/tasks/:taskId/edit')
  const taskScheduleMatch = useMatch('/groups/:groupId/tasks/:taskId/schedule')
  const taskDetailMatch = useMatch('/groups/:groupId/tasks/:taskId')
  const newGroupMatch = useMatch('/groups/new')
  const joinMatch = useMatch('/join')
  const notifMatch = useMatch('/notifications')
  const notifSettingsMatch = useMatch('/notifications/settings')
  const scheduleMatch = useMatch('/schedule')
  const storeMatch = useMatch('/store')
  const inventoryMatch = useMatch('/inventory')
  const notesMatch = useMatch('/notes')
  const noteNewMatch = useMatch('/notes/new')
  const meMatch = useMatch('/me')
  const profileEditMatch = useMatch('/me/edit')
  const coinHistoryMatch = useMatch('/me/coins')
  const groupMatch = useMatch('/groups/:groupId')
  const homeMatch = useMatch('/')

  // 태스크 상세가 알려주는 동적 제목/뒤로가기 경로 (상태별 명칭, 상태 탭 복귀)
  const [taskHeading, setTaskHeading] = useState(null)
  const [taskBackTo, setTaskBackTo] = useState(null)
  // 페이지가 상단바 뒤로가기 동작을 가로챌 수 있게 (예: 그룹 만들기 2단계 → 1단계)
  const [backHandler, setBackHandler] = useState(null)
  // 페이지가 "당겨서 새로고침" 핸들러를 등록할 수 있게 (예: 알림 페이지)
  const [refreshHandler, setRefreshHandler] = useState(null)
  // 페이지가 상단바 필터 버튼 동작/뱃지를 등록할 수 있게 (예: 일정 페이지)
  const [headerFilter, setHeaderFilter] = useState(null)
  // 페이지가 상단바 초대 버튼을 등록할 수 있게 (그룹 상세)
  const [headerInvite, setHeaderInvite] = useState(null)
  // 전역 음악 플레이어(페이지 이동/모달 닫아도 재생 유지)
  const playerRef = useRef(null)
  const [nowPlaying, setNowPlaying] = useState({ current: null, playing: false })
  const player = {
    playTrack: (t) => playerRef.current?.play(t),
    current: nowPlaying.current,
    playing: nowPlaying.playing,
  }

  // 당겨서 새로고침 (모바일): 콘텐츠 최상단에서 아래로 당기면 핸들러 실행
  const contentRef = useRef(null)
  const [pull, setPull] = useState(0)          // 당긴 거리(px)
  const [dragging, setDragging] = useState(false) // 손가락으로 당기는 중(전환 애니메이션 off)
  const [refreshing, setRefreshing] = useState(false)
  const [ptrTop, setPtrTop] = useState(58)     // 스피너 위치: 실제 스크롤 영역 상단(헤더/탭 아래)
  const ptr = useRef({ startY: null, dist: 0, active: false })
  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const THRESH = 64, MAX = 90, DAMP = 0.5
    // 실제로 스크롤되는 컨테이너 찾기(그룹 상세는 .content 가 아니라 내부 .tab-pane 이 스크롤)
    function scrollerAt(target) {
      let node = target
      while (node && node !== el) {
        if (node.nodeType === 1 && /(auto|scroll)/.test(getComputedStyle(node).overflowY)) return node
        node = node.parentElement
      }
      return el
    }
    // 당김/복귀 애니메이션은 상단 헤더·탭을 뺀 "스크롤 컨테이너(카드 영역)"에만 적용
    function setPullT(sc, dist, animate) {
      if (!sc) return
      sc.style.transition = animate ? 'transform .24s cubic-bezier(.2, .8, .2, 1)' : 'none'
      sc.style.transform = dist ? `translateY(${dist}px)` : ''
    }
    function onStart(e) {
      if (!refreshHandler || refreshing || e.touches.length !== 1) { ptr.current.active = false; return }
      const sc = scrollerAt(e.target)
      if (sc && sc.scrollTop <= 0) {
        ptr.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, dist: 0, active: true, sc, locked: null }
        // 스피너를 실제 스크롤 영역(헤더/탭 아래) 상단에 맞춤
        const shell = shellRef.current
        setPtrTop(shell ? Math.max(58, sc.getBoundingClientRect().top - shell.getBoundingClientRect().top) : 58)
      } else ptr.current.active = false
    }
    function onMove(e) {
      const g = ptr.current
      if (!g.active || g.startY == null) return
      const dx = e.touches[0].clientX - g.startX
      const dy = e.touches[0].clientY - g.startY
      if (g.locked === null) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
        // 가로 우세면 탭 스와이프에 양보
        g.locked = Math.abs(dy) >= Math.abs(dx) ? 'v' : 'h'
        if (g.locked === 'h') { g.active = false; return }
      }
      if ((g.sc || el).scrollTop > 0) { g.active = false; setPull(0); setDragging(false); setPullT(g.sc, 0, true); return }
      if (dy > 0) { g.dist = Math.min(MAX, dy * DAMP); setPull(g.dist); setDragging(true); setPullT(g.sc, g.dist, false); e.preventDefault() }
      else { g.dist = 0; setPull(0); setDragging(false); setPullT(g.sc, 0, false) }
    }
    async function onEnd() {
      const g = ptr.current
      if (!g.active) return
      g.active = false
      setDragging(false)
      const sc = g.sc
      if (g.dist >= THRESH && refreshHandler && !refreshing) {
        setRefreshing(true); setPull(0)
        setPullT(sc, 46, true) // 새로고침 동안 카드 영역을 46px 내린 채 스피너 표시
        try { await refreshHandler() } catch { /* noop */ }
        setPullT(sc, 0, true)
        setRefreshing(false)
      } else {
        setPull(0)
        setPullT(sc, 0, true) // 스냅백
      }
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    el.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [refreshHandler, refreshing])

  // 안읽은 알림 개수: 마운트 시 + 라우트 이동 시 + 60초 주기로 갱신
  const [unread, setUnread] = useState(0)
  const refreshUnread = () => unreadNotificationCount().then(setUnread).catch(() => {})
  useEffect(() => {
    refreshUnread()
    const iv = setInterval(refreshUnread, 60000)
    return () => clearInterval(iv)
  }, [])
  useEffect(() => { refreshUnread() }, [location.pathname])

  // 상단바 츄르 알약: 마이 페이지 / 상점 진입 시 잔액 조회
  const [coin, setCoin] = useState(null)
  const needCoin = !!storeMatch
  useEffect(() => {
    if (!needCoin) return
    let on = true
    getMyCoinBalance().then((b) => { if (on) setCoin(b) }).catch(() => {})
    return () => { on = false }
  }, [needCoin, location.pathname])
  // 페이지(상점 등)가 잔액 변동 후 상단바 츄르를 갱신할 수 있게
  const refreshCoin = () => getMyCoinBalance().then(setCoin).catch(() => {})

  // 안전영역(상단 상태바 / 하단 홈 인디케이터)이 콘텐츠와 다른 색으로 "띠"처럼
  // 보이지 않도록, 화면 하단 색과 body 배경을 맞춘다.
  // - 그룹 상세/설정 등(하단이 회색 콘텐츠): body 회색
  // - 그 외(하단이 흰색 탭바): body 흰색
  const isGroupView = !!(newGroupMatch || joinMatch || notifMatch || notifSettingsMatch || groupConfigMatch || settingsMatch || membersMatch || memberDetailMatch || taskNewMatch || taskEditMatch || taskScheduleMatch || taskDetailMatch || groupMatch || profileEditMatch || coinHistoryMatch || noteNewMatch || inventoryMatch)
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
      // 키보드가 올라오면(가시 영역이 크게 줄면) 하단 탭은 원래 위치(키보드 뒤)에
      // 두는 대신 숨겨, 키보드 위로 따라 올라오지 않게 한다.
      // 기준 전체 높이는 innerHeight/clientHeight 중 큰 값(키보드에 따라 한쪽이 줄 수 있음).
      const full = Math.max(window.innerHeight, document.documentElement.clientHeight)
      el.classList.toggle('kb-open', full - vv.height > 120)
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
        <span className="topbar-heading">그룹 정보 수정</span>
      </header>
    )
  } else if (settingsMatch) {
    // 설정 페이지: 좌측 뒤로(그룹으로), 제목 "설정"
    const id = settingsMatch.params.groupId
    topbar = (
      <header className="topbar">
        <Link to={`/groups/${id}`} className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></Link>
        <span className="topbar-heading">내 정보 수정</span>
      </header>
    )
  } else if (memberDetailMatch) {
    // 멤버 상세: 좌측 뒤로(멤버 목록으로). 본인 상세면 우측에 설정(내 정보 수정) 톱니바퀴
    const { groupId: gid, userId: uid } = memberDetailMatch.params
    const isMe = uid === profile?.id
    topbar = (
      <header className="topbar">
        <Link to={`/groups/${gid}/members`} className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></Link>
        <span className="topbar-heading">멤버 정보</span>
        {isMe && (
          <div className="topbar-right">
            <Link to={`/groups/${gid}/settings`} className="btn btn-ghost btn-sm icon-btn" aria-label="내 정보 수정" title="내 정보 수정"><GearIcon /></Link>
          </div>
        )}
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
    // 태스크 수정 페이지: 좌측 뒤로(수정 진입했던 상세로), 제목은 유형별 명칭 + 수정
    const { groupId: id, taskId: tid } = taskEditMatch.params
    topbar = (
      <header className="topbar">
        <Link to={`/groups/${id}/tasks/${tid}`} className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></Link>
        <span className="topbar-heading">{taskTerms(location.state?.groupType).noun} 수정</span>
      </header>
    )
  } else if (taskScheduleMatch) {
    // 약속 잡기 페이지: 그룹 카드에서 왔으면 그룹 상세(해당 탭)로, 그 외엔 태스크 상세로
    const { groupId: gid, taskId: tid } = taskScheduleMatch.params
    const backTo = location.state?.from === 'group'
      ? `/groups/${gid}?tab=${location.state?.tab || 'open'}`
      : `/groups/${gid}/tasks/${tid}`
    topbar = (
      <header className="topbar">
        <Link to={backTo} className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></Link>
        <span className="topbar-heading">약속 잡기</span>
      </header>
    )
  } else if (taskDetailMatch) {
    // 태스크 상세 페이지: 좌측 뒤로(상태 탭으로), 제목은 진행 상태별 명칭
    const id = taskDetailMatch.params.groupId
    topbar = (
      <header className="topbar">
        {taskBackTo === 'back'
          ? <button type="button" onClick={() => navigate(-1)} className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></button>
          : <Link to={taskBackTo || `/groups/${id}`} className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></Link>}
        <span className="topbar-heading">{taskHeading || taskTerms(location.state?.groupType).noun}</span>
        {taskBackTo === 'back' && (
          <Link to={`/groups/${id}`} replace state={{ from: location.state?.from }}
            className="btn btn-ghost btn-sm push-right topbar-link">그룹으로 이동</Link>
        )}
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
  } else if (joinMatch) {
    // 초대장 찾기(그룹 가입) 페이지: 좌측 뒤로 — 핸들러 있으면(2단계→1단계) 그걸, 아니면 내 그룹으로
    topbar = (
      <header className="topbar">
        {backHandler
          ? <button type="button" onClick={backHandler} className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></button>
          : <Link to="/" className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></Link>}
        <span className="topbar-heading">초대장 찾기</span>
      </header>
    )
  } else if (notifSettingsMatch) {
    // 알림 설정 페이지: 좌측 뒤로(이전 화면=알림), 제목 "알림 설정"
    topbar = (
      <header className="topbar">
        <button type="button" onClick={() => navigate(-1)} className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></button>
        <span className="topbar-heading">알림 설정</span>
      </header>
    )
  } else if (notifMatch) {
    // 알림 페이지: 좌측 뒤로, 제목 "알림", 우측 알림 설정(종+톱니) 아이콘
    topbar = (
      <header className="topbar">
        <button type="button" onClick={() => navigate(-1)} className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></button>
        <span className="topbar-heading">알림</span>
        <Link to="/notifications/settings" className="btn btn-ghost btn-sm icon-btn push-right" aria-label="알림 설정" title="알림 설정"><GearIcon /></Link>
      </header>
    )
  } else if (groupMatch) {
    // 그룹 상세 페이지: 좌측 뒤로(기본=내 그룹), 우측 그룹 설정 톱니바퀴
    // 알림/일정에서 "그룹으로 이동"(replace)으로 왔으면 히스토리 pop 으로 그 페이지 복귀
    const id = groupMatch.params.groupId
    const gFrom = location.state?.from
    topbar = (
      <header className="topbar">
        {(gFrom === 'notifications' || gFrom === 'schedule')
          ? <button type="button" onClick={() => navigate(-1)} className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></button>
          : <Link to="/" className="btn btn-ghost btn-sm icon-btn" aria-label="내 그룹" title="내 그룹"><BackIcon /></Link>}
        {headerFilter && (
          <button type="button" className="btn btn-ghost btn-sm icon-btn push-right sched-filter-btn"
            aria-label="유형 필터" title="유형 필터" onClick={() => headerFilter?.onClick?.()}>
            <FilterIcon />
            {headerFilter?.active && <span className="filter-dot" />}
          </button>
        )}
        {headerInvite && (
          <button type="button" className={`btn btn-ghost btn-sm icon-btn ${headerFilter ? '' : 'push-right'}`}
            aria-label="초대" title="초대" onClick={() => headerInvite?.onClick?.()}><InviteIcon /></button>
        )}
        <Link to={`/groups/${id}/settings`} className={`btn btn-ghost btn-sm icon-btn ${(headerFilter || headerInvite) ? '' : 'push-right'}`} aria-label="그룹 설정" title="그룹 설정"><GearIcon /></Link>
      </header>
    )
  } else if (profileEditMatch) {
    // 프로필 수정: 좌측 뒤로(마이 페이지로), 제목 "프로필 수정"
    topbar = (
      <header className="topbar">
        <Link to="/me" className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></Link>
        <span className="topbar-heading">프로필 수정</span>
      </header>
    )
  } else if (coinHistoryMatch) {
    // 츄르 내역: 좌측 뒤로(마이 페이지로), 제목 "적립·사용 내역"
    topbar = (
      <header className="topbar">
        <Link to="/me" className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></Link>
        <span className="topbar-heading">적립·사용 내역</span>
      </header>
    )
  } else if (meMatch) {
    // 마이 페이지: 좌측 "마이 페이지" 제목 (츄르 잔액은 페이지 내 카드로 이동)
    topbar = (
      <header className="topbar">
        <span className="topbar-heading topbar-title-lg">마이 페이지</span>
      </header>
    )
  } else if (scheduleMatch) {
    // 일정 페이지: 좌측 "일정" 제목, 우측 유형 필터(하단 시트는 페이지가 소유)
    topbar = (
      <header className="topbar">
        <span className="topbar-heading">일정</span>
        <button type="button" className="btn btn-ghost btn-sm icon-btn push-right sched-filter-btn"
          aria-label="유형 필터" title="유형 필터" onClick={() => headerFilter?.onClick?.()}>
          <FilterIcon />
          {headerFilter?.active && <span className="filter-dot" />}
        </button>
      </header>
    )
  } else if (storeMatch) {
    // 상점: 좌측 "깜냥이 상점" 제목, 우측 보유 츄르 알약(표시용)
    topbar = (
      <header className="topbar">
        <span className="topbar-heading">깜냥이 상점</span>
        <span className="coin-pill push-right" aria-label="보유 츄르">
          <span className="coin-pill-paw" aria-hidden="true">🐾</span>
          <span className="coin-pill-num">{coin == null ? '' : coin.toLocaleString('ko-KR')}</span>
        </span>
      </header>
    )
  } else if (inventoryMatch) {
    // 인벤토리: 좌측 뒤로(상점으로), 제목 "인벤토리"
    topbar = (
      <header className="topbar">
        <Link to="/store" className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></Link>
        <span className="topbar-heading">인벤토리</span>
      </header>
    )
  } else if (noteNewMatch) {
    // 쪽지 쓰기: 좌측 뒤로(쪽지 목록으로), 제목 "쪽지 쓰기"
    topbar = (
      <header className="topbar">
        <button type="button" onClick={() => navigate(-1)} className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></button>
        <span className="topbar-heading">쪽지 쓰기</span>
      </header>
    )
  } else if (notesMatch) {
    // 쪽지: 좌측 "쪽지" 제목
    topbar = (
      <header className="topbar">
        <span className="topbar-heading">쪽지</span>
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
          <NavLink to="/me">마이</NavLink>
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
        </div>
      </header>
    )
  }

  // 기본(메인) 화면에서만 하단 내비게이션 노출 (모바일 전용, CSS로 제어)
  const showBottomNav = !isGroupView

  return (
    <div className={`app-shell ${showBottomNav ? 'has-nav' : ''} ${homeMatch ? 'is-home' : ''} ${nowPlaying.current ? 'has-mini' : ''}`} ref={shellRef}>
      {topbar}
      {(pull > 0 || refreshing) && (
        <div className={`ptr ${dragging ? 'ptr-drag' : ''}`}
          style={{ top: ptrTop, transform: `translateY(${(refreshing ? 46 : pull) * 0.5 - 13}px)`, opacity: refreshing ? 1 : Math.min(1, pull / 40) }}>
          <span className={`ptr-spin ${refreshing ? 'on' : ''}`}
            style={refreshing ? undefined : { transform: `rotate(${pull * 4}deg)` }} />
        </div>
      )}
      <main className="content" ref={contentRef}>
        <Outlet context={{ setTaskHeading, setTaskBackTo, setBackHandler, setRefreshHandler, setHeaderFilter, setHeaderInvite, refreshCoin, player }} />
      </main>
      <MiniPlayer ref={playerRef} onState={setNowPlaying} />
      {showBottomNav && (
        <nav className="bottomnav">
          <NavLink to="/" end><GroupsIcon /><span>그룹</span></NavLink>
          <NavLink to="/schedule"><CalendarIcon /><span>일정</span></NavLink>
          <NavLink to="/store"><StoreIcon /><span>상점</span></NavLink>
          <NavLink to="/notes"><NoteIcon /><span>쪽지</span></NavLink>
          <NavLink to="/me"><MyIcon /><span>마이</span></NavLink>
        </nav>
      )}
      {/* 페이지가 Portal 로 하단 고정 바(댓글 입력 등)를 넣는 슬롯 */}
      <div id="app-bottom" className="app-bottom" />
      <PushPrompt />
    </div>
  )
}
