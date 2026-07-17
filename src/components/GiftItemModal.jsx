import { useEffect, useState } from 'react'
import Modal from './Modal'
import Avatar from './Avatar'
import RecipientPicker from './RecipientPicker'
import StoreItemImage from './StoreItemImage'
import { imgBgOf } from '../lib/storeMeta'

// 상점·인벤토리 공용 "아이템 선물" 모달.
// item: { id, name, emoji }, qty: 수량, onSend(recipient, message) → Promise
export default function GiftItemModal({ open, onClose, item, qty = 1, onSend }) {
  const [recipient, setRecipient] = useState(null)
  const [message, setMessage] = useState('')
  const [pickOpen, setPickOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) { setRecipient(null); setMessage(''); setPickOpen(false); setError(''); setSending(false) }
  }, [open])

  if (!item) return null

  async function send() {
    if (!recipient) { setError('받는 사람을 선택해 주세요.'); return }
    setSending(true); setError('')
    try { await onSend(recipient, message.trim()); onClose() }
    catch (e) { setError(e.message); setSending(false) }
  }

  return (
    <>
      <Modal open={open && !pickOpen} onClose={onClose} cardClassName="nc-link-modal">
        <div className="nc-link">
          <div className="nc-link-head">
            <span className="nc-link-ico" style={{ background: '#fde8ee' }}>📦</span>
            <div><div className="nc-link-name">아이템 선물</div><div className="nc-link-sub">간단한 쪽지와 함께 아이템을 선물해요</div></div>
          </div>
          {error && <div className="alert alert-error nc-modal-alert">{error}</div>}

          <button type="button" className="nc-to" onClick={() => setPickOpen(true)}>
            <span className="nc-label">To.</span>
            {recipient
              ? <span className="nc-to-val"><Avatar src={recipient.avatar} name={recipient.name} size={26} />{recipient.name}</span>
              : <span className="nc-placeholder">받는 사람을 선택하세요</span>}
            <svg className="nc-chev" width="16" viewBox="0 0 24 24" fill="none" stroke="#b0b0b8" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18" /></svg>
          </button>

          <div className="nc-body-wrap">
            <textarea className="nc-body" placeholder="함께 보낼 메시지(선택)" value={message} maxLength={150} rows={4}
              onChange={(e) => setMessage(e.target.value.slice(0, 150))} />
            <span className="nc-count">{message.length}/150</span>
          </div>

          <div className="gift-sum">
            <span className="gift-sum-ico" style={{ background: imgBgOf(item.id) }}>
              <StoreItemImage id={item.id} emoji={item.emoji} className="nc-img" />
            </span>
            <span className="gift-sum-name">{item.name}{qty > 1 && <span className="gift-sum-qty"> ×{qty}</span>}</span>
          </div>

          <button type="button" className="nc-sheet-confirm" onClick={send} disabled={sending}>
            {sending ? '보내는 중…' : '보내기'}
          </button>
        </div>
      </Modal>
      <RecipientPicker open={pickOpen} onClose={() => setPickOpen(false)} title="선물 받는 사람"
        onPick={(r) => { setRecipient(r); setPickOpen(false) }} />
    </>
  )
}
