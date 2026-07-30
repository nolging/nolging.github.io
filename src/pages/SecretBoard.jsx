import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate, useLocation, useSearchParams, useOutletContext } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  getGroup, getGroupBoard, renameBoard, listBoardPrefixes, addBoardPrefix, updateBoardPrefix, deleteBoardPrefix,
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

// 접근 준비 안 됨(미개설 그룹) 공통 화면
const NotReady = () => (
  <div className="page sb-page">
    <div className="sb-soon"><span>🔒</span><p>비밀 게시판은 아직 준비 중이에요</p></div>
  </div>
)
const BoardLoading = () => <div className="page sb-page"><div className="spinner" /></div>

// 게시판 접근 권한: 개설된 그룹의 멤버(또는 앱 관리자 미리보기). 'loading' | 'ok' | 'no'
function useBoardAccess(groupId) {
  const { isAdmin } = useAuth()
  const [state, setState] = useState('loading')
  useEffect(() => {
    let on = true
    getGroupBoard(groupId)
      .then((name) => { if (on) setState((name || isAdmin) ? 'ok' : 'no') })
      .catch(() => { if (on) setState(isAdmin ? 'ok' : 'no') })
    return () => { on = false }
  }, [groupId, isAdmin])
  return state
}

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
  const [filterPrefix, setFilterPrefix] = useState('') // '' = 전체
  const [filterOpen, setFilterOpen] = useState(false)

  const access = useBoardAccess(groupId)
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

  // 관리 권한(방장/관리자)이면 상단바 우측 톱니바퀴 → 설정 페이지. 페이지를 벗어나면 등록 해제.
  useEffect(() => {
    if (canManage) setHeaderGear(() => () => navigate(boardPath(groupId, '/settings')))
    else setHeaderGear(null)
    return () => setHeaderGear(null)
  }, [canManage, setHeaderGear, navigate, groupId])

  if (access === 'loading') return <BoardLoading />
  if (access === 'no') return <NotReady />

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
              <li key={p.id} className={`sb-row${p.is_mine ? ' mine' : ''}`}>
                <button type="button" className="sb-row-main-btn"
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
                </button>
                {p.comment_count > 0 && (
                  <button type="button" className="sb-row-cc" aria-label="댓글 보기"
                    onClick={() => navigate(boardPath(groupId, `/${p.id}/comments`))}>
                    {p.comment_count}
                  </button>
                )}
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
    </div>
  )
}

// ============ 글쓰기 / 수정 (페이지) — 상단바 ✕/등록, 말머리 드롭다운, 여백 없는 제목/본문 ============
export function BoardCompose() {
  const { groupId, postId } = useParams()   // postId 있으면 수정
  const navigate = useNavigate()
  const location = useLocation()
  const { setHeaderSubmit } = useOutletContext()
  const access = useBoardAccess(groupId)
  const editing = !!postId

  const [prefixes, setPrefixes] = useState([])
  const [prefixId, setPrefixId] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')       // 초기 시드(HTML)
  const [loaded, setLoaded] = useState(!editing)   // 새 글은 즉시 편집 가능
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [pfOpen, setPfOpen] = useState(false)
  const [empty, setEmpty] = useState(true)
  const [titleFocused, setTitleFocused] = useState(false) // 제목 입력 포커스 시 스타일 툴바 숨김
  const [bodyFocused, setBodyFocused] = useState(false)   // 본문 포커스(키패드) 여부 → 툴바 하단 여백 조절
  const editorRef = useRef(null)
  const seededRef = useRef(false)
  const [bottomEl, setBottomEl] = useState(null)
  useEffect(() => { setBottomEl(document.getElementById('app-bottom')) }, [])

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

  // 에디터에 초기 본문 주입(HTML 은 새니타이즈, 옛 평문은 줄바꿈 보존)
  useEffect(() => {
    if (!loaded || !editorRef.current || seededRef.current) return
    seededRef.current = true
    const html = isHtml(body) ? sanitizeHtml(body) : escapeHtml(body).replace(/\n/g, '<br>')
    editorRef.current.innerHTML = html
    setEmpty(!editorRef.current.textContent.trim())
  }, [loaded, body])

  async function submit() {
    if (busy) return
    if (!title.trim()) { setErr('제목을 입력해 주세요.'); return }
    const el = editorRef.current
    const hasText = el ? !!el.textContent.trim() : false
    const bodyHtml = hasText ? sanitizeHtml(el.innerHTML) : ''
    setBusy(true); setErr('')
    try {
      if (editing) {
        await updateBoardPost(postId, prefixId, title.trim(), bodyHtml)
        navigate(boardPath(groupId, `/${postId}`), { replace: true })
      } else {
        const id = await createBoardPost(groupId, prefixId, title.trim(), bodyHtml)
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

  if (access === 'loading') return <BoardLoading />
  if (access === 'no') return <NotReady />

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
            onChange={(e) => setTitle(e.target.value)}
            onFocus={() => setTitleFocused(true)} onBlur={() => setTitleFocused(false)} />
          <div className="sb-compose-div" />
          <div className="sb-editor-wrap">
            {empty && <div className="sb-editor-ph">내용을 입력하세요</div>}
            <div className="sb-body-area sb-editor sb-rich" contentEditable suppressContentEditableWarning
              ref={editorRef} onInput={() => setEmpty(!editorRef.current.textContent.trim())}
              onFocus={() => setBodyFocused(true)} onBlur={() => setBodyFocused(false)}
              onPaste={(e) => {
                e.preventDefault()
                const html = e.clipboardData?.getData('text/html')
                const text = e.clipboardData?.getData('text/plain') || ''
                const clean = html ? sanitizeHtml(html) : escapeHtml(text).replace(/\n/g, '<br>')
                try { document.execCommand('insertHTML', false, clean) } catch { /* noop */ }
                setEmpty(!editorRef.current.textContent.trim())
              }} />
          </div>
          {bottomEl && !titleFocused && createPortal(<RichToolbar editorRef={editorRef} keyboardUp={bodyFocused} />, bottomEl)}
        </>
      )}
    </div>
  )
}

// 검색 옵션 드롭다운(범위/정렬)
function SearchDropdown({ value, options, onChange }) {
  const [open, setOpen] = useState(false)
  const cur = options.find((o) => o.value === value) || options[0]
  return (
    <div className="sb-sdrop">
      <button type="button" className="sb-sdrop-btn" onClick={() => setOpen((o) => !o)}>{cur.label}<CaretDown /></button>
      {open && (
        <>
          <div className="menu-backdrop" onClick={() => setOpen(false)} />
          <div className="sb-sdrop-menu" role="menu">
            {options.map((o) => (
              <button type="button" key={o.value} className={o.value === value ? 'on' : ''}
                onClick={() => { onChange(o.value); setOpen(false) }}>{o.label}</button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// 댓글 수 원형(검색 결과 공용) — 누르면 해당 글 댓글 상세로
function CommentCountBadge({ count, onClick }) {
  return (
    <span className="sb-scc" role="button" tabIndex={0} aria-label="댓글 보기"
      onClick={(e) => { e.stopPropagation(); onClick() }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onClick() } }}>
      <span className="sb-scc-ico">💬</span>{count}
    </span>
  )
}

// ============ 검색 (페이지) — 검색어 + 게시글/댓글 탭 + 범위·정렬, 키워드 볼드 ============
export function BoardSearch() {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const access = useBoardAccess(groupId)
  const [q, setQ] = useState('')
  const [tab, setTab] = useState('posts')       // posts | comments
  const [scope, setScope] = useState('both')    // both | title | body (게시글)
  const [sort, setSort] = useState('recent')    // recent | comments (게시글)
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [allComments, setAllComments] = useState(null)  // null=미로딩
  const [cLoading, setCLoading] = useState(false)

  useEffect(() => { listBoardPosts(groupId).then(setPosts).catch(() => { }).finally(() => setLoading(false)) }, [groupId])

  // 댓글 탭 최초 진입 시 모든 글의 댓글을 모아 로딩(원문 제목 포함)
  useEffect(() => {
    if (tab !== 'comments' || allComments !== null || cLoading || loading) return
    setCLoading(true)
    ;(async () => {
      try {
        const lists = await Promise.all(posts.map((p) =>
          listBoardComments(p.id).then((cs) => cs.map((c) => ({ ...c, post_id: p.id, post_title: p.title }))).catch(() => [])))
        setAllComments(lists.flat())
      } finally { setCLoading(false) }
    })()
  }, [tab, allComments, cLoading, loading, posts])

  const kw = q.trim().toLowerCase()

  const postResults = useMemo(() => {
    if (!kw) return []
    const inScope = (p) => {
      const t = (p.title || '').toLowerCase().includes(kw)
      const b = stripHtml(p.body).toLowerCase().includes(kw)
      return scope === 'title' ? t : scope === 'body' ? b : (t || b)
    }
    const arr = posts.filter(inScope)
    return sort === 'comments'
      ? arr.slice().sort((a, b) => (b.comment_count || 0) - (a.comment_count || 0))
      : arr.slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  }, [kw, posts, scope, sort])

  const commentResults = useMemo(() => {
    if (!kw || !allComments) return []
    return allComments
      .filter((c) => !c.deleted && (c.body || '').toLowerCase().includes(kw))
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))   // 최신순 고정
  }, [kw, allComments])

  if (access === 'loading') return <BoardLoading />
  if (access === 'no') return <NotReady />

  const count = tab === 'posts' ? postResults.length : commentResults.length

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

      {!kw ? (
        <div className="sb-search-hint">검색어를 입력하면 {tab === 'posts' ? '게시글' : '댓글'}을 찾아 드려요.</div>
      ) : (
        <>
          <div className="sb-searchbar">
            <span className="sb-searchcount">{count.toLocaleString('ko-KR')}건</span>
            <div className="sb-searchopts">
              {tab === 'posts' && (
                <SearchDropdown value={scope} onChange={setScope}
                  options={[{ value: 'both', label: '제목+내용' }, { value: 'title', label: '제목' }, { value: 'body', label: '내용' }]} />
              )}
              {tab === 'posts'
                ? <SearchDropdown value={sort} onChange={setSort}
                  options={[{ value: 'recent', label: '최신순' }, { value: 'comments', label: '댓글순' }]} />
                : <span className="sb-sortfixed">최신순</span>}
            </div>
          </div>

          {tab === 'posts' ? (
            loading ? <div className="spinner" /> : postResults.length === 0 ? (
              <div className="sb-search-hint">‘{q}’에 대한 검색 결과가 없어요.</div>
            ) : (
              <ul className="sb-srows">
                {postResults.map((p) => (
                  <li key={p.id}>
                    <button type="button" className="sb-srow"
                      onClick={() => navigate(boardPath(groupId, `/${p.id}`), { state: { post: p } })}>
                      <span className="sb-srow-main">
                        <span className="sb-srow-title">
                          {p.prefix_label && <span className="sb-prefix">[{p.prefix_label}]</span>}
                          {boldText(p.title, q)}
                        </span>
                        {stripHtml(p.body) && <span className="sb-srow-body">{boldText(stripHtml(p.body), q)}</span>}
                        <span className="sb-srow-time">{boardTime(p.created_at)}</span>
                      </span>
                      {p.comment_count > 0 && (
                        <CommentCountBadge count={p.comment_count}
                          onClick={() => navigate(boardPath(groupId, `/${p.id}/comments`))} />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : (
            cLoading || allComments === null ? <div className="spinner" /> : commentResults.length === 0 ? (
              <div className="sb-search-hint">‘{q}’에 대한 검색 결과가 없어요.</div>
            ) : (
              <ul className="sb-srows">
                {commentResults.map((c) => (
                  <li key={c.id}>
                    <button type="button" className="sb-srow sb-crow"
                      onClick={() => navigate(boardPath(groupId, `/${c.post_id}/comments?c=${c.id}`))}>
                      <span className="sb-crow-body">{boldText(c.body, q)}</span>
                      <span className="sb-crow-origin">
                        <span className="sb-origin-badge">원문</span>
                        <span className="sb-origin-title">{c.post_title}</span>
                      </span>
                      <span className="sb-srow-time">{boardTime(c.created_at)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          )}
        </>
      )}
    </div>
  )
}

// 새로고침 아이콘 — 오른쪽(시계방향)으로 도는 화살표 하나
const RefreshIcon = ({ spinning }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={spinning ? 'sb-spin' : ''}>
    <polyline points="23 4 23 10 17 10" />
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
  </svg>
)
// 세로 점 3개(더보기)
const DotsIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" />
  </svg>
)
// 작은 연필(댓글쓰기)
const PencilMini = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
)
// 시계(글 작성 시간 앞)
const ClockIcon = () => (
  <svg className="sb-clock" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" />
  </svg>
)
// 오른쪽 화살표(댓글 전체 보기)
const ChevronRight = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="9 6 15 12 9 18" />
  </svg>
)
// 검색 결과 이동(아래=다음, 위=이전)
const ChevronDown = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
)
const ChevronUp = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="18 15 12 9 6 15" /></svg>
)
// 검색어 위치를 찾아 render(부분문자열, key)로 감싸 반환(대소문자 무시)
function markMatches(text, term, render) {
  const t = (term || '').toLowerCase()
  if (!t) return text
  const low = (text || '').toLowerCase()
  const out = []; let i = 0, k = 0
  for (;;) {
    const idx = low.indexOf(t, i)
    if (idx === -1) { out.push(text.slice(i)); break }
    if (idx > i) out.push(text.slice(i, idx))
    out.push(render(text.slice(idx, idx + t.length), k++))
    i = idx + t.length
  }
  return out
}
// 노란 하이라이팅(댓글 상세) / 볼드(검색 결과)
const highlightText = (text, term) => markMatches(text, term, (s, k) => <mark key={k} className="sb-hl">{s}</mark>)
const boldText = (text, term) => markMatches(text, term, (s, k) => <b key={k} className="sb-kw">{s}</b>)

// ---- 글 본문 리치 텍스트: 허용 태그/스타일만 남기는 새니타이저(붙여넣기·XSS 방지) ----
const RICH_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'SPAN', 'DIV', 'P', 'BR'])
const RICH_STYLES = ['color', 'background-color', 'text-align', 'font-weight', 'font-style', 'text-decoration', 'text-decoration-line', 'text-decoration-style']
function sanitizeHtml(html) {
  const tpl = document.createElement('template')
  tpl.innerHTML = html || ''
  tpl.content.querySelectorAll('script,style,iframe,object,embed,link,meta,img,svg,video,audio,a,button,input').forEach((el) => el.remove())
  // 허용 안 된 태그는 껍데기만 벗기고 내용은 유지
  let guard = 0
  for (;;) {
    const bad = [...tpl.content.querySelectorAll('*')].find((el) => !RICH_TAGS.has(el.tagName))
    if (!bad || guard++ > 5000) break
    const parent = bad.parentNode
    while (bad.firstChild) parent.insertBefore(bad.firstChild, bad)
    parent.removeChild(bad)
  }
  // 속성 정리: style 의 허용 속성만
  tpl.content.querySelectorAll('*').forEach((el) => {
    const style = el.getAttribute('style')
    ;[...el.attributes].forEach((a) => el.removeAttribute(a.name))
    if (style) {
      const kept = style.split(';').map((s) => s.trim()).filter(Boolean).filter((decl) => {
        const i = decl.indexOf(':'); if (i < 0) return false
        const prop = decl.slice(0, i).trim().toLowerCase()
        const val = decl.slice(i + 1).trim().toLowerCase()
        return RICH_STYLES.includes(prop) && !/url\(|expression|javascript:/.test(val)
      })
      if (kept.length) el.setAttribute('style', kept.join('; '))
    }
  })
  return tpl.innerHTML
}
const isHtml = (s) => typeof s === 'string' && /<[a-z][\s\S]*>/i.test(s)
const escapeHtml = (s) => (s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
// 목록/검색 미리보기용 한 줄 텍스트(HTML 제거)
function stripHtml(s) {
  if (!s) return ''
  if (!/[<&]/.test(s)) return s
  const d = document.createElement('div'); d.innerHTML = sanitizeHtml(s)
  return (d.textContent || '').replace(/\s+/g, ' ').trim()
}

// 리치 텍스트 편집 툴바(글쓰기 하단 고정) — execCommand 기반
const RT_TEXT_COLORS = ['#191722', '#8b8798', '#e5484d', '#f0762b', '#f5b301', '#2fa84f', '#3b82f6', '#7363e8']
const RT_BG_COLORS = ['#fff08a', '#ffd3d3', '#d6f5d6', '#d0e4ff', '#e6ddff', '#ffe0b3', '#e8e8ee', 'transparent']
const AlignIcon = ({ kind }) => {
  const lines = kind === 'center' ? [[6, 6, 18, 6], [3, 12, 21, 12], [6, 18, 18, 18]]
    : kind === 'right' ? [[8, 6, 21, 6], [3, 12, 21, 12], [8, 18, 21, 18]]
      : [[3, 6, 16, 6], [3, 12, 21, 12], [3, 18, 16, 18]]
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      {lines.map((l, i) => <line key={i} x1={l[0]} y1={l[1]} x2={l[2]} y2={l[3]} />)}
    </svg>
  )
}
function RichToolbar({ editorRef, keyboardUp }) {
  const [palette, setPalette] = useState(null)   // 'fore' | 'back' | null
  const exec = (cmd, val) => {
    const el = editorRef.current; if (!el) return
    el.focus()
    try { document.execCommand('styleWithCSS', false, true) } catch { /* noop */ }
    try { document.execCommand(cmd, false, val) } catch { /* noop */ }
  }
  const Btn = ({ cmd, label, style, ariaLabel }) => (
    <button type="button" className="sb-rt-btn" aria-label={ariaLabel} style={style}
      onMouseDown={(e) => { e.preventDefault(); exec(cmd) }}>{label}</button>
  )
  return (
    <div className={`sb-rttoolbar${keyboardUp ? '' : ' rest'}`}>
      {palette && (
        <div className="sb-rt-palette" onMouseDown={(e) => e.preventDefault()}>
          {(palette === 'fore' ? RT_TEXT_COLORS : RT_BG_COLORS).map((c) => (
            <button type="button" key={c} className={`sb-rt-swatch${c === 'transparent' ? ' none' : ''}`}
              style={c === 'transparent' ? undefined : { background: c }}
              onMouseDown={(e) => { e.preventDefault(); exec(palette === 'fore' ? 'foreColor' : 'hiliteColor', c === 'transparent' ? 'transparent' : c); setPalette(null) }} />
          ))}
        </div>
      )}
      <div className="sb-rt-row">
        <Btn cmd="bold" label="B" ariaLabel="굵게" style={{ fontWeight: 800 }} />
        <Btn cmd="italic" label="I" ariaLabel="기울임" style={{ fontStyle: 'italic', fontFamily: 'serif' }} />
        <Btn cmd="underline" label="U" ariaLabel="밑줄" style={{ textDecoration: 'underline' }} />
        <Btn cmd="strikeThrough" label="S" ariaLabel="취소선" style={{ textDecoration: 'line-through' }} />
        <span className="sb-rt-sep" />
        <button type="button" className="sb-rt-btn" aria-label="글자색"
          onMouseDown={(e) => { e.preventDefault(); setPalette((v) => v === 'fore' ? null : 'fore') }}><span className="sb-rt-a">가</span></button>
        <button type="button" className="sb-rt-btn" aria-label="배경색"
          onMouseDown={(e) => { e.preventDefault(); setPalette((v) => v === 'back' ? null : 'back') }}><span className="sb-rt-a bg">가</span></button>
        <span className="sb-rt-sep" />
        <button type="button" className="sb-rt-btn" aria-label="왼쪽 정렬" onMouseDown={(e) => { e.preventDefault(); exec('justifyLeft') }}><AlignIcon kind="left" /></button>
        <button type="button" className="sb-rt-btn" aria-label="가운데 정렬" onMouseDown={(e) => { e.preventDefault(); exec('justifyCenter') }}><AlignIcon kind="center" /></button>
        <button type="button" className="sb-rt-btn" aria-label="오른쪽 정렬" onMouseDown={(e) => { e.preventDefault(); exec('justifyRight') }}><AlignIcon kind="right" /></button>
      </div>
    </div>
  )
}
// 답글 들여쓰기 ㄴ(└) 표시
const ReplyCorner = () => (
  <svg className="sb-cmt-corner" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M7 4v11h11" /></svg>
)

// ---- 댓글 상태·동작 공용 훅(글 상세·댓글 상세). 익명, 대댓글 1단계, 삭제 자리표시자 ----
function useBoardComments(postId, focusId) {
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [editingId, setEditingId] = useState(null)     // 입력창에서 수정 중인 댓글 id
  const [replyParent, setReplyParent] = useState(null) // 답글을 달 부모 댓글
  const [menuId, setMenuId] = useState(null)           // ⋮ 메뉴가 열린 댓글 id
  const [flashId, setFlashId] = useState(null)         // 강조(작성/수정/포커스) 대상
  const [err, setErr] = useState('')
  const inputRef = useRef(null)
  const didFocus = useRef(false)

  const loadComments = useCallback(async () => {
    try { setComments(await listBoardComments(postId)) } catch (e) { setErr(e.message) } finally { setLoading(false) }
  }, [postId])
  useEffect(() => { loadComments() }, [loadComments])

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
  // 알림/검색에서 넘어온 포커스 대상: 로딩 후 한 번 화면 안으로 스크롤(강조 없음)
  useEffect(() => {
    if (!focusId || loading || didFocus.current) return
    didFocus.current = true
    const t = setTimeout(() => document.querySelector(`[data-cid="${focusId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80)
    return () => clearTimeout(t)
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

  const doRefresh = useCallback(async () => { setRefreshing(true); setErr(''); await loadComments(); setTimeout(() => setRefreshing(false), 300) }, [loadComments])
  async function submit(e) {
    if (e?.preventDefault) e.preventDefault()
    if (!body.trim() || sending) return
    setSending(true); setErr('')
    try {
      let targetId
      if (editingId) { await updateBoardComment(editingId, body.trim()); targetId = editingId; setEditingId(null) }
      else { targetId = await addBoardComment(postId, replyParent?.id || null, body.trim()); setReplyParent(null) }
      setBody(''); await loadComments()
      setFlashId(targetId || null)
      inputRef.current?.focus()   // 등록 후에도 입력 유지(키패드 내려가지 않게)
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

  return {
    comments, loading, refreshing, commentCount, flat, body, setBody, sending,
    editingId, replyParent, menuId, setMenuId, flashId, err, inputRef,
    loadComments, doRefresh, submit, removeComment, startEdit, replyTo, cancelCompose,
  }
}

// 댓글 목록(공용). boardTime 형식 시간, ⋮ 메뉴(답글/수정/삭제)
// limit 주면 마지막 limit개만 보여주고, 초과 시 상단에 '댓글 전체 보기' 바(onSeeAll).
// rows 주면 그 목록을 그대로 노출(검색 '내댓글' 필터 등). highlight 주면 본문에서 검색어 강조.
function CommentList({ h, onReply, onEdit, limit, onSeeAll, rows, highlight, emptyText }) {
  const { flat, loading, menuId, setMenuId, flashId, removeComment } = h
  if (loading) return <div className="spinner sm" />
  if (flat.length === 0) return <p className="comment-empty">아직 댓글이 없어요. 첫 댓글을 남겨 보세요.</p>
  const truncated = !rows && limit && flat.length > limit
  const visible = rows ? rows : (truncated ? flat.slice(-limit) : flat)
  if (rows && visible.length === 0) return <p className="comment-empty">{emptyText || '표시할 댓글이 없어요.'}</p>
  return (
    <>
      {truncated && (
        <button type="button" className="sb-seeall" onClick={onSeeAll}>댓글 전체 보기 <ChevronRight /></button>
      )}
      <ul className="sb-cmt-list">
      {visible.map(({ c, depth }) => {
        if (c.deleted) {
          return (
            <li key={c.id} data-cid={c.id} className={`sb-cmt-row${depth ? ' reply' : ''} deleted${flashId === c.id ? ' hl' : ''}`}>
              {depth === 1 && <ReplyCorner />}
              <p className="sb-cmt-text sb-deleted">삭제된 댓글입니다.</p>
            </li>
          )
        }
        const hasMenu = depth === 0 || c.is_mine || c.can_delete
        return (
          <li key={c.id} data-cid={c.id} className={`sb-cmt-row${depth ? ' reply' : ''}${c.is_mine ? ' mine' : ''}${flashId === c.id ? ' hl' : ''}`}>
            {depth === 1 && <ReplyCorner />}
            <div className="sb-cmt-meta">
              <span className="sb-cmt-time">{boardTime(c.created_at)}</span>
              {hasMenu && (
                <div className="comment-menu-wrap">
                  <button className="comment-menu-btn" aria-label="더보기" onClick={() => setMenuId(menuId === c.id ? null : c.id)}>
                    <DotsIcon />
                  </button>
                  {menuId === c.id && (
                    <>
                      <div className="menu-backdrop" onClick={() => setMenuId(null)} />
                      <div className="menu-pop" role="menu">
                        {depth === 0 && <button type="button" onClick={() => onReply(c)}>답글 달기</button>}
                        {c.is_mine && <button type="button" onClick={() => onEdit(c)}>수정</button>}
                        {c.can_delete && <button type="button" className="menu-danger" onClick={() => removeComment(c.id)}>삭제</button>}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
            <p className="sb-cmt-text">{highlight ? highlightText(c.body, highlight) : c.body}</p>
          </li>
        )
      })}
      </ul>
    </>
  )
}

// 하단 고정 댓글 입력창(공용). onClose 주면 ✕(닫기) 노출, onFocus/onBlur 로 열림 상태 제어
function CommentComposer({ h, onClose, onFocus, onBlur }) {
  const { body, setBody, sending, editingId, replyParent, inputRef, submit, cancelCompose } = h
  const showTag = editingId || replyParent
  return (
    <form className="composer" onSubmit={submit}>
      {(showTag || onClose) && (
        <div className="composer-tag">
          <span className="composer-tag-text">{editingId ? '댓글 수정 중' : replyParent ? '답글 작성 중' : '댓글 작성'}</span>
          <button type="button" className="composer-cancel" aria-label="닫기" title="닫기"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { cancelCompose(); onClose?.() }}>✕</button>
        </div>
      )}
      <div className="composer-row">
        <textarea ref={inputRef} className="composer-input" value={body} rows={1} maxLength={2000}
          onChange={(e) => setBody(e.target.value)} onFocus={onFocus} onBlur={onBlur}
          placeholder={editingId ? '댓글 수정…' : replyParent ? '답글을 입력하세요' : '댓글을 입력하세요'} />
        <button className="btn btn-primary" disabled={sending || !body.trim()}
          onMouseDown={(e) => e.preventDefault()}>{editingId ? '수정' : '등록'}</button>
      </div>
    </form>
  )
}

// ---- 하단 바 ↔ 입력창 토글(글 상세·댓글 상세 공용) ----
// 기본은 하단 바, '댓글 쓰기'/답글/수정 시 입력창(키패드) 노출. 비었을 때 blur 되면 다시 하단 바.
function useComposerToggle(h) {
  const [composing, setComposing] = useState(false)
  const closeTimer = useRef(null)
  const latest = useRef({})
  latest.current = { body: h.body, editingId: h.editingId, replyParent: h.replyParent }
  useEffect(() => { if (composing) h.inputRef.current?.focus() }, [composing]) // eslint-disable-line react-hooks/exhaustive-deps
  const openComposer = () => setComposing(true)
  const closeComposer = () => { h.cancelCompose(); setComposing(false) }
  const onComposerFocus = () => { if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null } }
  const onComposerBlur = () => {
    closeTimer.current = setTimeout(() => {
      const s = latest.current
      if (!s.body.trim() && !s.editingId && !s.replyParent) setComposing(false)
    }, 250)
  }
  const handleReply = (c) => { h.replyTo(c); setComposing(true) }
  const handleEdit = (c) => { h.startEdit(c); setComposing(true) }
  return { composing, openComposer, closeComposer, onComposerFocus, onComposerBlur, handleReply, handleEdit }
}

// ============ 글 상세 + 댓글 (페이지) ============
// 카페형: 제목/작성시간+댓글수, 본문, 댓글, 댓글쓰기, 이전·다음 글, 하단 바[댓글쓰기·댓글 N·새로고침].
// 수정/삭제 ⋮ 는 상단바(권한자만). 하단 바 대신 댓글쓰기 누르면 입력창(키패드) 노출.
export function BoardPost() {
  const { groupId, postId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { setHeaderPostMenu, setRefreshHandler } = useOutletContext()
  const access = useBoardAccess(groupId)

  const h = useBoardComments(postId, null)
  const c = useComposerToggle(h)
  const [posts, setPosts] = useState(location.state?.post ? [location.state.post] : [])
  const [post, setPost] = useState(location.state?.post || null)
  const [gone, setGone] = useState(false)
  const [bottomEl, setBottomEl] = useState(null)

  const loadPost = useCallback(async () => {
    try {
      const list = await listBoardPosts(groupId)
      setPosts(list)
      const fresh = list.find((x) => x.id === postId)
      if (fresh) setPost(fresh); else setGone(true)
    } catch { /* 기존 값 유지 */ }
  }, [groupId, postId])
  useEffect(() => { loadPost() }, [loadPost])

  useEffect(() => { setBottomEl(document.getElementById('app-bottom')) }, [])

  // 당겨서 새로고침 = 글 + 댓글 다시 불러오기
  const refreshAll = useCallback(async () => { await Promise.all([loadPost(), h.loadComments()]) }, [loadPost, h.loadComments])
  useEffect(() => {
    setRefreshHandler(() => refreshAll)
    return () => setRefreshHandler(() => null)
  }, [setRefreshHandler, refreshAll])

  // 삭제 핸들러(상단바 메뉴가 참조) — 최신 유지
  const removePost = useCallback(async () => {
    if (!confirm('이 글을 삭제할까요?')) return
    try { await deleteBoardPost(postId); navigate(boardPath(groupId), { replace: true }) } catch { /* noop */ }
  }, [postId, groupId, navigate])

  // 수정/삭제 ⋮ 를 상단바에 등록(권한자만)
  useEffect(() => {
    if (post && (post.is_mine || post.can_delete)) {
      const items = []
      if (post.is_mine) items.push({ label: '수정', onClick: () => navigate(boardPath(groupId, `/${post.id}/edit`), { state: { post } }) })
      if (post.can_delete) items.push({ label: '삭제', danger: true, onClick: removePost })
      setHeaderPostMenu({ items })
    } else setHeaderPostMenu(null)
    return () => setHeaderPostMenu(null)
  }, [post, groupId, navigate, removePost, setHeaderPostMenu])

  if (access === 'loading') return <BoardLoading />
  if (access === 'no') return <NotReady />
  if (gone) return <div className="page"><div className="comment-empty">삭제된 글이에요.</div></div>
  if (!post) return <div className="page"><div className="spinner" /></div>

  const idx = posts.findIndex((p) => p.id === postId)
  const newer = idx > 0 ? posts[idx - 1] : null   // 목록은 최신순 → 앞쪽이 새 글
  const older = idx >= 0 && idx < posts.length - 1 ? posts[idx + 1] : null
  const goPost = (p) => navigate(boardPath(groupId, `/${p.id}`), { state: { post: p } })

  const navRow = (p, label) => (
    <button type="button" className="sb-navrow" onClick={() => goPost(p)}>
      <span className="sb-navlabel">{label}</span>
      <span className="sb-navtitle">
        {p.prefix_label && <span className="sb-navprefix">[{p.prefix_label}]</span>}{p.title}
        {p.comment_count > 0 && <span className="sb-navcount"> ({p.comment_count})</span>}
      </span>
    </button>
  )

  const bottomBar = (
    <nav className="sb-detail-bar">
      <button type="button" className="sb-detail-btn" onClick={c.openComposer}><span>댓글 쓰기</span></button>
      <button type="button" className="sb-detail-btn" onClick={() => navigate(boardPath(groupId, `/${postId}/comments`))}>
        <span>댓글 {h.commentCount}</span>
      </button>
      <button type="button" className="sb-detail-btn sb-detail-refresh" onClick={h.doRefresh} disabled={h.refreshing}
        aria-label="새로고침" title="새로고침"><RefreshIcon spinning={h.refreshing} /></button>
    </nav>
  )
  const composer = <CommentComposer h={h} onClose={c.closeComposer} onFocus={c.onComposerFocus} onBlur={c.onComposerBlur} />

  return (
    <div className="page sb-post-page sb-detail">
      <div className="sb-post-head">
        <h2 className="sb-post-title">
          {post.prefix_label && <span className="sb-post-prefix">[{post.prefix_label}]</span>}
          {post.title}
        </h2>
      </div>

      <div className="sb-post-meta">
        <span className="sb-post-time"><ClockIcon />{boardTime(post.created_at)}</span>
        {h.commentCount > 0 && <span className="sb-post-cc">{h.commentCount}</span>}
      </div>

      {post.body && (isHtml(post.body)
        ? <div className="sb-post-body sb-rich" dangerouslySetInnerHTML={{ __html: sanitizeHtml(post.body) }} />
        : <div className="sb-post-body">{post.body}</div>)}

      <div className="sb-cmt-section">
        <div className="sb-cmt-head"><span>댓글 <span className="muted">{h.commentCount}</span></span></div>
        {h.err && <div className="alert alert-error sb-cmt-err">{h.err}</div>}
        <CommentList h={h} onReply={c.handleReply} onEdit={c.handleEdit} limit={10}
          onSeeAll={() => navigate(boardPath(groupId, `/${postId}/comments`))} />
      </div>

      <button type="button" className="sb-write-pill" onClick={c.openComposer}><PencilMini />댓글 쓰기</button>

      {(newer || older) && (
        <div className="sb-navposts">
          {older && navRow(older, '이전')}
          {newer && navRow(newer, '다음')}
        </div>
      )}

      {bottomEl && createPortal(c.composing ? composer : bottomBar, bottomEl)}
    </div>
  )
}

// ============ 댓글 상세 (글 본문 없이 댓글만, 알림 포커스) ============
// 하단 바[댓글 쓰기·원문 보기·첫 댓글로·새로고침] + 댓글 쓰기 시 입력창 토글.
export function BoardComments() {
  const { groupId, postId } = useParams()
  const navigate = useNavigate()
  const [sp] = useSearchParams()
  const { setRefreshHandler, setHeaderCommentCount, commentSearch } = useOutletContext()
  const access = useBoardAccess(groupId)

  const h = useBoardComments(postId, sp.get('c'))
  const c = useComposerToggle(h)
  const [bottomEl, setBottomEl] = useState(null)
  const [curMatch, setCurMatch] = useState(0)   // 현재 검색 결과(몇 번째)
  useEffect(() => { setBottomEl(document.getElementById('app-bottom')) }, [])

  const searching = !!commentSearch?.open
  const mineOnly = !!commentSearch?.mineOnly
  const term = (commentSearch?.term || '').trim()

  // 내댓글만 보기(검색 중). 그 외에는 전체.
  const rows = useMemo(() => (searching && mineOnly ? h.flat.filter(({ c }) => c.is_mine) : (searching ? h.flat : null)),
    [searching, mineOnly, h.flat])
  // 검색어가 포함된 댓글 목록(이동 대상) — 하이라이팅과 동일 기준
  const matches = useMemo(() => {
    if (!term) return []
    const kw = term.toLowerCase()
    const base = rows || h.flat
    return base.filter(({ c }) => !c.deleted && (c.body || '').toLowerCase().includes(kw)).map(({ c }) => c.id)
  }, [term, rows, h.flat])

  // 상단바에 댓글 수 표기
  useEffect(() => {
    setHeaderCommentCount(h.commentCount)
    return () => setHeaderCommentCount(null)
  }, [setHeaderCommentCount, h.commentCount])

  // 당겨서 새로고침 = 댓글 다시 불러오기
  useEffect(() => {
    setRefreshHandler(() => h.loadComments)
    return () => setRefreshHandler(() => null)
  }, [setRefreshHandler, h.loadComments])

  // 검색 결과가 바뀌면 첫 번째로, 현재 결과로 스크롤
  useEffect(() => { setCurMatch(0) }, [term, mineOnly])
  useEffect(() => {
    if (!term || matches.length === 0) return
    const id = matches[Math.min(curMatch, matches.length - 1)]
    const t = setTimeout(() => document.querySelector(`[data-cid="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60)
    return () => clearTimeout(t)
  }, [term, matches, curMatch])

  if (access === 'loading') return <BoardLoading />
  if (access === 'no') return <NotReady />

  const scrollFirst = () => document.querySelector('.sb-cmt-row')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  // 새로고침 후 가장 최근 댓글(맨 아래)로 스크롤
  const refreshToBottom = async () => {
    await h.doRefresh()
    setTimeout(() => {
      const rs = document.querySelectorAll('.sb-cmt-row')
      rs[rs.length - 1]?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }, 80)
  }

  const bottomBar = (
    <nav className="sb-detail-bar">
      <button type="button" className="sb-detail-btn" onClick={c.openComposer}><span>댓글 쓰기</span></button>
      <button type="button" className="sb-detail-btn" onClick={() => navigate(boardPath(groupId, `/${postId}`))}><span>원문 보기</span></button>
      <button type="button" className="sb-detail-btn" onClick={scrollFirst}><span>첫 댓글로</span></button>
      <button type="button" className="sb-detail-btn sb-detail-refresh" onClick={refreshToBottom} disabled={h.refreshing}
        aria-label="새로고침" title="새로고침"><RefreshIcon spinning={h.refreshing} /></button>
    </nav>
  )
  const composer = <CommentComposer h={h} onClose={c.closeComposer} onFocus={c.onComposerFocus} onBlur={c.onComposerBlur} />

  // 검색어 확정(term) 시: 결과 이동 바(아래=다음 · n/총 · 위=이전)
  const total = matches.length
  const cur = total ? Math.min(curMatch, total - 1) : 0
  const searchNav = (
    <nav className="sb-detail-bar sb-searchnav">
      <button type="button" className="sb-detail-btn" aria-label="다음 결과" disabled={total <= 1}
        onClick={() => setCurMatch((m) => Math.min(total - 1, m + 1))}><ChevronDown /></button>
      <span className="sb-searchnav-count">{total ? cur + 1 : 0}/{total}</span>
      <button type="button" className="sb-detail-btn" aria-label="이전 결과" disabled={total <= 1}
        onClick={() => setCurMatch((m) => Math.max(0, m - 1))}><ChevronUp /></button>
    </nav>
  )

  // 하단 슬롯: 검색어 확정 시 결과 이동 바 / 검색 입력 중(term 없음)엔 비움 / 평소엔 하단 바·입력창
  let bottom = null
  if (searching) bottom = term ? searchNav : null
  else bottom = c.composing ? composer : bottomBar

  return (
    <div className="page sb-post-page sb-comments-page">
      <div className="sb-cmt-section">
        {h.err && <div className="alert alert-error sb-cmt-err">{h.err}</div>}
        <CommentList h={h} onReply={c.handleReply} onEdit={c.handleEdit}
          rows={rows} highlight={searching ? term : ''} emptyText={mineOnly ? '내가 쓴 댓글이 없어요.' : '표시할 댓글이 없어요.'} />
      </div>
      {bottomEl && bottom && createPortal(bottom, bottomEl)}
    </div>
  )
}

// ============ 비밀 게시판 설정 (이름 변경 + 말머리 관리) — 방장/관리자 ============
export function BoardSettings() {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const { profile, isAdmin } = useAuth()
  const uid = profile?.id
  const access = useBoardAccess(groupId)

  const [group, setGroup] = useState(null)
  const [name, setName] = useState('')        // 저장된 현재 이름
  const [nameInput, setNameInput] = useState('')
  const [prefixes, setPrefixes] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingName, setSavingName] = useState(false)
  const [nameErr, setNameErr] = useState('')
  const [nameSaved, setNameSaved] = useState(false)

  const load = useCallback(async () => {
    try {
      const [g, nm, pf] = await Promise.all([
        getGroup(groupId).catch(() => null),
        getGroupBoard(groupId).catch(() => ''),
        listBoardPrefixes(groupId),
      ])
      setGroup(g); setName(nm || ''); setNameInput(nm || ''); setPrefixes(pf)
    } finally { setLoading(false) }
  }, [groupId])
  useEffect(() => { load() }, [load])

  const canManage = isAdmin || (group && group.owner_id === uid)

  async function saveName() {
    const v = nameInput.trim()
    if (!v || v === name || savingName) return
    setSavingName(true); setNameErr(''); setNameSaved(false)
    try {
      const saved = await renameBoard(groupId, v)
      setName(saved || v); setNameInput(saved || v); setNameSaved(true)
      setTimeout(() => setNameSaved(false), 1500)
    } catch (e) { setNameErr(e.message) } finally { setSavingName(false) }
  }

  if (access === 'loading' || loading) return <BoardLoading />
  if (access === 'no') return <NotReady />
  if (!canManage) return (
    <div className="page sb-page"><div className="sb-soon"><span>🔒</span><p>설정 권한이 없어요</p></div></div>
  )

  return (
    <div className="page sb-page sb-settings-page">
      <section className="sb-set-section">
        <h3 className="sb-set-title">게시판 이름</h3>
        {nameErr && <div className="alert alert-error">{nameErr}</div>}
        <div className="sb-prefix-add">
          <input className="sb-input" value={nameInput} maxLength={20} placeholder="게시판 이름을 입력하세요"
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveName() } }} />
          <button type="button" className="btn btn-primary sb-send" onClick={saveName}
            disabled={savingName || !nameInput.trim() || nameInput.trim() === name}>
            {savingName ? '저장 중…' : nameSaved ? '저장됨' : '저장'}
          </button>
        </div>
      </section>

      <section className="sb-set-section">
        <h3 className="sb-set-title">말머리</h3>
        <PrefixEditor groupId={groupId} prefixes={prefixes}
          onChanged={async () => setPrefixes(await listBoardPrefixes(groupId))} />
      </section>
    </div>
  )
}

// ---- 말머리 편집(설정 페이지 섹션) — 방장/관리자 ----
function PrefixEditor({ groupId, prefixes, onChanged }) {
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
    <div className="sb-prefix-mgr">
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
  )
}
