import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  getGroup, listMemberCards, listTasks, listParticipantsByTasks,
  completeTask, reopenTask, deleteTask, cancelAppointment,
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
      const [g, m, t] = await Promise.all([getGroup(groupId), listMemberCards(groupId), listTasks(groupId)])
      setGroup(g); setMembers(m); setTasks(t)
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
        <span className="tabs-count">{visibleTasks.length}개</span>
      </div>

      {visibleTasks.length === 0 ? (
        <div className="empty"><p className="muted">{terms.noun}가 없습니다.</p></div>
      ) : (
        <ul className="task-list">
          {visibleTasks.map((t) => (
            <TaskItem key={t.id} task={t} meId={profile.id} isOwner={isOwner} terms={terms} nameOf={nameOf} avatarOf={(u) => nameMap[u]?.avatar}
              participants={partsByTask[t.id] || []}
              onOpen={() => navigate(`/groups/${groupId}/tasks/${t.id}`, { state: { groupType: group.group_type } })}
              onAccept={() => navigate(`/groups/${groupId}/tasks/${t.id}/schedule`)}
              onComplete={() => runAction(() => completeTask(t.id))}
              onReopen={() => runAction(() => reopenTask(t.id))}
              onEdit={() => navigate(`/groups/${groupId}/tasks/${t.id}/edit`, { state: { groupType: group.group_type, task: t } })}
              onEditAppointment={() => navigate(`/groups/${groupId}/tasks/${t.id}/schedule`)}
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

function TaskItem({ task, meId, isOwner, terms, nameOf, avatarOf, participants, onOpen, onAccept, onComplete, onReopen, onEdit, onEditAppointment, onCancelAppointment, onDelete }) {
  const mine = task.assignee_id === meId
  const canManage = task.created_by === meId || isOwner
  const [menuOpen, setMenuOpen] = useState(false)
  const stop = (e) => e.stopPropagation()

  // 약속/추억 카드: 참여자 프로필 + 약속 시간/반복/알림 표기
  const parts = participants || []
  const showParts = parts.length > 0
  const extra = parts.length - 3

  // 약속(일정이 잡힌) 카드는 상세와 동일한 메뉴(편집/약속취소/삭제)
  const isScheduled = !!task.scheduled_at
  const isCreator = task.created_by === meId
  const isParticipant = isCreator || parts.includes(meId)
  const showMenu = isScheduled ? isParticipant : canManage

  const mediaLine = mediaCardLine(task.category, task.media_info)

  return (
    <li className={`task-item status-${task.status}`} onClick={onOpen}>
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
          {showMenu && (
            <div className="task-menu-wrap" onClick={stop}>
              <button className="btn btn-ghost btn-sm icon-btn" aria-label="더보기" onClick={() => setMenuOpen((v) => !v)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" />
                </svg>
              </button>
              {menuOpen && (
                <>
                  <div className="menu-backdrop" onClick={() => setMenuOpen(false)} />
                  <div className="menu-pop" role="menu">
                    {isScheduled ? (
                      <>
                        <button type="button" onClick={() => { setMenuOpen(false); onEditAppointment() }}>편집</button>
                        <button type="button" onClick={() => { setMenuOpen(false); onCancelAppointment() }}>약속 취소</button>
                        {isCreator && <button type="button" className="menu-danger" onClick={() => { setMenuOpen(false); onDelete() }}>삭제</button>}
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => { setMenuOpen(false); onEdit() }}>편집</button>
                        <button type="button" className="menu-danger" onClick={() => { setMenuOpen(false); onDelete() }}>삭제</button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {task.scheduled_at && (
        <div className="task-appt">
          <span className="task-appt-when">🗓 {formatWhen(task.scheduled_at, task.scheduled_time_set)}</span>
          {task.repeat_rule && <span className="task-appt-rep">{repeatCycleText(task.repeat_rule, task.scheduled_at)}</span>}
          {task.remind_min !== null && task.remind_min !== undefined && (
            <span className="task-appt-bell" aria-label="알림 설정됨" title="알림 설정됨"><BellIcon /></span>
          )}
        </div>
      )}

      {task.description && <p className="task-desc">{task.description}</p>}
      {mediaLine && <p className="task-media-line">{mediaLine}</p>}

      <div className="task-foot">
        {task.assignee_id && !showParts && (
          <span className="task-person">
            <Avatar src={avatarOf(task.assignee_id)} name={nameOf(task.assignee_id)} size={18} />
            담당 {nameOf(task.assignee_id)}{mine ? ' (나)' : ''}
          </span>
        )}
        <div className="task-actions" onClick={stop}>
          {task.status === 'open' && <button className="btn btn-sm btn-primary" onClick={onAccept}>{terms.accept}</button>}
          {task.status === 'accepted' && mine && <button className="btn btn-sm btn-success" onClick={onComplete}>완료</button>}
          {task.status === 'accepted' && !mine && <span className="muted sm">진행 중</span>}
          {task.status === 'done' && <button className="btn btn-sm btn-ghost" onClick={onReopen}>다시 열기</button>}
        </div>
      </div>
    </li>
  )
}
