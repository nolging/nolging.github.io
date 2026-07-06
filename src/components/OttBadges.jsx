import { OTT_BY_KEY } from '../lib/constants'

// 구독 OTT 키 배열 → 동그란 앱 아이콘 배지. (미디어 정보 배지와 동일 스타일 재사용)
export default function OttBadges({ list }) {
  const items = (list || []).map((k) => OTT_BY_KEY[k]).filter(Boolean)
  if (!items.length) return null
  return (
    <span className="ott-badges">
      {items.map((o) => (
        <img key={o.key} className="ott-badge" src={o.logo} alt={o.label} title={o.label} />
      ))}
    </span>
  )
}
