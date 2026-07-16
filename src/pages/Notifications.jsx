import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import {
  listNotifications, markNotificationRead, markAllNotificationsRead, deleteNotification, getNoteState,
} from '../lib/api'

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
              {!n.is_read && <span className="notif-dot" />}
              <span className="notif-title-text">{n.title}</span>
            </div>
            <span className="notif-time">{timeText}</span>
          </div>
          {n.body && <p className="notif-text">{n.body}</p>}
        </div>
      </div>
    </li>
  )
}

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
  mention: '@',
  new_task: '📝',
  new_member: '👋',
  accept: '🙌',
  reminder: '⏰',
  gift: '🎁',
  wish: '🌟',
  couple_ring: '💍',
  friend_ring: '🤝',
  cassette: '🎵',
  link: '🔗',
  video: '📹',
  poke: '👉',
  touch_call: '💋',
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
  const NOTE_TYPES = new Set(['gift', 'couple_ring', 'friend_ring', 'wish', 'cassette', 'link', 'video'])

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
      if ((n.type === 'gift' || n.type === 'couple_ring' || n.type === 'friend_ring') && n.note_id) {
        try {
          const note = await getNoteState(n.note_id)
          if (note) {
            const iAmRecipient = note.recipient_id === n.user_id
            const iAmSender = note.sender_id === n.user_id
            if ((n.type === 'couple_ring' || n.type === 'friend_ring') && note.claimed && n.group_id) {
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
            <NotifRow key={n.id} n={n} icon={ICONS[n.type] || '🔔'} clickable={!!targetOf(n)}
              timeText={timeAgo(n.created_at)} onOpen={() => open(n)} onDelete={() => remove(n.id)} />
          ))}
        </ul>
      )}
    </div>
  )
}
