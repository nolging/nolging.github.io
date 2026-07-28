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

// 목록 시간표기: 오늘은 HH:MM, 자정 지난(다른 날) 글은 YYYY.MM.DD HH:MM
function boardTime(iso) {
  try {
    const d = new Date(iso), now = new Date()
    const p2 = (n) => String(n).padStart(2, '0')
    const hm = `${p2(d.getHours())}:${p2(d.getMinutes())}`
    const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
    return sameDay ? hm : `${d.getFullYear()}.${p2(d.getMonth() + 1)}.${p2(d.getDate())} ${hm}`
  } catch { return '' }
}
// 최근 24시간 내 글이면 N 배지
function isNewPost(iso) {
  try { return (Date.now() - new Date(iso).getTime()) < 86400000 } catch { return false }
}

// 드롭다운 아래 화살표(텍스트 문자 대신 SVG 로 정렬·굵기 통일)
const CaretDown = () => (
  <svg className="sb-caret" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="6 9 12 15 18 9" />
  </svg>
)

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
  const { setHeaderGear, setRefreshHandler } = useOutletContext()
  const uid = profile?.id

  const [group, setGroup] = useState(null)
  const [prefixes, setPrefixes] = useState([])
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [prefixMgr, setPrefixMgr] = useState(false)
  const [filterPrefix, setFilterPrefix] = useState('') // '' = 전체
  const [filterOpen, setFilterOpen] = useState(false)

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

  // 당겨서 새로고침(하단 게시글 목록) — Layout 의 PTR 에 새로고침 핸들러 등록
  useEffect(() => {
    setRefreshHandler(() => load)
    return () => setRefreshHandler(() => null)
  }, [setRefreshHandler, load])

  // 관리 권한이면 상단바 우측 톱니바퀴 → 말머리 관리. 페이지를 벗어나면 등록 해제.
  useEffect(() => {
    if (isAdmin && canManage) setHeaderGear(() => () => setPrefixMgr(true))
    else setHeaderGear(null)
    return () => setHeaderGear(null)
  }, [isAdmin, canManage, setHeaderGear])

  if (!isAdmin) return <NotReady />

  const shown = filterPrefix ? posts.filter((p) => p.prefix_id === filterPrefix) : posts
  const filterLabel = filterPrefix ? (prefixes.find((p) => p.id === filterPrefix)?.label || '말머리') : '말머리 선택'

  return (
    <div className="page sb-page sb-list-page">
      {/* 목록 헤더(고정): 좌 총 게시글 수, 우 말머리 선택(필터) — 스크롤/새로고침 영향 없음 */}
      <div className="sb-listhead">
        <span className="sb-total">전체 <b>{posts.length.toLocaleString('ko-KR')}</b></span>
        <div className="sb-prefilter">
          <button type="button" className="sb-prefilter-btn" onClick={() => setFilterOpen((o) => !o)}>
            {filterLabel}<CaretDown />
          </button>
          {filterOpen && (
            <>
              <div className="menu-backdrop" onClick={() => setFilterOpen(false)} />
              <div className="sb-prefilter-menu" role="menu">
                <button type="button" className={!filterPrefix ? 'on' : ''}
                  onClick={() => { setFilterPrefix(''); setFilterOpen(false) }}>전체</button>
                {prefixes.map((pf) => (
                  <button type="button" key={pf.id} className={filterPrefix === pf.id ? 'on' : ''}
                    onClick={() => { setFilterPrefix(pf.id); setFilterOpen(false) }}>{pf.label}</button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 이 아래(회색 여백 + 목록)만 스크롤/당겨서 새로고침 */}
      <div className="sb-scroll">
        {error && <div className="alert alert-error sb-cmt-err">{error}</div>}
        <div className="sb-gap" />
        {loading ? <div className="spinner" /> : shown.length === 0 ? (
          <div className="sb-empty">{filterPrefix ? '이 말머리의 글이 없어요.' : '아직 글이 없어요. 첫 글을 남겨 보세요.'}</div>
        ) : (
          <ul className="sb-rows">
            {shown.map((p) => (
              <li key={p.id}>
                <button type="button" className="sb-row"
                  onClick={() => navigate(boardPath(groupId, `/${p.id}`), { state: { post: p } })}>
                  <span className="sb-row-main">
                    <span className="sb-row-title">
                      {p.prefix_label && <span className="sb-prefix">[{p.prefix_label}]</span>}
                      <span className="sb-row-t">{p.title}</span>
                    </span>
                    <span className="sb-row-meta">
                      <span className="sb-row-time">{boardTime(p.created_at)}</span>
                      {isNewPost(p.created_at) && <span className="sb-n">N</span>}
                    </span>
                  </span>
                  {p.comment_count > 0 && <span className="sb-row-cc">{p.comment_count}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 하단 탭바(고정): 검색하기 · 글쓰기 */}
      <nav className="sb-tabbar">
        <button type="button" className="sb-tab" onClick={() => navigate(boardPath(groupId, '/search'))}>검색하기</button>
        <button type="button" className="sb-tab" onClick={() => navigate(boardPath(groupId, '/new'))}>글쓰기</button>
      </nav>

      {prefixMgr && (
        <PrefixManager groupId={groupId} prefixes={prefixes}
          onClose={() => setPrefixMgr(false)}
          onChanged={async () => setPrefixes(await listBoardPrefixes(groupId))} />
      )}
    </div>
  )
}

// ============ 글쓰기 / 수정 (페이지) — 상단바 ✕/등록, 말머리 드롭다운, 여백 없는 제목/본문 ============
export function BoardCompose() {
  const { groupId, postId } = useParams()   // postId 있으면 수정
  const navigate = useNavigate()
  const location = useLocation()
  const { isAdmin } = useAuth()
  const { setHeaderSubmit } = useOutletContext()
  const editing = !!postId

  const [prefixes, setPrefixes] = useState([])
  const [prefixId, setPrefixId] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [loaded, setLoaded] = useState(!editing)   // 새 글은 즉시 편집 가능
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [pfOpen, setPfOpen] = useState(false)

  useEffect(() => {
    let on = true
    listBoardPrefixes(groupId).then((pf) => { if (on) setPrefixes(pf) }).catch(() => { })
    if (editing) {
      const seed = location.state?.post
      const fill = (p) => { if (!p || !on) return; setPrefixId(p.prefix_id || ''); setTitle(p.title || ''); setBody(p.body || ''); setLoaded(true) }
      if (seed) fill(seed)
      else listBoardPosts(groupId).then((ps) => fill(ps.find((x) => x.id === postId))).catch(() => on && setLoaded(true))
    }
    return () => { on = false }
  }, [groupId, postId, editing, location.state])

  async function submit() {
    if (busy) return
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
  // 상단바 "등록" 이 최신 submit 을 호출하도록 ref 로 연결(한 번만 등록)
  const submitRef = useRef(submit)
  submitRef.current = submit
  useEffect(() => {
    setHeaderSubmit(() => () => submitRef.current())
    return () => setHeaderSubmit(null)
  }, [setHeaderSubmit])

  if (!isAdmin) return <NotReady />

  const prefixLabel = prefixId ? (prefixes.find((p) => p.id === prefixId)?.label || '말머리') : '말머리 없음'

  return (
    <div className="page sb-page sb-compose-page">
      {!loaded ? <div className="spinner" /> : (
        <>
          {err && <div className="alert alert-error sb-cmt-err">{err}</div>}
          <div className="sb-compose-head">
            <div className="sb-prefix-sel">
              <button type="button" className="sb-prefix-sel-btn" onClick={() => setPfOpen((o) => !o)}>
                {prefixLabel}<CaretDown />
              </button>
              {pfOpen && (
                <>
                  <div className="menu-backdrop" onClick={() => setPfOpen(false)} />
                  <div className="sb-prefix-menu" role="menu">
                    <button type="button" className={!prefixId ? 'on' : ''} onClick={() => { setPrefixId(''); setPfOpen(false) }}>말머리 없음</button>
                    {prefixes.map((pf) => (
                      <button type="button" key={pf.id} className={prefixId === pf.id ? 'on' : ''}
                        onClick={() => { setPrefixId(pf.id); setPfOpen(false) }}>{pf.label}</button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
          <input className="sb-title-input" placeholder="제목" value={title} maxLength={100}
            onChange={(e) => setTitle(e.target.value)} />
          <div className="sb-compose-div" />
          <textarea className="sb-body-area" placeholder="내용을 입력하세요" value={body} maxLength={5000}
            onChange={(e) => setBody(e.target.value)} />
        </>
      )}
    </div>
  )
}

// ============ 검색 (페이지) — 검색어 입력 + 게시글/댓글 탭 ============
export function BoardSearch() {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const [q, setQ] = useState('')
  const [tab, setTab] = useState('posts')  // posts | comments
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { listBoardPosts(groupId).then(setPosts).catch(() => { }).finally(() => setLoading(false)) }, [groupId])

  if (!isAdmin) return <NotReady />

  const kw = q.trim().toLowerCase()
  const results = kw ? posts.filter((p) => (p.title || '').toLowerCase().includes(kw) || (p.body || '').toLowerCase().includes(kw)) : []

  return (
    <div className="page sb-page sb-search-page">
      <div className="sb-search-box">
        <input className="sb-search-input" placeholder="검색어를 입력하세요" value={q} autoFocus
          onChange={(e) => setQ(e.target.value)} />
        {q && <button type="button" className="sb-search-clear" aria-label="지우기" onClick={() => setQ('')}>✕</button>}
      </div>

      <div className="sb-search-tabs">
        <button type="button" className={`sb-search-tab${tab === 'posts' ? ' on' : ''}`} onClick={() => setTab('posts')}>게시글</button>
        <button type="button" className={`sb-search-tab${tab === 'comments' ? ' on' : ''}`} onClick={() => setTab('comments')}>댓글</button>
      </div>

      {tab === 'posts' ? (
        loading ? <div className="spinner" /> : !kw ? (
          <div className="sb-search-hint">검색어를 입력하면 게시글을 찾아 드려요.</div>
        ) : results.length === 0 ? (
          <div className="sb-search-hint">‘{q}’에 대한 검색 결과가 없어요.</div>
        ) : (
          <ul className="sb-rows">
            {results.map((p) => (
              <li key={p.id}>
                <button type="button" className="sb-row"
                  onClick={() => navigate(boardPath(groupId, `/${p.id}`), { state: { post: p } })}>
                  <span className="sb-row-main">
                    <span className="sb-row-title">
                      {p.prefix_label && <span className="sb-prefix">[{p.prefix_label}]</span>}
                      <span className="sb-row-t">{p.title}</span>
                    </span>
                    <span className="sb-row-meta">
                      <span className="sb-row-time">{boardTime(p.created_at)}</span>
                      {isNewPost(p.created_at) && <span className="sb-n">N</span>}
                    </span>
                  </span>
                  {p.comment_count > 0 && <span className="sb-row-cc">{p.comment_count}</span>}
                </button>
              </li>
            ))}
          </ul>
        )
      ) : (
        <div className="sb-search-hint">댓글 검색은 준비 중이에요.</div>
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
