import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/Modal'
import {
  getGroup, listBoardPrefixes, addBoardPrefix, updateBoardPrefix, deleteBoardPrefix,
  listBoardPosts, createBoardPost, updateBoardPost, deleteBoardPost,
  listBoardComments, addBoardComment, updateBoardComment, deleteBoardComment,
} from '../lib/api'

// 비밀 게시판 — 프리미엄 그룹 익명 게시판. 글/댓글/답글, 말머리, 내 글·댓글은 연보라 배경.
// 우선 앱 관리자에게만 노출(메뉴에서 숨김). 서버 RPC 가 익명(author_id 미노출) + 권한을 담당.

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

export default function SecretBoard() {
  const { groupId } = useParams()
  const { profile, isAdmin } = useAuth()
  const uid = profile?.id

  const [group, setGroup] = useState(null)
  const [prefixes, setPrefixes] = useState([])
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openPost, setOpenPost] = useState(null)     // 상세로 연 글
  const [compose, setCompose] = useState(null)       // { editing?post } 글쓰기/수정 모달
  const [prefixMgr, setPrefixMgr] = useState(false)  // 말머리 관리 모달

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

  const reloadPosts = useCallback(async () => {
    try { setPosts(await listBoardPosts(groupId)) } catch { /* noop */ }
  }, [groupId])

  if (!isAdmin) {
    return (
      <div className="page sb-page">
        <div className="sb-soon"><span>🔒</span><p>비밀 게시판은 아직 준비 중이에요</p></div>
      </div>
    )
  }

  return (
    <div className="page sb-page">
      <div className="sb-head">
        <div>
          <h2 className="sb-title">비밀 게시판</h2>
          <p className="sb-sub">익명으로 남기는 우리만의 이야기</p>
        </div>
        {canManage && (
          <button type="button" className="sb-mgr-btn" onClick={() => setPrefixMgr(true)}>말머리 관리</button>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? <div className="spinner" /> : posts.length === 0 ? (
        <div className="sb-empty">아직 글이 없어요. 첫 글을 남겨 보세요.</div>
      ) : (
        <ul className="sb-list">
          {posts.map((p) => (
            <li key={p.id}>
              <button type="button" className={`sb-item${p.is_mine ? ' mine' : ''}`} onClick={() => setOpenPost(p)}>
                <div className="sb-item-title">
                  {p.prefix_label && <span className="sb-prefix">[{p.prefix_label}]</span>}
                  <span className="sb-item-t">{p.title}</span>
                </div>
                {p.body && <div className="sb-item-body">{p.body}</div>}
                <div className="sb-item-meta">
                  <span>{timeAgo(p.created_at)}{p.edited ? ' · 수정됨' : ''}</span>
                  {p.comment_count > 0 && <span className="sb-cc">💬 {p.comment_count}</span>}
                  {p.is_mine && <span className="sb-mine-tag">내 글</span>}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <button type="button" className="sb-fab" onClick={() => setCompose({})} aria-label="새 글 쓰기">＋</button>

      {compose && (
        <ComposeModal groupId={groupId} prefixes={prefixes} editing={compose.editing}
          onClose={() => setCompose(null)}
          onDone={async () => { setCompose(null); await reloadPosts(); if (openPost) { const fresh = (await listBoardPosts(groupId)).find((x) => x.id === openPost.id); setOpenPost(fresh || null) } }} />
      )}

      {openPost && (
        <PostDetail post={openPost} uid={uid}
          onClose={() => setOpenPost(null)}
          onEdit={() => setCompose({ editing: openPost })}
          onDeleted={async () => { setOpenPost(null); await reloadPosts() }}
          onCommentsChanged={reloadPosts} />
      )}

      {prefixMgr && (
        <PrefixManager groupId={groupId} prefixes={prefixes}
          onClose={() => setPrefixMgr(false)}
          onChanged={async () => setPrefixes(await listBoardPrefixes(groupId))} />
      )}
    </div>
  )
}

// ---- 글쓰기 / 수정 ----
function ComposeModal({ groupId, prefixes, editing, onClose, onDone }) {
  const [prefixId, setPrefixId] = useState(editing?.prefix_id || '')
  const [title, setTitle] = useState(editing?.title || '')
  const [body, setBody] = useState(editing?.body || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    if (!title.trim()) { setErr('제목을 입력해 주세요.'); return }
    setBusy(true); setErr('')
    try {
      if (editing) await updateBoardPost(editing.id, prefixId, title.trim(), body)
      else await createBoardPost(groupId, prefixId, title.trim(), body)
      await onDone()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <Modal open onClose={onClose} cardClassName="sb-modal">
      <div className="sb-compose">
        <h3 className="sb-modal-title">{editing ? '글 수정' : '새 글'}</h3>
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
        <textarea className="sb-textarea" placeholder="내용을 입력하세요" value={body} maxLength={5000} rows={7}
          onChange={(e) => setBody(e.target.value)} />
        <button type="button" className="btn btn-primary btn-block" onClick={submit} disabled={busy || !title.trim()}>
          {busy ? '올리는 중…' : editing ? '수정하기' : '올리기'}
        </button>
      </div>
    </Modal>
  )
}

// ---- 글 상세 + 댓글 ----
function PostDetail({ post, uid, onClose, onEdit, onDeleted, onCommentsChanged }) {
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [replyTo, setReplyTo] = useState(null)   // { id, }
  const [editing, setEditing] = useState(null)   // 편집 중 댓글 id
  const [editText, setEditText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    try { setComments(await listBoardComments(post.id)) } catch (e) { setErr(e.message) } finally { setLoading(false) }
  }, [post.id])
  useEffect(() => { load() }, [load])

  // 최상위 댓글 + 그에 달린 답글 그룹핑
  const tree = useMemo(() => {
    const roots = comments.filter((c) => !c.parent_id)
    const kids = {}
    for (const c of comments) if (c.parent_id) (kids[c.parent_id] = kids[c.parent_id] || []).push(c)
    return roots.map((r) => ({ ...r, replies: kids[r.id] || [] }))
  }, [comments])

  async function send() {
    if (!draft.trim()) return
    setBusy(true); setErr('')
    try {
      await addBoardComment(post.id, replyTo?.id || null, draft.trim())
      setDraft(''); setReplyTo(null)
      await load(); await onCommentsChanged?.()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  async function saveEdit(id) {
    if (!editText.trim()) return
    setBusy(true); setErr('')
    try { await updateBoardComment(id, editText.trim()); setEditing(null); await load() }
    catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  async function removeComment(id) {
    if (!confirm('이 댓글을 삭제할까요? 답글도 함께 삭제돼요.')) return
    try { await deleteBoardComment(id); await load(); await onCommentsChanged?.() }
    catch (e) { setErr(e.message) }
  }
  async function removePost() {
    if (!confirm('이 글을 삭제할까요?')) return
    try { await deleteBoardPost(post.id); await onDeleted() } catch (e) { setErr(e.message) }
  }

  const CommentRow = ({ c, isReply }) => (
    <div className={`sb-comment${c.is_mine ? ' mine' : ''}${isReply ? ' reply' : ''}`}>
      {editing === c.id ? (
        <div className="sb-cedit">
          <textarea className="sb-textarea" rows={2} value={editText} maxLength={2000} onChange={(e) => setEditText(e.target.value)} />
          <div className="sb-cedit-row">
            <button type="button" className="sb-link" onClick={() => setEditing(null)}>취소</button>
            <button type="button" className="sb-link strong" onClick={() => saveEdit(c.id)} disabled={busy}>저장</button>
          </div>
        </div>
      ) : (
        <>
          <div className="sb-comment-body">{c.body}</div>
          <div className="sb-comment-meta">
            <span>{timeAgo(c.created_at)}{c.edited ? ' · 수정됨' : ''}</span>
            {c.is_mine && <span className="sb-mine-tag sm">내 댓글</span>}
            {!isReply && <button type="button" className="sb-link" onClick={() => { setReplyTo(c); setDraft('') }}>답글</button>}
            {c.is_mine && <button type="button" className="sb-link" onClick={() => { setEditing(c.id); setEditText(c.body) }}>수정</button>}
            {c.can_delete && <button type="button" className="sb-link danger" onClick={() => removeComment(c.id)}>삭제</button>}
          </div>
        </>
      )}
    </div>
  )

  return (
    <Modal open onClose={onClose} cardClassName="sb-modal sb-detail-modal">
      <div className="sb-detail">
        <div className="sb-detail-top">
          <div className="sb-detail-title">
            {post.prefix_label && <span className="sb-prefix">[{post.prefix_label}]</span>}
            <span>{post.title}</span>
          </div>
          {(post.is_mine || post.can_delete) && (
            <div className="sb-detail-actions">
              {post.is_mine && <button type="button" className="sb-link" onClick={onEdit}>수정</button>}
              {post.can_delete && <button type="button" className="sb-link danger" onClick={removePost}>삭제</button>}
            </div>
          )}
        </div>
        <div className="sb-detail-meta">{timeAgo(post.created_at)}{post.edited ? ' · 수정됨' : ''}{post.is_mine ? ' · 내 글' : ''}</div>
        {post.body && <div className={`sb-detail-body${post.is_mine ? ' mine' : ''}`}>{post.body}</div>}

        {err && <div className="alert alert-error">{err}</div>}

        <div className="sb-comments">
          <div className="sb-comments-title">댓글 {comments.length}</div>
          {loading ? <div className="spinner sm" /> : tree.length === 0 ? (
            <p className="sb-nocomments">첫 댓글을 남겨 보세요.</p>
          ) : tree.map((c) => (
            <div key={c.id} className="sb-thread">
              <CommentRow c={c} isReply={false} />
              {c.replies.map((r) => <CommentRow key={r.id} c={r} isReply />)}
            </div>
          ))}
        </div>
      </div>

      <div className="sb-composer">
        {replyTo && (
          <div className="sb-reply-hint">답글 작성 중 <button type="button" className="sb-link" onClick={() => setReplyTo(null)}>취소</button></div>
        )}
        <div className="sb-composer-row">
          <input className="sb-input" placeholder={replyTo ? '답글을 입력하세요' : '댓글을 입력하세요'} value={draft}
            maxLength={2000} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
          <button type="button" className="btn btn-primary sb-send" onClick={send} disabled={busy || !draft.trim()}>등록</button>
        </div>
      </div>
    </Modal>
  )
}

// ---- 말머리 관리 (방장/관리자) ----
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
