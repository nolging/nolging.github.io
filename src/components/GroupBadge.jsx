import { DEFAULT_GROUP_BG } from '../lib/constants'

// 그룹 대표 이모지 뱃지. 이모지가 없으면 아예 렌더하지 않음(자리 제거 → 좌측 정렬).
export default function GroupBadge({ emoji, bg, name = '', size = 40, radius }) {
  const has = !!(emoji && emoji.trim())
  if (!has) return null
  return (
    <span
      className="group-badge"
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        background: bg || DEFAULT_GROUP_BG, // 'transparent' 면 배경 없음
        fontSize: Math.round(size * 0.52),
        borderRadius: radius != null ? radius : Math.round(size * 0.35),
      }}
    >
      {emoji.trim()}
    </span>
  )
}
