import { useEffect, useState, useCallback, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listNotifTemplates, adminReorderNotifTemplates } from '../../lib/api'
import CgToggle from '../../components/CgToggle'
import useScrollRestore from '../../lib/useScrollRestore'

// 알림 메시지 관리 — 알림 종류 목록. 카드 클릭 → 제목/본문 수정.
// 이모지 아이콘을 잡고 드래그하면 정렬 순서를 바꿀 수 있다(퀘스트/상점 관리와 동일한 패턴).
export default function AdminNotifs() {
  const nav = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try { setRows(await listNotifTemplates()) }
    catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])
  useScrollRestore(!loading) // 상세 → 뒤로가기 시 목록 스크롤 위치 복원

  // ── 이모지 핸들 드래그 정렬 ──────────────────────────────
  const rowsRef = useRef(rows)
  useEffect(() => { rowsRef.current = rows }, [rows])
  const pendingRef = useRef(new Map())   // key -> sortOrder
  const saveTimer = useRef(null)
  const dragRef = useRef(null)           // 드래그 중인 key
  const suppressClick = useRef(false)
  const [dragKey, setDragKey] = useState(null)
  const [sortMode, setSortMode] = useState(false) // 켜져 있을 때만 이모지 핸들 드래그 정렬 동작

  const flushSave = useCallback(async () => {
    const ups = [...pendingRef.current.entries()].map(([key, sortOrder]) => ({ key, sortOrder }))
    pendingRef.current.clear()
    if (!ups.length) return
    try { await adminReorderNotifTemplates(ups) }
    catch (err) { setError('정렬 저장에 실패했어요: ' + err.message); load() }
  }, [load])
  useEffect(() => () => { clearTimeout(saveTimer.current); flushSave() }, [flushSave])

  const relayout = useCallback((orderedKeys) => {
    const map = new Map(orderedKeys.map((k, i) => [k, (i + 1) * 10]))
    setRows((prev) => prev.map((x) => (map.has(x.key) ? { ...x, sort_order: map.get(x.key) } : x))
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)))
  }, [])

  const scheduleSave = useCallback((orderedKeys) => {
    orderedKeys.forEach((k, i) => pendingRef.current.set(k, (i + 1) * 10))
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(flushSave, 600)
  }, [flushSave])

  function onIconPointerDown(e, key) {
    if (!sortMode) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (!e.target?.closest?.('.aq-card-icon')) return
    e.preventDefault()
    dragRef.current = key
    try { e.currentTarget?.setPointerCapture?.(e.pointerId) } catch { /* noop */ }
    setDragKey(key)
    if (navigator.vibrate) { try { navigator.vibrate(12) } catch { /* noop */ } }
  }

  useEffect(() => {
    if (!dragKey) return
    function onMove(e) {
      e.preventDefault()
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const row = el && el.closest('[data-row-id]')
      if (!row) return
      const overKey = row.getAttribute('data-row-id')
      const d = dragRef.current
      if (!d || !overKey || overKey === d) return
      const keys = rowsRef.current.map((x) => x.key)
      const from = keys.indexOf(d)
      const to = keys.indexOf(overKey)
      if (from < 0 || to < 0 || from === to) return
      keys.splice(from, 1)
      keys.splice(to, 0, d)
      relayout(keys)
    }
    function onUp() {
      const d = dragRef.current
      if (d) scheduleSave(rowsRef.current.map((x) => x.key))
      suppressClick.current = true
      setTimeout(() => { suppressClick.current = false }, 60)
      dragRef.current = null
      setDragKey(null)
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
  }, [dragKey, relayout, scheduleSave])

  function onCardClick(key) {
    if (suppressClick.current) return
    nav(`/admin/notifs/${key}`)
  }

  return (
    <div className="page admin-page aq-page admin-notifs-page">
      {error && <div className="alert alert-error">{error}</div>}
      <section>
        <div className="aq-section-head">
          <span className="aq-section-title">알림 메시지</span>
          <span className="aq-count">{rows.length}</span>
          <span className="aq-sort-toggle">
            <span className="aq-sort-toggle-label">정렬 수정</span>
            <CgToggle on={sortMode} onClick={() => setSortMode((v) => !v)} />
          </span>
        </div>
        {loading ? <div className="spinner" /> : rows.length === 0 ? (
          <p className="muted sm">등록된 알림이 없습니다.</p>
        ) : (
          <div className="aq-cards">
            {rows.map((r) => (
              <button
                key={r.key}
                type="button"
                className={`aq-card${sortMode ? ' aq-card-draggable' : ''}${dragKey === r.key ? ' is-dragging' : ''}${r.active === false ? ' inactive' : ''}`}
                data-row-id={r.key}
                style={dragKey ? { touchAction: 'none' } : undefined}
                onClick={() => onCardClick(r.key)}
                onPointerDown={(e) => onIconPointerDown(e, r.key)}
              >
                <span className="aq-card-icon" style={r.emoji_bg ? { background: r.emoji_bg } : undefined} aria-hidden="true">{r.emoji || '🔔'}</span>
                <span className="aq-card-body">
                  <span className="aq-card-name">{r.title}</span>
                  <span className="aq-card-desc">{r.body}</span>
                </span>
                <span className="aq-card-chevron" aria-hidden="true">›</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <Link to="/admin/notifs/new" className="aq-fab" aria-label="알림 메시지 추가">
        <svg width="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </Link>
    </div>
  )
}
