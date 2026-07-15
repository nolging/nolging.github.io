import { useEffect, useRef, useState } from 'react'
import { WISH_CATEGORIES, CATEGORY_COLORS, categoryEmoji, MEDIA_LOOKUP_CATS, workNoun, workSearchHint, TASK_STATUSES, taskTerms } from '../lib/constants'
import MediaCard from './MediaCard'
import WorkSearchSheet from './WorkSearchSheet'
import ScheduleFields, { defaultSchedule, buildSchedulePayload } from './ScheduleFields'

// 위시 작성/편집 공용 폼(시안). onSubmit(values) 는 저장 후 이동, 실패 시 throw.
// allowStatus=true 면 상단에 상태(위시/약속/추억) 탭이 나오고, 약속·추억 선택 시
// 일정·참여자 입력이 함께 노출된다. (작성 화면 전용, 편집 화면에선 미사용)
export default function TaskForm({ initial = {}, submitLabel, onSubmit, onDelete, deleteLabel = '위시 삭제하기',
  allowStatus = false, members = [], meId }) {
  const [title, setTitle] = useState(initial.title || '')
  const [category, setCategory] = useState(initial.category || '')
  const [mediaInfo, setMediaInfo] = useState(initial.media_info || null)
  const [comment, setComment] = useState(initial.category && !MEDIA_LOOKUP_CATS.includes(initial.category) ? (initial.description || '') : '')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [nameErr, setNameErr] = useState('')
  const [typeErr, setTypeErr] = useState('')
  const [status, setStatus] = useState('open')       // open=위시 / accepted=약속 / done=추억
  const [sched, setSched] = useState(defaultSchedule)
  const partsInit = useRef(false)

  const mediaCat = MEDIA_LOOKUP_CATS.includes(category)
  const noun = workNoun(category)
  const terms = taskTerms()
  const scheduled = allowStatus && status !== 'open'

  // 멤버가 로드되면 참여자 기본값 1회 설정: 2인 그룹은 둘 다, 그 외엔 나만(작성자=나)
  useEffect(() => {
    if (!allowStatus || partsInit.current || members.length === 0) return
    partsInit.current = true
    const base = members.length === 2 ? members.map((m) => m.user_id) : (meId ? [meId] : [])
    setSched((s) => ({ ...s, participants: base }))
  }, [allowStatus, members, meId])

  function pickCategory(c) {
    const next = category === c ? '' : c
    setCategory(next); if (typeErr) setTypeErr('')
    if (!MEDIA_LOOKUP_CATS.includes(next)) { setMediaInfo(null) } else { setComment('') }
  }

  async function submit(e) {
    e.preventDefault()
    if (!category) { setTypeErr('위시 유형을 선택해 주세요.'); return }
    if (!title.trim()) { setNameErr('제목을 입력해 주세요.'); return }
    let schedule = null
    if (scheduled) {
      // 날짜·시간을 체크하지 않아도 약속/추억으로 등록 가능(일정 없이 저장)
      const ids = members.length >= 2 ? sched.participants : members.map((m) => m.user_id)
      if (members.length >= 2 && ids.length === 0) { setError('참여자를 한 명 이상 선택해 주세요.'); return }
      schedule = { ...buildSchedulePayload(sched), participantIds: ids }
    }
    setBusy(true); setError('')
    try {
      await onSubmit({
        title: title.trim(),
        description: mediaCat ? '' : comment.trim(),
        category: category || null,
        media_info: mediaCat ? mediaInfo : null,
        status,
        schedule, // null=위시 / {…}=약속·추억(status 로 구분)
      })
    } catch (err) { setError(err.message); setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="page cg-page">
      <div className="cg-form">
        {allowStatus && (
          <div className="cg-field">
            <div className="cg-label">상태 <span className="cg-req">*</span></div>
            <div className="tabs ts-status-tabs" role="tablist">
              {TASK_STATUSES.map((s) => (
                <button type="button" key={s} role="tab" aria-selected={status === s}
                  className={`tab ${status === s ? 'active' : ''}`}
                  onClick={() => setStatus(s)}>{terms.status[s]}</button>
              ))}
              <span className="tab-underline ts-status-pill"
                style={{ width: 'calc((100% - 8px) / 3)', transform: `translateX(calc(${TASK_STATUSES.indexOf(status)} * 100%))` }} />
            </div>
          </div>
        )}
        {/* 위시 유형 */}
        <div className={`cg-field ${allowStatus ? 'cg-mt-22' : ''}`}>
          <div className="cg-label">위시 유형 <span className="cg-req">*</span></div>
          <div className="ts-chips">
            {WISH_CATEGORIES.map((c) => {
              const sel = category === c
              const col = CATEGORY_COLORS[c] || CATEGORY_COLORS['기타']
              return (
                <button type="button" key={c} className={`ts-chip ${sel ? 'sel' : ''}`}
                  style={sel ? { background: col.bg, color: col.fg, boxShadow: `inset 0 0 0 1.5px ${col.fg}` } : undefined}
                  onClick={() => pickCategory(c)}>
                  {sel && <span className="ts-chip-emoji" aria-hidden="true">{categoryEmoji(c)}</span>}{c}
                </button>
              )
            })}
          </div>
          {typeErr && <span className="field-error" style={{ marginTop: 8 }}>{typeErr}</span>}
        </div>

        {/* 제목 */}
        <div className="cg-field cg-mt-22">
          <div className="cg-label">제목 <span className="cg-req">*</span></div>
          <div className="cg-input-wrap">
            <input className="cg-input" value={title} maxLength={50}
              onChange={(e) => { setTitle(e.target.value); if (nameErr) setNameErr('') }}
              placeholder="위시 제목을 입력하세요" />
          </div>
          {nameErr && <span className="field-error">{nameErr}</span>}
        </div>

        {/* 작품 정보(미디어 유형) 또는 코멘트(운동·기타) */}
        {mediaCat ? (
          <div className="cg-section cg-mt-24">
            <div className="cg-label">{noun} 정보 <span className="cg-opt">선택</span></div>
            {!mediaInfo && <div className="cg-section-sub" style={{ marginTop: 4 }}>{workSearchHint(category)}</div>}
            <div className="cg-mt-12">
              {mediaInfo ? (
                <MediaCard category={category} info={mediaInfo} onClear={() => setMediaInfo(null)} />
              ) : (
                <button type="button" className="ts-search-card" onClick={() => setSheetOpen(true)}>
                  <span className="ts-search-icon">
                    <svg width="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                  </span>
                  <span className="ts-search-label">{noun} 검색</span>
                </button>
              )}
            </div>
          </div>
        ) : category ? (
          <div className="cg-field cg-mt-24">
            <div className="cg-label">코멘트 <span className="cg-opt">선택</span></div>
            <div className="cg-input-wrap">
              <textarea className="cg-input cg-textarea" rows={3} value={comment}
                onChange={(e) => setComment(e.target.value)} placeholder="어떤 위시인지 자유롭게 적어 주세요" />
            </div>
          </div>
        ) : null}

        {scheduled && (
          <ScheduleFields value={sched} onChange={(patch) => setSched((s) => ({ ...s, ...patch }))}
            members={members} meId={meId} authorId={meId} />
        )}

        {error && <div className="alert alert-error cg-mt-16">{error}</div>}
        <div className="cg-footer">
          <button type="submit" className="cg-btn-primary" disabled={busy}>{busy ? '저장 중…' : submitLabel}</button>
          {onDelete && (
            <div className="cg-footer-center">
              <button type="button" className="cg-danger-link" onClick={onDelete}>{deleteLabel}</button>
            </div>
          )}
        </div>
      </div>

      <WorkSearchSheet open={sheetOpen} onClose={() => setSheetOpen(false)}
        category={category} initialQuery={title} onPick={setMediaInfo} />
    </form>
  )
}
