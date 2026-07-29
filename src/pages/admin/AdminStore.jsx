import { useEffect, useState, useCallback, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { adminListStoreItems, adminReorderStoreItems } from '../../lib/api'
import { formatCoin } from '../../lib/constants'
import { CAT, CAT_ORDER, catOf } from '../../lib/storeMeta'

// 상세로 들어갔다가 뒤로 나올 때(컴포넌트 재마운트) 직전 탭을 유지하기 위한 모듈 변수
let lastStoreTab = 'general'

// 상점 관리 — 일반/프리미엄 탭. 카테고리별 섹션 + ▲▼ / 길게 눌러 드래그로 정렬.
export default function AdminStore() {
  const nav = useNavigate()
  const [items, setItems] = useState([])
  const [tab, setTabState] = useState(lastStoreTab) // 'general' | 'premium'
  const setTab = (t) => { lastStoreTab = t; setTabState(t) }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // 낙관적 정렬: 로컬 즉시 반영 + 마지막 조작 후 디바운스로 한 번만 저장
  const pendingRef = useRef(new Map())   // id -> sortOrder
  const saveTimer = useRef(null)
  const itemsRef = useRef(items)         // 드래그 종료 시 최신 순서 읽기용 미러
  useEffect(() => { itemsRef.current = items }, [items])

  const load = useCallback(async () => {
    setLoading(true)
    try { setItems(await adminListStoreItems()) }
    catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const flushSave = useCallback(async () => {
    const ups = [...pendingRef.current.entries()].map(([id, sortOrder]) => ({ id, sortOrder }))
    pendingRef.current.clear()
    if (!ups.length) return
    try { await adminReorderStoreItems(ups) }
    catch (err) { setError('정렬 저장에 실패했어요: ' + err.message); load() }
  }, [load])
  // 언마운트 시 대기 중인 저장 반영
  useEffect(() => () => { clearTimeout(saveTimer.current); flushSave() }, [flushSave])

  const list = items.filter((it) => (tab === 'premium' ? it.premium : !it.premium))
  const sections = CAT_ORDER.map((key) => ({
    key, label: CAT[key],
    items: list.filter((it) => catOf(it.id, it.category) === key).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)),
  })).filter((s) => s.items.length)

  // 한 섹션의 현재 정렬 순서를 sortOrder(10 간격)로 재부여 → items 상태에 반영
  const relayoutSection = useCallback((sectionKey, orderedIds) => {
    const map = new Map(orderedIds.map((id, i) => [id, (i + 1) * 10]))
    setItems((prev) => prev.map((x) => (map.has(x.id) ? { ...x, sortOrder: map.get(x.id) } : x)))
  }, [])

  const scheduleSave = useCallback((orderedIds) => {
    orderedIds.forEach((id, i) => pendingRef.current.set(id, (i + 1) * 10))
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(flushSave, 600)
  }, [flushSave])

  // 섹션 내 한 칸 이동(▲▼) — 로컬 즉시 반영, 저장은 디바운스로 묶어서 한 번만
  function move(sectionKey, sectionItems, it, dir) {
    const idx = sectionItems.findIndex((x) => x.id === it.id)
    const j = idx + dir
    if (j < 0 || j >= sectionItems.length) return
    const reordered = [...sectionItems]
    ;[reordered[idx], reordered[j]] = [reordered[j], reordered[idx]]
    const ids = reordered.map((x) => x.id)
    relayoutSection(sectionKey, ids)
    scheduleSave(ids)
  }

  // ── 길게 눌러 드래그 정렬 ──────────────────────────────
  const pressRef = useRef(null)  // { id, sectionKey, startY, timer }
  const dragRef = useRef(null)   // { id, sectionKey }
  const suppressClick = useRef(false)
  const [dragId, setDragId] = useState(null)

  const currentSectionIds = useCallback((sectionKey) => (
    itemsRef.current
      .filter((x) => (tab === 'premium' ? x.premium : !x.premium) && catOf(x.id, x.category) === sectionKey)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
      .map((x) => x.id)
  ), [tab])

  const clearPress = () => { if (pressRef.current) { clearTimeout(pressRef.current.timer); pressRef.current = null } }

  function onRowPointerDown(e, sectionKey, it) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    clearPress()
    const startY = e.clientY
    const timer = setTimeout(() => {
      dragRef.current = { id: it.id, sectionKey }
      setDragId(it.id)
      if (navigator.vibrate) { try { navigator.vibrate(12) } catch { /* noop */ } }
    }, 350)
    pressRef.current = { id: it.id, sectionKey, startY, timer }
  }
  // 드래그 활성화 전 스크롤로 판단되면 롱프레스 취소
  function onRowPointerMove(e) {
    if (!pressRef.current || dragRef.current) return
    if (Math.abs(e.clientY - pressRef.current.startY) > 8) clearPress()
  }
  function onRowPointerUp() { clearPress() }

  // 드래그 중 전역 이동/종료 처리
  useEffect(() => {
    if (!dragId) return
    function onMove(e) {
      e.preventDefault()
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const row = el && el.closest('[data-row-id]')
      if (!row) return
      const overId = row.getAttribute('data-row-id')
      const secKey = row.getAttribute('data-sec')
      const d = dragRef.current
      if (!d || !overId || secKey !== d.sectionKey || overId === d.id) return
      const ids = currentSectionIds(d.sectionKey)
      const from = ids.indexOf(d.id)
      const to = ids.indexOf(overId)
      if (from < 0 || to < 0 || from === to) return
      ids.splice(from, 1)
      ids.splice(to, 0, d.id)
      relayoutSection(d.sectionKey, ids)
    }
    function onUp() {
      const d = dragRef.current
      if (d) scheduleSave(currentSectionIds(d.sectionKey))
      suppressClick.current = true
      setTimeout(() => { suppressClick.current = false }, 60)
      dragRef.current = null
      setDragId(null)
    }
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [dragId, currentSectionIds, relayoutSection, scheduleSave])

  function onRowClick(it) {
    if (suppressClick.current) return
    nav(`/admin/store/${it.id}`)
  }

  return (
    <div className="page admin-page">
      {error && <div className="alert alert-error">{error}</div>}

      <div className="seg-tabs">
        <button type="button" className={`seg-tab ${tab === 'general' ? 'active' : ''}`} onClick={() => setTab('general')}>일반 상점</button>
        <button type="button" className={`seg-tab ${tab === 'premium' ? 'active' : ''}`} onClick={() => setTab('premium')}>프리미엄 상점</button>
      </div>

      <div className="card">
        <div className="admin-list-head">
          <h3 className="card-title" style={{ margin: 0 }}>아이템 <span className="muted">({list.length})</span></h3>
          <Link to="/admin/store/new" className="btn btn-sm btn-primary">아이템 추가</Link>
        </div>
        <p className="muted sm" style={{ margin: '0 0 10px' }}>행을 길게 눌러 드래그하거나 ▲▼ 로 순서를 바꿀 수 있어요.</p>
        {loading ? <div className="spinner" /> : sections.length === 0 ? (
          <p className="muted sm">아이템이 없습니다.</p>
        ) : (
          sections.map((sec) => (
            <div key={sec.key} className="admin-cat">
              <div className="admin-cat-title">{sec.label} <span className="muted sm">{sec.items.length}</span></div>
              <ul className="admin-rows">
                {sec.items.map((it, i) => (
                  <li
                    key={it.id}
                    className={`admin-row-wrap${dragId === it.id ? ' is-dragging' : ''}`}
                    data-row-id={it.id}
                    data-sec={sec.key}
                    style={dragId ? { touchAction: 'none' } : undefined}
                  >
                    <button
                      type="button"
                      className="admin-row"
                      onClick={() => onRowClick(it)}
                      onPointerDown={(e) => onRowPointerDown(e, sec.key, it)}
                      onPointerMove={onRowPointerMove}
                      onPointerUp={onRowPointerUp}
                      onPointerLeave={onRowPointerUp}
                      style={{ opacity: it.isActive ? (dragId === it.id ? .85 : 1) : .5 }}
                    >
                      <span className="admin-row-grip" aria-hidden="true">⠿</span>
                      <span className="admin-row-emoji" aria-hidden="true">{it.emoji || '🐾'}</span>
                      <span className="admin-row-main">{it.name}{!it.isActive && <span className="muted sm"> · 숨김</span>}</span>
                      <span className="admin-row-price">{formatCoin(it.price)}</span>
                    </button>
                    <div className="admin-ord">
                      <button type="button" className="admin-ord-btn" disabled={i === 0} aria-label="위로" onClick={() => move(sec.key, sec.items, it, -1)}>▲</button>
                      <button type="button" className="admin-ord-btn" disabled={i === sec.items.length - 1} aria-label="아래로" onClick={() => move(sec.key, sec.items, it, 1)}>▼</button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
