import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import {
  listNotifications, markNotificationRead, markAllNotificationsRead, deleteNotification, getNotifEmojis,
} from '../lib/api'
import { resolveItemText } from '../lib/storeMeta'
import { NOTIF_ICONS as ICONS, timeAgo, notifTarget as targetOf, navigateNotif } from '../lib/notifNav'

function TrashIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  )
}

// 알림 카드 한 줄. 왼쪽으로 밀면 삭제 버튼이 나온다(위시 카드와 동일 동작).
function NotifRow({ n, icon, clickable, timeText, onOpen, onDelete }) {
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const drag = useRef(null)
  const movedRef = useRef(false)
  const rootRef = useRef(null)
  const openW = 48 // 삭제 버튼(40) + 좌측 여백(8)

  const isOpen = dx !== 0
  useEffect(() => {
    if (!isOpen) return
    const onDocDown = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setDx(0) }
    document.addEventListener('pointerdown', onDocDown)
    return () => document.removeEventListener('pointerdown', onDocDown)
  }, [isOpen])

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    movedRef.current = false
    drag.current = { x0: e.clientX, y0: e.clientY, base: dx, decided: false, horiz: false }
  }
  function onPointerMove(e) {
    const d = drag.current; if (!d) return
    const mx = e.clientX - d.x0, my = e.clientY - d.y0
    if (!d.decided) {
      if (Math.abs(mx) < 6 && Math.abs(my) < 6) return
      d.decided = true; d.horiz = Math.abs(mx) > Math.abs(my)
      if (d.horiz) { setDragging(true); e.currentTarget.setPointerCapture?.(e.pointerId) }
    }
    if (!d.horiz) return
    movedRef.current = true
    setDx(Math.max(-openW, Math.min(0, d.base + mx))) // 왼쪽으로만
  }
  function onPointerUp() {
    const d = drag.current; drag.current = null; setDragging(false)
    if (d?.horiz) setDx((cur) => (cur < -openW / 2 ? -openW : 0))
  }
  function handleClick() {
    if (movedRef.current) { movedRef.current = false; return } // 스와이프였으면 클릭 무시
    if (dx !== 0) { setDx(0); return }                         // 열려 있으면 닫기
    if (clickable) onOpen()
  }

  return (
    <li ref={rootRef} className={`notif-swipe ${dragging ? 'dragging' : ''}`}>
      <div className="notif-swipe-actions" aria-hidden={dx === 0}>
        <button type="button" className="swipe-btn danger" aria-label="삭제" title="삭제"
          tabIndex={dx === 0 ? -1 : 0} onClick={(e) => { e.stopPropagation(); setDx(0); onDelete() }}><TrashIcon /></button>
      </div>
      <div className={`notif ${n.is_read ? '' : 'unread'} ${clickable ? 'clickable' : ''}`}
        style={{ transform: `translateX(${dx}px)` }}
        onClick={handleClick} onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        <span className={`notif-icon notif-ic-${n.type}`} aria-hidden="true">{icon}</span>
        <div className="notif-body">
          <div className="notif-top">
            <div className="notif-line">
              <span className="notif-title-text">{n.title}</span>
            </div>
            <span className="notif-right">
              <span className="notif-time">{timeText}</span>
              {!n.is_read && <span className="notif-dot" aria-label="안 읽음" />}
            </span>
          </div>
          {n.body && <p className="notif-text">{resolveItemText(n.body)}</p>}
        </div>
      </div>
    </li>
  )
}

export default function Notifications() {
  const navigate = useNavigate()
  const { setRefreshHandler } = useOutletContext()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [emojiMap, setEmojiMap] = useState({}) // 관리자 설정 이모지 (type/key → emoji)

  useEffect(() => { getNotifEmojis().then(setEmojiMap).catch(() => {}) }, [])

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

  async function open(n) {
    if (!n.is_read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)))
      try { await markNotificationRead(n.id) } catch { /* noop */ }
    }
    await navigateNotif(n, navigate)
  }

  async function markAll() {
    setItems((prev) => prev.map((x) => ({ ...x, is_read: true })))
    try { await markAllNotificationsRead() } catch (err) { setError(err.message) }
  }

  async function remove(id) {
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
            <NotifRow key={n.id} n={n} icon={emojiMap[n.type] || ICONS[n.type] || '🔔'} clickable={!!targetOf(n)}
              timeText={timeAgo(n.created_at)} onOpen={() => open(n)} onDelete={() => remove(n.id)} />
          ))}
        </ul>
      )}
    </div>
  )
}
