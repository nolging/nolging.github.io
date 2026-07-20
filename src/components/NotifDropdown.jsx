import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  listNotifications, markNotificationRead, markAllNotificationsRead, getNotifEmojis,
} from '../lib/api'
import { resolveItemText } from '../lib/storeMeta'
import { NOTIF_ICONS as ICONS, timeAgo, notifTarget as targetOf, navigateNotif } from '../lib/notifNav'

// PC 전용: 종 아이콘을 누르면 뜨는 알림 드롭다운.
// 알림 페이지(Notifications.jsx)와 동일한 데이터/이동 로직을 공유한다(notifNav.js).
export default function NotifDropdown({ onClose, onChange }) {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [emojiMap, setEmojiMap] = useState({})

  useEffect(() => { getNotifEmojis().then(setEmojiMap).catch(() => {}) }, [])

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setItems(await listNotifications()) }
    catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  async function open(n) {
    if (!n.is_read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)))
      try { await markNotificationRead(n.id) } catch { /* noop */ }
      onChange?.()
    }
    onClose?.()
    await navigateNotif(n, navigate)
  }

  async function markAll() {
    setItems((prev) => prev.map((x) => ({ ...x, is_read: true })))
    try { await markAllNotificationsRead() } catch (err) { setError(err.message) }
    onChange?.()
  }

  const hasUnread = items.some((x) => !x.is_read)

  return (
    <div className="notif-dd" role="dialog" aria-label="알림">
      <div className="notif-dd-head">
        <span className="notif-dd-title">알림</span>
        {hasUnread && <button type="button" className="notif-dd-allread" onClick={markAll}>모두 읽음</button>}
      </div>
      <div className="notif-dd-body">
        {error && <div className="alert alert-error">{error}</div>}
        {loading ? (
          <div className="spinner" style={{ margin: '28px auto' }} />
        ) : items.length === 0 ? (
          <div className="notif-dd-empty"><p className="muted">아직 알림이 없어요.</p></div>
        ) : (
          <ul className="notif-dd-list">
            {items.map((n) => {
              const clickable = !!targetOf(n)
              return (
                <li key={n.id}
                  className={`notif-dd-row ${n.is_read ? '' : 'unread'} ${clickable ? 'clickable' : ''}`}
                  onClick={() => clickable && open(n)}>
                  <span className={`notif-icon notif-ic-${n.type}`} aria-hidden="true">{emojiMap[n.type] || ICONS[n.type] || '🔔'}</span>
                  <div className="notif-body">
                    <div className="notif-top">
                      <div className="notif-line">
                        <span className="notif-title-text">{n.title}</span>
                      </div>
                      <span className="notif-right">
                        <span className="notif-time">{timeAgo(n.created_at)}</span>
                        {!n.is_read && <span className="notif-dot" aria-label="안 읽음" />}
                      </span>
                    </div>
                    {n.body && <p className="notif-text">{resolveItemText(n.body)}</p>}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
