import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate, useLocation, useSearchParams, useOutletContext } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/Modal'
import {
  getGroup, listBoardPrefixes, addBoardPrefix, updateBoardPrefix, deleteBoardPrefix,
  listBoardPosts, createBoardPost, updateBoardPost, deleteBoardPost,
  listBoardComments, addBoardComment, updateBoardComment, deleteBoardComment,
} from '../lib/api'

// 비밀 게시판 — 프리미엄 그룹 익명 게시판. 글쓰기/수정/조회는 페이지 이동, 댓글은 상세 페이지 안에서.
// 내 글·내 댓글은 배경만 연보라(배지 없음). 우선 앱 관리자에게만 노출. 서버 RPC 가 익명 + 권한 담당.

function timeAgo(iso) {
  try {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000
    if (diff < 60) return '방금'
    if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
    if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`
    if (diff < 604800) return `${Math.floor(diff / 86400)}일 전`
    return new Date(iso).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
  } catch { return '' }
}
const boardPath = (groupId, sub = '') => `/groups/${groupId}/board${sub}`

// 접근 준비 안 됨(관리자 아님) 공통 화면
const NotReady = () => (
  <div className="page sb-page">
    <div className="sb-soon"><span>🔒</span><p>비밀 게시판은 아직 준비 중이에요</p></div>
  </div>
)

// ============ 목록 ============
export default function SecretBoard() {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const { profile, isAdmin } = useAuth()
  const { setHeaderGear } = useOutletContext()
  const uid = profile?.id

  const [group, setGroup] = useState(null)
  const [prefixes, setPrefixes] = useState([])
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [prefixMgr, setPrefixMgr] = useState(false)

  const canManage = isAdmin || (group && group.owner_id === uid)

  const load = useCallback(async () => {
    setError('')
    try {
      const [g, pf, ps] = await Promise.all([
        getGroup(groupId).catch(() => null),
        listBoardPrefixes(groupId),
        listBoardPosts(groupId),
      ])
      setGroup(g); setPrefixes(pf); setPosts(ps)
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }, [groupId])
  useEffect(() => { load() }, [load])

  // 관리 권한이면 상단바 우측 톱니바퀴 → 말머리 관리. 페이지를 벗어나면 등록 해제.
  useEffect(() => {
    if (isAdmin && canManage) setHeaderGear(() => () => setPrefixMgr(true))
    else setHeaderGear(null)
    return () => setHeaderGear(null)
  }, [isAdmin, canManage, setHeaderGear])

  if (!isAdmin) return <NotReady />

  return (
    <div className="page sb-page">
      {error && <div className="alert alert-error">{error}</div>}

      {loading ? <div className="spinner" /> : posts.length === 0 ? (
        <div className="sb-empty">아직 글이 없어요. 첫 글을 남겨 보세요.</div>
      ) : (
        <ul className="sb-list">
          {posts.map((p) => (
            <li key={p.id}>
              <button type="button" className={`sb-item${p.is_mine ? ' mine' : ''}`}
                onClick={() => navigate(boardPath(groupId, `/${p.id}`), { state: { post: p } })}>
                <div className="sb-item-title">
                  {p.prefix_label && <span className="sb-prefix">[{p.prefix_label}]</span>}
                  <span className="sb-item-t">{p.title}</span>
                </div>
                {p.body && <div className="sb-item-body">{p.body}</div>}
                <div className="sb-item-meta">
                  <span>{timeAgo(p.created_at)}{p.edited ? ' · 수정됨' : ''}</span>
                  {p.comment_count > 0 && <span className="sb-cc">💬 {p.comment_count}</span>}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <button type="button" className="sb-fab" onClick={() => navigate(boardPath(groupId, '/new'))} aria-label="새 글 쓰기">＋</button>

      {prefixMgr && (
        <PrefixManager groupId={groupId} prefixes={prefixes}
          onClose={() => setPrefixMgr(false)}
          onChanged={async () => setPrefixes(await listBoardPrefixes(groupId))} />
      )}
    </div>
  )
}

// ============ 글쓰기 / 수정 (페이지) ============
export function BoardCompose() {
  const { groupId, postId } = useParams()   // postId 있으면 수정
  const navigate = useNavigate()
  const location = useLocation()
  const { isAdmin } = useAuth()
  const editing = !!postId

  const [prefixes, setPrefixes] = useState([])
  const [prefixId, setPrefixId] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [loaded, setLoaded] = useState(!editing)   // 새 글은 즉시 편집 가능
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    let on = true
    listBoardPrefixes(groupId).then((pf) => { if (on) setPrefixes(pf) }).catch(() => { })
    if (editing) {
      // 목록에서 넘어왔으면 state 로 즉시, 아니면(직접 URL) 목록에서 찾아 채운다
      const seed = location.state?.post
      const fill = (p) => { if (!p || !on) return; setPrefixId(p.prefix_id || ''); setTitle(p.title || ''); setBody(p.body || ''); setLoaded(true) }
      if (seed) fill(seed)
      else listBoardPosts(groupId).then((ps) => fill(ps.find((x) => x.id === postId))).catch(() => on && setLoaded(true))
    }
    return () => { on = false }
  }, [groupId, postId, editing, location.state])

  if (!isAdmin) return <NotReady />

  async function submit() {
    if (!title.trim()) { setErr('제목을 입력해 주세요.'); return }
    setBusy(true); setErr('')
    try {
      if (editing) {
        await updateBoardPost(postId, prefixId, title.trim(), body)
        navigate(boardPath(groupId, `/${postId}`), { replace: true })
      } else {
        const id = await createBoardPost(groupId, prefixId, title.trim(), body)
        navigate(boardPath(groupId, `/${id}`), { replace: true })
      }
    } catch (e) { setErr(e.message); setBusy(false) }
  }

  return (
    <div className="page sb-page">
      {!loaded ? <div className="spinner" /> : (
        <div className="sb-compose">
          {err && <div className="alert alert-error">{err}</div>}
          {prefixes.length > 0 && (
            <div className="sb-prefix-pick">
              <button type="button" className={`sb-chip${!prefixId ? ' on' : ''}`} onClick={() => setPrefixId('')}>말머리 없음</button>
              {prefixes.map((pf) => (
                <button key={pf.id} type="button" className={`sb-chip${prefixId === pf.id ? ' on' : ''}`}
                  onClick={() => setPrefixId(pf.id)}>{pf.label}</button>
              ))}
            </div>
          )}
          <input className="sb-input" placeholder="제목" value={title} maxLength={100}
            onChange={(e) => setTitle(e.target.value)} />
          <textarea className="sb-textarea sb-body-input" placeholder="내용을 입력하세요" value={body} maxLength={5000}
            onChange={(e) => setBody(e.target.value)} />
          <button type="button" className="btn btn-primary btn-block" onClick={submit} disabled={busy || !title.trim()}>
            {busy ? '올리는 중…' : editing ? '수정하기' : '올리기'}
          </button>
        </div>
      )}
    </div>
  )
}

// 새로고침 아이콘
const RefreshIcon = ({ spinning }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={spinning ? 'sb-spin' : ''}>
    <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
)

// ---- 댓글 스레드(글 상세·댓글 상세 공용). 익명, 대댓글 1단계, 삭제 자리표시자, 하단 고정 입력창 ----
function BoardCommentThread({ groupId, postId, focusId, showRefresh = false }) {
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [editingId, setEditingId] = useState(null)     // 하단 입력창에서 수정 중인 댓글 id
  const [replyParent, setReplyParent] = useState(null) // 답글을 달 부모 댓글
  const [menuId, setMenuId] = useState(null)           // ⋮ 메뉴가 열린 댓글 id
  const [flashId, setFlashId] = useState(null)         // 강조(작성/수정/포커스) 대상
  const [bottomEl, setBottomEl] = useState(null)
  const [err, setErr] = useState('')
  const inputRef = useRef(null)
  const didFocus = useRef(false)

  const loadComments = useCallback(async () => {
    try { setComments(await listBoardComments(postId)) } catch (e) { setErr(e.message) } finally { setLoading(false) }
  }, [postId])
  useEffect(() => { loadComments() }, [loadComments])

  // 하단 고정 입력창을 앱 셸 하단 슬롯에 Portal 로
  useEffect(() => { setBottomEl(document.getElementById('app-bottom')) }, [])
  // 입력창 높이 자동 조절
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`
  }, [body])
  // 강조 대상으로 스크롤 + 잠깐 색 → 서서히 꺼짐
  useEffect(() => {
    if (!flashId) return
    document.querySelector(`[data-cid="${flashId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const t = setTimeout(() => setFlashId(null), 2000)
    return () => clearTimeout(t)
  }, [flashId])
  // 알림에서 넘어온 포커스 대상: 로딩 후 한 번 강조
  useEffect(() => {
    if (!focusId || loading || didFocus.current) return
    didFocus.current = true; setFlashId(focusId)
  }, [focusId, loading])

  // 최상위 댓글 + 딸린 답글(답글의 답글까지 한 단계로 평면화)
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
  const commentCount = useMemo(() => comments.filter((c) => !c.deleted).length, [comments])
  const flat = useMemo(() => {
    const out = []
    roots.forEach((r) => { out.push({ c: r, depth: 0 }); (repliesOf[r.id] || []).forEach((k) => out.push({ c: k, depth: 1 })) })
    return out
  }, [roots, repliesOf])

  async function doRefresh() { setRefreshing(true); setErr(''); await loadComments(); setTimeout(() => setRefreshing(false), 300) }
  async function submit(e) {
    e.preventDefault()
    if (!body.trim() || sending) return
    setSending(true); setErr('')
    try {
      let targetId
      if (editingId) { await updateBoardComment(editingId, body.trim()); targetId = editingId; setEditingId(null) }
      else { targetId = await addBoardComment(postId, replyParent?.id || null, body.trim()); setReplyParent(null) }
      setBody(''); await loadComments()
      setFlashId(targetId || null)
    } catch (e2) { setErr(e2.message) } finally { setSending(false) }
  }
  async function removeComment(id) {
    setMenuId(null)
    if (!confirm('이 댓글을 삭제할까요?')) return
    try {
      await deleteBoardComment(id)
      if (editingId === id) { setEditingId(null); setBody('') }
      if (replyParent?.id === id) setReplyParent(null)
      await loadComments()
    } catch (e) { setErr(e.message) }
  }
  function startEdit(c) { setMenuId(null); setReplyParent(null); setEditingId(c.id); setBody(c.body); inputRef.current?.focus() }
  function replyTo(c) { setMenuId(null); setEditingId(null); setReplyParent(c); setBody(''); inputRef.current?.focus() }
  function cancelCompose() { setEditingId(null); setReplyParent(null); setBody('') }

  function renderRow({ c, depth }) {
    if (c.deleted) {
      return (
        <li key={c.id} data-cid={c.id} className={`sb-cmt-row${depth ? ' reply' : ''} deleted${flashId === c.id ? ' hl' : ''}`}>
          <p className="sb-cmt-text sb-deleted">삭제된 댓글입니다.</p>
        </li>
      )
    }
    const hasMenu = depth === 0 || c.is_mine || c.can_delete
    return (
      <li key={c.id} data-cid={c.id} className={`sb-cmt-row${depth ? ' reply' : ''}${c.is_mine ? ' mine' : ''}${flashId === c.id ? ' hl' : ''}`}>
        <div className="sb-cmt-meta">
          <span className="sb-cmt-time">{timeAgo(c.created_at)}{c.edited ? ' · 수정됨' : ''}</span>
          {hasMenu && (
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
                    {depth === 0 && <button type="button" onClick={() => replyTo(c)}>답글 달기</button>}
                    {c.is_mine && <button type="button" onClick={() => startEdit(c)}>수정</button>}
                    {c.can_delete && <button type="button" className="menu-danger" onClick={() => removeComment(c.id)}>삭제</button>}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        <p className="sb-cmt-text">{c.body}</p>
      </li>
    )
  }

  const composer = (
    <form className="composer" onSubmit={submit}>
      {(editingId || replyParent) && (
        <div className="composer-tag">
          <span className="composer-tag-text">{editingId ? '댓글 수정 중' : '답글 작성 중'}</span>
          <button type="button" className="composer-cancel" onClick={cancelCompose} aria-label="취소" title="취소">✕</button>
        </div>
      )}
      <div className="composer-row">
        <textarea ref={inputRef} className="composer-input" value={body} rows={1} maxLength={2000}
          onChange={(e) => setBody(e.target.value)}
          placeholder={editingId ? '댓글 수정…' : replyParent ? '답글을 입력하세요' : '댓글을 입력하세요'} />
        <button className="btn btn-primary" disabled={sending || !body.trim()}>{editingId ? '수정' : '등록'}</button>
      </div>
    </form>
  )

  return (
    <>
      <div className="sb-cmt-section">
        <div className="sb-cmt-head">
          <span>댓글 <span className="muted">{commentCount}</span></span>
          {showRefresh && (
            <button type="button" className="sb-cmt-refresh" onClick={doRefresh} disabled={refreshing}
              aria-label="새로고침" title="새로고침"><RefreshIcon spinning={refreshing} /></button>
          )}
        </div>
        {err && <div className="alert alert-error sb-cmt-err">{err}</div>}
        {loading ? <div className="spinner sm" /> : flat.length === 0 ? (
          <p className="comment-empty">아직 댓글이 없어요. 첫 댓글을 남겨 보세요.</p>
        ) : (
          <ul className="sb-cmt-list">{flat.map(renderRow)}</ul>
        )}
      </div>
      {bottomEl ? createPortal(composer, bottomEl) : composer}
    </>
  )
}

// ============ 글 상세 + 댓글 (페이지) ============
export function BoardPost() {
  const { groupId, postId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { isAdmin } = useAuth()

  const [post, setPost] = useState(location.state?.post || null)
  const [gone, setGone] = useState(false)
  const [headMenu, setHeadMenu] = useState(false)

  const loadPost = useCallback(async () => {
    try {
      const fresh = (await listBoardPosts(groupId)).find((x) => x.id === postId)
      if (fresh) setPost(fresh); else setGone(true)
    } catch { /* 기존 값 유지 */ }
  }, [groupId, postId])
  useEffect(() => { loadPost() }, [loadPost])

  if (!isAdmin) return <NotReady />

  async function removePost() {
    setHeadMenu(false)
    if (!confirm('이 글을 삭제할까요?')) return
    try { await deleteBoardPost(postId); navigate(boardPath(groupId), { replace: true }) } catch { /* noop */ }
  }

  if (gone) return <div className="page"><div className="comment-empty">삭제된 글이에요.</div></div>
  if (!post) return <div className="page"><div className="spinner" /></div>

  return (
    <div className="page sb-post-page">
      <div className="sb-post-head">
        <h2 className="sb-post-title">
          {post.prefix_label && <span className="sb-post-prefix">[{post.prefix_label}]</span>}
          {post.title}
        </h2>
        {(post.is_mine || post.can_delete) && (
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
                  {post.is_mine && <button type="button" onClick={() => { setHeadMenu(false); navigate(boardPath(groupId, `/${post.id}/edit`), { state: { post } }) }}>수정</button>}
                  {post.can_delete && <button type="button" className="menu-danger" onClick={removePost}>삭제</button>}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="sb-post-meta">{timeAgo(post.created_at)}{post.edited ? ' · 수정됨' : ''}</div>

      {post.body && <div className="sb-post-body">{post.body}</div>}

      <BoardCommentThread groupId={groupId} postId={postId} />
    </div>
  )
}

// ============ 댓글 상세 (글 본문 없이 댓글만 + 새로고침, 알림 포커스) ============
export function BoardComments() {
  const { groupId, postId } = useParams()
  const [sp] = useSearchParams()
  const { isAdmin } = useAuth()
  if (!isAdmin) return <NotReady />
  return (
    <div className="page sb-post-page sb-comments-page">
      <BoardCommentThread groupId={groupId} postId={postId} focusId={sp.get('c')} showRefresh />
    </div>
  )
}

// ---- 말머리 관리 (방장/관리자) — 목록에서 톱니바퀴로 여는 모달 ----
function PrefixManager({ groupId, prefixes, onClose, onChanged }) {
  const [items, setItems] = useState(prefixes)
  const [adding, setAdding] = useState('')
  const [editing, setEditing] = useState(null)
  const [editText, setEditText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { setItems(prefixes) }, [prefixes])

  async function add() {
    if (!adding.trim()) return
    setBusy(true); setErr('')
    try { await addBoardPrefix(groupId, adding.trim()); setAdding(''); await onChanged() }
    catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  async function save(id) {
    if (!editText.trim()) return
    setBusy(true); setErr('')
    try { await updateBoardPrefix(id, editText.trim()); setEditing(null); await onChanged() }
    catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  async function remove(id) {
    if (!confirm('이 말머리를 삭제할까요? 이 말머리가 달린 글은 말머리만 사라져요.')) return
    setErr('')
    try { await deleteBoardPrefix(id); await onChanged() } catch (e) { setErr(e.message) }
  }

  return (
    <Modal open onClose={onClose} cardClassName="sb-modal">
      <div className="sb-prefix-mgr">
        <h3 className="sb-modal-title">말머리 관리</h3>
        {err && <div className="alert alert-error">{err}</div>}
        <div className="sb-prefix-add">
          <input className="sb-input" placeholder="새 말머리 (20자 이내)" value={adding} maxLength={20}
            onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
          <button type="button" className="btn btn-primary sb-send" onClick={add} disabled={busy || !adding.trim()}>추가</button>
        </div>
        {items.length === 0 ? <p className="sb-nocomments">등록된 말머리가 없어요.</p> : (
          <ul className="sb-prefix-items">
            {items.map((pf) => (
              <li key={pf.id}>
                {editing === pf.id ? (
                  <>
                    <input className="sb-input" value={editText} maxLength={20} onChange={(e) => setEditText(e.target.value)} />
                    <button type="button" className="sb-link strong" onClick={() => save(pf.id)} disabled={busy}>저장</button>
                    <button type="button" className="sb-link" onClick={() => setEditing(null)}>취소</button>
                  </>
                ) : (
                  <>
                    <span className="sb-prefix-chip">[{pf.label}]</span>
                    <button type="button" className="sb-link" onClick={() => { setEditing(pf.id); setEditText(pf.label) }}>수정</button>
                    <button type="button" className="sb-link danger" onClick={() => remove(pf.id)}>삭제</button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}
