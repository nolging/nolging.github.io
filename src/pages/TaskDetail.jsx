import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  getGroup, getTask, listMemberCards, listComments, addComment, deleteComment,
  acceptTask, completeTask, reopenTask,
} from '../lib/api'
import { taskTerms } from '../lib/constants'
import Avatar from '../components/Avatar'

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

export default function TaskDetail() {
  const { groupId, taskId } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [group, setGroup] = useState(null)
  const [task, setTask] = useState(null)
  const [members, setMembers] = useState([])
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  const isOwner = group && group.owner_id === profile?.id
  const terms = taskTerms(group?.group_type)

  const nameMap = useMemo(() => {
    const map = {}
    members.forEach((m) => { map[m.user_id] = { name: m.display_nickname, avatar: m.avatar_url } })
    return map
  }, [members])
  const nameOf = (uid) => nameMap[uid]?.name || '알 수 없음'
  const avatarOf = (uid) => nameMap[uid]?.avatar

  const loadComments = useCallback(async () => { setComments(await listComments(taskId)) }, [taskId])

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [g, t, m, c] = await Promise.all([
        getGroup(groupId), getTask(taskId), listMemberCards(groupId), listComments(taskId),
      ])
      setGroup(g); setTask(t); setMembers(m); setComments(c)
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [groupId, taskId])

  useEffect(() => { load() }, [load])

  async function runTaskAction(fn) {
    setError('')
    try { setTask(await fn()) } catch (err) { setError(err.message) }
  }

  async function send(e) {
    e.preventDefault()
    if (!body.trim() || sending) return
    setSending(true); setError('')
    try {
      await addComment({ taskId, groupId, body: body.trim(), authorId: profile.id })
      setBody(''); await loadComments()
    } catch (err) { setError(err.message) } finally { setSending(false) }
  }

  async function removeComment(id) {
    if (!confirm('삭제하시겠습니까?')) return
    try { await deleteComment(id); await loadComments() } catch (err) { setError(err.message) }
  }

  if (loading) return <div className="page"><div className="spinner" /></div>
  if (error && !task) return <div className="page"><div className="alert alert-error">{error}</div></div>
  if (!task) return null

  const mine = task.assignee_id === profile.id

  return (
    <div className="page task-detail">
      <div className="td-head">
        <div className="task-headline">
          {task.category && <span className="cat-chip">{task.category}</span>}
          <span className="task-name td-name">{task.title}</span>
        </div>
        <span className="task-author">
          <Avatar src={avatarOf(task.created_by)} name={nameOf(task.created_by)} size={22} />
          <span className="task-author-name">{nameOf(task.created_by)}</span>
        </span>
      </div>

      {task.description && <p className="td-desc">{task.description}</p>}

      <div className="td-actions">
        {task.assignee_id && (
          <span className="task-person"><Avatar src={avatarOf(task.assignee_id)} name={nameOf(task.assignee_id)} size={18} />담당 {nameOf(task.assignee_id)}{mine ? ' (나)' : ''}</span>
        )}
        <div className="task-actions">
          {task.status === 'open' && <button className="btn btn-sm btn-primary" onClick={() => runTaskAction(() => acceptTask(task.id, profile.id))}>{terms.accept}</button>}
          {task.status === 'accepted' && mine && <button className="btn btn-sm btn-success" onClick={() => runTaskAction(() => completeTask(task.id))}>완료</button>}
          {task.status === 'accepted' && !mine && <span className="muted sm">진행 중</span>}
          {task.status === 'done' && <button className="btn btn-sm btn-ghost" onClick={() => runTaskAction(() => reopenTask(task.id))}>다시 열기</button>}
        </div>
      </div>

      <hr className="divider" />

      <div className="comment-title">댓글 <span className="muted">{comments.length}</span></div>
      {error && <div className="alert alert-error">{error}</div>}
      {comments.length === 0 ? (
        <p className="muted sm">아직 댓글이 없어요. 첫 댓글을 남겨보세요.</p>
      ) : (
        <ul className="comment-list">
          {comments.map((c) => (
            <li key={c.id} className="comment">
              <Avatar src={avatarOf(c.author_id)} name={nameOf(c.author_id)} size={30} />
              <div className="comment-body">
                <div className="comment-meta">
                  <span className="comment-author">{nameOf(c.author_id)}</span>
                  <span className="comment-time">{formatTime(c.created_at)}</span>
                  {(c.author_id === profile.id || isOwner) && (
                    <button className="comment-del" onClick={() => removeComment(c.id)} aria-label="댓글 삭제">✕</button>
                  )}
                </div>
                <p className="comment-text">{c.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form className="composer" onSubmit={send}>
        <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="댓글을 입력하세요" />
        <button className="btn btn-primary" disabled={sending || !body.trim()}>등록</button>
      </form>
    </div>
  )
}
