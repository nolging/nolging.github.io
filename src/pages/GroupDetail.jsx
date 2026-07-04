import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  getGroup, listMemberCards, listTasks,
  acceptTask, completeTask, reopenTask, deleteTask,
} from '../lib/api'
import { typeLabel, themeLabel, TASK_STATUS_LABEL } from '../lib/constants'
import Avatar from '../components/Avatar'
import BottomSheet from '../components/BottomSheet'

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

export default function GroupDetail() {
  const { groupId } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [group, setGroup] = useState(null)
  const [members, setMembers] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [filter, setFilter] = useState('all')
  const [inviteOpen, setInviteOpen] = useState(false)

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

  const visibleTasks = tasks.filter((t) => filter === 'all' || t.status === filter)

  return (
    <div className="page">
      <div className="gd-head">
        <div className="gd-title">
          <div className="group-card-badges">
            <span className={`badge type-${group.group_type}`}>{typeLabel(group.group_type)}</span>
            <span className="badge">{themeLabel(group.group_type, group.theme)}</span>
          </div>
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
        {['all', 'open', 'accepted', 'done'].map((f) => (
          <button key={f} className={`tab ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {f === 'all' ? '전체' : TASK_STATUS_LABEL[f]}
            <span className="tab-count">{f === 'all' ? tasks.length : tasks.filter((t) => t.status === f).length}</span>
          </button>
        ))}
      </div>

      {visibleTasks.length === 0 ? (
        <div className="empty"><p className="muted">태스크가 없습니다.</p></div>
      ) : (
        <ul className="task-list">
          {visibleTasks.map((t) => (
            <TaskItem key={t.id} task={t} meId={profile.id} isOwner={isOwner} nameOf={nameOf} avatarOf={(u) => nameMap[u]?.avatar}
              onAccept={() => runAction(() => acceptTask(t.id, profile.id))}
              onComplete={() => runAction(() => completeTask(t.id))}
              onReopen={() => runAction(() => reopenTask(t.id))}
              onDelete={() => runAction(() => deleteTask(t.id))} />
          ))}
        </ul>
      )}

      {/* 태스크 작성 버튼 (고정) */}
      <button className="fab" aria-label="태스크 작성" title="태스크 작성"
        onClick={() => navigate(`/groups/${groupId}/tasks/new`)}>+</button>

      {/* 초대 시트 */}
      <BottomSheet open={inviteOpen} onClose={() => setInviteOpen(false)}>
        <h3 className="sheet-title">함께할 멤버를 초대해 보세요.</h3>
        <div className="invite-box">
          <code className="mono">{group.invite_code}</code>
          <button className="btn btn-sm" onClick={copyCode}>{copied ? '복사됨!' : '복사'}</button>
        </div>
      </BottomSheet>
    </div>
  )
}

function TaskItem({ task, meId, isOwner, nameOf, avatarOf, onAccept, onComplete, onReopen, onDelete }) {
  const mine = task.assignee_id === meId
  const canDelete = task.created_by === meId || isOwner
  return (
    <li className={`task-item status-${task.status}`}>
      <div className="task-main">
        <div className="task-title">
          <span className={`status-dot ${task.status}`} />
          {task.title}
        </div>
        {task.description && <p className="task-desc">{task.description}</p>}
        <div className="task-meta">
          <span className="task-person"><Avatar src={avatarOf(task.created_by)} name={nameOf(task.created_by)} size={18} />작성 {nameOf(task.created_by)}</span>
          {task.assignee_id && (
            <span className="task-person">· <Avatar src={avatarOf(task.assignee_id)} name={nameOf(task.assignee_id)} size={18} />담당 {nameOf(task.assignee_id)}{mine ? ' (나)' : ''}</span>
          )}
          <span className={`badge badge-${task.status}`}>{TASK_STATUS_LABEL[task.status]}</span>
        </div>
      </div>
      <div className="task-actions">
        {task.status === 'open' && <button className="btn btn-sm btn-primary" onClick={onAccept}>수락</button>}
        {task.status === 'accepted' && mine && <button className="btn btn-sm btn-success" onClick={onComplete}>완료</button>}
        {task.status === 'accepted' && !mine && <span className="muted sm">진행 중</span>}
        {task.status === 'done' && <button className="btn btn-sm btn-ghost" onClick={onReopen}>다시 열기</button>}
        {canDelete && <button className="btn btn-sm btn-icon" title="삭제" onClick={onDelete}>✕</button>}
      </div>
    </li>
  )
}
