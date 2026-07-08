import { DEFAULT_GROUP_BG } from '../lib/constants'

// 그룹 대표 이모지 뱃지. 이모지가 없으면 그룹명 첫 글자로 폴백.
export default function GroupBadge({ emoji, bg, name = '', size = 40, radius }) {
  // 이모지가 없으면 배경 흰색(카드와 동일) + 내용 공백
  const has = !!(emoji && emoji.trim())
  return (
    <span
      className="group-badge"
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        background: has ? (bg || DEFAULT_GROUP_BG) : 'var(--surface)',
        fontSize: Math.round(size * 0.52),
        borderRadius: radius != null ? radius : Math.round(size * 0.35),
      }}
    >
      {has ? emoji.trim() : ''}
    </span>
  )
}
