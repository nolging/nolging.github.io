import { DEFAULT_GROUP_BG } from '../lib/constants'

// 그룹 대표 이모지 뱃지. 이모지가 없으면 그룹명 첫 글자로 폴백.
export default function GroupBadge({ emoji, bg, name = '', size = 40 }) {
  const ch = (emoji && emoji.trim()) || (name.trim()[0] || '🐾')
  return (
    <span
      className="group-badge"
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        background: bg || DEFAULT_GROUP_BG,
        fontSize: Math.round(size * 0.52),
        borderRadius: Math.round(size * 0.28),
      }}
    >
      {ch}
    </span>
  )
}
