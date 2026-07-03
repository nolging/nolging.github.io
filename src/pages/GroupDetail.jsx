import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  getGroup, listMembers, listTasks, createTask,
  acceptTask, completeTask, reopenTask, deleteTask,
  leaveGroup, deleteGroup,
} from '../lib/api'

const STATUS_LABEL = { open: '열림', accepted: '진행 중', done: '완료' }

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

  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState('all')

  const isOwner = group && group.owner_id === profile?.id

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [g, m, t] = await Promise.all([
        getGroup(groupId), listMembers(groupId), listTasks(groupId),
      ])
      setGroup(g)
      setMembers(m)
      setTasks(t)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [groupId])

  useEffect(() => { load() }, [load])

  async function handleCreateTask(e) {
    e.preventDefault()
    if (!title.trim()) return
    setBusy(true)
    try {
      await createTask({ groupId, title: title.trim(), description: desc.trim(), createdBy: profile.id })
      setTitle(''); setDesc('')
      await load()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  async function runAction(fn) {
    try { await fn(); await load() } catch (err) { setError(err.message) }
  }

  function copyCode() {
    navigator.clipboard?.writeText(group.invite_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function handleLeave() {
    if (!confirm('이 그룹에서 나가시겠습니까?')) return
    await runAction(() => leaveGroup(groupId, profile.id))
    navigate('/')
  }

  async function handleDeleteGroup() {
    if (!confirm('그룹을 삭제하면 모든 태스크가 사라집니다. 삭제할까요?')) return
    await runAction(() => deleteGroup(groupId))
    navigate('/')
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
      <div className="breadcrumb"><Link to="/">내 그룹</Link> / {group.name}</div>

      <div className="page-head">
        <div>
          <h1>{group.name}</h1>
          {group.description && <p className="muted">{group.description}</p>}
        </div>
        <div className="row-gap">
          {isOwner
            ? <button className="btn btn-danger btn-sm" onClick={handleDeleteGroup}>그룹 삭제</button>
            : <button className="btn btn-ghost btn-sm" onClick={handleLeave}>그룹 나가기</button>}
        </div>
      </div>

      <div className="two-col">
        <section className="col-main">
          {/* 태스크 작성 */}
          <div className="card">
            <h3 className="card-title">태스크 작성</h3>
            <form onSubmit={handleCreateTask} className="form">
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="할 일 제목" />
              <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="설명 (선택)" rows={2} />
              <button className="btn btn-primary" disabled={busy}>{busy ? '추가 중…' : '태스크 추가'}</button>
            </form>
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          {/* 필터 */}
          <div className="tabs">
            {['all', 'open', 'accepted', 'done'].map((f) => (
              <button
                key={f}
                className={`tab ${filter === f ? 'active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? '전체' : STATUS_LABEL[f]}
                <span className="tab-count">
                  {f === 'all' ? tasks.length : tasks.filter((t) => t.status === f).length}
                </span>
              </button>
            ))}
          </div>

          {/* 태스크 목록 */}
          {visibleTasks.length === 0 ? (
            <div className="empty"><p className="muted">태스크가 없습니다.</p></div>
          ) : (
            <ul className="task-list">
              {visibleTasks.map((t) => (
                <TaskItem
                  key={t.id}
                  task={t}
                  me={profile}
                  isOwner={isOwner}
                  onAccept={() => runAction(() => acceptTask(t.id, profile.id))}
                  onComplete={() => runAction(() => completeTask(t.id))}
                  onReopen={() => runAction(() => reopenTask(t.id))}
                  onDelete={() => runAction(() => deleteTask(t.id))}
                />
              ))}
            </ul>
          )}
        </section>

        <aside className="col-side">
          {/* 초대 */}
          <div className="card">
            <h3 className="card-title">초대</h3>
            <p className="muted sm">이 코드를 공유해 멤버를 초대하세요.</p>
            <div className="invite-box">
              <code className="mono">{group.invite_code}</code>
              <button className="btn btn-sm" onClick={copyCode}>{copied ? '복사됨!' : '복사'}</button>
            </div>
          </div>

          {/* 멤버 */}
          <div className="card">
            <h3 className="card-title">멤버 <span className="muted">({members.length})</span></h3>
            <ul className="member-list">
              {members.map((m) => (
                <li key={m.user?.id}>
                  <span className="avatar">{(m.user?.nickname || '?')[0].toUpperCase()}</span>
                  <span className="member-name">{m.user?.nickname}</span>
                  {m.role === 'owner' && <span className="badge">소유자</span>}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  )
}

function TaskItem({ task, me, isOwner, onAccept, onComplete, onReopen, onDelete }) {
  const mine = task.assignee_id === me?.id
  const canDelete = task.created_by === me?.id || isOwner
  return (
    <li className={`task-item status-${task.status}`}>
      <div className="task-main">
        <div className="task-title">
          <span className={`status-dot ${task.status}`} />
          {task.title}
        </div>
        {task.description && <p className="task-desc">{task.description}</p>}
        <div className="task-meta">
          <span>작성 {task.creator?.nickname}</span>
          {task.assignee && <span>· 담당 {task.assignee.nickname}{mine ? ' (나)' : ''}</span>}
          <span className={`badge badge-${task.status}`}>{STATUS_LABEL[task.status]}</span>
        </div>
      </div>
      <div className="task-actions">
        {task.status === 'open' && (
          <button className="btn btn-sm btn-primary" onClick={onAccept}>수락</button>
        )}
        {task.status === 'accepted' && mine && (
          <button className="btn btn-sm btn-success" onClick={onComplete}>완료</button>
        )}
        {task.status === 'accepted' && !mine && (
          <span className="muted sm">진행 중</span>
        )}
        {task.status === 'done' && (
          <button className="btn btn-sm btn-ghost" onClick={onReopen}>다시 열기</button>
        )}
        {canDelete && (
          <button className="btn btn-sm btn-icon" title="삭제" onClick={onDelete}>✕</button>
        )}
      </div>
    </li>
  )
}
