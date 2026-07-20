// 알림 아이콘/시간표기/이동 목적지 — 알림 페이지와 PC 드롭다운이 공유하는 로직
import { getNoteState } from './api'

export const NOTIF_ICONS = {
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

export function timeAgo(iso) {
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

// 쪽지함(받은 쪽지)으로 보내는 알림 유형: 선물/커플 링/소원권 등
const NOTE_TYPES = new Set(['gift', 'couple_ring', 'friend_ring', 'wish', 'cassette', 'link', 'video'])

// 알림 클릭 시 이동할 경로(없으면 null → 클릭 불가)
export function notifTarget(n) {
  if (NOTE_TYPES.has(n.type)) return '/notes'
  if (n.type === 'touch_call' && n.group_id) return `/groups/${n.group_id}/touch`
  if (n.type === 'praise' && n.group_id) return `/groups/${n.group_id}/praise?mine=1`
  if (n.task_id && n.group_id) {
    const base = `/groups/${n.group_id}/tasks/${n.task_id}`
    return n.comment_id ? `${base}?c=${n.comment_id}` : base
  }
  if (n.group_id) return `/groups/${n.group_id}`
  return null
}

// 알림 클릭 → 실제 화면 이동. 선물/링은 수령 상태에 따라 목적지가 달라진다.
export async function navigateNotif(n, navigate) {
  const to = notifTarget(n)
  if (to === '/notes') {
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
