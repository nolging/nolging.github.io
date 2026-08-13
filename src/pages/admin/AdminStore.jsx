import { useEffect, useState, useCallback, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { adminListStoreItems, adminReorderStoreItems } from '../../lib/api'
import { formatCoin } from '../../lib/constants'
import { CAT, CAT_ORDER, catOf, imgBgOf, itemName } from '../../lib/storeMeta'
import { flagsToKind, ITEM_KIND_SHORT } from './adminMeta'
import StoreItemImage from '../../components/StoreItemImage'
import { decoSlot } from '../../components/AvatarDeco'

// 프로필 꾸미기 유형 배지(머리/얼굴/안경/테두리) — 신규 아이템은 deco_slot 에 한글 그대로 저장되므로
// 매핑에 없으면 원문을 그대로 표시
const SLOT_LABEL = { head: '머리', face: '얼굴', glasses: '안경' }
const slotLabel = (slot) => SLOT_LABEL[slot] || slot

// 상세로 들어갔다가 뒤로 나올 때(컴포넌트 재마운트) 직전 탭을 유지하기 위한 모듈 변수
let lastStoreTab = 'general'

// 상점 관리 — 일반/프리미엄 탭. 카테고리별 섹션 + 미리보기 이미지를 잡고 드래그로 정렬.
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

  // ── 미리보기 이미지를 잡고 드래그 정렬 ──────────────────────────────
  const dragRef = useRef(null)   // { id, sectionKey }
  const suppressClick = useRef(false)
  const [dragId, setDragId] = useState(null)

  const currentSectionIds = useCallback((sectionKey) => (
    itemsRef.current
      .filter((x) => (tab === 'premium' ? x.premium : !x.premium) && catOf(x.id, x.category) === sectionKey)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
      .map((x) => x.id)
  ), [tab])

  // 포인터를 캡처해 이후 move/up 이벤트를 계속 받고(핑거가 카드를 벗어나도),
  // 모바일에서 스크롤로 가로채가지 않게 한다.
  function onCardPointerDown(e, sectionKey, it) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (!e.target?.closest?.('.aq-card-icon')) return
    e.preventDefault()
    dragRef.current = { id: it.id, sectionKey }
    try { e.currentTarget?.setPointerCapture?.(e.pointerId) } catch { /* noop */ }
    setDragId(it.id)
    if (navigator.vibrate) { try { navigator.vibrate(12) } catch { /* noop */ } }
  }

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
    // iOS Safari 는 pointermove.preventDefault 로 스크롤이 안 막힘 → touchmove 를 직접 막는다
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
  }, [dragId, currentSectionIds, relayoutSection, scheduleSave])

  function onCardClick(it) {
    if (suppressClick.current) return
    nav(`/admin/store/${it.id}`)
  }

  return (
    <div className="page admin-page admin-store-page aq-page">
      {error && <div className="alert alert-error">{error}</div>}

      <div className="admin-store-tabbar">
        <div className="seg-tabs">
          <button type="button" className={`seg-tab ${tab === 'general' ? 'active' : ''}`} onClick={() => setTab('general')}>일반 상점</button>
          <button type="button" className={`seg-tab ${tab === 'premium' ? 'active' : ''}`} onClick={() => setTab('premium')}>프리미엄 상점</button>
        </div>
      </div>

      {loading && <div className="spinner" />}
      {!loading && sections.length === 0 && <p className="muted sm">아이템이 없습니다.</p>}
      {!loading && sections.map((sec) => (
        <div key={sec.key} className="admin-cat">
          <div className="aq-section-head">
            <span className="aq-section-title">{sec.label}</span>
            <span className="aq-count">{sec.items.length}</span>
          </div>
          <div className="aq-cards">
            {sec.items.map((it) => {
              const slot = it.decoSlot || decoSlot(it.id)
              const kindKey = flagsToKind(it.premium, it.tier)
              const tierLabel = tab === 'premium' ? ITEM_KIND_SHORT[kindKey] : null
              const statusLabel = it.adminOnly ? '비매품' : (it.isActive ? '판매' : '숨김')
              const statusOn = !it.adminOnly && it.isActive
              const dimmed = !it.isActive || it.adminOnly
              const badges = (
                <span className="aq-card-badges">
                  {tierLabel && <span className="aq-badge-target">{tierLabel}</span>}
                  <span className={`aq-badge-status ${statusOn ? 'on' : ''}`}>{statusLabel}</span>
                </span>
              )
              return (
                <button
                  key={it.id}
                  type="button"
                  className={`aq-card aq-card-draggable${dragId === it.id ? ' is-dragging' : ''}${dimmed ? ' inactive' : ''}`}
                  data-row-id={it.id}
                  data-sec={sec.key}
                  style={dragId ? { touchAction: 'none' } : undefined}
                  onClick={() => onCardClick(it)}
                  onPointerDown={(e) => onCardPointerDown(e, sec.key, it)}
                >
                  <span className="aq-card-icon" style={{ background: it.imageBg || imgBgOf(it.id, it.premium) }} aria-hidden="true">
                    <StoreItemImage id={it.id} emoji={it.emoji} svg={it.imageSvg} className="aq-card-img" />
                  </span>
                  <span className="aq-card-body">
                    <span className="aq-card-title-row">
                      <span className="aq-card-name">{itemName(it.id, it.name)}</span>
                      {slot && <span className="aq-badge-target">{slotLabel(slot)}</span>}
                    </span>
                    <span className="aq-card-badges-mobile">{badges}</span>
                    {it.description ? <span className="aq-card-desc aq-card-desc-desktop">{it.description}</span> : null}
                  </span>
                  <span className="aq-card-reward">{formatCoin(it.price)}</span>
                  <span className="aq-card-badges-desktop">{badges}</span>
                  <span className="aq-card-chevron" aria-hidden="true">›</span>
                </button>
              )
            })}
          </div>
        </div>
      ))}

      <Link to="/admin/store/new" state={{ kind: tab === 'premium' ? 'prem' : 'general' }}
        className="aq-fab" aria-label={tab === 'premium' ? '프리미엄 상점 아이템 추가' : '일반 상점 아이템 추가'}>
        <svg width="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </Link>
    </div>
  )
}
