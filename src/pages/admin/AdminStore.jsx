import { useEffect, useState, useCallback, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { adminListStoreItems, adminReorderStoreItems } from '../../lib/api'
import { formatCoin } from '../../lib/constants'
import { CAT, CAT_ORDER, catOf } from '../../lib/storeMeta'

// 상세로 들어갔다가 뒤로 나올 때(컴포넌트 재마운트) 직전 탭을 유지하기 위한 모듈 변수
let lastStoreTab = 'general'

// 상점 관리 — 일반/프리미엄 탭. 카테고리별 섹션 + ▲▼ 로 정렬(숫자 직접 입력 없음).
export default function AdminStore() {
  const nav = useNavigate()
  const [items, setItems] = useState([])
  const [tab, setTabState] = useState(lastStoreTab) // 'general' | 'premium'
  const setTab = (t) => { lastStoreTab = t; setTabState(t) }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // 낙관적 정렬: 로컬 즉시 반영 + 마지막 클릭 후 디바운스로 한 번만 저장
  const pendingRef = useRef(new Map())   // id -> sortOrder
  const saveTimer = useRef(null)

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

  // 섹션 내 한 칸 이동 — 로컬 즉시 반영, 저장은 디바운스(0.6s)로 묶어서 한 번만
  function move(sectionItems, it, dir) {
    const idx = sectionItems.findIndex((x) => x.id === it.id)
    const j = idx + dir
    if (j < 0 || j >= sectionItems.length) return
    const reordered = [...sectionItems]
    ;[reordered[idx], reordered[j]] = [reordered[j], reordered[idx]]
    const orders = reordered.map((x, i) => ({ id: x.id, sortOrder: (i + 1) * 10 }))
    const map = new Map(orders.map((o) => [o.id, o.sortOrder]))
    setItems((prev) => prev.map((x) => (map.has(x.id) ? { ...x, sortOrder: map.get(x.id) } : x)))
    orders.forEach((o) => pendingRef.current.set(o.id, o.sortOrder))
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(flushSave, 600)
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
        {loading ? <div className="spinner" /> : sections.length === 0 ? (
          <p className="muted sm">아이템이 없습니다.</p>
        ) : (
          sections.map((sec) => (
            <div key={sec.key} className="admin-cat">
              <div className="admin-cat-title">{sec.label} <span className="muted sm">{sec.items.length}</span></div>
              <ul className="admin-rows">
                {sec.items.map((it, i) => (
                  <li key={it.id} className="admin-row-wrap">
                    <button type="button" className="admin-row" onClick={() => nav(`/admin/store/${it.id}`)} style={{ opacity: it.isActive ? 1 : .5 }}>
                      <span className="admin-row-emoji" aria-hidden="true">{it.emoji || '🐾'}</span>
                      <span className="admin-row-main">{it.name}{!it.isActive && <span className="muted sm"> · 숨김</span>}</span>
                      <span className="admin-row-price">{formatCoin(it.price)}</span>
                    </button>
                    <div className="admin-ord">
                      <button type="button" className="admin-ord-btn" disabled={i === 0} aria-label="위로" onClick={() => move(sec.items, it, -1)}>▲</button>
                      <button type="button" className="admin-ord-btn" disabled={i === sec.items.length - 1} aria-label="아래로" onClick={() => move(sec.items, it, 1)}>▼</button>
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
