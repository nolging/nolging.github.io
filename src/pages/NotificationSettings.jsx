import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { pushStatus, enablePush, disablePush } from '../lib/push'
import { getNotifPrefs, updateNotifPrefs } from '../lib/api'
import Switch from '../components/Switch'

// 카테고리 → notifications.type 매핑은 send-push(Edge Function)에서 처리.
// (댓글 알림 = task_comment + reply)
const CATS = [
  { key: 'new_member', label: '가입 알림' },
  { key: 'new_task', label: '새 위시 알림' },
  { key: 'accept', label: '놀기 신청 알림' },
  { key: 'comment', label: '댓글 알림' },
  { key: 'reminder', label: '일정 알림' },
]
const DEFAULT_PREFS = { new_member: true, new_task: true, accept: true, comment: true, reminder: true }

const STATUS_MSG = {
  default: '켜면 앱을 열지 않아도 알림센터로 알림을 받아요.',
  denied: '브라우저 설정에서 이 사이트의 알림을 허용해 주세요.',
  'need-standalone': '아이폰은 홈 화면에 추가한 뒤 이 화면에서 켤 수 있어요.',
  unsupported: '이 브라우저는 휴대폰 알림(푸시)을 지원하지 않아요.',
}

export default function NotificationSettings() {
  const { profile } = useAuth()
  const [pStatus, setPStatus] = useState(null)
  const [pBusy, setPBusy] = useState(false)
  const [prefs, setPrefs] = useState(DEFAULT_PREFS)
  const [error, setError] = useState('')

  useEffect(() => {
    pushStatus().then(setPStatus).catch(() => setPStatus('unsupported'))
    getNotifPrefs().then((p) => { if (p) setPrefs({ ...DEFAULT_PREFS, ...p }) }).catch(() => {})
  }, [])

  const on = pStatus === 'subscribed'
  const canToggleMaster = pStatus === 'default' || pStatus === 'subscribed'

  async function toggleMaster(next) {
    setPBusy(true); setError('')
    try {
      if (next) { await enablePush(profile.id); setPStatus('subscribed') }
      else { await disablePush(); setPStatus('default') }
    } catch (err) { setError(err.message) } finally { setPBusy(false) }
  }

  async function toggleCat(key, val) {
    const next = { ...prefs, [key]: val }
    setPrefs(next)
    try { await updateNotifPrefs(next, profile.id) }
    catch (err) { setError(err.message); setPrefs(prefs) } // 실패 시 롤백
  }

  return (
    <div className="page">
      {error && <div className="alert alert-error">{error}</div>}

      {!pStatus ? (
        <div className="spinner" />
      ) : (
        <>
          <div className="card">
            <div className="switch-row">
              <span>푸시 알림 받기</span>
              <Switch checked={on} onChange={toggleMaster} disabled={!canToggleMaster || pBusy} />
            </div>
            {!on && <p className="muted sm np-hint">{STATUS_MSG[pStatus] || ''}</p>}
          </div>

          {on && (
            <div className="card np-cats">
              <p className="muted sm np-hint">푸시 알림을 꺼도 알림 목록에서는 계속 확인할 수 있어요.</p>
              {CATS.map((c) => (
                <div className="switch-row" key={c.key}>
                  <span>{c.label}</span>
                  <Switch checked={!!prefs[c.key]} onChange={(v) => toggleCat(c.key, v)} />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
