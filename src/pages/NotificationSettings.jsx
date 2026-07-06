import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { pushStatus, enablePush, disablePush } from '../lib/push'

// 알림 설정: 휴대폰(웹푸시) 알림 켜기/끄기
export default function NotificationSettings() {
  const { profile } = useAuth()
  const [pStatus, setPStatus] = useState(null)
  const [pBusy, setPBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { pushStatus().then(setPStatus).catch(() => setPStatus('unsupported')) }, [])

  async function togglePush() {
    setPBusy(true); setError('')
    try {
      if (pStatus === 'subscribed') { await disablePush(); setPStatus('default') }
      else { await enablePush(profile.id); setPStatus('subscribed') }
    } catch (err) { setError(err.message) } finally { setPBusy(false) }
  }

  return (
    <div className="page">
      {error && <div className="alert alert-error">{error}</div>}

      {!pStatus ? (
        <div className="spinner" />
      ) : pStatus === 'unsupported' ? (
        <div className="card"><p className="muted">이 브라우저는 휴대폰 알림(푸시)을 지원하지 않아요.</p></div>
      ) : (
        <div className="push-banner">
          <div className="push-banner-text">
            <strong>휴대폰 알림</strong>
            <span className="muted sm">
              {pStatus === 'subscribed' && '앱을 열지 않아도 알림센터로 알림을 받아요.'}
              {pStatus === 'default' && '앱을 열지 않아도 알림센터로 알림을 받으려면 켜세요.'}
              {pStatus === 'denied' && '브라우저 설정에서 이 사이트의 알림을 허용해 주세요.'}
              {pStatus === 'need-standalone' && '아이폰은 홈 화면에 추가한 뒤 이 화면에서 켤 수 있어요.'}
            </span>
          </div>
          {(pStatus === 'default' || pStatus === 'subscribed') && (
            <button className={`btn btn-sm ${pStatus === 'subscribed' ? 'btn-ghost' : 'btn-primary'}`}
              onClick={togglePush} disabled={pBusy}>
              {pBusy ? '…' : pStatus === 'subscribed' ? '끄기' : '켜기'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
