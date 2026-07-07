import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import Modal from '../components/Modal'
import RecipientPicker from '../components/RecipientPicker'
import { STORE_ITEMS, formatCoin } from '../lib/constants'
import { purchaseItem, giftItem } from '../lib/api'

export default function Store() {
  const { refreshCoin } = useOutletContext()
  const [selected, setSelected] = useState(null)
  const [busy, setBusy] = useState(false)        // 구매/선물 처리 중
  const [pickOpen, setPickOpen] = useState(false) // 선물 받는 사람 선택
  // 안내 메시지 { type: 'ok' | 'err' | 'info', text }
  const [notice, setNotice] = useState(null)

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
      <div className="store-grid">
        {STORE_ITEMS.map((item) => (
          <button key={item.id} type="button" className="store-card" onClick={() => open(item)}>
            <span className="store-card-img" aria-hidden="true">{item.emoji}</span>
            <span className="store-card-name">{item.name}</span>
            <span className="store-card-price">{formatCoin(item.price)}</span>
          </button>
        ))}
      </div>

      <Modal open={!!selected} onClose={close}>
        {selected && (
          <div className="store-detail">
            <span className="store-detail-img" aria-hidden="true">{selected.emoji}</span>
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
