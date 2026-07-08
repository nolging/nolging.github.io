import { categoryStyle, categoryEmoji } from '../lib/constants'

// 위시 유형 표시 알약 (이모지 + 유형). 카드/상세 등 표시용.
export default function CategoryChip({ category }) {
  if (!category) return null
  return (
    <span className="cat-chip" style={categoryStyle(category)}>
      <span className="cat-chip-emoji" aria-hidden="true">{categoryEmoji(category)}</span>
      {category}
    </span>
  )
}
