import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import {
  listNotifications, markNotificationRead, markAllNotificationsRead, deleteNotification,
} from '../lib/api'

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
  reminder: '⏰',
}

export default function Notifications() {
  const navigate = useNavigate()
  const { setRefreshHandler } = useOutletContext()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setItems(await listNotifications()) }
    catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  // 당겨서 새로고침: 전체 로딩 스피너 없이 목록만 갱신
  const refresh = useCallback(async () => {
    try { setItems(await listNotifications()) } catch (err) { setError(err.message) }
  }, [])
  useEffect(() => {
    setRefreshHandler(() => refresh)
    return () => setRefreshHandler(() => null)
  }, [setRefreshHandler, refresh])

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
    if (to) navigate(to, { state: { from: 'notifications' } })
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
      {hasUnread && (
        <div className="notif-head">
          <button className="btn btn-ghost btn-sm" onClick={markAll}>모두 읽음</button>
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
