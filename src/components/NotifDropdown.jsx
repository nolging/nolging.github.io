import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  listNotifications, markNotificationRead, markAllNotificationsRead, deleteNotification, getNotifEmojis,
} from '../lib/api'
import { resolveItemText } from '../lib/storeMeta'
import { NOTIF_ICONS as ICONS, timeAgo, notifTarget as targetOf, navigateNotif } from '../lib/notifNav'

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  )
}

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

  async function remove(e, id) {
    e.stopPropagation()
    setItems((prev) => prev.filter((x) => x.id !== id))
    try { await deleteNotification(id) } catch (err) { setError(err.message) }
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
                        {!n.is_read && <span className="notif-dot" />}
                        <span className="notif-title-text">{n.title}</span>
                      </div>
                      <span className="notif-time">{timeAgo(n.created_at)}</span>
                    </div>
                    {n.body && <p className="notif-text">{resolveItemText(n.body)}</p>}
                  </div>
                  <button type="button" className="notif-dd-del" aria-label="삭제" title="삭제"
                    onClick={(e) => remove(e, n.id)}><TrashIcon /></button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
