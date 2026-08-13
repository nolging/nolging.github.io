import { useEffect, useState, useCallback, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { adminListQuestDefs, adminListDailyQuestDefs, adminReorderQuestDefs } from '../../lib/api'
import { QUEST_GRADE_SHORT } from './adminMeta'
import CgToggle from '../../components/CgToggle'

// 목록 카드: PC 가로형 / 모바일 세로형은 CSS 로 반응형 전환. 데일리는 설명·배지 없음(랜덤만 표시).
// draggable(랜덤 전용)이면 이모지 아이콘이 정렬 드래그 핸들 역할을 한다.
function QuestCard({
  emoji, emojiBg, title, desc, reward, target, active, showBadges, onClick,
  draggable, dataId, dragging, dragActive, onIconPointerDown,
}) {
  const badges = (
    <span className="aq-card-badges">
      <span className="aq-badge-target">{target}</span>
      <span className={`aq-badge-status ${active ? 'on' : ''}`}>{active ? '활성' : '비활성'}</span>
    </span>
  )
  const inactive = showBadges && !active
  const cls = ['aq-card']
  if (draggable) cls.push('aq-card-draggable')
  if (dragging) cls.push('is-dragging')
  if (inactive) cls.push('inactive')
  return (
    <button type="button" className={cls.join(' ')} onClick={onClick}
      data-row-id={draggable ? dataId : undefined}
      onPointerDown={draggable ? (e) => onIconPointerDown(e) : undefined}
      style={dragActive ? { touchAction: 'none' } : undefined}
    >
      <span className="aq-card-icon" style={emojiBg ? { background: emojiBg } : undefined} aria-hidden="true">{emoji || '✦'}</span>
      <span className="aq-card-body">
        <span className="aq-card-name">{title}</span>
        {showBadges ? <span className="aq-card-badges-mobile">{badges}</span> : desc ? <span className="aq-card-desc">{desc}</span> : null}
      </span>
      <span className="aq-card-reward">{reward} 츄르</span>
      {showBadges && <span className="aq-card-badges-desktop">{badges}</span>}
      <span className="aq-card-chevron" aria-hidden="true">›</span>
    </button>
  )
}

// 퀘스트 관리 — 목록 조회. 카드 클릭 → 상세/수정. 랜덤 퀘스트는 이모지 아이콘을 잡고 드래그해 정렬.
export default function AdminQuests() {
  const nav = useNavigate()
  const [quests, setQuests] = useState([])
  const [daily, setDaily] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [q, d] = await Promise.all([adminListQuestDefs(), adminListDailyQuestDefs()])
      setQuests(q); setDaily(d)
    }
    catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  // ── 랜덤 퀘스트 이모지 핸들 드래그 정렬(상점 관리와 동일한 패턴) ──
  const questsRef = useRef(quests)
  useEffect(() => { questsRef.current = quests }, [quests])
  const pendingRef = useRef(new Map())   // id -> sortOrder
  const saveTimer = useRef(null)
  const dragRef = useRef(null)           // 드래그 중인 id
  const suppressClick = useRef(false)
  const [dragId, setDragId] = useState(null)
  const [sortMode, setSortMode] = useState(false) // 켜져 있을 때만 이모지 핸들 드래그 정렬 동작

  const flushSave = useCallback(async () => {
    const ups = [...pendingRef.current.entries()].map(([id, sortOrder]) => ({ id, sortOrder }))
    pendingRef.current.clear()
    if (!ups.length) return
    try { await adminReorderQuestDefs(ups) }
    catch (err) { setError('정렬 저장에 실패했어요: ' + err.message); load() }
  }, [load])
  useEffect(() => () => { clearTimeout(saveTimer.current); flushSave() }, [flushSave])

  const relayout = useCallback((orderedIds) => {
    const map = new Map(orderedIds.map((id, i) => [id, (i + 1) * 10]))
    setQuests((prev) => prev.map((x) => (map.has(x.id) ? { ...x, sort_order: map.get(x.id) } : x))
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)))
  }, [])

  const scheduleSave = useCallback((orderedIds) => {
    orderedIds.forEach((id, i) => pendingRef.current.set(id, (i + 1) * 10))
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(flushSave, 600)
  }, [flushSave])

  function onIconPointerDown(e, id) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (!e.target?.closest?.('.aq-card-icon')) return
    e.preventDefault()
    dragRef.current = id
    try { e.currentTarget?.setPointerCapture?.(e.pointerId) } catch { /* noop */ }
    setDragId(id)
    if (navigator.vibrate) { try { navigator.vibrate(12) } catch { /* noop */ } }
  }

  useEffect(() => {
    if (!dragId) return
    function onMove(e) {
      e.preventDefault()
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const row = el && el.closest('[data-row-id]')
      if (!row) return
      const overId = row.getAttribute('data-row-id')
      const d = dragRef.current
      if (!d || !overId || overId === d) return
      const ids = questsRef.current.map((x) => x.id)
      const from = ids.indexOf(d)
      const to = ids.indexOf(overId)
      if (from < 0 || to < 0 || from === to) return
      ids.splice(from, 1)
      ids.splice(to, 0, d)
      relayout(ids)
    }
    function onUp() {
      const d = dragRef.current
      if (d) scheduleSave(questsRef.current.map((x) => x.id))
      suppressClick.current = true
      setTimeout(() => { suppressClick.current = false }, 60)
      dragRef.current = null
      setDragId(null)
    }
    const blockScroll = (e) => e.preventDefault()
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('touchmove', blockScroll, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('touchmove', blockScroll)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [dragId, relayout, scheduleSave])

  function onCardClick(id) {
    if (suppressClick.current) return
    nav(`/admin/quests/${id}`)
  }

  return (
    <div className="page admin-page aq-page admin-quests-page">
      {error && <div className="alert alert-error">{error}</div>}
      <div className="aq-head">
        <h2 className="aq-title">퀘스트 관리</h2>
        <p className="aq-sub">데일리 퀘스트와 랜덤 퀘스트를 확인하고 수정할 수 있어요.</p>
      </div>
      <section>
        <div className="aq-section-head">
          <span className="aq-section-title">데일리 퀘스트</span>
          <span className="aq-count">{daily.length}</span>
        </div>
        <div className="aq-cards">
          {daily.map((q) => (
            <QuestCard key={q.key} emoji={q.emoji} emojiBg={q.emoji_bg} title={q.title} reward={q.reward}
              onClick={() => nav(`/admin/quests/daily/${q.key}`)} />
          ))}
        </div>
      </section>
      <section>
        <div className="aq-section-head">
          <span className="aq-section-title">랜덤 퀘스트</span>
          <span className="aq-count">{quests.length}</span>
          <span className="aq-sort-toggle">
            <span className="aq-sort-toggle-label">정렬 수정</span>
            <CgToggle on={sortMode} onClick={() => setSortMode((v) => !v)} />
          </span>
        </div>
        {loading ? <div className="spinner" /> : quests.length === 0 ? (
          <p className="muted sm">등록된 퀘스트가 없습니다.</p>
        ) : (
          <div className="aq-cards">
            {quests.map((q) => (
              <QuestCard key={q.id} emoji={q.emoji} emojiBg={q.emoji_bg} title={q.title} desc={q.body} reward={q.reward}
                target={QUEST_GRADE_SHORT[q.grade] || q.grade} active={q.active} showBadges
                draggable={sortMode} dataId={q.id} dragging={dragId === q.id} dragActive={!!dragId}
                onIconPointerDown={(e) => onIconPointerDown(e, q.id)}
                onClick={() => onCardClick(q.id)} />
            ))}
          </div>
        )}
      </section>

      <Link to="/admin/quests/new" className="aq-fab" aria-label="퀘스트 추가">
        <svg width="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </Link>
    </div>
  )
}
