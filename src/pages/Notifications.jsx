import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  listNotifications, markNotificationRead, markAllNotificationsRead, deleteNotification,
} from '../lib/api'
import { pushStatus, enablePush, disablePush } from '../lib/push'

function timeAgo(iso) {
  try {
    const d = new Date(iso)
    const diff = (Date.now() - d.getTime()) / 1000
    if (diff < 60) return '방금'
    if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
    if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`
    if (diff < 604800) return `${Math.floor(diff / 86400)}일 전`
    return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
  } catch { return '' }
}

const ICONS = {
  reply: '↩︎',
  task_comment: '💬',
  new_task: '📝',
  new_member: '👋',
  accept: '🙌',
}

export default function Notifications() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pStatus, setPStatus] = useState(null) // 푸시 상태
  const [pBusy, setPBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setItems(await listNotifications()) }
    catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => { pushStatus().then(setPStatus).catch(() => setPStatus('unsupported')) }, [])

  async function togglePush() {
    setPBusy(true); setError('')
    try {
      if (pStatus === 'subscribed') { await disablePush(); setPStatus('default') }
      else { await enablePush(profile.id); setPStatus('subscribed') }
    } catch (err) { setError(err.message) } finally { setPBusy(false) }
  }

  function targetOf(n) {
    if (n.task_id && n.group_id) {
      const base = `/groups/${n.group_id}/tasks/${n.task_id}`
      return n.comment_id ? `${base}?c=${n.comment_id}` : base
    }
    if (n.group_id) return `/groups/${n.group_id}`
    return null
  }

  async function open(n) {
    const to = targetOf(n)
    if (!n.is_read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)))
      try { await markNotificationRead(n.id) } catch { /* noop */ }
    }
    if (to) navigate(to)
  }

  async function markAll() {
    setItems((prev) => prev.map((x) => ({ ...x, is_read: true })))
    try { await markAllNotificationsRead() } catch (err) { setError(err.message) }
  }

  async function remove(e, id) {
    e.stopPropagation()
    setItems((prev) => prev.filter((x) => x.id !== id))
    try { await deleteNotification(id) } catch (err) { setError(err.message) }
  }

  const hasUnread = items.some((x) => !x.is_read)

  return (
    <div className="page">
      <div className="notif-head">
        <h2 className="notif-title">알림</h2>
        {hasUnread && <button className="btn btn-ghost btn-sm" onClick={markAll}>모두 읽음</button>}
      </div>

      {pStatus && pStatus !== 'unsupported' && (
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

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="spinner" />
      ) : items.length === 0 ? (
        <div className="empty"><p className="muted">아직 알림이 없어요.</p></div>
      ) : (
        <ul className="notif-list">
          {items.map((n) => (
            <li key={n.id}
              className={`notif ${n.is_read ? '' : 'unread'} ${targetOf(n) ? 'clickable' : ''}`}
              onClick={() => open(n)}>
              <span className="notif-icon" aria-hidden="true">{ICONS[n.type] || '🔔'}</span>
              <div className="notif-body">
                <div className="notif-line">
                  {!n.is_read && <span className="notif-dot" aria-label="안읽음" />}
                  <span className="notif-title-text">{n.title}</span>
                </div>
                {n.body && <p className="notif-text">{n.body}</p>}
                <span className="notif-time">{timeAgo(n.created_at)}</span>
              </div>
              <button className="notif-del" aria-label="삭제" title="삭제" onClick={(e) => remove(e, n.id)}>✕</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
