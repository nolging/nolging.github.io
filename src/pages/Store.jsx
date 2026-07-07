import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import Modal from '../components/Modal'
import { STORE_ITEMS, formatCoin } from '../lib/constants'
import { purchaseItem } from '../lib/api'

export default function Store() {
  const { refreshCoin } = useOutletContext()
  const [selected, setSelected] = useState(null)
  const [buying, setBuying] = useState(false)
  // 안내 메시지 { type: 'ok' | 'err' | 'info', text }
  const [notice, setNotice] = useState(null)

  function open(item) {
    setNotice(null)
    setBuying(false)
    setSelected(item)
  }
  function close() {
    setSelected(null)
    setNotice(null)
    setBuying(false)
  }

  async function handleBuy() {
    if (!selected || buying) return
    setBuying(true)
    setNotice(null)
    try {
      await purchaseItem(selected.id)
      await refreshCoin?.()
      setNotice({ type: 'ok', text: `${selected.name} 구매 완료! 🎉` })
    } catch (err) {
      setNotice({ type: 'err', text: err.message })
    } finally {
      setBuying(false)
    }
  }

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
                disabled={selected.giftOnly || buying || notice?.type === 'ok'}
                onClick={handleBuy}
              >
                {buying ? '구매 중…' : '구매하기'}
              </button>
              <button
                type="button"
                className="btn"
                disabled={buying}
                onClick={() => setNotice({ type: 'info', text: '아직 준비 중인 기능이에요 🐾' })}
              >
                선물하기
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
