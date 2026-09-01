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
import BottomSheet from '../components/BottomSheet'

// 물음표 공방 — 세 유형(VS/투표/문답)의 질문 게시판. 목록/작성·수정/상세(답변+댓글)로 구성.
// "물음표 공방"은 기능/장소 이름이라 그대로 두고, 그 안의 포스팅 한 건을 가리키는 말은 "질문"으로 통일한다.
// 접근 제어·댓글 멘션/답글은 비밀 게시판(RPC 전면 잠금)·위시 댓글(실명+멘션) 패턴을 그대로 따른다.

const TYPE_LABEL = { vs: 'VS', poll: '투표', qna: '문답' }
const FILTERS = [
  { key: 'all', label: '전체' },
  { key: 'qna', label: '문답' },
  { key: 'vs', label: 'VS' },
  { key: 'poll', label: '투표' },
]

// 목록 하단 장식(qw-spark-field)에 뿌릴 반짝임·물음표 — 크기 제각각(sm/md/lg), 서로 다른
// 딜레이·주기로 겹쳐 놓아 한 번에 여러 개가 보이면서 자연스럽게 어긋나 깜빡이게 한다.
// side/pos 는 left 또는 right 기준 위치, bottom 은 qw-spark-field 자체 높이 기준 %.
const QW_SPARKLE_ITEMS = [
  { type: 'spark', size: 'lg', side: 'left', pos: '5%', bottom: '18%', delay: '0s', dur: '2.8s' },
  { type: 'qmark', size: 'sm', side: 'left', pos: '13%', bottom: '36%', delay: '.4s', dur: '3.6s' },
  { type: 'spark', size: 'sm', side: 'left', pos: '25%', bottom: '50%', delay: '.9s', dur: '2.3s' },
  { type: 'qmark', size: 'md', side: 'left', pos: '2%', bottom: '56%', delay: '1.4s', dur: '3.9s' },
  { type: 'spark', size: 'md', side: 'left', pos: '35%', bottom: '9%', delay: '.2s', dur: '2.5s' },
  { type: 'spark', size: 'sm', side: 'left', pos: '45%', bottom: '30%', delay: '1.7s', dur: '2.9s' },
  { type: 'qmark', size: 'lg', side: 'left', pos: '54%', bottom: '15%', delay: '.6s', dur: '4.1s' },
  { type: 'qmark', size: 'sm', side: 'left', pos: '38%', bottom: '44%', delay: '2.3s', dur: '3.4s' },
  { type: 'spark', size: 'lg', side: 'right', pos: '30%', bottom: '40%', delay: '1.1s', dur: '2.6s' },
  { type: 'qmark', size: 'sm', side: 'right', pos: '19%', bottom: '54%', delay: '.1s', dur: '3.3s' },
  { type: 'spark', size: 'md', side: 'right', pos: '9%', bottom: '22%', delay: '1.9s', dur: '2.4s' },
  { type: 'spark', size: 'sm', side: 'right', pos: '3%', bottom: '46%', delay: '.8s', dur: '2.7s' },
  { type: 'qmark', size: 'md', side: 'right', pos: '29%', bottom: '9%', delay: '2.1s', dur: '3.7s' },
  { type: 'spark', size: 'sm', side: 'right', pos: '13%', bottom: '12%', delay: '1.5s', dur: '2.2s' },
]

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

// 아바타 스택(겹침 + N명 더). 상세의 VoterStack 과 같은 시각 언어를 목록 카드에서도 재사용.
function AvatarStack({ people, max = 3, size = 26 }) {
  const shown = people.slice(0, max)
  const extra = people.length - shown.length
  if (shown.length === 0) return null
  return (
    <span className="qw-card-avatars task-parts multi">
      {shown.map((p, i) => <Avatar key={i} src={p.avatar_url} name={p.nickname} size={size} />)}
      {extra > 0 && <span className="task-parts-more">+{extra}</span>}
    </span>
  )
}

// ============ 목록 카드(유형별 미리보기) ============
function QwListCard({ post, onOpen }) {
  const answerers = post.answerers || []
  const counts = post.option_counts || []
  const total = counts.reduce((a, b) => a + b, 0)
  const topCount = counts.length ? Math.max(...counts) : 0

  return (
    <li className="qw-card-item">
      <button type="button" className="qw-card" onClick={onOpen}>
        <div className="qw-card-top">
          <span className="qw-card-seq">{post.seq} 번째 질문</span>
          <AvatarStack people={answerers} />
        </div>
        <div className="qw-card-q">
          <span className={`qw-type-badge qw-type-${post.type}`}>{TYPE_LABEL[post.type]}</span>
          {post.question}
        </div>

        {post.type === 'qna' && answerers[0] && (
          <div className="qw-card-preview">
            <Avatar src={answerers[0].avatar_url} name={answerers[0].nickname} size={22} />
            <span className="qw-card-preview-text"><b>{answerers[0].nickname}</b> · {answerers[0].answer_text}</span>
          </div>
        )}

        {post.type === 'vs' && post.options?.length === 2 && (
          <div className="qw-card-vs">
            {post.options.map((label, i) => (
              <div key={i} className={`qw-card-vs-opt${counts[i] > counts[1 - i] ? ' lead' : ''}`}>
                <div className="qw-card-vs-label">{label}</div>
                <div className="qw-card-vs-count">{counts[i] ?? 0} 명</div>
              </div>
            ))}
            <span className="qw-card-vs-mid">VS</span>
          </div>
        )}

        {post.type === 'poll' && post.options?.length > 0 && (
          <div className="qw-card-poll">
            {post.options.slice(0, 2).map((label, i) => {
              const c = counts[i] ?? 0
              const pct = total > 0 ? Math.round((c / total) * 100) : 0
              const top = c === topCount && c > 0
              return (
                <div key={i} className={`qw-card-poll-row${top ? ' top' : ''}`}>
                  <div className="qw-card-poll-line">
                    <span className="qw-card-poll-label">{label}</span>
                    <span className="qw-card-poll-pct">{pct} %</span>
                  </div>
                  <div className="qw-card-poll-bar">
                    <span className={`qw-card-poll-fill${top ? ' top' : ''}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
            {post.options.length > 2 && <div className="qw-card-poll-more">+ 선택지 {post.options.length - 2} 개 더</div>}
          </div>
        )}
      </button>
    </li>
  )
}

// ============ 목록 ============
export default function QuestionWorkshop() {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { setRefreshHandler, qwSearch } = useOutletContext()
  const { state: access } = useQworkshopAccess(groupId)
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')

  const load = useCallback(async () => {
    setError('')
    try { setPosts(await listQworkshopPosts(groupId)) }
    catch (e) { setError(e.message) } finally { setLoading(false) }
  }, [groupId])
  useEffect(() => { load() }, [load])
  useEffect(() => { setRefreshHandler(() => load); return () => setRefreshHandler(() => null) }, [setRefreshHandler, load])

  // "N번째 질문" — 그룹 전체 개수 기준으로 오래된 순 1부터. 새로 만들수록 큰 번호.
  const numbered = useMemo(() => {
    const total = posts.length
    return posts.map((p, i) => ({ ...p, seq: total - i }))
  }, [posts])

  const term = (qwSearch?.term || '').trim().toLowerCase()
  const shown = useMemo(() => numbered
    .filter((p) => typeFilter === 'all' || p.type === typeFilter)
    .filter((p) => !term || p.question.toLowerCase().includes(term)),
    [numbered, typeFilter, term])

  if (access === 'loading') return <QwLoading />
  if (access === 'no') return <QwNotReady />

  return (
    <div className="page qw-page qw-list-page">
      <div className="qw-spark-field" aria-hidden="true">
        {QW_SPARKLE_ITEMS.map((it, i) => (
          it.type === 'qmark'
            ? <span key={i} className={`qw-qmark qw-qmark-${it.size}`}
                style={{ [it.side]: it.pos, bottom: it.bottom, animationDelay: it.delay, animationDuration: it.dur }}>?</span>
            : <span key={i} className={`qw-spark qw-spark-${it.size}`}
                style={{ [it.side]: it.pos, bottom: it.bottom, animationDelay: it.delay, animationDuration: it.dur }} />
        ))}
      </div>
      <div className="qw-scroll">
        <div className="qw-filter-row" role="tablist">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" role="tab" aria-selected={typeFilter === f.key}
              className={`qw-filter-chip${typeFilter === f.key ? ' on' : ''}`}
              onClick={() => setTypeFilter(f.key)}>{f.label}</button>
          ))}
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        {loading ? <div className="spinner" /> : shown.length === 0 ? (
          <div className="qw-empty">{term ? '검색 결과가 없어요.' : '아직 질문이 없어요. 첫 질문을 남겨 보세요.'}</div>
        ) : (
          <ul className="qw-cards">
            {shown.map((p) => (
              <QwListCard key={p.id} post={p}
                onOpen={() => navigate(qwPath(groupId, `/${p.id}`), { state: { membersBackTo: location.state?.membersBackTo } })} />
            ))}
          </ul>
        )}
      </div>
      <button type="button" className="fab" aria-label="질문 쓰기" title="질문 쓰기"
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

// VS/투표 카드에서 선택지 옆에 붙는 "고른 사람" 아바타 겹침(최대 3명+N) → 클릭 시 모달로 전체 목록
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
function AnswerArea({ post, av, me, submitting, setSubmitting, setErr, reload }) {
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
    <BottomSheet open={!!voterModal} onClose={() => setVoterModal(null)}>
      <h3 className="sheet-title">{voterModal?.label}</h3>
      <ul className="qw-voter-list">
        {(voterModal?.voters || []).map((v) => (
          <li key={v.author_id} className="qw-voter-list-item">
            <Avatar src={v.avatar_url} name={v.nickname} size={32} />
            <span>{v.nickname}</span>
          </li>
        ))}
      </ul>
    </BottomSheet>
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
              <span className="qw-vs-ab">{i === 0 ? 'A' : 'B'}</span>
              <span className="qw-vs-label">{label}</span>
              {byOption[i].length > 0 && (
                <>
                  <VoterStack voters={byOption[i]} onOpen={() => setVoterModal({ label, voters: byOption[i] })} />
                  <span className="qw-vs-count">{byOption[i].length} 명</span>
                </>
              )}
            </div>
          ))}
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
    const total = byOption.reduce((sum, arr) => sum + arr.length, 0)
    return (
      <div className="qw-poll">
        {opts.map((label, i) => {
          const cnt = byOption[i].length
          const pct = answered && total > 0 ? Math.round((cnt / total) * 100) : 0
          const mine = myIdx === i
          return (
            <div key={i} role="button" tabIndex={0}
              className={`qw-poll-opt${answered ? ' answered' : ''}${mine ? ' mine' : ''}${submitting ? ' disabled' : ''}`}
              onClick={() => pick(i)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(i) } }}>
              {answered && <span className="qw-poll-fill" style={{ width: `${pct}%` }} aria-hidden="true" />}
              <span className="qw-poll-mark" aria-hidden="true">{mine ? '✓' : ''}</span>
              <span className="qw-poll-label">{label}</span>
              {cnt > 0 && (
                <span className="qw-poll-side">
                  <VoterStack voters={byOption[i]} onOpen={() => setVoterModal({ label, voters: byOption[i] })} />
                </span>
              )}
            </div>
          )
        })}
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
        <ul className="qw-qna-list">
          <li className="qw-qna-card">
            <div className="qw-qna-card-head">
              <Avatar src={me?.avatar_url} name={me?.nickname} size={26} />
              <span className="qw-qna-card-name">{me?.nickname}</span>
            </div>
            <p className="qw-qna-card-text">{av.my_answer?.answer_text}</p>
            <button type="button" className="qw-link qw-qna-edit" onClick={() => setQnaEditing(true)}>수정</button>
          </li>
        </ul>
      )}
      {answered ? (
        others.length === 0 ? <p className="qw-qna-locked">아직 다른 답변이 없어요.</p> : (
          <ul className="qw-qna-list">
            {others.map((a) => (
              <li className="qw-qna-card" key={a.author_id}>
                <div className="qw-qna-card-head">
                  <Avatar src={a.avatar_url} name={a.nickname} size={26} />
                  <span className="qw-qna-card-name">{a.nickname}</span>
                </div>
                <p className="qw-qna-card-text">{a.answer_text}</p>
              </li>
            ))}
          </ul>
        )
      ) : (av.answers || []).length > 0 ? (
        <p className="qw-qna-locked">{av.answers.length} 명이 답변했어요. 답변을 남기면 볼 수 있어요.</p>
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
  const [newestFirst, setNewestFirst] = useState(true) // 댓글 정렬(3f 시안 기본값 "최신순")
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
    let roots = comments.filter((c) => !c.parent_id)
    if (newestFirst) roots = [...roots].reverse()
    const repliesOf = {}
    comments.forEach((c) => {
      if (!c.parent_id) return
      const rid = rootIdOf(c)
      if (rid === c.id) return
      ;(repliesOf[rid] = repliesOf[rid] || []).push(c)
    })
    return { roots, repliesOf }
  }, [comments, newestFirst])

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
    loadComments, submit, removeComment, startEdit, replyTo, cancelCompose, newestFirst, setNewestFirst,
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
  const { setRefreshHandler, setHeaderPostMenu } = useOutletContext()
  const { state: access } = useQworkshopAccess(groupId)

  const seed = location.state?.post
  const [post, setPost] = useState(seed || null)
  const [seq, setSeq] = useState(seed?.seq ?? null)
  const [gone, setGone] = useState(false)
  const [members, setMembers] = useState([])
  const me = members.find((m) => m.is_self)
  const [av, setAv] = useState({ has_answered: false, my_answer: null, answers: [], counts: null })
  const [avLoading, setAvLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')
  const [bottomEl, setBottomEl] = useState(null)
  useEffect(() => { setBottomEl(document.getElementById('app-bottom')) }, [])

  const h = useQworkshopComments(postId, groupId, members)

  const loadPost = useCallback(async () => {
    try {
      const list = await listQworkshopPosts(groupId)
      const idx = list.findIndex((x) => x.id === postId)
      if (idx >= 0) { setPost(list[idx]); setSeq(list.length - idx) } else setGone(true)
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
    if (!confirm('이 질문을 삭제할까요? 답변과 댓글도 함께 삭제돼요.')) return
    try { await deleteQworkshopPost(postId); navigate(qwPath(groupId), { replace: true }) } catch (e) { setErr(e.message) }
  }
  function goEdit() { navigate(qwPath(groupId, `/${postId}/edit`), { state: { post } }) }

  // 수정/삭제 ⋮ 를 상단바에 등록(권한자만) — 비밀 게시판 글 상세와 동일한 패턴
  useEffect(() => {
    if (!post) { setHeaderPostMenu(null); return }
    const items = []
    if (post.is_mine) items.push({ label: '수정', onClick: goEdit })
    if (post.can_delete) items.push({ label: '삭제', danger: true, onClick: removePost })
    setHeaderPostMenu(items.length ? { items } : null)
    return () => setHeaderPostMenu(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post, setHeaderPostMenu])

  if (access === 'loading') return <QwLoading />
  if (access === 'no') return <QwNotReady />
  if (gone) return <div className="page"><div className="comment-empty">삭제된 질문이에요.</div></div>
  if (!post) return <div className="page"><div className="spinner" /></div>

  const commentCount = h.comments.length

  return (
    <div className="page qw-post-page">
      <div className="qw-post-info">
        <span className="qw-card-seq">{seq != null ? `${seq} 번째 질문` : ''}</span>
        <MemberAvatarBtn groupId={groupId} userId={post.author_id} src={post.avatar_url} name={post.nickname} size={28} />
      </div>
      <h2 className="qw-post-q">
        <span className={`qw-type-badge qw-type-${post.type}`}>{TYPE_LABEL[post.type]}</span>
        {post.question}
      </h2>
      {post.body && <p className="qw-post-body">{post.body}</p>}

      {err && <div className="alert alert-error">{err}</div>}
      {avLoading ? <div className="spinner" /> : (
        <AnswerArea post={post} av={av} me={me ? { avatar_url: me.avatar_url, nickname: me.display_nickname } : null}
          submitting={submitting} setSubmitting={setSubmitting} setErr={setErr} reload={async () => { await loadAnswers(); await loadPost() }} />
      )}

      <div className="qw-cmt-section">
        <div className="qw-cmt-head">
          <span>댓글 <span className="muted">{commentCount}</span></span>
          {commentCount > 1 && (
            <button type="button" className="qw-cmt-sort" onClick={() => h.setNewestFirst((v) => !v)}>
              {h.newestFirst ? '최신순' : '오래된순'}
            </button>
          )}
        </div>
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
              placeholder={h.editingId ? '댓글 수정…' : h.replyParent ? '답글을 입력하세요' : '댓글을 남겨 보세요'} />
            <button className="btn btn-primary" disabled={h.sending || !h.body.trim()}>{h.editingId ? '수정' : '등록'}</button>
          </div>
        </form>
      ), bottomEl)}
    </div>
  )
}
