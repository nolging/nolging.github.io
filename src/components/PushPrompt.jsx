import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { pushStatus, enablePush, isStandalone } from '../lib/push'
import BottomSheet from './BottomSheet'

// 홈 화면에 추가한(standalone) 웹앱을 처음 열었을 때, 알림 설정 페이지에 들어가지
// 않아도 푸시 알림 허용 여부를 한 번 물어본다. 허용하면 바로 켜진다.
const ASKED_KEY = 'nolging-push-asked'

export default function PushPrompt() {
  const { profile } = useAuth()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!profile) return
    if (localStorage.getItem(ASKED_KEY)) return
    if (!isStandalone()) return // 홈 화면 추가(standalone)일 때만
    let cancelled = false
    pushStatus()
      .then((s) => { if (!cancelled && s === 'default') setOpen(true) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [profile])

  function done() { localStorage.setItem(ASKED_KEY, '1') }
  function dismiss() { done(); setOpen(false) }
  async function allow() {
    setBusy(true); setErr('')
    try {
      await enablePush(profile.id)
      done(); setOpen(false)
    } catch (e) {
      // 권한 거부 등 — 다시 묻지 않고 안내만
      setErr(e.message || '알림을 켤 수 없어요.')
      done()
    } finally { setBusy(false) }
  }

  return (
    <BottomSheet open={open} onClose={dismiss}>
      <h3 className="sheet-title">푸시 알림을 허용해 주세요.</h3>
      <p className="push-prompt-desc">
        앱을 켜지 않아도 휴대폰 알림 센터로 알림을 받아요.<br />
        푸시 알림을 꺼도 앱 내 알림 목록에서는 계속 확인할 수 있어요.
      </p>
      {err && <p className="field-error" style={{ textAlign: 'center' }}>{err}</p>}
      <div className="push-prompt-actions">
        <button type="button" className="btn btn-block" onClick={dismiss} disabled={busy}>나중에</button>
        <button type="button" className="btn btn-primary btn-block" onClick={allow} disabled={busy}>
          {busy ? '켜는 중…' : '알림 받기'}
        </button>
      </div>
    </BottomSheet>
  )
}
