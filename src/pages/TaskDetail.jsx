import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate, useSearchParams, useOutletContext, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  getGroup, getTask, listMemberCards, listComments, addComment, updateComment, deleteComment,
  completeTask, reopenTask, listTaskParticipants, cancelAppointment, deleteTask,
} from '../lib/api'
import { taskTerms, repeatLabel, remindLabel, categoryStyle } from '../lib/constants'
import Avatar from '../components/Avatar'

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

function formatWhen(iso, timeSet = true) {
  try {
    const opts = timeSet
      ? { month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }
      : { month: 'long', day: 'numeric', weekday: 'short' }
    return new Date(iso).toLocaleString('ko-KR', opts)
  } catch { return '' }
}

export default function TaskDetail() {
  const { groupId, taskId } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const focusCommentId = searchParams.get('c') // 알림에서 넘어온 강조 대상 댓글
  const from = location.state?.from // 진입 경로별 뒤로가기 (일정/알림)
  const { setTaskHeading, setTaskBackTo } = useOutletContext()

  const [group, setGroup] = useState(null)
  const [task, setTask] = useState(null)
  const [members, setMembers] = useState([])
  const [participants, setParticipants] = useState([])
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [editingId, setEditingId] = useState(null)     // 하단 입력창에서 수정 중인 댓글 id
  const [replyParent, setReplyParent] = useState(null) // 답글을 달 부모 댓글
  const [menuId, setMenuId] = useState(null)           // ⋮ 메뉴가 열린 댓글 id
  const [headMenu, setHeadMenu] = useState(false)      // 상단 약속 ⋮ 메뉴
  const [highlightId, setHighlightId] = useState(null) // 방금 작성/수정한 댓글(강조)
  const [toast, setToast] = useState('')
  const [bottomEl, setBottomEl] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 1500)
    return () => clearTimeout(t)
  }, [toast])

  // 하단 고정 입력창을 앱 셸 하단 슬롯에 Portal 로 렌더
  useEffect(() => { setBottomEl(document.getElementById('app-bottom')) }, [])

  // 방금 작성/수정한 댓글을 화면에 보이게 스크롤 + 강조 (애니메이션 후 해제)
  useEffect(() => {
    if (!highlightId) return
    const el = document.querySelector(`[data-cid="${highlightId}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const t = setTimeout(() => setHighlightId(null), 1800)
    return () => clearTimeout(t)
  }, [highlightId])

  const isOwner = group && group.owner_id === profile?.id
  const terms = taskTerms()

  const nameMap = useMemo(() => {
    const map = {}
    members.forEach((m) => { map[m.user_id] = { name: m.display_nickname, avatar: m.avatar_url } })
    return map
  }, [members])
  const nameOf = (uid) => nameMap[uid]?.name || '알 수 없음'
  const avatarOf = (uid) => nameMap[uid]?.avatar

  // 최상위 댓글과, 각 최상위 댓글에 딸린 답글(답글의 답글까지 모두 한 단계로 평면화)
  const { roots, repliesOf } = useMemo(() => {
    const byId = {}
    comments.forEach((c) => { byId[c.id] = c })
    const rootIdOf = (c) => {
      let cur = c, guard = 0
      while (cur.parent_id && byId[cur.parent_id] && guard++ < 100) cur = byId[cur.parent_id]
      return cur.id
    }
    const roots = comments.filter((c) => !c.parent_id)
    const repliesOf = {}
    comments.forEach((c) => {
      if (!c.parent_id) return
      const rid = rootIdOf(c)
      if (rid === c.id) return
      ;(repliesOf[rid] = repliesOf[rid] || []).push(c) // comments 는 이미 작성순 정렬
    })
    return { roots, repliesOf }
  }, [comments])

  const loadComments = useCallback(async () => { setComments(await listComments(taskId)) }, [taskId])

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [g, t, m, c, p] = await Promise.all([
        getGroup(groupId), getTask(taskId), listMemberCards(groupId), listComments(taskId),
        listTaskParticipants(taskId),
      ])
      setGroup(g); setTask(t); setMembers(m); setComments(c); setParticipants(p)
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [groupId, taskId])

  useEffect(() => { load() }, [load])

  // 상단바: 진행 상태별 명칭(위시/약속/추억) + 진입 경로별 뒤로가기
  useEffect(() => {
    if (task && group) {
      setTaskHeading(taskTerms().status[task.status])
      // 일정/알림에서 진입했으면 히스토리 pop('back')으로 되돌아가 무한반복 방지,
      // 그 외(그룹 상세에서 진입)는 해당 상태 탭으로 이동
      const backTo = (from === 'schedule' || from === 'notifications')
        ? 'back'
        : `/groups/${groupId}?tab=${task.status}`
      setTaskBackTo(backTo)
    }
  }, [task?.status, group, groupId, from, setTaskHeading, setTaskBackTo])
  useEffect(() => () => { setTaskHeading(null); setTaskBackTo(null) }, [setTaskHeading, setTaskBackTo])

  // 알림에서 넘어온 경우(?c=댓글id): 로딩 완료 후 그 댓글로 스크롤 + 강조
  useEffect(() => {
    if (!loading && focusCommentId) setHighlightId(focusCommentId)
  }, [loading, focusCommentId])

  async function runTaskAction(fn) {
    setError('')
    try { setTask(await fn()) } catch (err) { setError(err.message) }
  }

  // 놀기 신청 → 약속 잡기 페이지
  function acceptOrSchedule() {
    navigate(`/groups/${groupId}/tasks/${taskId}/schedule`)
  }

  // 상단 약속 메뉴 동작
  function goEditAppointment() {
    setHeadMenu(false)
    navigate(`/groups/${groupId}/tasks/${taskId}/schedule`)
  }
  async function doCancelAppointment() {
    setHeadMenu(false)
    if (!confirm('약속을 취소하고 위시로 되돌릴까요?')) return
    try { await cancelAppointment(taskId); await load() } catch (err) { setError(err.message) }
  }
  async function doDeleteTask() {
    setHeadMenu(false)
    if (!confirm('삭제하시겠습니까? 약속과 댓글도 함께 삭제됩니다.')) return
    try { await deleteTask(taskId); navigate(`/groups/${groupId}`) } catch (err) { setError(err.message) }
  }

  // 하단 입력창 제출: 수정 중이면 수정, 답글 대상이 있으면 답글, 아니면 새 댓글
  async function submit(e) {
    e.preventDefault()
    if (!body.trim() || sending) return
    setSending(true); setError('')
    try {
      let targetId
      if (editingId) {
        await updateComment(editingId, body.trim())
        targetId = editingId
        setEditingId(null)
      } else {
        const created = await addComment({ taskId, groupId, body: body.trim(), authorId: profile.id, parentId: replyParent?.id })
        targetId = created?.id
        setReplyParent(null)
      }
      setBody(''); await loadComments()
      setHighlightId(targetId || null)
    } catch (err) { setError(err.message) } finally { setSending(false) }
  }

  async function removeComment(id) {
    if (!confirm('삭제하시겠습니까? 답글도 함께 삭제됩니다.')) return
    try {
      await deleteComment(id)
      if (editingId === id) { setEditingId(null); setBody('') }
      if (replyParent?.id === id) setReplyParent(null)
      await loadComments()
    } catch (err) { setError(err.message) }
  }

  // '수정' → 하단 입력창에 댓글 내용을 넣고 편집 모드로
  function startEdit(c) {
    setMenuId(null); setReplyParent(null)
    setEditingId(c.id); setBody(c.body)
    inputRef.current?.focus()
  }
  // '답글 달기' → 하단 입력창을 해당 댓글의 답글 작성 모드로
  function replyTo(c) {
    setMenuId(null); setEditingId(null)
    setReplyParent(c); setBody('')
    inputRef.current?.focus()
  }
  function cancelCompose() { setEditingId(null); setReplyParent(null); setBody('') }
  function copyComment(c) {
    setMenuId(null)
    try { navigator.clipboard?.writeText(c.body); setToast('복사되었습니다') }
    catch { setToast('복사에 실패했습니다') }
  }

  function renderCard(c, depth) {
    const canEdit = c.author_id === profile.id
    const canDelete = c.author_id === profile.id || isOwner
    return (
      <div data-cid={c.id} className={`comment ${editingId === c.id ? 'editing' : ''} ${replyParent?.id === c.id ? 'replying' : ''} ${highlightId === c.id ? 'highlight' : ''}`}>
        <Avatar src={avatarOf(c.author_id)} name={nameOf(c.author_id)} size={depth > 0 ? 26 : 30} />
        <div className="comment-body">
          <div className="comment-meta">
            <span className="comment-author">{nameOf(c.author_id)}</span>
            <span className="comment-time">{formatTime(c.created_at)}</span>
            <div className="comment-menu-wrap">
              <button className="comment-menu-btn" aria-label="더보기" onClick={() => setMenuId(menuId === c.id ? null : c.id)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" />
                </svg>
              </button>
              {menuId === c.id && (
                <>
                  <div className="menu-backdrop" onClick={() => setMenuId(null)} />
                  <div className="menu-pop" role="menu">
                    <button type="button" onClick={() => replyTo(c)}>답글 달기</button>
                    <button type="button" onClick={() => copyComment(c)}>댓글 복사</button>
                    {canEdit && <button type="button" onClick={() => startEdit(c)}>수정</button>}
                    {canDelete && <button type="button" className="menu-danger" onClick={() => { setMenuId(null); removeComment(c.id) }}>삭제</button>}
                  </div>
                </>
              )}
            </div>
          </div>
          <p className="comment-text">{c.body}</p>
        </div>
      </div>
    )
  }

  // 최상위 댓글 + 그에 딸린 답글(모두 한 단계 들여쓰기)
  function renderThread(c) {
    const replies = repliesOf[c.id] || []
    return (
      <li key={c.id} className="comment-item">
        {renderCard(c, 0)}
        {replies.length > 0 && (
          <ul className="comment-replies">
            {replies.map((k) => (
              <li key={k.id} className="comment-item">{renderCard(k, 1)}</li>
            ))}
          </ul>
        )}
      </li>
    )
  }

  if (loading) return <div className="page"><div className="spinner" /></div>
  if (error && !task) return <div className="page"><div className="alert alert-error">{error}</div></div>
  if (!task) return null

  const mine = task.assignee_id === profile.id
  const isScheduled = !!task.scheduled_at
  const isCreator = task.created_by === profile.id
  const isParticipant = isCreator || participants.includes(profile.id)
  const extra = participants.length - 3
  const canComplete = task.status === 'accepted' && (isScheduled ? isParticipant : mine)
  const showActions = task.status !== 'done' || !isScheduled

  return (
    <div className="page task-detail">
      <div className="td-head">
        <div className="task-headline">
          {task.category && <span className="cat-chip" style={categoryStyle(task.category)}>{task.category}</span>}
          <span className="task-name td-name">{task.title}</span>
        </div>
        <div className="td-head-right">
          {isScheduled && participants.length > 0 ? (
            <span className={`task-parts ${participants.length > 1 ? 'multi' : ''}`}>
              {participants.slice(0, 3).map((uid) => (
                <Avatar key={uid} src={avatarOf(uid)} name={nameOf(uid)} size={26} />
              ))}
              {extra > 0 && <span className="task-parts-more">+{extra}</span>}
            </span>
          ) : (
            <span className="task-author">
              <Avatar src={avatarOf(task.created_by)} name={nameOf(task.created_by)} size={22} />
              <span className="task-author-name">{nameOf(task.created_by)}</span>
            </span>
          )}
          {isScheduled && isParticipant && (
            <div className="task-menu-wrap">
              <button className="btn btn-ghost btn-sm icon-btn" aria-label="더보기" onClick={() => setHeadMenu((v) => !v)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" />
                </svg>
              </button>
              {headMenu && (
                <>
                  <div className="menu-backdrop" onClick={() => setHeadMenu(false)} />
                  <div className="menu-pop" role="menu">
                    <button type="button" onClick={goEditAppointment}>편집</button>
                    <button type="button" onClick={doCancelAppointment}>약속 취소</button>
                    {isCreator && <button type="button" className="menu-danger" onClick={doDeleteTask}>삭제</button>}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 약속 정보 (태스크명 아래: 날짜·시간, 반복, 알림) */}
      {isScheduled && (
        <div className="appt">
          <div className="appt-when">
            <span className="appt-cal" aria-hidden="true">🗓</span>
            <span>{formatWhen(task.scheduled_at, task.scheduled_time_set)}</span>
            {task.repeat_rule && (
              <span className="appt-repeat">
                {repeatLabel(task.repeat_rule)}{task.repeat_until ? ` ~${task.repeat_until}` : ''}
              </span>
            )}
          </div>
          {task.remind_min !== null && task.remind_min !== undefined && (
            <div className="appt-remind muted sm">⏰ 미리 알림 · {remindLabel(task.remind_min)}</div>
          )}
        </div>
      )}

      {task.description && <p className="td-desc">{task.description}</p>}

      {showActions && (
        <div className="td-actions">
          {!isScheduled && task.assignee_id && (
            <span className="task-person"><Avatar src={avatarOf(task.assignee_id)} name={nameOf(task.assignee_id)} size={18} />담당 {nameOf(task.assignee_id)}{mine ? ' (나)' : ''}</span>
          )}
          <div className="task-actions">
            {task.status === 'open' && <button className="btn btn-sm btn-primary" onClick={acceptOrSchedule}>{terms.accept}</button>}
            {task.status === 'accepted' && canComplete && <button className="btn btn-sm btn-success" onClick={() => runTaskAction(() => completeTask(task.id))}>완료</button>}
            {task.status === 'accepted' && !canComplete && <span className="muted sm">진행 중</span>}
            {task.status === 'done' && !isScheduled && <button className="btn btn-sm btn-ghost" onClick={() => runTaskAction(() => reopenTask(task.id))}>다시 열기</button>}
          </div>
        </div>
      )}

      <hr className="divider" />

      <div className="comment-title">댓글 <span className="muted">{comments.length}</span></div>
      {error && <div className="alert alert-error">{error}</div>}
      {comments.length === 0 ? (
        <p className="muted sm">아직 댓글이 없어요. 첫 댓글을 남겨보세요.</p>
      ) : (
        <ul className="comment-list">
          {roots.map((c) => renderThread(c))}
        </ul>
      )}

      {toast && <div className="toast">{toast}</div>}

      {bottomEl && createPortal(
        <form className="composer" onSubmit={submit}>
          {(editingId || replyParent) && (
            <div className="composer-tag">
              <span className="composer-tag-text">
                {editingId ? '댓글 수정 중' : `${nameOf(replyParent.author_id)}님에게 답글`}
              </span>
              <button type="button" className="composer-cancel" onClick={cancelCompose} aria-label="취소" title="취소">✕</button>
            </div>
          )}
          <div className="composer-row">
            <input ref={inputRef} value={body} onChange={(e) => setBody(e.target.value)}
              placeholder={editingId ? '댓글 수정…' : replyParent ? '답글을 입력하세요' : '댓글을 입력하세요'} />
            <button className="btn btn-primary" disabled={sending || !body.trim()}>{editingId ? '수정' : '등록'}</button>
          </div>
        </form>,
        bottomEl,
      )}
    </div>
  )
}
