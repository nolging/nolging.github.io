import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { adminListStoreItems } from '../../lib/api'
import { formatCoin } from '../../lib/constants'

// 상세로 들어갔다가 뒤로 나올 때(컴포넌트 재마운트) 직전 탭을 유지하기 위한 모듈 변수
let lastStoreTab = 'general'

// 상점 관리 — 일반/프리미엄 탭. 각 탭에서 이모지/이름/가격만. 행 클릭 → 상세/수정.
export default function AdminStore() {
  const nav = useNavigate()
  const [items, setItems] = useState([])
  const [tab, setTabState] = useState(lastStoreTab) // 'general' | 'premium'
  const setTab = (t) => { lastStoreTab = t; setTabState(t) }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try { setItems(await adminListStoreItems()) }
    catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const list = items.filter((it) => (tab === 'premium' ? it.premium : !it.premium))

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
        {loading ? <div className="spinner" /> : list.length === 0 ? (
          <p className="muted sm">아이템이 없습니다.</p>
        ) : (
          <ul className="admin-rows">
            {list.map((it) => (
              <li key={it.id}>
                <button type="button" className="admin-row" onClick={() => nav(`/admin/store/${it.id}`)} style={{ opacity: it.isActive ? 1 : .5 }}>
                  <span className="admin-row-emoji" aria-hidden="true">{it.emoji || '🐾'}</span>
                  <span className="admin-row-main">{it.name}{!it.isActive && <span className="muted sm"> · 숨김</span>}</span>
                  <span className="admin-row-side">
                    <span className="admin-row-price">{formatCoin(it.price)}</span>
                    <span className="admin-row-caret" aria-hidden="true">›</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
