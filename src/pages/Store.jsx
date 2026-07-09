import { useCallback, useEffect, useState } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/Modal'
import RecipientPicker from '../components/RecipientPicker'
import StoreItemImage from '../components/StoreItemImage'
import { formatCoin } from '../lib/constants'
import { listStoreItems, purchaseItem, giftItem, ownsCoupleRing, listInventory } from '../lib/api'

export default function Store() {
  const { refreshCoin } = useOutletContext()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [selected, setSelected] = useState(null)
  const [busy, setBusy] = useState(false)        // 구매/선물 처리 중
  const [pickOpen, setPickOpen] = useState(false) // 선물 받는 사람 선택
  const [ownsCouple, setOwnsCouple] = useState(false) // 커플 링 보유 여부
  const [qty, setQty] = useState(1)              // 구매/선물 수량
  const [invCounts, setInvCounts] = useState({}) // itemId → 보유 개수
  // 안내 메시지 { type: 'ok' | 'err' | 'info', text }
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    let on = true
    listStoreItems()
      .then((rows) => { if (on) setItems(rows) })
      .catch((err) => { if (on) setLoadError(err.message) })
      .finally(() => { if (on) setLoading(false) })
    return () => { on = false }
  }, [])

  useEffect(() => {
    if (!user?.id) return
    ownsCoupleRing(user.id).then(setOwnsCouple).catch(() => {})
  }, [user?.id])

  // 인벤토리 보유 개수(active) 집계
  const loadCounts = useCallback(async () => {
    if (!user?.id) return
    try {
      const rows = await listInventory(user.id)
      const m = {}
      for (const r of rows) { if (r.status === 'active') m[r.item_id] = (m[r.item_id] || 0) + 1 }
      setInvCounts(m)
    } catch { /* noop */ }
  }, [user?.id])
  useEffect(() => { loadCounts() }, [loadCounts])

  function open(item) {
    setNotice(null)
    setBusy(false)
    setQty(1)
    setSelected(item)
  }
  function close() {
    setSelected(null)
    setNotice(null)
    setBusy(false)
  }

  async function handleBuy() {
    if (!selected || busy) return
    setBusy(true)
    setNotice(null)
    try {
      await purchaseItem(selected.id, qty)
      await refreshCoin?.()
      await loadCounts()
      if (selected.id === 'couple-ring') setOwnsCouple(true)
      setNotice({ type: 'ok', text: `${selected.name}${qty > 1 ? ` ${qty}개` : ''} 구매 완료! 🎉` })
    } catch (err) {
      setNotice({ type: 'err', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  async function handleGift(r) {
    if (!selected || busy) return
    setPickOpen(false)
    setBusy(true)
    setNotice(null)
    try {
      await giftItem(selected.id, r.groupId, r.userId, qty)
      await refreshCoin?.()
      setNotice({ type: 'ok', text: `${r.name} 님 쪽지함으로 ${selected.name}${qty > 1 ? ` ${qty}개` : ''}을(를) 보냈어요! 🎁 (상대가 수령하면 인벤토리에 들어가요)` })
    } catch (err) {
      setNotice({ type: 'err', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const done = notice?.type === 'ok'

  return (
    <div className="page">
      {loadError && <div className="alert alert-error">{loadError}</div>}

      <div className="store-toolbar">
        <button type="button" className="btn btn-sm inv-link" onClick={() => navigate('/inventory')}>
          🎒 인벤토리
        </button>
      </div>

      {loading ? (
        <div className="spinner" />
      ) : items.length === 0 ? (
        <div className="empty">판매 중인 아이템이 없어요.</div>
      ) : (
        <div className="store-grid">
          {items.map((item) => (
            <button key={item.id} type="button" className="store-card" onClick={() => open(item)}>
              <StoreItemImage id={item.id} emoji={item.emoji} className="store-card-img" />
              <span className="store-card-name">{item.name}</span>
              <span className="store-card-price">{formatCoin(item.price)}</span>
            </button>
          ))}
        </div>
      )}

      <Modal open={!!selected} onClose={close}>
        {selected && (
          <div className="store-detail">
            <span className="store-owned">{invCounts[selected.id] || 0} 개 보유</span>
            <StoreItemImage id={selected.id} emoji={selected.emoji} className="store-detail-img" />
            <h3 className="store-detail-name">{selected.name}</h3>
            <p className="store-detail-desc">{selected.desc}</p>
            <div className="store-detail-price">{formatCoin(selected.price * qty)}</div>

            {notice && (
              <div className={`store-notice ${notice.type === 'err' ? 'is-err' : notice.type === 'ok' ? 'is-ok' : ''}`}>
                {notice.text}
              </div>
            )}

            {(() => {
              const maxQty = selected.id === 'couple-ring' ? 1 : 99
              return (
                <div className="store-qty">
                  <button type="button" className="store-qty-btn" aria-label="수량 감소"
                    disabled={qty <= 1 || busy || done} onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
                  <span className="store-qty-num">{qty}</span>
                  <button type="button" className="store-qty-btn" aria-label="수량 증가"
                    disabled={qty >= maxQty || busy || done} onClick={() => setQty((q) => Math.min(maxQty, q + 1))}>+</button>
                </div>
              )
            })()}

            <div className="store-detail-actions">
              {(() => {
                const ownedCouple = selected.id === 'couple-ring' && ownsCouple
                return (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={selected.giftOnly || busy || done || ownedCouple}
                    onClick={handleBuy}
                  >
                    {ownedCouple ? '보유 중' : busy ? '처리 중…' : '구매하기'}
                  </button>
                )
              })()}
              <button
                type="button"
                className="btn"
                disabled={busy || done}
                onClick={() => { setNotice(null); setPickOpen(true) }}
              >
                선물하기
              </button>
            </div>
          </div>
        )}
      </Modal>

      <RecipientPicker open={pickOpen} onClose={() => setPickOpen(false)} onPick={handleGift} title="선물 받는 사람" />
    </div>
  )
}
