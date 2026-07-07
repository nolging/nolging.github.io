import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import Modal from '../components/Modal'
import RecipientPicker from '../components/RecipientPicker'
import { formatCoin } from '../lib/constants'
import { listStoreItems, purchaseItem, giftItem } from '../lib/api'

// 아이템 이미지: public/store/{id}.svg 를 우선 사용하고, 없으면 이모지로 폴백.
function ItemImage({ id, emoji, className }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [id])
  return (
    <span className={className} aria-hidden="true">
      {failed
        ? emoji
        : <img className="store-img" src={`/store/${id}.svg`} alt="" onError={() => setFailed(true)} />}
    </span>
  )
}

export default function Store() {
  const { refreshCoin } = useOutletContext()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [selected, setSelected] = useState(null)
  const [busy, setBusy] = useState(false)        // 구매/선물 처리 중
  const [pickOpen, setPickOpen] = useState(false) // 선물 받는 사람 선택
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

  function open(item) {
    setNotice(null)
    setBusy(false)
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
      await purchaseItem(selected.id)
      await refreshCoin?.()
      setNotice({ type: 'ok', text: `${selected.name} 구매 완료! 🎉` })
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
      await giftItem(selected.id, r.groupId, r.userId)
      await refreshCoin?.()
      setNotice({ type: 'ok', text: `${r.name} 님에게 ${selected.name}을(를) 선물했어요! 🎁` })
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

      {loading ? (
        <div className="spinner" />
      ) : items.length === 0 ? (
        <div className="empty">판매 중인 아이템이 없어요.</div>
      ) : (
        <div className="store-grid">
          {items.map((item) => (
            <button key={item.id} type="button" className="store-card" onClick={() => open(item)}>
              <ItemImage id={item.id} emoji={item.emoji} className="store-card-img" />
              <span className="store-card-name">{item.name}</span>
              <span className="store-card-price">{formatCoin(item.price)}</span>
            </button>
          ))}
        </div>
      )}

      <Modal open={!!selected} onClose={close}>
        {selected && (
          <div className="store-detail">
            <ItemImage id={selected.id} emoji={selected.emoji} className="store-detail-img" />
            <h3 className="store-detail-name">{selected.name}</h3>
            <p className="store-detail-desc">{selected.desc}</p>
            <div className="store-detail-price">{formatCoin(selected.price)}</div>

            {notice && (
              <div className={`store-notice ${notice.type === 'err' ? 'is-err' : notice.type === 'ok' ? 'is-ok' : ''}`}>
                {notice.text}
              </div>
            )}

            <div className="store-detail-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={selected.giftOnly || busy || done}
                onClick={handleBuy}
              >
                {busy ? '처리 중…' : '구매하기'}
              </button>
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
