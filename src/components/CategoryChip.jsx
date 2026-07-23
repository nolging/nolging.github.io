import { catMeta, catChipStyle, catChipEmoji } from '../lib/constants'

// 위시 유형 표시 알약 (이모지 + 유형). 카드/상세 등 표시용.
// cats: 그룹의 유형 목록(resolveCategories 결과). 없으면 기본값 기준. 목록에 없는
// (삭제된) 유형은 중립(회색)으로 표시된다.
export default function CategoryChip({ category, cats }) {
  if (!category) return null
  const meta = catMeta(cats, category)
  return (
    <span className="cat-chip" style={catChipStyle(meta)}>
      <span className="cat-chip-emoji" aria-hidden="true">{catChipEmoji(meta)}</span>
      {category}
    </span>
  )
}
