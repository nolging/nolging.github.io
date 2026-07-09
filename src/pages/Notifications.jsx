import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import {
  listNotifications, markNotificationRead, markAllNotificationsRead, deleteNotification, getNoteState,
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
  gift: '🎁',
  wish: '🌟',
  couple_ring: '💍',
  cassette: '🎵',
  link: '🔗',
  video: '📹',
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

  // 쪽지함(받은 쪽지)으로 보내는 알림 유형: 선물/커플 링/소원권
  const NOTE_TYPES = new Set(['gift', 'couple_ring', 'wish', 'cassette', 'link', 'video'])

  function targetOf(n) {
    if (NOTE_TYPES.has(n.type)) return '/notes'
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
    if (to === '/notes') {
      // 수령 상태에 따라 이동 목적지를 바꾼다:
      //  - 커플 링 수락(claimed) → 링이 적용된 그룹 상세 페이지
      //  - 커플 링 거절(보낸 사람) → 인벤토리(다시 사용 가능)
      //  - 선물 수령(받는 사람) → 인벤토리(아이템 들어옴)
      //  - 그 외(수령 전) → 받은 쪽지함
      if ((n.type === 'gift' || n.type === 'couple_ring') && n.note_id) {
        try {
          const note = await getNoteState(n.note_id)
          if (note) {
            const iAmRecipient = note.recipient_id === n.user_id
            const iAmSender = note.sender_id === n.user_id
            if (n.type === 'couple_ring' && note.claimed && n.group_id) {
              navigate(`/groups/${n.group_id}`, { state: { from: 'notifications' } }); return
            }
            const toInventory = (iAmRecipient && note.claimed) || (iAmSender && note.rejected)
            if (toInventory) { navigate('/inventory', { state: { from: 'notifications' } }); return }
          }
        } catch { /* 조회 실패 시 쪽지함으로 폴백 */ }
      }
      navigate('/notes', { state: { tab: 'received', from: 'notifications' } })
      return
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
              <span className={`notif-icon notif-ic-${n.type}`} aria-hidden="true">{ICONS[n.type] || '🔔'}</span>
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
