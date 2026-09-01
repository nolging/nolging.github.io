import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useMatch, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { taskTerms } from '../lib/constants'
import { attachShellFit } from '../lib/shellFit'
import { unreadNotificationCount, getMyCoinBalance, unreadNoteCount, hasClaimableQuest, hasNewStoreItems, getGroupBoard, listStoreItems } from '../lib/api'
import { setStoreCatalog } from '../lib/storeCatalog'
import Brand from './Brand'
import PawIcon from './PawIcon'
import PushPrompt from './PushPrompt'
import Modal from './Modal'
import MemberDetail from '../pages/MemberDetail'
import { MEMBER_EVENT } from '../lib/memberModal'
import MiniPlayer from './MiniPlayer'
import BlurayPlayer from './BlurayPlayer'
import NotifDropdown from './NotifDropdown'
import AccountSwitcher from './AccountSwitcher'
import ErrorReportModal from './ErrorReportModal'
import { hasAdminSaved } from '../lib/accountSwitch'

function SwapIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="17 2 21 6 17 10" /><path d="M21 6H7" />
      <polyline points="7 22 3 18 7 14" /><path d="M3 18h14" />
    </svg>
  )
}

function MegaphoneIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m3 11 18-5v12L3 14v-3z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </svg>
  )
}

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

function CloseIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function CheckCircleIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" /><polyline points="8.5 12 11 14.5 15.5 9.5" />
    </svg>
  )
}

function MenuIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  )
}

function SaveIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
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

function CubeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" />
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
// 쪽지: 편지봉투
const NoteIcon = () => tabSvg(<>
  <rect x="3" y="5" width="18" height="14" rx="2" />
  <path d="M3 7l9 6 9-6" />
</>)

// 프리미엄 상점 배경의 반짝이는 별 (앱 전체를 덮는 고정 백드롭에 렌더)
const PREM_STARS = [
  ['11%', '9%', 3, '#fff', 2.6, 0], ['26%', '5%', 2, '#dcd3ff', 3.4, .6], ['44%', '11%', 2.5, '#fff', 2.2, .3],
  ['63%', '6%', 2, '#fff', 3, 1.1], ['88%', '10%', 3, '#f0c968', 2.8, .9], ['6%', '24%', 2, '#fff', 3.2, .2],
  ['34%', '20%', 2, '#dcd3ff', 2.4, 1.4], ['72%', '22%', 2.5, '#fff', 3.6, .5], ['92%', '27%', 2, '#fff', 2.9, 1.7],
  ['18%', '38%', 2, '#fff', 3.1, .8], ['82%', '42%', 2, '#dcd3ff', 2.5, .1], ['10%', '54%', 2, '#fff', 3, .4],
  ['48%', '60%', 2.5, '#dcd3ff', 2.7, 1], ['86%', '58%', 2, '#fff', 3.3, .7], ['30%', '72%', 2, '#fff', 2.6, 1.3],
  ['66%', '78%', 2.5, '#f0c968', 3, .3], ['14%', '86%', 2, '#dcd3ff', 2.8, .9], ['90%', '84%', 2, '#fff', 3.2, 1.5],
]

export default function Layout() {
  const { profile, isAdmin } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  // 항상 지정된 상위 페이지로 replace 이동. 실제 브라우저 히스토리(navigate(-1))에 기대지
  // 않으므로, 콜드스타트로 곧장 진입한 경우든 아니든 뒤로가기 결과가 항상 예측 가능하다.
  // state 를 함께 넘기면(예: 멤버 페이지 자신의 뒤로가기 목적지) 그 목적지 페이지의 뒤로가기도
  // 이어서 올바르게 계산된다 — replace 이동은 실제 back 과 달리 이전 엔트리의 state 를 이어받지 않기 때문.
  const backOr = (fallbackPath, state) => navigate(fallbackPath, { replace: true, state })
  // 멤버 페이지(하위 기능의 "뒤로") 로 돌아갈 때 넘길 state: 그 하위 기능에 들어올 때
  // GroupMembers.jsx 가 함께 넘겨준 membersBackTo 가 '/'(그룹 홈)였다면, 멤버 페이지 자신의
  // 뒤로가기도 그룹 홈으로 가도록 from:'home' 을 이어서 전달한다.
  const membersReturnState = location.state?.membersBackTo === '/' ? { from: 'home' } : undefined
  const groupConfigMatch = useMatch('/groups/:groupId/settings/group')
  const settingsMatch = useMatch('/groups/:groupId/settings')
  const membersMatch = useMatch('/groups/:groupId/members')
  const memberDetailMatch = useMatch('/groups/:groupId/members/:userId')
  const closetMatch = useMatch('/groups/:groupId/closet')
  const drawMatch = useMatch('/groups/:groupId/draw')
  const touchMatch = useMatch('/groups/:groupId/touch')
  const puzzleMatch = useMatch('/groups/:groupId/puzzle')
  const catchMatch = useMatch('/groups/:groupId/catchmind')
  const omokMatch = useMatch('/groups/:groupId/omok')
  const rpsMatch = useMatch('/groups/:groupId/rps')
  const tarotMatch = useMatch('/groups/:groupId/tarot')
  const qworkshopMatch = useMatch('/groups/:groupId/qworkshop')
  const qworkshopNewMatch = useMatch('/groups/:groupId/qworkshop/new')
  const qworkshopEditMatch = useMatch('/groups/:groupId/qworkshop/:postId/edit')
  const qworkshopPostMatch = useMatch('/groups/:groupId/qworkshop/:postId')
  const boardMatch = useMatch('/groups/:groupId/board')
  const boardNewMatch = useMatch('/groups/:groupId/board/new')
  const boardSearchMatch = useMatch('/groups/:groupId/board/search')
  const boardSettingsMatch = useMatch('/groups/:groupId/board/settings')
  const boardEditMatch = useMatch('/groups/:groupId/board/:postId/edit')
  const boardCommentsMatch = useMatch('/groups/:groupId/board/:postId/comments')
  const boardPostMatch = useMatch('/groups/:groupId/board/:postId')
  const praiseMatch = useMatch('/groups/:groupId/praise')
  const davinciMatch = useMatch('/groups/:groupId/davinci')
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
  const memberInfoMatch = useMatch('/me/info')
  const profileEditMatch = useMatch('/me/edit')
  const coinHistoryMatch = useMatch('/me/coins')
  const groupMatch = useMatch('/groups/:groupId')
  const homeMatch = useMatch('/')
  // 관리자: 섹션(탭 메뉴) vs 드릴다운(뒤로+제목)
  const adminSection = ['/admin', '/admin/members', '/admin/store', '/admin/quests', '/admin/notifs', '/admin/misc'].includes(location.pathname)
  const adminSub = location.pathname.startsWith('/admin/') && !adminSection
  // PC 상단 내비게이션(desknav)에서 브랜드 클릭 목적지 + 중앙 메뉴를 관리자용으로 바꿀지 판단
  const inAdminArea = adminSection || adminSub
  const adminSubTitle = (p) =>
    p.startsWith('/admin/members') ? (p.endsWith('/new') ? '계정 생성' : '회원 상세')
      : p.startsWith('/admin/store') ? (p.endsWith('/new') ? '아이템 추가' : '아이템 수정')
        : p.startsWith('/admin/quests/daily') ? '퀘스트 수정'
          : p.startsWith('/admin/quests') ? (p.endsWith('/new') ? '퀘스트 추가' : '퀘스트 수정')
          : p.startsWith('/admin/notifs') ? (p.endsWith('/new') ? '알림 메시지 추가' : '알림 메시지 수정')
            : p.startsWith('/admin/misc/groups/') ? '그룹 사용량 제어'
              : p.startsWith('/admin/misc/groups') ? '그룹별 사용량 제어'
                : p.startsWith('/admin/misc/notices') ? (p.endsWith('/new') ? '시스템 공지 발송' : p === '/admin/misc/notices' ? '시스템 공지' : '시스템 공지 수정')
                  : p.startsWith('/admin/reports') ? '오류 리포트 관리'
                  : '관리자'
  // 관리자 탭 밑줄: 현재 탭 <a> 의 위치·너비를 측정해 슬라이드 애니메이션으로 옮긴다
  const adminTabsRef = useRef(null)
  const [adminIndicator, setAdminIndicator] = useState({ left: 0, width: 0 })
  useLayoutEffect(() => {
    if (!adminSection) return
    const nav = adminTabsRef.current
    if (!nav) return
    const update = () => {
      const active = nav.querySelector('a.active')
      if (active) setAdminIndicator({ left: active.offsetLeft, width: active.offsetWidth })
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [adminSection, location.pathname])
  // PC 상단 내비게이션(desknav) 탭 밑줄 — 관리자 탭 밑줄과 동일한 방식(위치·너비 측정 후 슬라이드)
  const desknavRef = useRef(null)
  const [desknavIndicator, setDesknavIndicator] = useState({ left: 0, width: 0 })
  useLayoutEffect(() => {
    const nav = desknavRef.current
    if (!nav) return
    const update = () => {
      const active = nav.querySelector('a.active')
      setDesknavIndicator(active ? { left: active.offsetLeft, width: active.offsetWidth } : { left: 0, width: 0 })
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [location.pathname])
  // 마이 페이지 '도전'으로 진입했는지 (뒤로가기 시 마이 페이지 복귀)
  const fromMe = location.state?.from === '/me'

  // 태스크 상세가 알려주는 동적 제목/뒤로가기 경로 (상태별 명칭, 상태 탭 복귀)
  const [taskHeading, setTaskHeading] = useState(null)
  const [taskBackTo, setTaskBackTo] = useState(null)
  // 페이지가 상단바 뒤로가기 동작을 가로챌 수 있게 (예: 그룹 만들기 2단계 → 1단계)
  const [backHandler, setBackHandler] = useState(null)
  // 페이지가 상단바 배경색을 지정할 수 있게 (예: 칭찬 스티커 — 페이지 그라데이션을 상단바까지 연장)
  const [headerBg, setHeaderBg] = useState(null)
  // 페이지가 상단바 우측 삼선 메뉴를 등록할 수 있게 (예: 칭찬 스티커 완성판 히스토리)
  const [headerMenu, setHeaderMenu] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => { if (!praiseMatch) setMenuOpen(false) }, [praiseMatch])
  // 페이지가 "당겨서 새로고침" 핸들러를 등록할 수 있게 (예: 알림 페이지)
  const [refreshHandler, setRefreshHandler] = useState(null)
  // 페이지가 상단바 필터 버튼 동작/뱃지를 등록할 수 있게 (예: 일정 페이지)
  const [headerFilter, setHeaderFilter] = useState(null)
  // 페이지가 상단바 초대 버튼을 등록할 수 있게 (그룹 상세)
  const [headerInvite, setHeaderInvite] = useState(null)
  // 페이지가 상단바 저장 버튼을 등록할 수 있게 (낙서장 → 이미지 저장)
  const [headerSave, setHeaderSave] = useState(null)
  // 페이지가 상단바 우측 톱니바퀴(설정) 버튼을 등록할 수 있게 (비밀 게시판 → 말머리 관리)
  const [headerGear, setHeaderGear] = useState(null)
  // 마이 페이지 상단바: 계정 전환(관리자용) 모달 열림 상태
  const [acctOpen, setAcctOpen] = useState(false)
  const [errOpen, setErrOpen] = useState(false)
  // 비밀 게시판 글쓰기: 상단바 "등록" 이 호출할 제출 핸들러(페이지가 등록)
  const [headerSubmit, setHeaderSubmit] = useState(null)
  // 비밀 게시판 글 상세: 상단바 우측 ⋮(수정/삭제) 메뉴 — 권한자만 페이지가 등록
  const [headerPostMenu, setHeaderPostMenu] = useState(null)
  const [postMenuOpen, setPostMenuOpen] = useState(false)
  useEffect(() => { setPostMenuOpen(false) }, [location.pathname])
  // 비밀 게시판 댓글 상세: 상단바에 댓글 수 표기 + 돋보기 → 상단바 검색창 토글
  // query=입력값, term=엔터로 확정한 검색어(하이라이팅 대상), mineOnly=내댓글만
  const [headerCommentCount, setHeaderCommentCount] = useState(null)
  const [commentSearchOpen, setCommentSearchOpen] = useState(false)
  const [commentSearchQuery, setCommentSearchQuery] = useState('')
  const [commentSearchTerm, setCommentSearchTerm] = useState('')
  const [commentMineOnly, setCommentMineOnly] = useState(false)
  const resetCommentSearch = () => { setCommentSearchOpen(false); setCommentSearchQuery(''); setCommentSearchTerm(''); setCommentMineOnly(false) }
  // 일정 페이지: 상단바 필터 버튼 우측 돋보기 → 상단바 한 줄이 검색창으로(댓글 검색과 동일한 패턴)
  const [schedSearchOpen, setSchedSearchOpen] = useState(false)
  const [schedSearchQuery, setSchedSearchQuery] = useState('')
  const [schedSearchTerm, setSchedSearchTerm] = useState('')
  const resetSchedSearch = () => { setSchedSearchOpen(false); setSchedSearchQuery(''); setSchedSearchTerm('') }
  // 물음표 공방 목록: 상단바 제목 우측 돋보기 → 알약 검색창(일정 검색과 동일한 패턴/컴포넌트)
  const [qwSearchOpen, setQwSearchOpen] = useState(false)
  const [qwSearchQuery, setQwSearchQuery] = useState('')
  const [qwSearchTerm, setQwSearchTerm] = useState('')
  const resetQwSearch = () => { setQwSearchOpen(false); setQwSearchQuery(''); setQwSearchTerm('') }
  useEffect(() => { resetCommentSearch(); resetSchedSearch(); resetQwSearch(); setHeaderCommentCount(null) }, [location.pathname])
  // 비밀 게시판 상단바 명칭: 그룹이 개설 시 지정한 이름(없으면 '비밀 게시판')
  const [boardTitle, setBoardTitle] = useState(null)
  const boardGroupId = boardMatch?.params.groupId || boardPostMatch?.params.groupId
    || boardCommentsMatch?.params.groupId || boardSearchMatch?.params.groupId
    || boardNewMatch?.params.groupId || boardEditMatch?.params.groupId || null
  useEffect(() => {
    if (!boardGroupId) { setBoardTitle(null); return }
    let on = true
    getGroupBoard(boardGroupId).then((n) => { if (on) setBoardTitle(n || null) }).catch(() => {})
    return () => { on = false }
  }, [boardGroupId])
  // 페이지가 상단바 제목을 바꿀 수 있게 (예: 커플 그룹 멤버 목록 → "데이트")
  const [headerTitle, setHeaderTitle] = useState(null)
  // 상점의 프리미엄 탭이 켜지면 앱 전체(상단바·하단탭)를 다크 테마로
  const [storePremium, setStorePremium] = useState(false)
  // 전역 음악 플레이어(페이지 이동/모달 닫아도 재생 유지)
  const playerRef = useRef(null)
  const [nowPlaying, setNowPlaying] = useState({ current: null, playing: false, pos: 0, dur: 0 })
  const player = {
    playTrack: (t) => playerRef.current?.play(t),
    prewarm: (kind) => playerRef.current?.prewarm(kind),
    toggle: () => playerRef.current?.toggle(),
    restart: () => playerRef.current?.restart(),
    current: nowPlaying.current,
    playing: nowPlaying.playing,
    pos: nowPlaying.pos || 0,
    dur: nowPlaying.dur || 0,
  }
  // 전역 블루레이 플레이어(쪽지 안 인라인 재생 ↔ 인앱 PIP, 페이지 이동해도 유지)
  const blurayRef = useRef(null)
  const bluray = {
    mount: (url, el) => blurayRef.current?.mount(url, el),
    release: (el) => blurayRef.current?.release(el),
    expand: () => blurayRef.current?.expand(),
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
      // 그룹 상세: 헤더/탭 영역(.gd-sticky-head)에서 시작한 터치는 당겨서 새로고침 대상에서 제외
      // (카드 목록 영역에서 당길 때만 동작하게)
      if (e.target.closest?.('.gd-sticky-head')) { ptr.current.active = false; return }
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

  // PC: 스크롤바를 스크롤 중일 때만 보이게 (macOS 오버레이 스타일). 리렌더 없이 DOM에 직접 클래스 토글
  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    let hideT
    const onScroll = () => {
      el.classList.add('is-scrolling')
      clearTimeout(hideT)
      hideT = setTimeout(() => el.classList.remove('is-scrolling'), 650)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => { el.removeEventListener('scroll', onScroll); clearTimeout(hideT) }
  }, [])

  // 안읽은 알림 개수: 마운트 시 + 라우트 이동 시 + 60초 주기로 갱신
  const [unread, setUnread] = useState(0)
  const refreshUnread = () => unreadNotificationCount().then(setUnread).catch(() => {})
  useEffect(() => {
    refreshUnread()
    const iv = setInterval(refreshUnread, 60000)
    return () => clearInterval(iv)
  }, [])
  useEffect(() => { refreshUnread() }, [location.pathname])

  // PC 전용 알림 드롭다운: 종 아이콘 클릭 시 열림 (모바일은 알림 페이지로 이동)
  const [notifOpen, setNotifOpen] = useState(false)
  const notifRef = useRef(null)
  useEffect(() => {
    if (!notifOpen) return
    const onDocDown = (e) => { if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false) }
    const onEsc = (e) => { if (e.key === 'Escape') setNotifOpen(false) }
    document.addEventListener('pointerdown', onDocDown)
    document.addEventListener('keydown', onEsc)
    return () => { document.removeEventListener('pointerdown', onDocDown); document.removeEventListener('keydown', onEsc) }
  }, [notifOpen])
  useEffect(() => { setNotifOpen(false) }, [location.pathname])

  // PC 전용: 멤버 아바타 클릭 시 멤버 상세를 모달로 (openMember 가 이벤트 발행)
  const [memberModal, setMemberModal] = useState(null) // { groupId, userId }
  useEffect(() => {
    const on = (e) => setMemberModal(e.detail || null)
    window.addEventListener(MEMBER_EVENT, on)
    return () => window.removeEventListener(MEMBER_EVENT, on)
  }, [])
  useEffect(() => { setMemberModal(null) }, [location.pathname])

  // 하단 탭 '쪽지' 점: 안 읽은 받은 쪽지가 있으면 표시
  const [noteUnread, setNoteUnread] = useState(0)
  const refreshNoteUnread = () => unreadNoteCount(profile?.id).then(setNoteUnread).catch(() => {})
  useEffect(() => {
    refreshNoteUnread()
    const iv = setInterval(refreshNoteUnread, 60000)
    return () => clearInterval(iv)
  }, [profile?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { refreshNoteUnread() }, [location.pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  // 하단 탭 '마이' 점: 완료돼서 "받기" 가능한 퀘스트가 있으면 표시
  const [questClaimable, setQuestClaimable] = useState(false)
  const refreshQuestClaimable = () => hasClaimableQuest().then(setQuestClaimable).catch(() => {})
  useEffect(() => {
    refreshQuestClaimable()
    const iv = setInterval(refreshQuestClaimable, 60000)
    return () => clearInterval(iv)
  }, [profile?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { refreshQuestClaimable() }, [location.pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  // 하단 탭 '상점' 점: 일반/프리미엄 중 아직 안 본 신상이 있으면 표시(둘 다 봐야 없어짐)
  const [storeNew, setStoreNew] = useState(false)
  const refreshStoreNew = () => hasNewStoreItems().then(setStoreNew).catch(() => {})
  useEffect(() => {
    refreshStoreNew()
    const iv = setInterval(refreshStoreNew, 60000)
    return () => clearInterval(iv)
  }, [profile?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { refreshStoreNew() }, [location.pathname]) // eslint-disable-line react-hooks/exhaustive-deps

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
  const isGroupView = !!(newGroupMatch || joinMatch || notifMatch || notifSettingsMatch || groupConfigMatch || settingsMatch || membersMatch || memberDetailMatch || closetMatch || drawMatch || touchMatch || puzzleMatch || catchMatch || omokMatch || davinciMatch || rpsMatch || tarotMatch || qworkshopMatch || qworkshopNewMatch || qworkshopEditMatch || qworkshopPostMatch || boardMatch || boardNewMatch || boardSearchMatch || boardEditMatch || boardCommentsMatch || boardPostMatch || praiseMatch || taskNewMatch || taskEditMatch || taskScheduleMatch || taskDetailMatch || groupMatch || profileEditMatch || coinHistoryMatch || noteNewMatch || inventoryMatch)
  useEffect(() => {
    // body 배경 = 콘텐츠 캔버스(--bg)와 동일하게. iOS 홈화면 앱에서 콘텐츠가 하단까지
    // 못 미쳐 body 가 비쳐도 흰색(#fff)이 아니라 콘텐츠와 같은 색으로 보이게 하는 안전장치
    document.body.style.background = storePremium ? '#0d0a22' : 'var(--bg)'
    // iOS 홈화면 앱: 상태바/다이나믹 아일랜드 영역 색을 상단바 색과 맞춰 이어지게
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', storePremium ? '#2c2560' : '#fdfcfe')
    return () => { document.body.style.background = '' }
  }, [isGroupView, storePremium])

  // 아이템 이미지/배경색 카탈로그 최초 로드(선물 모달·쪽지 등 어디서든 공유)
  useEffect(() => { listStoreItems().then(setStoreCatalog).catch(() => {}) }, [])

  // 키보드가 올라오면 앱 셸을 보이는 영역(visual viewport)에 맞춰 축소한다.
  // → 하단 입력창이 키보드 위로 올라오고, 본문은 그 영역 안에 맞춰진다.
  const shellRef = useRef(null)
  useEffect(() => attachShellFit(() => shellRef.current), [])


  let topbar
  if (groupConfigMatch) {
    // 그룹 정보 수정 페이지: 좌측 뒤로(그룹 상세로 — 톱니바퀴로 진입), 제목 "그룹 정보 수정"
    const id = groupConfigMatch.params.groupId
    topbar = (
      <header className="topbar">
        <Link to={`/groups/${id}`} className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></Link>
        <span className="topbar-heading">그룹 정보 수정</span>
      </header>
    )
  } else if (settingsMatch) {
    // 내 정보 수정 페이지: 좌측 뒤로는 직전 페이지로(멤버 상세 → 톱니로 들어온 경우 그 상세로 복귀)
    topbar = (
      <header className="topbar">
        <button type="button" onClick={() => navigate(-1)} className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></button>
        <span className="topbar-heading">내 정보 수정</span>
      </header>
    )
  } else if (drawMatch) {
    // 그림판: 좌측 뒤로 — 멤버 목록(커플 공간)에서 왔으면 멤버 목록으로, 아니면 그룹으로
    // topbar-keep: PC 에서도 '갤러리에 저장' 버튼을 위해 상단바 유지
    topbar = (
      <header className="topbar topbar-keep">
        <button type="button" onClick={() => navigate(-1)} className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></button>
        <span className="topbar-heading">낙서장</span>
        {headerSave && (
          <button type="button" onClick={() => headerSave()} className="btn btn-ghost btn-sm icon-btn push-right"
            aria-label="갤러리에 저장" title="갤러리에 저장"><SaveIcon /></button>
        )}
      </header>
    )
  } else if (touchMatch) {
    // 우심뽀까: 좌측 뒤로 — 커플 공간에서 왔으면 멤버 목록으로, 직전 히스토리 없으면(푸시 콜드스타트) 데이트 페이지로.
    // 마이 페이지 '도전'(r_kiss)으로 왔으면 마이 페이지로.
    topbar = (
      <header className="topbar">
        <button type="button" onClick={() => (fromMe ? navigate('/me') : backOr(`/groups/${touchMatch.params.groupId}/members`, membersReturnState))} className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></button>
        <span className="topbar-heading">우심뽀까</span>
      </header>
    )
  } else if (tarotMatch) {
    // 타로 카페: 좌측 뒤로, 제목
    topbar = (
      <header className="topbar">
        <button type="button" onClick={() => navigate(-1)} className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></button>
        <span className="topbar-heading">타로 카페</span>
      </header>
    )
  } else if (qworkshopNewMatch || qworkshopEditMatch) {
    // 물음표 작성/수정: 좌측 ✕(닫기) · 우측 등록/수정(페이지가 등록한 제출 핸들러 호출)
    topbar = (
      <header className="topbar">
        <button type="button" onClick={() => navigate(-1)} className="btn btn-ghost btn-sm icon-btn" aria-label="닫기" title="닫기"><CloseIcon /></button>
        <button type="button" onClick={() => headerSubmit?.()} className="sb-post-btn push-right">{qworkshopEditMatch ? '수정' : '등록'}</button>
      </header>
    )
  } else if (qworkshopPostMatch) {
    // 질문 상세: 제목 없이 좌측 뒤로 화살표, (권한 시) 우측 ⋮ → 수정/삭제(비밀 게시판과 동일 패턴).
    // 목록에서 받은 membersBackTo 를 그대로 이어서 넘겨, 목록에서 또 뒤로 갈 때도 안 끊기게 한다.
    const hasQwPostMenu = headerPostMenu?.items?.length > 0
    topbar = (
      <header className="topbar">
        <button type="button"
          onClick={() => backOr(`/groups/${qworkshopPostMatch.params.groupId}/qworkshop`, location.state?.membersBackTo ? { membersBackTo: location.state.membersBackTo } : undefined)}
          className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></button>
        {hasQwPostMenu && (
          <div className="task-menu-wrap push-right">
            <button type="button" className="btn btn-ghost btn-sm icon-btn" aria-label="더보기" onClick={() => setPostMenuOpen((o) => !o)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" />
              </svg>
            </button>
            {postMenuOpen && (
              <>
                <div className="menu-backdrop" onClick={() => setPostMenuOpen(false)} />
                <div className="menu-pop" role="menu">
                  {headerPostMenu.items.map((it, i) => (
                    <button key={i} type="button" className={it.danger ? 'menu-danger' : ''}
                      onClick={() => { setPostMenuOpen(false); it.onClick?.() }}>{it.label}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </header>
    )
  } else if (qworkshopMatch) {
    // 질문 목록: 좌측 뒤로(데이트/놀이터 페이지인 멤버 목록으로 — 비밀 게시판과 동일하게
    // 고정 목적지), 제목(설명 문구 없이 제목만, 2a 시안), 우측 돋보기 → 알약 검색창(일정과 동일 패턴)
    topbar = (
      <header className="topbar">
        {!qwSearchOpen && (
          <button type="button" onClick={() => backOr(`/groups/${qworkshopMatch.params.groupId}/members`, membersReturnState)} className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></button>
        )}
        {!qwSearchOpen && <span className="topbar-heading topbar-title-lg">물음표 공방</span>}
        <div className={`sched-search push-right ${qwSearchOpen ? 'open' : ''}`}>
          <button type="button" className="sched-search-btn" aria-label="질문 검색" title="질문 검색"
            onClick={() => setQwSearchOpen(true)}><SearchIcon /></button>
          <input className="sched-search-input" autoFocus={qwSearchOpen} placeholder="질문 검색" enterKeyHint="search"
            value={qwSearchQuery} onChange={(e) => setQwSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); setQwSearchTerm(qwSearchQuery.trim()) } }}
            tabIndex={qwSearchOpen ? 0 : -1} />
          {qwSearchOpen && (
            <button type="button" className="sched-search-clear" aria-label="검색 닫기" onClick={resetQwSearch}><CloseIcon size={16} /></button>
          )}
        </div>
      </header>
    )
  } else if (boardNewMatch || boardEditMatch) {
    // 비밀 게시판 글쓰기/수정: 좌측 ✕(닫기) · 우측 등록(페이지가 등록한 제출 핸들러 호출)
    topbar = (
      <header className="topbar">
        <button type="button" onClick={() => navigate(-1)} className="btn btn-ghost btn-sm icon-btn" aria-label="닫기" title="닫기"><CloseIcon /></button>
        <button type="button" onClick={() => headerSubmit?.()} className="sb-post-btn push-right">등록</button>
      </header>
    )
  } else if (boardSearchMatch) {
    // 비밀 게시판 검색: 좌측 뒤로, 제목 "검색"
    topbar = (
      <header className="topbar">
        <button type="button" onClick={() => navigate(-1)} className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></button>
        <span className="topbar-heading">검색</span>
      </header>
    )
  } else if (boardCommentsMatch) {
    // 비밀 게시판 댓글 상세: 상단바에 댓글 수 + 우측 돋보기. 돋보기 → 상단바 한 줄이 검색창으로.
    topbar = commentSearchOpen ? (
      <header className="topbar sb-search-topbar">
        <button type="button" className={`sb-mine-toggle${commentMineOnly ? ' on' : ''}`}
          onClick={() => setCommentMineOnly((v) => !v)}><CheckCircleIcon /><span>내댓글</span></button>
        <div className="sb-topbar-searchwrap">
          <input className="sb-topbar-search" autoFocus placeholder="댓글 내용 검색"
            value={commentSearchQuery} onChange={(e) => setCommentSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); setCommentSearchTerm(commentSearchQuery.trim()) } }} />
          {commentSearchQuery && (
            <button type="button" className="sb-topbar-clear" aria-label="지우기"
              onClick={() => { setCommentSearchQuery(''); setCommentSearchTerm('') }}>✕</button>
          )}
        </div>
        <button type="button" className="sb-topbar-close" onClick={resetCommentSearch}>닫기</button>
      </header>
    ) : (
      <header className="topbar">
        <button type="button" onClick={() => backOr(`/groups/${boardCommentsMatch.params.groupId}/board/${boardCommentsMatch.params.postId}`)} className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></button>
        <span className="topbar-heading">댓글{headerCommentCount != null && (<>{' '}<span className="sb-cmt-count-num">{headerCommentCount}</span></>)}</span>
        <button type="button" className="btn btn-ghost btn-sm icon-btn push-right" aria-label="댓글 검색" title="댓글 검색"
          onClick={() => setCommentSearchOpen(true)}><SearchIcon /></button>
      </header>
    )
  } else if (boardSettingsMatch) {
    // 비밀 게시판 설정: 좌측 뒤로, 제목 "비밀 게시판 설정"
    topbar = (
      <header className="topbar">
        <button type="button" onClick={() => navigate(-1)} className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></button>
        <span className="topbar-heading">비밀 게시판 설정</span>
      </header>
    )
  } else if (boardPostMatch) {
    // 비밀 게시판 글 상세: 좌측 뒤로(목록으로), 제목, (권한 시) 우측 ⋮ → 수정/삭제
    const hasPostMenu = headerPostMenu?.items?.length > 0
    topbar = (
      <header className="topbar">
        <button type="button" onClick={() => backOr(`/groups/${boardPostMatch.params.groupId}/board`)} className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></button>
        <span className="topbar-heading">{boardTitle || '비밀 게시판'}</span>
        {hasPostMenu && (
          <div className="task-menu-wrap push-right">
            <button type="button" className="btn btn-ghost btn-sm icon-btn" aria-label="더보기" onClick={() => setPostMenuOpen((o) => !o)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" />
              </svg>
            </button>
            {postMenuOpen && (
              <>
                <div className="menu-backdrop" onClick={() => setPostMenuOpen(false)} />
                <div className="menu-pop" role="menu">
                  {headerPostMenu.items.map((it, i) => (
                    <button key={i} type="button" className={it.danger ? 'menu-danger' : ''}
                      onClick={() => { setPostMenuOpen(false); it.onClick?.() }}>{it.label}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </header>
    )
  } else if (boardMatch) {
    // 비밀 게시판: 좌측 뒤로(데이트/놀이터 페이지인 멤버 목록으로 — navigate(-1) 은 글/댓글
    // 상세를 거쳐 들어왔을 때 실제 히스토리 스택 상 엉뚱한 단계로 돌아가 버려서, 우심뽀까 등
    // 다른 커플 공간 하위 페이지들처럼 고정 목적지로 고정한다), 제목, (관리 권한 시) 우측 톱니바퀴 → 설정 페이지
    topbar = (
      <header className="topbar">
        <button type="button" onClick={() => backOr(`/groups/${boardMatch.params.groupId}/members`, membersReturnState)} className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></button>
        <span className="topbar-heading">{boardTitle || '비밀 게시판'}</span>
        {headerGear && (
          <button type="button" onClick={() => headerGear()} className="btn btn-ghost btn-sm icon-btn push-right"
            aria-label="비밀 게시판 설정" title="비밀 게시판 설정"><GearIcon /></button>
        )}
      </header>
    )
  } else if (puzzleMatch) {
    // 함께 퍼즐: 페이지가 자체 헤더(뒤로·퍼즐·접속 인원·종료)를 그리므로 Layout 상단바는 숨김
    // (숨기지 않으면 헤더가 두 겹이 되고 접속 인원 배지가 상단바에 가려진다)
    topbar = null
  } else if (catchMatch) {
    // 캐치마인드: 페이지가 자체 헤더(대기실/게임)를 그리므로 Layout 상단바는 숨김
    topbar = null
  } else if (omokMatch) {
    // 오목: 페이지가 자체 헤더(대기실/게임 단계별)를 그리므로 Layout 상단바는 숨김
    topbar = null
  } else if (davinciMatch) {
    // 다빈치코드: 페이지가 자체 헤더(대기실/게임 단계별)를 그리므로 Layout 상단바는 숨김
    topbar = null
  } else if (rpsMatch) {
    // 가위바위보: 페이지가 자체 헤더를 그리므로 Layout 상단바는 숨김
    topbar = null
  } else if (praiseMatch) {
    // 칭찬 스티커: 좌측 뒤로(데이트로), 제목. 페이지 그라데이션을 상단바까지 연장(headerBg).
    // 완성한 판이 있으면 우측 삼선 버튼 → 히스토리 드롭다운. 마이 페이지 '도전'(r_sticker)으로
    // 왔으면 마이 페이지로.
    const hasMenu = headerMenu?.items?.length > 0
    topbar = (
      <header className="topbar" style={headerBg ? { background: headerBg, borderBottom: 'none' } : undefined}>
        <button type="button" onClick={() => (fromMe ? navigate('/me') : backOr(`/groups/${praiseMatch.params.groupId}/members`, membersReturnState))} className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></button>
        <span className="topbar-heading">칭찬 스티커</span>
        {hasMenu && (
          <div className="praise-menu-wrap">
            <button type="button" className="btn btn-ghost btn-sm icon-btn" aria-label="완성한 스티커판" onClick={() => setMenuOpen((o) => !o)}>
              <MenuIcon />
            </button>
            {menuOpen && (
              <>
                <div className="praise-menu-backdrop" onClick={() => setMenuOpen(false)} />
                <div className="praise-menu-dd">
                  <div className="praise-menu-hd">완성한 스티커판</div>
                  {headerMenu.items.map((it) => (
                    <button key={it.id} type="button"
                      className={`praise-menu-item ${headerMenu.selectedId === it.id ? 'on' : ''}`}
                      onClick={() => { headerMenu.onSelect(it.id); setMenuOpen(false) }}>{it.label}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </header>
    )
  } else if (memberDetailMatch) {
    // 멤버 상세: 좌측 뒤로(직전 페이지). 본인 상세면 우측에 설정(내 정보 수정) 톱니바퀴
    const { groupId: gid, userId: uid } = memberDetailMatch.params
    const isMe = uid === profile?.id
    topbar = (
      <header className="topbar">
        <button type="button" onClick={() => navigate(-1)} className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></button>
        <span className="topbar-heading">멤버 정보</span>
        {isMe && (
          <div className="topbar-right">
            <Link to={`/groups/${gid}/settings`} className="btn btn-ghost btn-sm icon-btn" aria-label="내 정보 수정" title="내 정보 수정"><GearIcon /></Link>
          </div>
        )}
      </header>
    )
  } else if (closetMatch) {
    // 옷장: 좌측 뒤로 — 페이지가 준 핸들러(변경 사항 있으면 확인창) 사용, 우측 먹색 알약
    // "완료"는 페이지가 준 제출 핸들러(그 시점에 실제 서버 반영) 사용.
    topbar = (
      <header className="topbar">
        <button type="button" onClick={() => (backHandler ? backHandler() : navigate(-1))} className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></button>
        <span className="topbar-heading">옷장</span>
        <div className="topbar-right">
          <button type="button" onClick={() => headerSubmit?.()} className="sb-post-btn">완료</button>
        </div>
      </header>
    )
  } else if (membersMatch) {
    // 멤버 페이지: 좌측 뒤로(직전 페이지 — 그룹 홈 카드에서 왔으면 그룹 홈, 그 외엔 그룹 상세),
    // 제목 "멤버"(커플 그룹은 페이지가 제목을 "데이트"로 등록). 직전 히스토리 없으면(콜드스타트) 그룹 상세로.
    // 마이 페이지 '도전'(r_date)으로 왔으면 마이 페이지로.
    const membersBackTo = location.state?.from === 'home' ? '/' : `/groups/${membersMatch.params.groupId}`
    topbar = (
      <header className="topbar">
        <button type="button" onClick={() => (fromMe ? navigate('/me') : backOr(membersBackTo))} className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></button>
        <span className="topbar-heading">{headerTitle || '멤버'}</span>
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
    // 태스크 수정 페이지: 좌측 뒤로 — 그룹 카드(스와이프)에서 왔으면 그룹 상세(해당 탭), 그 외엔 태스크 상세로
    const { groupId: id, taskId: tid } = taskEditMatch.params
    const editBackTo = location.state?.from === 'group'
      ? `/groups/${id}?tab=${location.state?.tab || 'open'}`
      : `/groups/${id}/tasks/${tid}`
    topbar = (
      <header className="topbar">
        <Link to={editBackTo} className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></Link>
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
        <span className="topbar-heading">{headerTitle || '약속 잡기'}</span>
      </header>
    )
  } else if (taskDetailMatch) {
    // 태스크 상세 페이지: 좌측 뒤로(상태 탭으로), 제목은 진행 상태별 명칭
    const id = taskDetailMatch.params.groupId
    topbar = (
      <header className="topbar">
        {taskBackTo === 'back'
          ? <button type="button" onClick={() => navigate(-1)} className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></button>
          : <button type="button" onClick={() => backOr(taskBackTo || `/groups/${id}`)} className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></button>}
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
    // 그룹 가입 STEP 2 페이지: 좌측 뒤로(내 그룹으로). 코드 입력은 바텀시트 모달로 분리됨
    topbar = (
      <header className="topbar">
        <Link to="/" className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></Link>
        <span className="topbar-heading">그룹 가입</span>
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
    // 알림/일정에서 "그룹으로 이동"(replace)으로 왔으면 히스토리 pop 으로 그 페이지 복귀.
    // 마이 페이지 '도전'(r_accept/r_review/r_first_comment)으로 왔으면 마이 페이지로.
    const id = groupMatch.params.groupId
    const gFrom = location.state?.from
    topbar = (
      <header className="topbar">
        {fromMe
          ? <button type="button" onClick={() => navigate('/me')} className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></button>
          : (gFrom === 'notifications' || gFrom === 'schedule')
          ? <button type="button" onClick={() => navigate(-1)} className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></button>
          : <button type="button" onClick={() => backOr('/')} className="btn btn-ghost btn-sm icon-btn" aria-label="내 그룹" title="내 그룹"><BackIcon /></button>}
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
        <Link to={`/groups/${id}/settings/group`} className={`btn btn-ghost btn-sm icon-btn ${(headerFilter || headerInvite) ? '' : 'push-right'}`} aria-label="그룹 정보 수정" title="그룹 정보 수정"><GearIcon /></Link>
      </header>
    )
  } else if (memberInfoMatch) {
    // 회원 정보 조회: 좌측 뒤로(마이 페이지로), 제목 "회원 정보"
    topbar = (
      <header className="topbar">
        <Link to="/me" className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></Link>
        <span className="topbar-heading">회원 정보</span>
      </header>
    )
  } else if (profileEditMatch) {
    // 회원 정보 수정: 좌측 뒤로(회원 정보로), 제목 "회원 정보 수정"
    topbar = (
      <header className="topbar">
        <Link to="/me/info" className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></Link>
        <span className="topbar-heading">회원 정보 수정</span>
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
    // 마이 페이지: 좌측 "마이 페이지" 제목, (관리자면) 우측 관리자 링크 + 계정 전환 아이콘
    // 계정 전환 아이콘은 (현재 관리자) 또는 (이 기기에 저장된 관리자 계정 있음)일 때만 노출
    const showAcct = isAdmin || hasAdminSaved()
    topbar = (
      <header className="topbar">
        <span className="topbar-heading topbar-title-lg">마이 페이지</span>
        <div className="topbar-right">
          {isAdmin && <Link to="/admin" className="topbar-admin">관리자</Link>}
          {!isAdmin && (
            <button type="button" className="btn btn-ghost btn-sm icon-btn" aria-label="오류 리포트" title="오류 리포트"
              onClick={() => setErrOpen(true)}><MegaphoneIcon /></button>
          )}
          {showAcct && (
            <button type="button" className="btn btn-ghost btn-sm icon-btn" aria-label="계정 전환" title="계정 전환"
              onClick={() => setAcctOpen(true)}><SwapIcon /></button>
          )}
        </div>
      </header>
    )
  } else if (scheduleMatch) {
    // 일정 페이지: 좌측 "일정" 제목, 우측 유형 필터(하단 시트는 페이지가 소유) + 검색(돋보기 버튼이
    // 알약 검색창으로 자연스럽게 늘어남 — 원형 버튼은 그대로 왼쪽에 남고 뒤에서 입력창이 펼쳐지는 트릭).
    // 마이 페이지 '도전'(r_schedule)으로 왔으면 좌측에 뒤로가기(마이 페이지로) 추가.
    topbar = (
      <header className="topbar">
        {!schedSearchOpen && fromMe && <Link to="/me" className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></Link>}
        {!schedSearchOpen && <span className="topbar-heading topbar-title-lg">일정</span>}
        {!schedSearchOpen && (
          <button type="button" className="btn btn-ghost btn-sm icon-btn push-right sched-filter-btn"
            aria-label="유형 필터" title="유형 필터" onClick={() => headerFilter?.onClick?.()}>
            <FilterIcon />
            {headerFilter?.active && <span className="filter-dot" />}
          </button>
        )}
        <div className={`sched-search ${schedSearchOpen ? 'open' : ''}`}>
          <button type="button" className="sched-search-btn" aria-label="일정 검색" title="일정 검색"
            onClick={() => setSchedSearchOpen(true)}><SearchIcon /></button>
          <input className="sched-search-input" autoFocus={schedSearchOpen} placeholder="제목 검색" enterKeyHint="search"
            value={schedSearchQuery} onChange={(e) => setSchedSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); setSchedSearchTerm(schedSearchQuery.trim()) } }}
            tabIndex={schedSearchOpen ? 0 : -1} />
          {schedSearchOpen && (
            <button type="button" className="sched-search-clear" aria-label="검색 닫기" onClick={resetSchedSearch}><CloseIcon size={16} /></button>
          )}
        </div>
      </header>
    )
  } else if (storeMatch) {
    // 상점: 좌측 "깜냥이 상점" 제목, 우측 보유 츄르 알약 + 인벤토리 버튼
    topbar = (
      <header className="topbar">
        {fromMe && <Link to="/me" className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></Link>}
        <span className="topbar-heading topbar-title-lg">깜냥이 상점</span>
        <span className="coin-pill push-right" aria-label="보유 츄르">
          <PawIcon className="coin-pill-paw" />
          <span className="coin-pill-num">{coin == null ? '' : coin.toLocaleString('ko-KR')}</span>
        </span>
        <Link to="/inventory" className="btn btn-ghost btn-sm icon-btn store-inv-btn" aria-label="인벤토리" title="인벤토리"><CubeIcon /></Link>
      </header>
    )
  } else if (inventoryMatch) {
    // 인벤토리: 좌측 뒤로(상점으로), 제목 "인벤토리"
    topbar = (
      <header className="topbar">
        {fromMe
          ? <Link to="/me" className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></Link>
          : <Link to="/store" state={{ restore: true }} className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></Link>}
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
        <span className="topbar-heading topbar-title-lg">쪽지</span>
      </header>
    )
  } else if (fromMe && homeMatch) {
    // 마이 페이지 '도전'으로 홈에 진입: 좌측 뒤로(마이 페이지로)
    topbar = (
      <header className="topbar">
        <Link to="/me" className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></Link>
        <span className="topbar-heading">내 그룹</span>
      </header>
    )
  } else if (adminSection) {
    // 관리자 섹션(탭 화면): 하단 탭바로 이동 가능하므로 뒤로 버튼 없이 탭만
    topbar = (
      <header className="topbar admin-topbar">
        <nav className="admin-tabs" ref={adminTabsRef}>
          <NavLink to="/admin/store">상점 관리</NavLink>
          <NavLink to="/admin/quests">퀘스트 관리</NavLink>
          <NavLink to="/admin/notifs">알림 관리</NavLink>
          <NavLink to="/admin/members">회원 관리</NavLink>
          <NavLink to="/admin/misc">기타 관리</NavLink>
          <span className="admin-tabs-indicator" aria-hidden="true"
            style={{ transform: `translateX(${adminIndicator.left}px)`, width: adminIndicator.width }} />
        </nav>
      </header>
    )
  } else if (adminSub) {
    // 관리자 드릴다운(상세/추가): 좌측 뒤로, 제목
    topbar = (
      <header className="topbar">
        <button type="button" onClick={() => navigate(-1)} className="btn btn-ghost btn-sm icon-btn" aria-label="뒤로" title="뒤로"><BackIcon /></button>
        <span className="topbar-heading">{adminSubTitle(location.pathname)}</span>
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
            {profile?.login_id}
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
    <div className={`app-shell ${showBottomNav ? 'has-nav' : ''} ${homeMatch ? 'is-home' : ''} ${nowPlaying.current ? 'has-mini' : ''} ${storePremium ? 'premium-shop' : ''} ${storeMatch ? 'store-view' : ''} ${meMatch ? 'me-view' : ''} ${tarotMatch ? 'tarot-view' : ''}`} ref={shellRef}>
      {storePremium && (
        <div className="premium-backdrop" aria-hidden="true">
          {PREM_STARS.map(([l, t, s, c, d, dl], i) => (
            <span key={i} style={{ left: l, top: t, width: s, height: s, background: c, boxShadow: `0 0 6px 1px ${c}`, animationDuration: `${d}s`, animationDelay: `${dl}s` }} />
          ))}
        </div>
      )}
      {topbar}
      {/* PC 전용 상단 내비게이션 (모바일 하단 탭을 상단으로) — 모든 페이지에서 항상 노출.
          .page 와 동일하게 1080px 중앙 정렬(좌우 패딩은 바깥 .desknav 가 담당) */}
      <header className="desknav">
          <div className="desknav-inner">
            {/* 관리자로 로그인 중이면 브랜드가 관리자 페이지 ⇄ 일반 화면을 오가는 토글 역할도 함 */}
            <Link to={isAdmin ? (inAdminArea ? '/' : '/admin') : '/'} className="brand"><Brand /></Link>
            {inAdminArea ? (
              <nav className="desknav-left" ref={desknavRef}>
                <NavLink to="/admin/store">상점 관리</NavLink>
                <NavLink to="/admin/quests">퀘스트 관리</NavLink>
                <NavLink to="/admin/notifs">알림 관리</NavLink>
                <NavLink to="/admin/members">회원 관리</NavLink>
                <NavLink to="/admin/misc">기타 관리</NavLink>
                <span className="desknav-indicator" aria-hidden="true"
                  style={{ transform: `translateX(${desknavIndicator.left}px)`, width: desknavIndicator.width }} />
              </nav>
            ) : (
              <nav className="desknav-left" ref={desknavRef}>
                <NavLink to="/" end>내 그룹</NavLink>
                <NavLink to="/schedule">일정</NavLink>
                <NavLink to="/store"><span className="nav-ico-wrap">상점{storeNew && <span className="nav-dot" aria-label="신상 입고" />}</span></NavLink>
                <NavLink to="/inventory">인벤토리</NavLink>
                <span className="desknav-indicator" aria-hidden="true"
                  style={{ transform: `translateX(${desknavIndicator.left}px)`, width: desknavIndicator.width }} />
              </nav>
            )}
            <div className="desknav-right">
              <div className="desknav-notif" ref={notifRef}>
                <button type="button" className={`desknav-icon ${notifOpen ? 'active' : ''}`}
                  aria-label="알림" title="알림" aria-haspopup="dialog" aria-expanded={notifOpen}
                  onClick={() => setNotifOpen((o) => !o)}>
                  <span className="nav-ico-wrap"><BellIcon />{unread > 0 && <span className="nav-dot" aria-label="읽지 않은 알림" />}</span>
                </button>
                {notifOpen && <NotifDropdown onClose={() => setNotifOpen(false)} onChange={refreshUnread} />}
              </div>
              <NavLink to="/notes" className="desknav-icon" aria-label="쪽지" title="쪽지">
                <span className="nav-ico-wrap"><NoteIcon />{noteUnread > 0 && <span className="nav-dot" aria-label="안 읽은 쪽지" />}</span>
              </NavLink>
              <NavLink to="/me" className="desknav-me" title="마이 페이지">{profile?.nickname || '마이 페이지'}</NavLink>
              {(isAdmin || hasAdminSaved()) && (
                <button type="button" className="desknav-icon" aria-label="계정 전환" title="계정 전환"
                  onClick={() => setAcctOpen(true)}><SwapIcon /></button>
              )}
            </div>
          </div>
        </header>
      {(pull > 0 || refreshing) && (
        <div className={`ptr ${dragging ? 'ptr-drag' : ''}`}
          style={{ top: ptrTop, transform: `translateY(${(refreshing ? 46 : pull) * 0.5 - 13}px)`, opacity: refreshing ? 1 : Math.min(1, pull / 40) }}>
          <span className={`ptr-spin ${refreshing ? 'on' : ''}`}
            style={refreshing ? undefined : { transform: `rotate(${pull * 4}deg)` }} />
        </div>
      )}
      <main className="content" ref={contentRef}>
        <Outlet context={{ setTaskHeading, setTaskBackTo, setBackHandler, setRefreshHandler, setHeaderFilter, setHeaderInvite, setHeaderTitle, setHeaderSave, setHeaderGear, setHeaderSubmit, setHeaderPostMenu, setHeaderCommentCount, commentSearch: { open: commentSearchOpen, query: commentSearchQuery, term: commentSearchTerm, mineOnly: commentMineOnly }, schedSearch: { open: schedSearchOpen, query: schedSearchQuery, term: schedSearchTerm }, qwSearch: { open: qwSearchOpen, query: qwSearchQuery, term: qwSearchTerm }, setHeaderBg, setHeaderMenu, setStorePremium, refreshCoin, refreshNoteUnread, refreshQuestBadge: refreshQuestClaimable, refreshStoreBadge: refreshStoreNew, player, bluray }} />
      </main>
      <MiniPlayer ref={playerRef} onState={setNowPlaying} />
      <BlurayPlayer ref={blurayRef} />
      {showBottomNav && (
        <nav className="bottomnav">
          <NavLink to="/" end><GroupsIcon /><span>그룹</span></NavLink>
          <NavLink to="/schedule"><CalendarIcon /><span>일정</span></NavLink>
          <NavLink to="/store"><span className="nav-ico-wrap"><StoreIcon />{storeNew && <span className="nav-dot" aria-label="신상 입고" />}</span><span>상점</span></NavLink>
          <NavLink to="/notes"><span className="nav-ico-wrap"><NoteIcon />{noteUnread > 0 && <span className="nav-dot" aria-label="안 읽은 쪽지" />}</span><span>쪽지</span></NavLink>
          <NavLink to="/me"><span className="nav-ico-wrap"><MyIcon />{questClaimable && <span className="nav-dot" aria-label="받을 수 있는 퀘스트" />}</span><span>마이</span></NavLink>
        </nav>
      )}
      {/* 페이지가 Portal 로 하단 고정 바(댓글 입력 등)를 넣는 슬롯 */}
      <div id="app-bottom" className="app-bottom" />
      {memberModal && (
        <Modal open onClose={() => setMemberModal(null)} cardClassName="member-modal">
          <MemberDetail embedded groupId={memberModal.groupId} userId={memberModal.userId} onClose={() => setMemberModal(null)} />
        </Modal>
      )}
      {acctOpen && (
        <Modal open onClose={() => setAcctOpen(false)} cardClassName="acct-modal">
          <AccountSwitcher onClose={() => setAcctOpen(false)} />
        </Modal>
      )}
      <ErrorReportModal open={errOpen} onClose={() => setErrOpen(false)} />
      <PushPrompt />
    </div>
  )
}
