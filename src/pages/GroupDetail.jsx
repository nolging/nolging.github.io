import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  getGroup, listMemberCards, listTasks, createTask,
  acceptTask, completeTask, reopenTask, deleteTask,
  leaveGroup, deleteGroup,
} from '../lib/api'
import { typeLabel, themeLabel, TASK_STATUS_LABEL } from '../lib/constants'
import Avatar from '../components/Avatar'
import GroupSettings from '../components/GroupSettings'
import MySettings from '../components/MySettings'

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
  const [panel, setPanel] = useState(null) // 'group' | 'me' | null

  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState('all')

  const isOwner = group && group.owner_id === profile?.id
  const me = useMemo(() => members.find((m) => m.user_id === profile?.id), [members, profile])

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

  async function handleCreateTask(e) {
    e.preventDefault()
    if (!title.trim()) return
    setBusy(true)
    try {
      await createTask({ groupId, title: title.trim(), description: desc.trim(), createdBy: profile.id })
      setTitle(''); setDesc(''); await load()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  async function runAction(fn) {
    setError('')
    try { await fn(); await load() } catch (err) { setError(err.message) }
  }

  function copyCode() {
    navigator.clipboard?.writeText(group.invite_code)
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }

  async function handleLeave() {
    if (!confirm('이 그룹에서 나가시겠습니까?')) return
    await runAction(() => leaveGroup(groupId, profile.id)); navigate('/')
  }
  async function handleDeleteGroup() {
    if (!confirm('그룹을 삭제하면 모든 태스크가 사라집니다. 삭제할까요?')) return
    await runAction(() => deleteGroup(groupId)); navigate('/')
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
      <div className="page-head">
        <div>
          <div className="group-card-badges">
            <span className={`badge type-${group.group_type}`}>{typeLabel(group.group_type)}</span>
            <span className="badge">{themeLabel(group.group_type, group.theme)}</span>
          </div>
          <h1>{group.name}</h1>
          {group.description && <p className="muted">{group.description}</p>}
        </div>
        <div className="row-gap">
          <button className="btn btn-sm" onClick={() => setPanel(panel === 'me' ? null : 'me')}>내 설정</button>
          {isOwner && <button className="btn btn-sm" onClick={() => setPanel(panel === 'group' ? null : 'group')}>그룹 설정</button>}
          {isOwner
            ? <button className="btn btn-danger btn-sm" onClick={handleDeleteGroup}>그룹 삭제</button>
            : <button className="btn btn-ghost btn-sm" onClick={handleLeave}>나가기</button>}
        </div>
      </div>

      {panel === 'group' && isOwner && (
        <div className="card"><h3 className="card-title">그룹 설정</h3>
          <GroupSettings group={group} onClose={() => setPanel(null)}
            onSaved={(g) => { setGroup(g); setPanel(null) }} />
        </div>
      )}
      {panel === 'me' && me && (
        <div className="card"><h3 className="card-title">내 설정 (이 그룹)</h3>
          <MySettings group={group} me={me} onClose={() => setPanel(null)}
            onSaved={() => { setPanel(null); load() }} />
        </div>
      )}

      <div className="two-col">
        <section className="col-main">
          <div className="card">
            <h3 className="card-title">태스크 작성</h3>
            <form onSubmit={handleCreateTask} className="form">
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="할 일 제목" />
              <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="설명 (선택)" rows={2} />
              <button className="btn btn-primary" disabled={busy}>{busy ? '추가 중…' : '태스크 추가'}</button>
            </form>
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
        </section>

        <aside className="col-side">
          <div className="card">
            <h3 className="card-title">초대</h3>
            <p className="muted sm">이 코드를 공유해 멤버를 초대하세요.</p>
            <div className="invite-box">
              <code className="mono">{group.invite_code}</code>
              <button className="btn btn-sm" onClick={copyCode}>{copied ? '복사됨!' : '복사'}</button>
            </div>
          </div>

          <div className="card">
            <h3 className="card-title">멤버 <span className="muted">({members.length})</span></h3>
            <ul className="member-list">
              {members.map((m) => (
                <li key={m.user_id}>
                  <Avatar src={m.avatar_url} name={m.display_nickname} size={36} />
                  <div className="member-info">
                    <div className="member-name">
                      {m.display_nickname}
                      {m.is_self && <span className="muted sm"> (나)</span>}
                      {m.role === 'owner' && <span className="badge">소유자</span>}
                    </div>
                    {(m.contact || m.birthdate) && (
                      <div className="member-meta muted sm">
                        {m.contact && <span>{m.contact}</span>}
                        {m.birthdate && <span>· {m.birthdate}</span>}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
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
