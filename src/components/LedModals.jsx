import { useEffect, useState } from 'react'
import Modal from './Modal'
import LedBanner, { LED_COLORS } from './LedBanner'
import StoreItemImage from './StoreItemImage'
import { imgBgOf } from '../lib/storeMeta'
import { useLedboard, editLedBanner, stopLedBanner, getMyLedBanner, takeoverLedboard } from '../lib/api'

export const MAX_LED_TEXT = 60

// 남은 시간 HH:MM + 비용(시간 올림 × 2 츄르)
function takeoverInfo(expiresAt) {
  const ms = Math.max(0, new Date(expiresAt).getTime() - Date.now())
  const hh = Math.floor(ms / 3600000)
  const mm = Math.floor((ms % 3600000) / 60000)
  const cost = Math.ceil(ms / 3600000) * 2
  return { time: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, cost }
}

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

// 전광판 게재(문구+색상). 상대가 게재 중이면 권한 가져오기 확인 모달로 전환.
export function LedboardModal({ open, onClose, onDone, refreshCoin }) {
  const [text, setText] = useState('')
  const [color, setColor] = useState('amber')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [takeover, setTakeover] = useState(null) // 상대 배너 { owner_name, expires_at }
  useEffect(() => { if (open) { setText(''); setColor('amber'); setError(''); setSending(false); setTakeover(null) } }, [open])

  async function go() {
    if (!text.trim()) { setError('문구를 입력해 주세요.'); return }
    setSending(true); setError('')
    try {
      // 이미 게재 중인(상대) 전광판이 있으면 권한 가져오기 확인
      const b = await getMyLedBanner()
      if (b && !b.is_owner) { setTakeover(b); setSending(false); return }
      await useLedboard({ text: text.trim(), color }); await onDone(); onClose()
    } catch (e) { setError(e.message); setSending(false) }
  }
  async function doTakeover() {
    setSending(true); setError('')
    try { await takeoverLedboard({ text: text.trim(), color }); refreshCoin?.(); await onDone(); onClose() }
    catch (e) { setError(e.message); setSending(false) }
  }

  const info = takeover ? takeoverInfo(takeover.expires_at) : null

  return (
    <Modal open={open} onClose={onClose} cardClassName="nc-link-modal">
      {takeover ? (
        <div className="led-takeover">
          <div className="led-takeover-ico">
            <svg width="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="7" x2="12" y2="13.5" /><circle cx="12" cy="17.5" r="0.4" fill="#fff" stroke="#fff" strokeWidth="1.6" /></svg>
          </div>
          <div className="led-takeover-t">{takeover.owner_name || '상대'} 님이 전광판 사용 중이에요</div>
          <div className="led-takeover-s">남은 시간만큼 츄르를 보내고 게재 권한을 가져올까요?</div>
          <div className="led-takeover-box">
            <span className="led-takeover-time">남은 시간 {info.time}</span>
            <span className="led-takeover-cost">{info.cost} 츄르</span>
          </div>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="led-takeover-actions">
            <button type="button" className="btn btn-ghost" onClick={() => { setTakeover(null); setError('') }} disabled={sending}>취소</button>
            <button type="button" className="btn btn-primary" onClick={doTakeover} disabled={sending}>
              {sending ? '처리 중…' : '츄르 보내고 게재하기'}
            </button>
          </div>
        </div>
      ) : (
        <div className="couple-modal">
          <div className="nc-link-head">
            <span className="nc-link-ico" style={{ background: imgBgOf('ledboard') }}><StoreItemImage id="ledboard" emoji="📟" className="nc-img" /></span>
            <div><div className="nc-link-name">전광판</div><div className="nc-link-sub">24 시간 동안 우리 커플에게만 보여요</div></div>
          </div>
          {error && <div className="alert alert-error">{error}</div>}
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
      )}
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
