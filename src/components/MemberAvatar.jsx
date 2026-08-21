// 멤버 아바타: 사진이 있으면 원형 이미지, 없으면 파스텔 배경 + 닉네임(최대 2자).
// 색은 user_id(없으면 이름) 해시로 결정 → 목록·상세에서 동일 멤버는 같은 색.
const AV_COLORS = [
  { bg: '#e6eefd', fg: '#4b79c9' }, // blue
  { bg: '#e8f4ec', fg: '#4a9b6e' }, // green
  { bg: '#fdeee6', fg: '#cc7a45' }, // orange
  { bg: '#fde8ee', fg: '#c76b8a' }, // pink
  { bg: '#fbf1d3', fg: '#b79432' }, // yellow
  { bg: '#eeebfe', fg: '#7363e8' }, // purple
]

export function memberColor(seed) {
  const s = String(seed || '')
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return AV_COLORS[h % AV_COLORS.length]
}

function label(name) {
  const s = (name || '?').trim()
  return Array.from(s).slice(0, 2).join('') || '?'
}

import AvatarDeco, { decoItems } from './AvatarDeco'

// deco 배열에 id:'__graffiti' 항목(푸린 마이크로 짝꿍이 그린 낙서)이 섞여 오면 사진/이니셜
// 위에 투명 PNG 오버레이로 얹는다 — Avatar.jsx 와 동일한 규칙(getGroupDecoMap 참고).
export default function MemberAvatar({ src, name, seed, size = 46, fontScale = 0.35, deco }) {
  const dim = { width: size, height: size, borderRadius: '50%', flexShrink: 0 }
  const base = src
    ? <span className="mem-av" style={{ ...dim, background: `#e9e9ee center/cover no-repeat url(${src})` }} aria-hidden="true" />
    : (() => {
        const c = memberColor(seed || name)
        return (
          <span className="mem-av mem-av-txt" aria-hidden="true"
            style={{ ...dim, background: c.bg, color: c.fg, fontSize: Math.round(size * fontScale) }}>
            {label(name)}
          </span>
        )
      })()
  const items = decoItems(deco)
  const graffiti = items.find((d) => d.id === '__graffiti')?.url
  const decoOnly = graffiti ? items.filter((d) => d.id !== '__graffiti') : items
  const inner = graffiti ? (
    <span style={{ position: 'relative', display: 'inline-block', overflow: 'hidden', ...dim }}>
      {base}
      <img className="mem-av-graffiti" src={graffiti} alt="" />
    </span>
  ) : base
  if (!decoOnly.length) return inner
  return (
    <span className="mem-av-wrap" style={{ position: 'relative', width: size, height: size, display: 'inline-block', flexShrink: 0, isolation: 'isolate' }}>
      <AvatarDeco items={decoOnly} layer="back" size={size} />
      {inner}
      <AvatarDeco items={decoOnly} layer="front" size={size} />
    </span>
  )
}
