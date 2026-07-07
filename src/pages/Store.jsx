import { useState } from 'react'
import Modal from '../components/Modal'
import { STORE_ITEMS, formatCoin } from '../lib/constants'

export default function Store() {
  const [selected, setSelected] = useState(null)
  // 준비 중 안내(구매/선물 버튼) — 아직 미구현
  const [notice, setNotice] = useState('')

  function open(item) {
    setNotice('')
    setSelected(item)
  }
  function close() {
    setSelected(null)
    setNotice('')
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

            {notice && <div className="store-notice">{notice}</div>}

            <div className="store-detail-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={selected.giftOnly}
                onClick={() => setNotice('아직 준비 중인 기능이에요 🐾')}
              >
                구매하기
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setNotice('아직 준비 중인 기능이에요 🐾')}
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
