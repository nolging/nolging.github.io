import { useEffect, useState } from 'react'
import Modal from './Modal'
import LedBanner, { LED_COLORS } from './LedBanner'
import { useLedboard, editLedBanner, stopLedBanner } from '../lib/api'

export const MAX_LED_TEXT = 60

function LedColorPicker({ color, onChange }) {
  return (
    <div className="led-swatches">
      {LED_COLORS.map((c) => (
        <button key={c} type="button" className={`led-swatch led-sw-${c} ${color === c ? 'on' : ''}`}
          aria-label={c} onClick={() => onChange(c)} />
      ))}
    </div>
  )
}

function remainText(expiresAt) {
  const ms = new Date(expiresAt).getTime() - Date.now()
  const totalMin = Math.max(0, Math.floor(ms / 60000))
  return `${Math.floor(totalMin / 60)} 시간 ${totalMin % 60} 분`
}

// 전광판 게재(문구+색상)
export function LedboardModal({ open, onClose, onDone }) {
  const [text, setText] = useState('')
  const [color, setColor] = useState('amber')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { if (open) { setText(''); setColor('amber'); setError(''); setSending(false) } }, [open])

  async function go() {
    if (!text.trim()) { setError('문구를 입력해 주세요.'); return }
    setSending(true); setError('')
    try { await useLedboard({ text: text.trim(), color }); await onDone(); onClose() }
    catch (e) { setError(e.message); setSending(false) }
  }
  return (
    <Modal open={open} onClose={onClose} title="전광판">
      <div className="couple-modal">
        {error && <div className="alert alert-error">{error}</div>}
        <p className="couple-hint">24 시간 동안 우리 커플에게만 보여요.</p>
        <LedBanner text={text || '미리보기'} color={color} />
        <div className="couple-msg">
          <textarea className="wish-input" placeholder="전광판에 띄울 문구"
            value={text} maxLength={MAX_LED_TEXT} onChange={(e) => setText(e.target.value)} rows={2} />
          <span className="couple-msg-count">{text.length}/{MAX_LED_TEXT}</span>
        </div>
        <LedColorPicker color={color} onChange={setColor} />
        <button type="button" className="btn btn-primary btn-block" onClick={go} disabled={sending}>
          {sending ? '게재 중…' : '게재하기'}
        </button>
      </div>
    </Modal>
  )
}

// 전광판 수정 / 게재 중단
export function LedEditModal({ open, onClose, banner, onDone }) {
  const [text, setText] = useState('')
  const [color, setColor] = useState('amber')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmStop, setConfirmStop] = useState(false)
  useEffect(() => {
    if (open && banner) { setText(banner.text || ''); setColor(banner.color || 'amber'); setError(''); setBusy(false); setConfirmStop(false) }
  }, [open, banner])

  async function save() {
    if (!text.trim()) { setError('문구를 입력해 주세요.'); return }
    setBusy(true); setError('')
    try { await editLedBanner({ text: text.trim(), color }); await onDone(); onClose() }
    catch (e) { setError(e.message); setBusy(false) }
  }
  async function stop() {
    setBusy(true); setError('')
    try { await stopLedBanner(); await onDone(); onClose() }
    catch (e) { setError(e.message); setBusy(false) }
  }
  return (
    <Modal open={open} onClose={onClose} title="전광판 수정">
      <div className="couple-modal">
        {error && <div className="alert alert-error">{error}</div>}
        <LedBanner text={text || '미리보기'} color={color} />
        <div className="couple-msg">
          <textarea className="wish-input" placeholder="전광판에 띄울 문구"
            value={text} maxLength={MAX_LED_TEXT} onChange={(e) => setText(e.target.value)} rows={2} />
          <span className="couple-msg-count">{text.length}/{MAX_LED_TEXT}</span>
        </div>
        <LedColorPicker color={color} onChange={setColor} />
        <button type="button" className="btn btn-primary btn-block" onClick={save} disabled={busy}>
          {busy ? '처리 중…' : '수정하기'}
        </button>

        {confirmStop ? (
          <div className="led-stop-confirm">
            <p>아직 {banner ? remainText(banner.expires_at) : ''} 남았어요. 지금 중단할까요?</p>
            <div className="led-stop-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmStop(false)} disabled={busy}>취소</button>
              <button type="button" className="btn btn-sm led-stop-yes" onClick={stop} disabled={busy}>중단</button>
            </div>
          </div>
        ) : (
          <div className="led-stop-wrap">
            <button type="button" className="led-stop-link" onClick={() => setConfirmStop(true)}>게재 중단</button>
          </div>
        )}
      </div>
    </Modal>
  )
}
