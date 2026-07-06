import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  getGroup, listMemberCards, listTasks, listParticipantsByTasks, listCommentCounts,
  completeTask, deleteTask, cancelAppointment,
} from '../lib/api'
import {
  taskTerms, TASK_STATUSES, WISH_CATEGORIES, formatWhen, repeatCycleText, categoryStyle, mediaCardLine,
} from '../lib/constants'
import Avatar from '../components/Avatar'
import BottomSheet from '../components/BottomSheet'

const BellIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
)

const MembersIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
)
const InviteIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 7L2 7" />
  </svg>
)
const FilterIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="4" y1="6" x2="20" y2="6" /><line x1="7" y1="12" x2="17" y2="12" /><line x1="10" y1="18" x2="14" y2="18" />
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

export default function GroupDetail() {
  const { groupId } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [searchParams] = useSearchParams()
  const initialTab = TASK_STATUSES.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'open'

  const [group, setGroup] = useState(null)
  const [members, setMembers] = useState([])
  const [tasks, setTasks] = useState([])
  const [partsByTask, setPartsByTask] = useState({})
  const [commentCounts, setCommentCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [filter, setFilter] = useState(initialTab)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [catFilter, setCatFilter] = useState([]) // 선택된 위시 유형(중복 가능). 빈 배열=전체
  const [filterOpen, setFilterOpen] = useState(false)

  function toggleCat(c) {
    setCatFilter((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))
  }

  const isOwner = group && group.owner_id === profile?.id

  // userId -> {name, avatar} (그룹 내 표시 이름)
  const nameMap = useMemo(() => {
    const map = {}
    members.forEach((m) => { map[m.user_id] = { name: m.display_nickname, avatar: m.avatar_url } })
    return map
  }, [members])
  const nameOf = (uid) => nameMap[uid]?.name || '알 수 없음'

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [g, m, t, cc] = await Promise.all([
        getGroup(groupId), listMemberCards(groupId), listTasks(groupId), listCommentCounts(groupId),
      ])
      setGroup(g); setMembers(m); setTasks(t); setCommentCounts(cc)
      const scheduledIds = t.filter((x) => x.scheduled_at).map((x) => x.id)
      setPartsByTask(await listParticipantsByTasks(scheduledIds))
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [groupId])

  useEffect(() => { load() }, [load])

  async function runAction(fn) {
    setError('')
    try { await fn(); await load() } catch (err) { setError(err.message) }
  }

  function copyCode() {
    navigator.clipboard?.writeText(group.invite_code)
    setCopied(true); setTimeout(() => setCopied(false), 1500)
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
  const matchesCat = (t) => catFilter.length === 0 || catFilter.includes(t.category)
  const visibleTasks = tasks.filter((t) => t.status === filter && matchesCat(t))

  return (
    <div className="page">
      <div className="gd-head">
        <div className="gd-title">
          <h1>{group.name}</h1>
          {group.description && <p className="muted">{group.description}</p>}
        </div>
        <div className="gd-actions">
          <button className="btn btn-ghost btn-sm icon-btn" aria-label="멤버" title="멤버"
            onClick={() => navigate(`/groups/${groupId}/members`)}><MembersIcon /></button>
          <button className="btn btn-ghost btn-sm icon-btn" aria-label="초대" title="초대"
            onClick={() => setInviteOpen(true)}><InviteIcon /></button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="tabs">
        {TASK_STATUSES.map((f) => (
          <button key={f} className={`tab ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {terms.status[f]}
          </button>
        ))}
      </div>

      <div className="tabs-toolbar">
        <button className="btn btn-ghost btn-sm icon-btn tabs-filter-btn" aria-label="유형 필터" title="유형 필터"
          onClick={() => setFilterOpen(true)}>
          <FilterIcon />
          {catFilter.length > 0 && <span className="filter-badge">{catFilter.length}</span>}
        </button>
        <span className="tabs-count">{visibleTasks.length} 개</span>
      </div>

      {visibleTasks.length === 0 ? (
        <div className="empty"><p className="muted">{terms.noun}가 없습니다.</p></div>
      ) : (
        <ul className="task-list">
          {visibleTasks.map((t) => (
            <TaskItem key={t.id} task={t} meId={profile.id} isOwner={isOwner} terms={terms} nameOf={nameOf} avatarOf={(u) => nameMap[u]?.avatar}
              participants={partsByTask[t.id] || []} commentCount={commentCounts[t.id] || 0}
              onOpen={() => navigate(`/groups/${groupId}/tasks/${t.id}`, { state: { groupType: group.group_type } })}
              onAccept={() => navigate(`/groups/${groupId}/tasks/${t.id}/schedule`, { state: { from: 'group', tab: t.status, groupType: group.group_type } })}
              onComplete={() => { if (confirm('완료하시겠습니까?')) runAction(() => completeTask(t.id)) }}
              onReview={() => {}}
              onEdit={() => navigate(`/groups/${groupId}/tasks/${t.id}/edit`, { state: { groupType: group.group_type, task: t } })}
              onEditAppointment={() => navigate(`/groups/${groupId}/tasks/${t.id}/schedule`, { state: { from: 'group', tab: t.status, groupType: group.group_type } })}
              onCancelAppointment={() => { if (confirm('약속을 취소하고 위시로 되돌릴까요?')) runAction(() => cancelAppointment(t.id)) }}
              onDelete={() => { if (confirm('삭제하시겠습니까?')) runAction(() => deleteTask(t.id)) }} />
          ))}
        </ul>
      )}

      {/* 태스크 작성 버튼 (고정) */}
      <button className="fab" aria-label={`${terms.noun} 작성`} title={`${terms.noun} 작성`}
        onClick={() => navigate(`/groups/${groupId}/tasks/new`, { state: { groupType: group.group_type } })}>+</button>

      {/* 초대 시트 */}
      <BottomSheet open={inviteOpen} onClose={() => setInviteOpen(false)}>
        <h3 className="sheet-title">함께할 멤버를 초대해 보세요.</h3>
        <div className="invite-box">
          <code className="mono">{group.invite_code}</code>
          <button className="btn btn-sm" onClick={copyCode}>{copied ? '복사됨!' : '복사'}</button>
        </div>
      </BottomSheet>

      {/* 유형 필터 시트 (중복 선택, 즉시 적용) */}
      <BottomSheet open={filterOpen} onClose={() => setFilterOpen(false)}>
        <div className="filter-head">
          <h3 className="sheet-title filter-title">위시 유형 필터</h3>
          <button type="button" className="btn btn-ghost btn-sm" disabled={catFilter.length === 0}
            onClick={() => setCatFilter([])}>초기화</button>
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

function TaskItem({ task, meId, isOwner, terms, nameOf, avatarOf, participants, commentCount = 0, onOpen, onAccept, onComplete, onReview, onEdit, onEditAppointment, onCancelAppointment, onDelete }) {
  const mine = task.assignee_id === meId
  const canManage = task.created_by === meId || isOwner
  const stop = (e) => e.stopPropagation()

  // 약속/추억 카드: 참여자 프로필 + 약속 시간/반복/알림 표기
  const parts = participants || []
  const showParts = parts.length > 0
  const extra = parts.length - 3

  // 약속(일정이 잡힌) 카드는 상세와 동일한 동작(수정/약속취소/삭제)
  const isScheduled = !!task.scheduled_at
  const isCreator = task.created_by === meId
  const isParticipant = isCreator || parts.includes(meId)
  const canAct = isScheduled ? isParticipant : canManage

  const mediaLine = mediaCardLine(task.category, task.media_info)
  // 약속/추억(scheduled) 카드는 댓글 수를 약속 정보(🗓) 라인에, 그 외(open)는 foot 에
  const ccOnAppt = !!task.scheduled_at
  const showProgress = task.status === 'accepted' && !mine
  const showFoot = mediaLine || (task.assignee_id && !showParts) || showProgress || !ccOnAppt

  // 스와이프 시 오른쪽에 뜨는 원형 액션들 (기존 ⋮ 메뉴 대체)
  const actions = []
  if (canAct) {
    if (isScheduled) {
      // 약속(accepted): 수정/약속취소/삭제, 추억(done): 수정/삭제 (약속취소 없음)
      actions.push({ key: 'edit', label: '수정', icon: <EditIcon />, onClick: onEditAppointment })
      if (task.status !== 'done') actions.push({ key: 'cancel', label: '약속 취소', icon: <CalendarXIcon />, onClick: onCancelAppointment })
      if (isCreator) actions.push({ key: 'del', label: '삭제', icon: <TrashIcon />, danger: true, onClick: onDelete })
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
            {task.category && <span className="cat-chip" style={categoryStyle(task.category)}>{task.category}</span>}
            <span className="task-name">{task.title}</span>
          </div>
          <div className="task-head-right">
            {showParts ? (
              <span className={`task-parts ${parts.length > 1 ? 'multi' : ''}`}>
                {parts.slice(0, 3).map((uid) => (
                  <Avatar key={uid} src={avatarOf(uid)} name={nameOf(uid)} size={24} />
                ))}
                {extra > 0 && <span className="task-parts-more">+{extra}</span>}
                {parts.length === 1 && <span className="task-author-name">{nameOf(parts[0])}</span>}
              </span>
            ) : (
              <span className="task-author">
                <Avatar src={avatarOf(task.created_by)} name={nameOf(task.created_by)} size={22} />
                <span className="task-author-name">{nameOf(task.created_by)}</span>
              </span>
            )}
          </div>
        </div>

        {task.description && <p className="task-desc">{task.description}</p>}

        {showFoot && (
          <div className="task-foot">
            {mediaLine && <span className="task-media-line">{mediaLine}</span>}
            {task.assignee_id && !showParts && (
              <span className="task-person">
                <Avatar src={avatarOf(task.assignee_id)} name={nameOf(task.assignee_id)} size={18} />
                담당 {nameOf(task.assignee_id)}{mine ? ' (나)' : ''}
              </span>
            )}
            <div className="task-foot-right">
              {showProgress && <span className="muted sm">진행 중</span>}
              {!ccOnAppt && <span className="task-cc">댓글 {commentCount}</span>}
            </div>
          </div>
        )}

        {/* 약속 시간: 상세 정보(foot) 아래. 댓글 수도 이 라인에 맞춤 */}
        {task.scheduled_at && (
          <div className="task-appt">
            <span className="task-appt-when">🗓 {formatWhen(task.scheduled_at, task.scheduled_time_set)}</span>
            {task.repeat_rule && <span className="task-appt-rep">{repeatCycleText(task.repeat_rule, task.scheduled_at)}</span>}
            {task.remind_min !== null && task.remind_min !== undefined && (
              <span className="task-appt-bell" aria-label="알림 설정됨" title="알림 설정됨"><BellIcon /></span>
            )}
            <span className="task-cc task-appt-cc">댓글 {commentCount}</span>
          </div>
        )}
      </div>
    </li>
  )
}
