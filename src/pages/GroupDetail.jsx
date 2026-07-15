import { useEffect, useLayoutEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useParams, useNavigate, useSearchParams, useOutletContext, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  getGroup, listMemberCards, listTasks, listParticipantsByTasks, listCommentCounts,
  completeTask, deleteTask, cancelAppointment, revertToAppointment, listReviewCounts, isCoupleGroup,
  regenerateInviteCode, isFriendGroup, getGroupDecoMap,
} from '../lib/api'
import {
  taskTerms, TASK_STATUSES, WISH_CATEGORIES, formatWhen, repeatCycleText, categoryStyle, mediaCardLine,
} from '../lib/constants'
import Avatar from '../components/Avatar'
import MemberAvatarBtn from '../components/MemberAvatarBtn'
import MemberStack from '../components/MemberStack'
import GroupBadge from '../components/GroupBadge'
import ThemeHearts from '../components/ThemeHearts'
import CategoryChip from '../components/CategoryChip'
import CalendarIcon from '../components/CalendarIcon'
import BottomSheet from '../components/BottomSheet'

const PANE_GAP = 24 // 스와이프 시 넘어오는 탭 화면 사이의 간격(거터)

const BellIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
)

// 스와이프 액션 아이콘
const EditIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
)
const TrashIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
  </svg>
)
const CalendarXIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" />
    <line x1="8" y1="2" x2="8" y2="6" /><line x1="16" y1="2" x2="16" y2="6" />
    <line x1="9.5" y1="14" x2="14.5" y2="19" /><line x1="14.5" y1="14" x2="9.5" y2="19" />
  </svg>
)
// 되돌리기(추억→약속): 반시계 방향 되돌림 화살표
const UndoIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 8h11a6 6 0 0 1 0 12H8" />
    <polyline points="7 4 3 8 7 12" />
  </svg>
)

export default function GroupDetail() {
  const { groupId } = useParams()
  const { profile, isAdmin } = useAuth()
  const navigate = useNavigate()
  const { setHeaderFilter, setHeaderInvite, setRefreshHandler } = useOutletContext()

  const [searchParams] = useSearchParams()
  const initialTab = TASK_STATUSES.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'open'

  const [group, setGroup] = useState(null)
  const [members, setMembers] = useState([])
  const [isCouple, setIsCouple] = useState(false) // 커플 그룹(적용된 커플 링)
  const [isFriend, setIsFriend] = useState(false) // 우정 그룹(적용된 우정 링)
  const [tasks, setTasks] = useState([])
  const [partsByTask, setPartsByTask] = useState({})
  const [decoMap, setDecoMap] = useState({})
  const [commentCounts, setCommentCounts] = useState({})
  const [reviewCounts, setReviewCounts] = useState({}) // 추억별 리뷰 개수 { task_id: cnt }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [filter, setFilter] = useState(initialTab)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [regenBusy, setRegenBusy] = useState(false)
  const [catFilter, setCatFilter] = useState(() => [...WISH_CATEGORIES]) // 선택된 위시 유형. 기본=전체 체크
  const [filterOpen, setFilterOpen] = useState(false)
  const catActive = catFilter.length < WISH_CATEGORIES.length // 전체 미선택=필터 적용 중

  // 유형 필터를 상단바(톱니 좌측)로 노출
  useEffect(() => {
    setHeaderFilter?.({ onClick: () => setFilterOpen(true), active: catActive })
    return () => setHeaderFilter?.(null)
  }, [setHeaderFilter, catActive])

  // 초대 버튼을 상단바(필터와 톱니 사이)로 노출. 로딩 중/커플 그룹은 등록하지 않음(깜빡임 방지).
  useEffect(() => {
    if (loading || isCouple) { setHeaderInvite?.(null); return }
    setHeaderInvite?.({ onClick: () => setInviteOpen(true) })
    return () => setHeaderInvite?.(null)
  }, [setHeaderInvite, isCouple, loading])

  function toggleCat(c) {
    setCatFilter((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))
  }

  // 탭 전환(슬라이드 방향 포함). next=왼쪽으로(다음 탭), prev=오른쪽으로(이전 탭)
  const paneRef = useRef(null)
  const tabsRef = useRef(null)
  const [slideDir, setSlideDir] = useState('next')
  const [paneAnim, setPaneAnim] = useState(true) // 버튼 클릭 전환은 진입 애니메이션, 스와이프는 끔
  function scrollPaneTop() { paneRef.current?.scrollTo({ top: 0 }) }
  function changeTab(next, { anim = true } = {}) {
    if (next === filter) return
    setSlideDir(TASK_STATUSES.indexOf(next) > TASK_STATUSES.indexOf(filter) ? 'next' : 'prev')
    setPaneAnim(anim)
    setFilter(next)
    scrollPaneTop()
  }

  // 좌우 스와이프: 현재 pane 과 넘어오는 탭 pane 이 손가락을 따라 함께 이동
  const swipeRef = useRef(null)   // { x0, y0, locked, paneW }
  const boxRef = useRef(null)     // 넘어오는 pane 을 뷰포트에 고정 배치하기 위한 위치
  const settleRef = useRef(null)  // 정착(스냅) 애니메이션 정리 타이머
  const [gesture, setGesture] = useState(null) // { x, targetIdx|null, settling }
  const [tabGeo, setTabGeo] = useState([]) // 각 탭 버튼의 {left,width}
  const [paneW, setPaneW] = useState(0)

  const neighborOf = (idx, x) => {
    const last = TASK_STATUSES.length - 1
    if (x < 0) return idx < last ? idx + 1 : null
    if (x > 0) return idx > 0 ? idx - 1 : null
    return null
  }

  function onTabTouchStart(e) {
    if (settleRef.current) { clearTimeout(settleRef.current); settleRef.current = null }
    if (e.touches.length !== 1) { swipeRef.current = null; return }
    const skip = !!e.target.closest?.('.task-swipe, .fab, .sheet-root, .tabs-filter-btn')
    if (skip) { swipeRef.current = null; return }
    swipeRef.current = {
      x0: e.touches[0].clientX, y0: e.touches[0].clientY, locked: null,
      paneW: paneRef.current?.offsetWidth || window.innerWidth,
    }
  }
  function onTabTouchMove(e) {
    const s = swipeRef.current
    if (!s || e.touches.length !== 1) return
    const dx = e.touches[0].clientX - s.x0
    const dy = e.touches[0].clientY - s.y0
    if (s.locked === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      s.locked = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'h' : 'v'
      if (s.locked === 'v') { swipeRef.current = null; return } // 세로 스크롤에 양보
      // 넘어오는 pane 을 뷰포트에 고정 배치하기 위해 현재 pane·콘텐츠 위치 캡처
      const r = paneRef.current?.getBoundingClientRect()
      const cr = paneRef.current?.closest('.content')?.getBoundingClientRect()
      boxRef.current = r ? { top: r.top, left: r.left, width: r.width, contentTop: cr?.top ?? 0 } : null
    }
    if (s.locked !== 'h') return
    const idx = TASK_STATUSES.indexOf(filter)
    let x = dx
    const targetIdx = neighborOf(idx, x)
    if (targetIdx === null) x *= 0.35 // 가장자리 저항
    setGesture({ x, targetIdx, settling: false })
  }
  function onTabTouchEnd(e) {
    const s = swipeRef.current; swipeRef.current = null
    if (!s || s.locked !== 'h') { if (gesture) setGesture(null); return }
    const dx = e.changedTouches[0].clientX - s.x0
    const idx = TASK_STATUSES.indexOf(filter)
    const targetIdx = neighborOf(idx, dx)
    const threshold = Math.min(80, s.paneW * 0.22)
    if (Math.abs(dx) >= threshold && targetIdx !== null) {
      // 현재 pane 은 밖으로, 넘어온 pane 은 완전히 안으로 정착시킨 뒤 탭 전환
      setGesture({ x: (dx < 0 ? -1 : 1) * (s.paneW + PANE_GAP), targetIdx, settling: true })
      settleRef.current = setTimeout(() => {
        settleRef.current = null
        changeTab(TASK_STATUSES[targetIdx], { anim: false })
        setGesture(null)
      }, 235)
    } else {
      // 원위치 스냅백 (넘어온 pane 도 함께 되돌아감)
      setGesture((g) => (g ? { ...g, x: 0, settling: true } : null))
      settleRef.current = setTimeout(() => { settleRef.current = null; setGesture(null) }, 235)
    }
  }
  useEffect(() => () => { if (settleRef.current) clearTimeout(settleRef.current) }, [])

  // 탭 버튼/‌pane 폭 측정 (밑줄 위치·드래그 비율 계산용).
  // ResizeObserver 로 탭이 실제 폭을 갖는 순간에도 다시 측정 → 첫 진입 시 밑줄이
  // 폭 0(측정 시점이 일러 안 보임) 으로 남는 문제 방지.
  useLayoutEffect(() => {
    const tabsEl = tabsRef.current
    if (!tabsEl) return
    const measure = () => {
      const btns = [...tabsEl.querySelectorAll('.tab')]
      setTabGeo(btns.map((b) => ({ left: b.offsetLeft, width: b.offsetWidth })))
      setPaneW(paneRef.current?.offsetWidth || 0)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(tabsEl)
    return () => ro.disconnect()
    // loading 포함: 로딩 종료(스피너→탭 렌더)는 group 변경과 다른 렌더에서 일어나므로
    // loading 이 빠지면 탭이 처음 붙는 순간 측정이 안 돼 밑줄이 안 보임
  }, [group, filter, loading])

  const isOwner = group && group.owner_id === profile?.id

  // userId -> {name, avatar} (그룹 내 표시 이름)
  const nameMap = useMemo(() => {
    const map = {}
    members.forEach((m) => { map[m.user_id] = { name: m.display_nickname, avatar: m.avatar_url } })
    return map
  }, [members])
  const nameOf = (uid) => nameMap[uid]?.name || '알 수 없음'
  const decoOf = (uid) => decoMap[uid]

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      // 커플 여부까지 함께 확정해 첫 렌더부터 헤더/상단바가 올바르게 나오도록(깜빡임 방지)
      const [g, m, t, cc, couple, friend] = await Promise.all([
        getGroup(groupId), listMemberCards(groupId), listTasks(groupId), listCommentCounts(groupId),
        isCoupleGroup(groupId).catch(() => false),
        isFriendGroup(groupId).catch(() => false),
      ])
      setGroup(g); setMembers(m); setTasks(t); setCommentCounts(cc); setIsCouple(couple); setIsFriend(friend)
      // 참여자는 약속(accepted)·추억(done) 모두 로드 (날짜 없는 추억도 포함)
      const partIds = t.filter((x) => x.status !== 'open').map((x) => x.id)
      setPartsByTask(await listParticipantsByTasks(partIds))
      getGroupDecoMap(groupId).then(setDecoMap).catch(() => {})
      listReviewCounts(groupId).then(setReviewCounts).catch(() => {})
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [groupId])

  useEffect(() => { load() }, [load])

  // 당겨서 새로고침: 전체 스피너 없이 데이터만 다시 불러옴
  const refresh = useCallback(async () => {
    try {
      const [g, m, t, cc] = await Promise.all([
        getGroup(groupId), listMemberCards(groupId), listTasks(groupId), listCommentCounts(groupId),
      ])
      setGroup(g); setMembers(m); setTasks(t); setCommentCounts(cc)
      // 참여자는 약속(accepted)·추억(done) 모두 로드 (날짜 없는 추억도 포함)
      const partIds = t.filter((x) => x.status !== 'open').map((x) => x.id)
      setPartsByTask(await listParticipantsByTasks(partIds))
      getGroupDecoMap(groupId).then(setDecoMap).catch(() => {})
      listReviewCounts(groupId).then(setReviewCounts).catch(() => {})
      isCoupleGroup(groupId).then(setIsCouple).catch(() => {})
    } catch (err) { setError(err.message) }
  }, [groupId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setRefreshHandler(() => refresh)
    return () => setRefreshHandler(() => null)
  }, [setRefreshHandler, refresh])

  // 하트 뿅뿅 테마: 상단바~콘텐츠 배경을 은은한 분홍빛으로 (페이지 벗어나면 원복)
  useEffect(() => {
    const themed = group?.deco_theme === 'heart'
    document.querySelector('.app-shell')?.classList.toggle('gd-bg-heart', themed)
    return () => document.querySelector('.app-shell')?.classList.remove('gd-bg-heart')
  }, [group?.deco_theme])

  async function runAction(fn) {
    setError('')
    try { await fn(); await load() } catch (err) { setError(err.message) }
  }

  function copyCode() {
    try { navigator.clipboard?.writeText(group.invite_code) } catch { /* noop */ }
    setCopied(true); setTimeout(() => setCopied(false), 1600)
  }
  async function shareCode() {
    if (!group?.invite_code) return
    const text = `${group.name} 그룹 초대 코드: ${group.invite_code}`
    try {
      if (navigator.share) { await navigator.share({ title: '그룹 초대', text }); return }
    } catch { return /* 사용자가 취소 */ }
    copyCode()
  }
  async function regenCode() {
    if (regenBusy) return
    if (!confirm('새 코드를 만들면 기존 코드는 더 이상 사용할 수 없어요. 계속할까요?')) return
    setRegenBusy(true); setError('')
    try {
      const next = await regenerateInviteCode(groupId)
      setGroup((g) => ({ ...g, invite_code: next })); setCopied(false)
    } catch (err) { setError(err.message) } finally { setRegenBusy(false) }
  }

  if (loading) return <div className="page"><div className="spinner" /></div>
  if (error && !group) {
    return (
      <div className="page">
        <div className="alert alert-error">{error}</div>
        <Link to="/" className="btn btn-ghost">← 내 그룹</Link>
      </div>
    )
  }

  const terms = taskTerms()
  const matchesCat = (t) => !WISH_CATEGORIES.includes(t.category) || catFilter.includes(t.category)
  const visibleTasks = tasks.filter((t) => t.status === filter && matchesCat(t))

  // 특정 상태(탭)의 카드 목록 렌더 (현재 pane 과 넘어오는 ghost pane 이 공용)
  function renderTaskList(status) {
    const list = tasks.filter((t) => t.status === status && matchesCat(t))
    if (list.length === 0) return <div className="empty"><p className="muted">{terms.noun}가 없습니다.</p></div>
    return (
      <ul className="task-list">
        {list.map((t) => (
          <TaskItem key={t.id} task={t} meId={profile.id} isOwner={isOwner} isAdmin={isAdmin} terms={terms} nameOf={nameOf} avatarOf={(u) => nameMap[u]?.avatar} decoOf={decoOf}
            participants={partsByTask[t.id] || []} commentCount={commentCounts[t.id] || 0}
            reviewCount={reviewCounts[t.id] || 0} hasReviews={(reviewCounts[t.id] || 0) > 0}
            onOpen={() => navigate(`/groups/${groupId}/tasks/${t.id}`, { state: { groupType: group.group_type } })}
            onAccept={() => navigate(`/groups/${groupId}/tasks/${t.id}/schedule`, { state: { from: 'group', tab: t.status, groupType: group.group_type } })}
            onComplete={() => { if (confirm('완료하시겠습니까?')) runAction(() => completeTask(t.id)) }}
            onReview={() => navigate(`/groups/${groupId}/tasks/${t.id}`, { state: { groupType: group.group_type, openReview: true } })}
            onEdit={() => navigate(`/groups/${groupId}/tasks/${t.id}/edit`, { state: { groupType: group.group_type, task: t, from: 'group', tab: t.status } })}
            onEditAppointment={() => navigate(`/groups/${groupId}/tasks/${t.id}/schedule`, { state: { from: 'group', tab: t.status, groupType: group.group_type } })}
            onCancelAppointment={() => { if (confirm('약속을 취소하고 위시로 되돌릴까요?')) runAction(() => cancelAppointment(t.id)) }}
            onRevertAppointment={() => { if (confirm('이 추억을 약속으로 되돌릴까요?')) runAction(() => revertToAppointment(t.id)) }}
            onDelete={() => { if (confirm('삭제하시겠습니까?')) runAction(() => deleteTask(t.id)) }} />
        ))}
      </ul>
    )
  }

  const gx = gesture?.x || 0
  const gActive = !!gesture && !gesture.settling // 드래그 중=트랜지션 off, 놓은 후=on
  const activeIdx = TASK_STATUSES.indexOf(filter)

  // 탭 글씨 강조도(0~1): 스와이프 진행에 따라 현재 탭↔목표 탭 사이를 보간
  // → 색이 손가락을 따라 부드럽게 진해지고, 굵기는 절반 지점에서 전환
  const tabActiveness = (i) => {
    const p = paneW ? Math.max(-1, Math.min(1, gx / paneW)) : 0
    if (i === activeIdx) return 1 - Math.abs(p)
    if (p < 0 && i === activeIdx + 1) return -p
    if (p > 0 && i === activeIdx - 1) return p
    return 0
  }

  // 현재 pane: 손가락 따라 이동, 놓으면 트랜지션으로 정착
  const paneStyle = {
    transform: gx ? `translateX(${gx}px)` : undefined,
    transition: gActive ? 'none' : 'transform .21s ease',
  }
  // 넘어오는(ghost) pane: 뷰포트 고정 배치 + 현재 pane 과 paneW 만큼 떨어져 함께 이동
  const box = boxRef.current
  const ghostStatus = gesture && gesture.targetIdx != null ? TASK_STATUSES[gesture.targetIdx] : null
  let ghostTop = 0, ghostStyle = null
  if (ghostStatus && box) {
    ghostTop = Math.max(box.top, box.contentTop) // 스크롤로 탭이 가려져도 보이는 영역 상단에 정렬
    const off = (gesture.targetIdx > activeIdx ? paneW + PANE_GAP : -(paneW + PANE_GAP)) + gx
    ghostStyle = {
      position: 'absolute', top: 0, left: box.left, width: box.width, animation: 'none',
      transform: `translateX(${off}px)`, transition: gActive ? 'none' : 'transform .21s ease',
    }
  }
  // 밑줄: 현재 탭 → 인접 탭으로 드래그 비율만큼 선형 보간해 이동
  const cur = tabGeo[activeIdx]
  let uLeft = cur?.left ?? 0, uWidth = cur?.width ?? 0
  if (cur && paneW) {
    if (gx < 0 && activeIdx < TASK_STATUSES.length - 1) {
      const nb = tabGeo[activeIdx + 1], t = Math.min(1, -gx / paneW)
      uLeft = cur.left + (nb.left - cur.left) * t; uWidth = cur.width + (nb.width - cur.width) * t
    } else if (gx > 0 && activeIdx > 0) {
      const nb = tabGeo[activeIdx - 1], t = Math.min(1, gx / paneW)
      uLeft = cur.left + (nb.left - cur.left) * t; uWidth = cur.width + (nb.width - cur.width) * t
    }
  }
  const underlineStyle = cur && cur.width
    ? { transform: `translateX(${uLeft}px)`, width: `${uWidth}px`,
        transition: gActive ? 'none' : 'transform .21s ease, width .21s ease' }
    : { opacity: 0 }

  return (
    <div className={`page gd-page ${group.deco_theme === 'heart' ? 'gd-themed' : ''}`}
      onTouchStart={onTabTouchStart} onTouchMove={onTabTouchMove} onTouchEnd={onTabTouchEnd}>
      {group.deco_theme === 'heart' && <ThemeHearts durScale={2.8} className="gd-hearts-over" />}
      <div className="gd-sticky-head">
      <div className="gd-head">
        <div className="gd-title gd-title-row">
          <GroupBadge emoji={group.emoji} bg={group.emoji_bg} name={group.name} size={56} radius={20} />
          <div className="gd-title-text">
            <h1>{group.name}</h1>
            {group.description && <p className="muted">{group.description}</p>}
          </div>
        </div>
        <div className="gd-head-actions">
          {members.length > 0 && (
            isCouple ? (
              <button type="button" className="gd-members gd-members-couple"
                aria-label="멤버 목록" title="멤버 목록" onClick={() => navigate(`/groups/${groupId}/members`)}>
                {members.slice(0, 2).map((m) => (
                  <Avatar key={m.user_id} src={m.avatar_url} name={m.display_nickname} size={30} deco={decoOf(m.user_id)} />
                ))}
                <span className="gd-couple-heart" aria-hidden="true">♥</span>
              </button>
            ) : (
              <button type="button" className={`gd-members task-parts tile-members ${members.length > 1 ? 'multi' : ''}`}
                aria-label="멤버 목록" title="멤버 목록" onClick={() => navigate(`/groups/${groupId}/members`)}>
                {members.slice(0, 3).map((m) => (
                  <Avatar key={m.user_id} src={m.avatar_url} name={m.display_nickname} size={28} deco={decoOf(m.user_id)} />
                ))}
                {members.length - 3 > 0 && <span className="task-parts-more">+{members.length - 3}</span>}
              </button>
            )
          )}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="tabs" ref={tabsRef}>
        {TASK_STATUSES.map((f, i) => {
          const a = tabActiveness(i)
          return (
            <button key={f} className={`tab ${filter === f ? 'active' : ''}`}
              style={{
                color: `color-mix(in srgb, var(--muted), var(--text) ${Math.round(a * 100)}%)`,
                fontWeight: a > 0.5 ? 700 : 600,
                transition: gActive ? 'none' : 'color .2s ease',
              }}
              onClick={() => changeTab(f)}>
              {terms.status[f]}
            </button>
          )
        })}
        <span className="tab-underline" style={underlineStyle} />
      </div>
      </div>

      <div className="tab-pane" key={filter} data-dir={slideDir} data-anim={paneAnim ? 'y' : 'n'} ref={paneRef} style={paneStyle}>
        {renderTaskList(filter)}
      </div>

      {/* 넘어오는 탭 pane: 스와이프 중 옆에서 함께 밀려 들어옴 (뷰포트 고정, 입력 차단) */}
      {ghostStatus && box && (
        <div className="tab-ghost-clip" style={{ position: 'fixed', top: ghostTop, left: 0, right: 0, bottom: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 20 }}>
          <div className="tab-pane tab-ghost" style={ghostStyle}>
            {renderTaskList(ghostStatus)}
          </div>
        </div>
      )}

      {/* 태스크 작성 버튼 (고정) */}
      <button className="fab" aria-label={`${terms.noun} 작성`} title={`${terms.noun} 작성`}
        onClick={() => navigate(`/groups/${groupId}/tasks/new`, { state: { groupType: group.group_type } })}>+</button>

      {/* 초대 시트 (시안 12e) */}
      <BottomSheet open={inviteOpen} onClose={() => setInviteOpen(false)}>
        <div className="iv-head">
          <span className="iv-ico" aria-hidden="true">
            <svg width="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" /></svg>
          </span>
          <div className="iv-htext">
            <div className="iv-tt">멤버 초대</div>
            <div className="iv-sub">함께할 멤버를 초대해 보세요</div>
          </div>
          <button type="button" className="iv-x" onClick={() => setInviteOpen(false)} aria-label="닫기" title="닫기">
            <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div className="iv-codecard">
          <div className="iv-codelabel">초대 코드</div>
          <div className="iv-codeval">{group.invite_code}</div>
          <button type="button" className={`iv-copy ${copied ? 'copied' : ''}`} onClick={copyCode}>
            {copied ? (
              <><svg width="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>복사됨</>
            ) : (
              <><svg width="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>코드 복사</>
            )}
          </button>
        </div>

        <button type="button" className="iv-share" onClick={shareCode}>
          <svg width="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.6" y1="13.5" x2="15.4" y2="17.5" /><line x1="15.4" y1="6.5" x2="8.6" y2="10.5" /></svg>
          공유하기
        </button>
        <button type="button" className="iv-regen" onClick={regenCode} disabled={regenBusy}>
          {regenBusy ? <span className="iv-regen-spin" aria-hidden="true" /> : (
            <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36" /><polyline points="21 3 21 9 15 9" /></svg>
          )}
          {regenBusy ? '만드는 중…' : '새 코드 만들기'}
        </button>
      </BottomSheet>

      {/* 필터 설정 시트 (중복 선택, 즉시 적용). 기본=전체 체크 */}
      <BottomSheet open={filterOpen} onClose={() => setFilterOpen(false)}>
        <div className="filter-head">
          <h3 className="sheet-title filter-title">필터 설정</h3>
          <button type="button" className="btn btn-ghost btn-sm"
            onClick={() => setCatFilter(catActive ? [...WISH_CATEGORIES] : [])}>전체</button>
        </div>
        <div className="chip-row filter-chips">
          {WISH_CATEGORIES.map((c) => {
            const on = catFilter.includes(c)
            return (
              <button key={c} type="button" className={`chip ${on ? 'active' : ''}`}
                style={on ? categoryStyle(c) : undefined} onClick={() => toggleCat(c)}>{c}</button>
            )
          })}
        </div>
      </BottomSheet>
    </div>
  )
}

function TaskItem({ task, meId, isOwner, isAdmin, terms, nameOf, avatarOf, decoOf, participants, commentCount = 0, reviewCount = 0, hasReviews = false, onOpen, onAccept, onComplete, onReview, onEdit, onEditAppointment, onCancelAppointment, onRevertAppointment, onDelete }) {
  const { groupId } = useParams()
  const mine = task.assignee_id === meId
  const canManage = task.created_by === meId || isOwner || isAdmin
  const stop = (e) => e.stopPropagation()

  // 약속/추억 카드: 참여자 프로필 + 약속 시간/반복/알림 표기
  const parts = participants || []
  const showParts = parts.length > 0
  const extra = parts.length - 3

  // 약속·추억 카드는 상세와 동일한 동작(수정/약속취소/삭제). 날짜 유무가 아니라 상태로 판단.
  const isScheduled = task.status !== 'open'
  const isCreator = task.created_by === meId
  const isParticipant = isCreator || parts.includes(meId)
  const canAct = isScheduled ? (isParticipant || isAdmin) : canManage

  const mediaLine = mediaCardLine(task.category, task.media_info)
  // 약속/추억(scheduled) 카드는 댓글 수를 약속 정보(🗓) 라인에, 그 외(open)는 foot 에
  const ccOnAppt = !!task.scheduled_at
  const showFoot = mediaLine || !ccOnAppt

  // 스와이프 시 오른쪽에 뜨는 원형 액션들 (기존 ⋮ 메뉴 대체)
  const actions = []
  if (canAct) {
    if (isScheduled) {
      // 약속(accepted): 수정/약속취소/삭제
      // 추억(done): 수정 / (리뷰 없을 때만)약속으로 되돌리기 / 삭제
      actions.push({ key: 'edit', label: '수정', icon: <EditIcon />, onClick: onEditAppointment })
      if (task.status !== 'done') {
        actions.push({ key: 'cancel', label: '약속 취소', icon: <CalendarXIcon />, onClick: onCancelAppointment })
      } else if (!hasReviews) {
        actions.push({ key: 'revert', label: '약속으로 되돌리기', icon: <UndoIcon />, onClick: onRevertAppointment })
      }
      if (isCreator || isAdmin) actions.push({ key: 'del', label: '삭제', icon: <TrashIcon />, danger: true, onClick: onDelete })
    } else {
      actions.push({ key: 'edit', label: '수정', icon: <EditIcon />, onClick: onEdit })
      actions.push({ key: 'del', label: '삭제', icon: <TrashIcon />, danger: true, onClick: onDelete })
    }
  }
  // 카드가 밀리는 거리 = 좌측 여백(8) + 버튼들(40) + 버튼 간격(8). 우측 여백 0(삭제 우측 끝=카드 우측 끝).
  const openW = actions.length ? actions.length * 40 + (actions.length - 1) * 8 + 8 : 0
  // 오른쪽 스와이프 시 좌측에 뜨는 원형 버튼 (상태별). open→놀기신청, accepted(내 것)→완료, done→리뷰 작성(준비 중)
  let leftAction = null
  if (task.status === 'open') leftAction = { lines: terms.accept.split(' '), onClick: onAccept }
  else if (task.status === 'accepted' && mine) leftAction = { lines: ['완료'], onClick: onComplete }
  else if (task.status === 'done') leftAction = { lines: ['리뷰', '작성'], onClick: onReview }
  const openL = leftAction ? 48 + 8 : 0

  // 스와이프로 액션 노출. touch-action: pan-y 라 세로 스크롤은 그대로 동작.
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const drag = useRef(null)
  const movedRef = useRef(false)
  const rootRef = useRef(null)

  // 스와이프로 열린 상태에서 카드 바깥을 누르면 원위치로 닫기
  const isOpen = dx !== 0
  useEffect(() => {
    if (!isOpen) return
    const onDocDown = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setDx(0) }
    document.addEventListener('pointerdown', onDocDown)
    return () => document.removeEventListener('pointerdown', onDocDown)
  }, [isOpen])

  function onPointerDown(e) {
    if ((!actions.length && !leftAction) || (e.pointerType === 'mouse' && e.button !== 0)) return
    movedRef.current = false // 새 제스처 시작마다 초기화(스와이프 후 click 미발생 기기 대비)
    drag.current = { x0: e.clientX, y0: e.clientY, base: dx, decided: false, horiz: false }
  }
  function onPointerMove(e) {
    const d = drag.current
    if (!d) return
    const mx = e.clientX - d.x0
    const my = e.clientY - d.y0
    if (!d.decided) {
      if (Math.abs(mx) < 6 && Math.abs(my) < 6) return
      d.decided = true
      d.horiz = Math.abs(mx) > Math.abs(my)
      if (d.horiz) { setDragging(true); e.currentTarget.setPointerCapture?.(e.pointerId) }
    }
    if (!d.horiz) return
    movedRef.current = true
    setDx(Math.max(-openW, Math.min(openL, d.base + mx)))
  }
  function onPointerUp() {
    const d = drag.current
    drag.current = null
    setDragging(false)
    if (d?.horiz) setDx((cur) => (cur > openL / 2 ? openL : cur < -openW / 2 ? -openW : 0))
  }
  function handleClick() {
    if (movedRef.current) { movedRef.current = false; return } // 스와이프였으면 이동 안 함
    if (dx !== 0) { setDx(0); return }                         // 열려 있으면 닫기
    onOpen()
  }

  return (
    <li ref={rootRef} className={`task-swipe ${dragging ? 'dragging' : ''}`}>
      {leftAction && (
        <div className="task-swipe-accept" aria-hidden={dx <= 0}>
          <button type="button" className="accept-btn" aria-label={leftAction.lines.join(' ')} title={leftAction.lines.join(' ')}
            tabIndex={dx <= 0 ? -1 : 0} onClick={(e) => { stop(e); setDx(0); leftAction.onClick() }}>
            {leftAction.lines.map((w, i) => <span key={i}>{w}</span>)}
          </button>
        </div>
      )}
      {actions.length > 0 && (
        <div className="task-swipe-actions" aria-hidden={dx === 0}>
          {actions.map((a) => (
            <button key={a.key} type="button" className={`swipe-btn ${a.danger ? 'danger' : ''}`}
              aria-label={a.label} title={a.label} tabIndex={dx === 0 ? -1 : 0}
              onClick={(e) => { stop(e); setDx(0); a.onClick() }}>{a.icon}</button>
          ))}
        </div>
      )}
      <div className={`task-item status-${task.status}`} style={{ transform: `translateX(${dx}px)` }}
        onClick={handleClick} onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        <div className="task-head">
          <div className="task-headline">
            <CategoryChip category={task.category} />
            <span className="task-name">{task.title}</span>
          </div>
          <div className="task-head-right">
            {showParts ? (
              <MemberStack groupId={groupId} userIds={parts} nameOf={nameOf} avatarOf={avatarOf} decoOf={decoOf} size={24} max={3} singleName />
            ) : (
              <span className="task-author">
                <MemberAvatarBtn groupId={groupId} userId={task.created_by} src={avatarOf(task.created_by)} name={nameOf(task.created_by)} size={22} deco={decoOf?.(task.created_by)} />
                <span className="task-author-name">{nameOf(task.created_by)}</span>
              </span>
            )}
          </div>
        </div>

        {showFoot && (
          <div className="task-foot">
            {task.description && <span className="task-cmt">{task.description}</span>}
            {mediaLine && <span className="task-media-line">{mediaLine}</span>}
            <div className="task-foot-right">
              {!ccOnAppt && <span className="task-cc">댓글 {commentCount}</span>}
              {!ccOnAppt && task.status === 'done' && <span className="task-cc">리뷰 {reviewCount}</span>}
            </div>
          </div>
        )}

        {/* 약속 시간: 상세 정보(foot) 아래. 댓글 수도 이 라인에 맞춤 */}
        {task.scheduled_at && (
          <div className="task-appt">
            <span className="task-appt-when"><CalendarIcon size={13} /> {formatWhen(task.scheduled_at, task.scheduled_time_set)}</span>
            {task.repeat_rule && <span className="task-appt-rep">{repeatCycleText(task.repeat_rule, task.scheduled_at)}</span>}
            {task.remind_min !== null && task.remind_min !== undefined && (
              <span className="task-appt-bell" aria-label="알림 설정됨" title="알림 설정됨"><BellIcon /></span>
            )}
            {task.description && <span className="task-cmt">{task.description}</span>}
            <span className="task-appt-counts">
              <span className="task-cc">댓글 {commentCount}</span>
              {task.status === 'done' && <span className="task-cc">리뷰 {reviewCount}</span>}
            </span>
          </div>
        )}
      </div>
    </li>
  )
}
