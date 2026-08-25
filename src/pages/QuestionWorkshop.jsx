import { createPortal } from 'react-dom'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate, useLocation, useOutletContext } from 'react-router-dom'
import {
  getGroupQworkshop, listMemberCards,
  listQworkshopPosts, createQworkshopPost, updateQworkshopPost, deleteQworkshopPost,
  getQworkshopAnswers, submitQworkshopAnswer,
  listQworkshopComments, addQworkshopComment, updateQworkshopComment, deleteQworkshopComment,
} from '../lib/api'
import { resolveMentions, splitMentions } from '../lib/mentions'
import { openMember } from '../lib/memberModal'
import Avatar from '../components/Avatar'
import MemberAvatarBtn from '../components/MemberAvatarBtn'
import Modal from '../components/Modal'

// 물음표 공방 — 세 유형(VS/고르기/문답)의 질문 게시판. 목록/작성·수정/상세(답변+댓글)로 구성.
// 접근 제어·댓글 멘션/답글은 비밀 게시판(RPC 전면 잠금)·위시 댓글(실명+멘션) 패턴을 그대로 따른다.

const TYPE_LABEL = { vs: 'VS', poll: '고르기', qna: '문답' }

function qwTime(iso) {
  try {
    const d = new Date(iso), now = new Date()
    const p2 = (n) => String(n).padStart(2, '0')
    const hm = `${p2(d.getHours())}:${p2(d.getMinutes())}`
    const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
    return sameDay ? hm : `${d.getFullYear()}.${p2(d.getMonth() + 1)}.${p2(d.getDate())} ${hm}`
  } catch { return '' }
}
function formatTime(iso) {
  try { return new Date(iso).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) } catch { return '' }
}
const qwPath = (groupId, sub = '') => `/groups/${groupId}/qworkshop${sub}`

const QwLoading = () => <div className="page qw-page"><div className="spinner" /></div>
const QwNotReady = () => (
  <div className="page qw-page"><div className="qw-soon"><span className="qw-soon-ico">❓</span><p>물음표 공방은 아직 준비 중이에요</p></div></div>
)

// 물음표 공방 접근 권한: 개설된 그룹의 멤버만. state: 'loading' | 'ok' | 'no'
function useQworkshopAccess(groupId) {
  const [state, setState] = useState('loading')
  useEffect(() => {
    let on = true
    getGroupQworkshop(groupId).then((on2) => on && setState(on2 ? 'ok' : 'no')).catch(() => on && setState('no'))
    return () => { on = false }
  }, [groupId])
  return { state }
}

// 세로 점 3개(더보기)
const DotsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" />
  </svg>
)

// ============ 목록 ============
export default function QuestionWorkshop() {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { setRefreshHandler } = useOutletContext()
  const { state: access } = useQworkshopAccess(groupId)
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try { setPosts(await listQworkshopPosts(groupId)) }
    catch (e) { setError(e.message) } finally { setLoading(false) }
  }, [groupId])
  useEffect(() => { load() }, [load])
  useEffect(() => { setRefreshHandler(() => load); return () => setRefreshHandler(() => null) }, [setRefreshHandler, load])

  if (access === 'loading') return <QwLoading />
  if (access === 'no') return <QwNotReady />

  return (
    <div className="page qw-page qw-list-page">
      <div className="qw-spark-field" aria-hidden="true">
        <span className="qw-spark" style={{ left: '9%', bottom: '20%', animationDelay: '0s' }} />
        <span className="qw-spark qw-spark-sm" style={{ left: '21%', bottom: '42%', animationDelay: '.7s' }} />
        <span className="qw-spark qw-spark-sm" style={{ left: '4%', bottom: '52%', animationDelay: '1.6s' }} />
        <span className="qw-spark" style={{ left: '47%', bottom: '12%', animationDelay: '1.2s' }} />
        <span className="qw-spark qw-spark-sm" style={{ right: '22%', bottom: '32%', animationDelay: '.3s' }} />
        <span className="qw-spark" style={{ right: '8%', bottom: '16%', animationDelay: '1.9s' }} />
      </div>
      <div className="qw-scroll">
        {error && <div className="alert alert-error">{error}</div>}
        {loading ? <div className="spinner" /> : posts.length === 0 ? (
          <div className="qw-empty">아직 물음표가 없어요. 첫 물음표를 남겨 보세요.</div>
        ) : (
          <ul className="qw-rows">
            {posts.map((p) => (
              <li key={p.id} className="qw-row">
                <button type="button" className="qw-row-btn"
                  onClick={() => navigate(qwPath(groupId, `/${p.id}`), { state: { membersBackTo: location.state?.membersBackTo } })}>
                  <span className="qw-row-main">
                    <span className="qw-row-qline">
                      <span className={`qw-type-badge qw-type-${p.type}`}>{TYPE_LABEL[p.type]}</span>
                      <span className="qw-row-q">{p.question}</span>
                    </span>
                    <span className="qw-row-meta">
                      <span className="qw-row-time">{qwTime(p.created_at)}</span>
                      {p.comment_count > 0 && <span className="qw-row-cc">💬 {p.comment_count}</span>}
                      {!p.has_answered && <span className="qw-row-pending">답변 전</span>}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button type="button" className="fab" aria-label="물음표 쓰기" title="물음표 쓰기"
        onClick={() => navigate(qwPath(groupId, '/new'))}>+</button>
    </div>
  )
}

// ============ 작성 / 수정 ============
export function QworkshopCompose() {
  const { groupId, postId } = useParams()
  const navigate = useNavigate()
  const { setHeaderSubmit } = useOutletContext()
  const { state: access } = useQworkshopAccess(groupId)
  const editing = !!postId

  const [type, setType] = useState('vs')
  const [question, setQuestion] = useState('')
  const [body, setBody] = useState('')
  const [options, setOptions] = useState(['', ''])
  const [loaded, setLoaded] = useState(!editing)
  const [locked, setLocked] = useState(false) // 이미 답변이 달려 선택지 수정 불가(vs/poll)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!editing) return
    let on = true
    listQworkshopPosts(groupId).then((ps) => {
      const p = ps.find((x) => x.id === postId)
      if (!p || !on) return
      setType(p.type); setQuestion(p.question); setBody(p.body || '')
      setOptions(p.type === 'qna' ? [] : (p.options?.length ? p.options : ['', '']))
      setLocked(p.type !== 'qna' && (p.answer_count || 0) > 0)
      setLoaded(true)
    }).catch(() => { if (on) setLoaded(true) })
    return () => { on = false }
  }, [groupId, postId, editing])

  function setOption(i, v) { setOptions((os) => os.map((o, k) => (k === i ? v : o))) }
  function addOption() { setOptions((os) => (os.length < 10 ? [...os, ''] : os)) }
  function removeOption(i) { setOptions((os) => (os.length > 2 ? os.filter((_, k) => k !== i) : os)) }

  async function submit() {
    if (busy) return
    const q = question.trim()
    if (!q) { setErr('질문을 입력해 주세요.'); return }
    const opts = type === 'qna' ? [] : options.map((o) => o.trim()).filter(Boolean)
    if (type === 'vs' && opts.length !== 2) { setErr('VS는 선택지 2개를 모두 입력해 주세요.'); return }
    if (type === 'poll' && opts.length < 2) { setErr('선택지를 2개 이상 입력해 주세요.'); return }
    setBusy(true); setErr('')
    try {
      if (editing) {
        await updateQworkshopPost(postId, q, body.trim(), locked ? undefined : opts)
        navigate(qwPath(groupId, `/${postId}`), { replace: true })
      } else {
        const id = await createQworkshopPost(groupId, type, q, body.trim(), opts)
        navigate(qwPath(groupId, `/${id}`), { replace: true })
      }
    } catch (e) { setErr(e.message); setBusy(false) }
  }
  const submitRef = useRef(submit)
  submitRef.current = submit
  useEffect(() => { setHeaderSubmit(() => () => submitRef.current()); return () => setHeaderSubmit(null) }, [setHeaderSubmit])

  if (access === 'loading') return <QwLoading />
  if (access === 'no') return <QwNotReady />
  if (!loaded) return <div className="page qw-page"><div className="spinner" /></div>

  return (
    <div className="page qw-page qw-compose-page">
      {err && <div className="alert alert-error">{err}</div>}
      {!editing && (
        <div className="qw-type-sel">
          {Object.entries(TYPE_LABEL).map(([v, label]) => (
            <button type="button" key={v} className={`qw-type-opt${type === v ? ' on' : ''}`}
              onClick={() => { setType(v); setOptions(v === 'qna' ? [] : ['', '']) }}>{label}</button>
          ))}
        </div>
      )}
      <input className="qw-question-input" placeholder="질문을 입력하세요" value={question} maxLength={100}
        onChange={(e) => setQuestion(e.target.value)} />
      <textarea className="qw-body-input" placeholder="내용을 입력하세요 (선택)" value={body} maxLength={2000} rows={4}
        onChange={(e) => setBody(e.target.value)} />
      {type !== 'qna' && (
        <div className="qw-options-editor">
          <h4 className="qw-options-title">{type === 'vs' ? '선택지 (2개)' : '선택지 (2~10개)'}</h4>
          {locked && <p className="qw-options-locked">이미 답변이 달려서 선택지는 수정할 수 없어요. 질문/내용만 바꿀 수 있어요.</p>}
          {options.map((o, i) => (
            <div className="qw-option-row" key={i}>
              <input className="qw-option-input" value={o} maxLength={50} disabled={locked}
                placeholder={`선택지 ${i + 1}`} onChange={(e) => setOption(i, e.target.value)} />
              {type === 'poll' && !locked && options.length > 2 && (
                <button type="button" className="qw-option-del" aria-label="선택지 삭제" onClick={() => removeOption(i)}>✕</button>
              )}
            </div>
          ))}
          {type === 'poll' && !locked && options.length < 10 && (
            <button type="button" className="qw-option-add" onClick={addOption}>+ 선택지 추가</button>
          )}
        </div>
      )}
    </div>
  )
}

// VS 카드 우측 상단: 이 선택지를 고른 사람 아바타 겹침(최대 3명+N) → 클릭 시 모달로 전체 목록
function VoterStack({ voters, onOpen, max = 3 }) {
  const shown = voters.slice(0, max)
  const extra = voters.length - max
  return (
    <button type="button" className="qw-voter-stack task-parts multi" aria-label="고른 사람 보기"
      onClick={(e) => { e.stopPropagation(); onOpen() }}>
      {shown.map((v) => <Avatar key={v.author_id} src={v.avatar_url} name={v.nickname} size={22} />)}
      {extra > 0 && <span className="task-parts-more">+{extra}</span>}
    </button>
  )
}

// ---- 답변/선택 영역(유형별) ----
function AnswerArea({ post, av, submitting, setSubmitting, setErr, reload }) {
  const [qnaEditing, setQnaEditing] = useState(!av.has_answered)
  const [qnaText, setQnaText] = useState(av.my_answer?.answer_text || '')
  const [voterModal, setVoterModal] = useState(null) // { label, voters } | null
  useEffect(() => { setQnaText(av.my_answer?.answer_text || ''); setQnaEditing(!av.has_answered) }, [av.has_answered, av.my_answer])

  async function pick(idx) {
    if (submitting) return
    setSubmitting(true); setErr('')
    try { await submitQworkshopAnswer(post.id, idx, null); await reload() }
    catch (e) { setErr(e.message) } finally { setSubmitting(false) }
  }
  async function submitQna() {
    if (submitting || !qnaText.trim()) return
    setSubmitting(true); setErr('')
    try { await submitQworkshopAnswer(post.id, null, qnaText.trim()); setQnaEditing(false); await reload() }
    catch (e) { setErr(e.message) } finally { setSubmitting(false) }
  }

  const voterModalEl = (
    <Modal open={!!voterModal} onClose={() => setVoterModal(null)} title={voterModal?.label}>
      <ul className="qw-voter-list">
        {(voterModal?.voters || []).map((v) => (
          <li key={v.author_id} className="qw-voter-list-item">
            <Avatar src={v.avatar_url} name={v.nickname} size={32} />
            <span>{v.nickname}</span>
          </li>
        ))}
      </ul>
    </Modal>
  )

  if (post.type === 'vs') {
    const opts = post.options || []
    const answered = av.has_answered
    const myIdx = av.my_answer?.option_idx
    const byOption = answered ? [0, 1].map((i) => (av.answers || []).filter((a) => a.option_idx === i)) : [[], []]
    return (
      <div className="qw-vs">
        <div className="qw-vs-row">
          {opts.map((label, i) => (
            <div key={i} role="button" tabIndex={0}
              className={`qw-vs-opt${answered ? ' answered' : ''}${myIdx === i ? ' mine' : ''}${submitting ? ' disabled' : ''}`}
              onClick={() => pick(i)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(i) } }}>
              {byOption[i].length > 0 && (
                <VoterStack voters={byOption[i]} onOpen={() => setVoterModal({ label, voters: byOption[i] })} />
              )}
              <span className="qw-vs-label">{label}</span>
            </div>
          ))}
          <span className="qw-vs-mid">VS</span>
        </div>
        {voterModalEl}
      </div>
    )
  }

  if (post.type === 'poll') {
    const opts = post.options || []
    const answered = av.has_answered
    const myIdx = av.my_answer?.option_idx
    const byOption = answered ? opts.map((_, i) => (av.answers || []).filter((a) => a.option_idx === i)) : opts.map(() => [])
    return (
      <div className="qw-poll">
        {opts.map((label, i) => (
          <div key={i} role="button" tabIndex={0}
            className={`qw-poll-opt${answered ? ' answered' : ''}${myIdx === i ? ' mine' : ''}${submitting ? ' disabled' : ''}`}
            onClick={() => pick(i)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(i) } }}>
            <span className="qw-poll-label">{label}</span>
            {byOption[i].length > 0 && (
              <VoterStack voters={byOption[i]} onOpen={() => setVoterModal({ label, voters: byOption[i] })} />
            )}
          </div>
        ))}
        {voterModalEl}
      </div>
    )
  }

  // qna
  const answered = av.has_answered
  const others = (av.answers || []).filter((a) => !a.is_self)
  return (
    <div className="qw-qna">
      {(qnaEditing || !answered) ? (
        <div className="qw-qna-input-wrap">
          <textarea className="qw-qna-input" value={qnaText} maxLength={1000} placeholder="답변을 입력하세요"
            onChange={(e) => setQnaText(e.target.value)} />
          <div className="qw-qna-actions">
            {answered && <button type="button" className="qw-link" onClick={() => { setQnaEditing(false); setQnaText(av.my_answer?.answer_text || '') }}>취소</button>}
            <button type="button" className="btn btn-primary" disabled={submitting || !qnaText.trim()} onClick={submitQna}>
              {answered ? '수정' : '답변 등록'}
            </button>
          </div>
        </div>
      ) : (
        <div className="qw-qna-mine">
          <p className="qw-qna-mine-text">{av.my_answer?.answer_text}</p>
          <button type="button" className="qw-link" onClick={() => setQnaEditing(true)}>수정</button>
        </div>
      )}
      {answered ? (
        others.length === 0 ? <p className="qw-qna-locked">아직 다른 답변이 없어요.</p> : (
          <ul className="qw-qna-list">
            {others.map((a) => (
              <li className="qw-qna-item" key={a.author_id}>
                <Avatar src={a.avatar_url} name={a.nickname} size={26} />
                <div className="qw-qna-item-body">
                  <span className="qw-qna-item-name">{a.nickname}</span>
                  <p className="qw-qna-item-text">{a.answer_text}</p>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : (av.answers || []).length > 0 ? (
        <p className="qw-qna-locked">{av.answers.length}명이 답변했어요. 답변을 남기면 볼 수 있어요.</p>
      ) : null}
    </div>
  )
}

// ---- 댓글 상태·동작(멘션+답글 1단계) ----
function useQworkshopComments(postId, groupId, members) {
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [replyParent, setReplyParent] = useState(null)
  const [menuId, setMenuId] = useState(null)
  const [highlightId, setHighlightId] = useState(null)
  const [err, setErr] = useState('')
  const inputRef = useRef(null)
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const mentionRange = useRef(null)

  const loadComments = useCallback(async () => {
    try { setComments(await listQworkshopComments(postId)) } catch (e) { setErr(e.message) } finally { setLoading(false) }
  }, [postId])
  useEffect(() => { loadComments() }, [loadComments])

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`
  }, [body])
  useEffect(() => {
    if (!highlightId) return
    document.querySelector(`[data-cid="${highlightId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const t = setTimeout(() => setHighlightId(null), 1800)
    return () => clearTimeout(t)
  }, [highlightId])

  const mentionSuggest = useMemo(() => {
    if (!mentionOpen) return []
    const q = mentionQuery.toLowerCase()
    return members.filter((m) => !m.is_left && m.display_nickname)
      .filter((m) => !q || m.display_nickname.toLowerCase().includes(q)).slice(0, 6)
  }, [mentionOpen, mentionQuery, members])

  function onBodyChange(e) {
    const val = e.target.value
    setBody(val)
    const pos = e.target.selectionStart ?? val.length
    const upto = val.slice(0, pos)
    const at = upto.lastIndexOf('@')
    if (at >= 0) {
      const between = upto.slice(at + 1)
      const prev = at > 0 ? upto[at - 1] : ''
      if (!/[\w가-힣]/.test(prev) && !/\s/.test(between)) {
        mentionRange.current = { start: at, end: pos }
        setMentionQuery(between); setMentionOpen(true)
        return
      }
    }
    setMentionOpen(false)
  }
  function pickMention(m) {
    const r = mentionRange.current
    const insert = `@${m.display_nickname} `
    const before = r ? body.slice(0, r.start) : body
    const after = r ? body.slice(r.end) : ''
    setBody(before + insert + after)
    setMentionOpen(false)
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (el) { const p = (before + insert).length; el.focus(); el.setSelectionRange(p, p) }
    })
  }
  const renderBody = (text) => splitMentions(text, members).map((p, i) => {
    if (!p.mention) return <span key={i}>{p.text}</span>
    if (!p.userId) return <span key={i} className="mention-chip">{p.mention}</span>
    return <MentionChip key={i} groupId={groupId} userId={p.userId} label={p.mention} />
  })

  const { roots, repliesOf } = useMemo(() => {
    const byId = {}
    comments.forEach((c) => { byId[c.id] = c })
    const rootIdOf = (c) => { let cur = c, g = 0; while (cur.parent_id && byId[cur.parent_id] && g++ < 100) cur = byId[cur.parent_id]; return cur.id }
    const roots = comments.filter((c) => !c.parent_id)
    const repliesOf = {}
    comments.forEach((c) => {
      if (!c.parent_id) return
      const rid = rootIdOf(c)
      if (rid === c.id) return
      ;(repliesOf[rid] = repliesOf[rid] || []).push(c)
    })
    return { roots, repliesOf }
  }, [comments])

  async function submit(e) {
    e?.preventDefault?.()
    if (!body.trim() || sending) return
    setSending(true); setErr('')
    try {
      let targetId
      if (editingId) { await updateQworkshopComment(editingId, body.trim()); targetId = editingId; setEditingId(null) }
      else {
        const id = await addQworkshopComment(postId, replyParent?.id || null, body.trim(), resolveMentions(body.trim(), members))
        targetId = id; setReplyParent(null)
      }
      setBody(''); setMentionOpen(false); await loadComments()
      setHighlightId(targetId || null)
    } catch (e2) { setErr(e2.message) } finally { setSending(false) }
  }
  async function removeComment(id) {
    setMenuId(null)
    if (!confirm('이 댓글을 삭제할까요? 답글도 함께 삭제돼요.')) return
    try {
      await deleteQworkshopComment(id)
      if (editingId === id) { setEditingId(null); setBody('') }
      if (replyParent?.id === id) setReplyParent(null)
      await loadComments()
    } catch (e) { setErr(e.message) }
  }
  function startEdit(c) { setMenuId(null); setReplyParent(null); setEditingId(c.id); setBody(c.body); inputRef.current?.focus() }
  function replyTo(c) { setMenuId(null); setEditingId(null); setReplyParent(c); setBody(''); inputRef.current?.focus() }
  function cancelCompose() { setEditingId(null); setReplyParent(null); setBody('') }

  return {
    comments, loading, roots, repliesOf, body, setBody, sending, editingId, replyParent, menuId, setMenuId,
    highlightId, err, inputRef, mentionOpen, setMentionOpen, mentionQuery, mentionSuggest, onBodyChange, pickMention, renderBody,
    loadComments, submit, removeComment, startEdit, replyTo, cancelCompose,
  }
}

function MentionChip({ groupId, userId, label }) {
  const navigate = useNavigate()
  return (
    <button type="button" className="mention-chip" onClick={(e) => { e.stopPropagation(); openMember(navigate, groupId, userId) }}>
      {label}
    </button>
  )
}

// 댓글 목록 렌더(최상위 + 답글 1단계, ⋮ 메뉴)
function QwCommentList({ h, groupId }) {
  const [menuDir, setMenuDir] = useState('up')
  if (h.loading) return <div className="spinner sm" />
  if (h.roots.length === 0) return <p className="comment-empty">아직 댓글이 없어요. 첫 댓글을 남겨 보세요.</p>
  function toggleMenu(e, id) {
    if (h.menuId === id) { h.setMenuId(null); return }
    const rect = e.currentTarget.getBoundingClientRect()
    setMenuDir(rect.top < 160 ? 'down' : 'up')
    h.setMenuId(id)
  }
  function card(c, depth) {
    return (
      <div data-cid={c.id} key={c.id} className={`comment${h.highlightId === c.id ? ' highlight' : ''}`}>
        <MemberAvatarBtn groupId={groupId} userId={c.author_id} src={c.avatar_url} name={c.nickname} size={depth > 0 ? 26 : 30} />
        <div className="comment-body">
          <div className="comment-meta">
            <span className="comment-author">{c.nickname}</span>
            <span className="comment-time">{formatTime(c.created_at)}</span>
            <div className="comment-menu-wrap">
              <button className="comment-menu-btn" aria-label="더보기" onClick={(e) => toggleMenu(e, c.id)}><DotsIcon /></button>
              {h.menuId === c.id && (
                <>
                  <div className="menu-backdrop" onClick={() => h.setMenuId(null)} />
                  <div className={`menu-pop${menuDir === 'down' ? ' menu-pop-down' : ''}`} role="menu">
                    <button type="button" onClick={() => h.replyTo(c)}>답글 달기</button>
                    {c.is_mine && <button type="button" onClick={() => h.startEdit(c)}>수정</button>}
                    {c.can_delete && <button type="button" className="menu-danger" onClick={() => h.removeComment(c.id)}>삭제</button>}
                  </div>
                </>
              )}
            </div>
          </div>
          <p className="comment-text">{h.renderBody(c.body)}</p>
        </div>
      </div>
    )
  }
  return (
    <ul className="comment-list">
      {h.roots.map((c) => (
        <li key={c.id} className="comment-item">
          {card(c, 0)}
          {(h.repliesOf[c.id] || []).length > 0 && (
            <ul className="comment-replies">
              {h.repliesOf[c.id].map((k) => <li key={k.id} className="comment-item">{card(k, 1)}</li>)}
            </ul>
          )}
        </li>
      ))}
    </ul>
  )
}

// ============ 상세(답변/선택 + 댓글) ============
export function QworkshopPost() {
  const { groupId, postId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { setRefreshHandler } = useOutletContext()
  const { state: access } = useQworkshopAccess(groupId)

  const seed = location.state?.post
  const [post, setPost] = useState(seed || null)
  const [gone, setGone] = useState(false)
  const [members, setMembers] = useState([])
  const [av, setAv] = useState({ has_answered: false, my_answer: null, answers: [], counts: null })
  const [avLoading, setAvLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [bottomEl, setBottomEl] = useState(null)
  useEffect(() => { setBottomEl(document.getElementById('app-bottom')) }, [])

  const h = useQworkshopComments(postId, groupId, members)

  const loadPost = useCallback(async () => {
    try {
      const list = await listQworkshopPosts(groupId)
      const fresh = list.find((x) => x.id === postId)
      if (fresh) setPost(fresh); else setGone(true)
    } catch { /* 기존 값 유지 */ }
  }, [groupId, postId])
  const loadAnswers = useCallback(async () => {
    try { setAv(await getQworkshopAnswers(postId)) } catch (e) { setErr(e.message) } finally { setAvLoading(false) }
  }, [postId])
  useEffect(() => { loadPost(); loadAnswers() }, [loadPost, loadAnswers])
  useEffect(() => { listMemberCards(groupId).then(setMembers).catch(() => {}) }, [groupId])

  const refreshAll = useCallback(async () => { await Promise.all([loadPost(), loadAnswers(), h.loadComments()]) }, [loadPost, loadAnswers, h.loadComments])
  useEffect(() => { setRefreshHandler(() => refreshAll); return () => setRefreshHandler(() => null) }, [setRefreshHandler, refreshAll])

  async function removePost() {
    setMenuOpen(false)
    if (!confirm('이 물음표를 삭제할까요? 답변과 댓글도 함께 삭제돼요.')) return
    try { await deleteQworkshopPost(postId); navigate(qwPath(groupId), { replace: true }) } catch (e) { setErr(e.message) }
  }
  function goEdit() { setMenuOpen(false); navigate(qwPath(groupId, `/${postId}/edit`), { state: { post } }) }

  if (access === 'loading') return <QwLoading />
  if (access === 'no') return <QwNotReady />
  if (gone) return <div className="page"><div className="comment-empty">삭제된 물음표예요.</div></div>
  if (!post) return <div className="page"><div className="spinner" /></div>

  const commentCount = h.comments.length

  return (
    <div className="page qw-post-page">
      <div className="qw-post-head">
        <span className={`qw-type-badge qw-type-${post.type}`}>{TYPE_LABEL[post.type]}</span>
        {(post.is_mine || post.can_delete) && (
          <div className="task-menu-wrap">
            <button type="button" className="btn btn-ghost btn-sm icon-btn" aria-label="더보기" onClick={() => setMenuOpen((o) => !o)}><DotsIcon /></button>
            {menuOpen && (
              <>
                <div className="menu-backdrop" onClick={() => setMenuOpen(false)} />
                <div className="menu-pop" role="menu">
                  {post.is_mine && <button type="button" onClick={goEdit}>수정</button>}
                  {post.can_delete && <button type="button" className="menu-danger" onClick={removePost}>삭제</button>}
                </div>
              </>
            )}
          </div>
        )}
      </div>
      <h2 className="qw-post-q">{post.question}</h2>
      <div className="qw-post-meta">
        <span className="qw-post-author">{post.nickname}</span>
        <span className="qw-post-time">{formatTime(post.created_at)}</span>
      </div>
      {post.body && <p className="qw-post-body">{post.body}</p>}

      {err && <div className="alert alert-error">{err}</div>}
      {avLoading ? <div className="spinner" /> : (
        <AnswerArea post={post} av={av} submitting={submitting} setSubmitting={setSubmitting} setErr={setErr} reload={async () => { await loadAnswers(); await loadPost() }} />
      )}

      <div className="qw-cmt-section">
        <div className="qw-cmt-head">댓글 <span className="muted">{commentCount}</span></div>
        {h.err && <div className="alert alert-error">{h.err}</div>}
        <QwCommentList h={h} groupId={groupId} />
      </div>

      {bottomEl && createPortal((
        <form className="composer" onSubmit={h.submit}>
          {(h.editingId || h.replyParent) && (
            <div className="composer-tag">
              <span className="composer-tag-text">{h.editingId ? '댓글 수정 중' : '답글 작성 중'}</span>
              <button type="button" className="composer-cancel" onClick={h.cancelCompose} aria-label="취소" title="취소">✕</button>
            </div>
          )}
          {h.mentionOpen && h.mentionSuggest.length > 0 && (
            <div className="mention-pop" role="listbox">
              {h.mentionSuggest.map((m) => (
                <button type="button" key={m.user_id} className="mention-opt" role="option"
                  onMouseDown={(e) => { e.preventDefault(); h.pickMention(m) }}>
                  <Avatar src={m.avatar_url} name={m.display_nickname} size={26} />
                  <span className="mention-opt-name">{m.display_nickname}</span>
                </button>
              ))}
            </div>
          )}
          <div className="composer-row">
            <textarea ref={h.inputRef} className="composer-input" value={h.body} onChange={h.onBodyChange} rows={1}
              onKeyDown={(e) => { if (e.key === 'Escape' && h.mentionOpen) { e.preventDefault(); h.setMentionOpen(false) } }}
              placeholder={h.editingId ? '댓글 수정…' : h.replyParent ? '답글을 입력하세요' : '댓글을 입력하세요'} />
            <button className="btn btn-primary" disabled={h.sending || !h.body.trim()}>{h.editingId ? '수정' : '등록'}</button>
          </div>
        </form>
      ), bottomEl)}
    </div>
  )
}
