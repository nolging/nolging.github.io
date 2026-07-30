// 워터파크 테마: 위에서 내려다본 수영장(타일 바닥 + 찰랑이는 물) 위로 튜브·비치볼·꽃이
// 둥둥 떠 흔들리고, 네 귀퉁이엔 트로피컬 잎. 배경 레이어라 콘텐츠 뒤(z-index).

const Leaf = () => (
  <svg className="wp-leaf" viewBox="0 0 64 128" aria-hidden="true">
    <defs>
      <linearGradient id="wpLf" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#67c979" /><stop offset="1" stopColor="#2f9c4c" />
      </linearGradient>
    </defs>
    <path fill="url(#wpLf)" d="M32 3 C52 34 55 78 32 125 C9 78 12 34 32 3 Z" />
    <path d="M32 12 L32 116" stroke="#2b8f45" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    <g stroke="#2b8f45" strokeWidth="1.6" opacity=".65" fill="none" strokeLinecap="round">
      <path d="M32 34 L17 27" /><path d="M32 34 L47 27" />
      <path d="M32 60 L14 54" /><path d="M32 60 L50 54" />
      <path d="M32 86 L17 81" /><path d="M32 86 L47 81" />
    </g>
  </svg>
)

// 튜브·공은 가장자리 위주(상세에선 위시 카드 양옆으로 보이게). kind: 종류, l/t 위치, s 크기
const FLOATS = [
  { kind: 'ring-striped', l: -4, t: 20, s: 80, d: 0,   dur: 5.6, rot: -6 },
  { kind: 'ball-pink',    l: 76, t: 5,  s: 50, d: 1.1, dur: 4.7, rot: 8 },
  { kind: 'ring',         l: 83, t: 48, s: 60, c: '#ffd24d', d: 0.7, dur: 5.9, rot: 6 },
  { kind: 'ball',         l: 3,  t: 64, s: 42, d: 2.0, dur: 5.1, rot: -8 },
  { kind: 'ring',         l: 60, t: 85, s: 56, c: '#63cdf0', d: 1.6, dur: 5.4, rot: 5 },
  { kind: 'ball-pink',    l: 44, t: 34, s: 34, d: 2.7, dur: 4.5, rot: -5 },
]
const FLOWERS = [
  { l: 26, t: 9, s: 26, d: 0.3 }, { l: 90, t: 27, s: 20, d: 1.4 }, { l: 11, t: 44, s: 22, d: 0.8 },
  { l: 71, t: 63, s: 24, d: 2.0 }, { l: 46, t: 92, s: 20, d: 1.1 }, { l: 93, t: 82, s: 18, d: 2.6 },
]
const PLANTS = ['tl', 'tr', 'bl', 'br']

export default function ThemeWaterpark({ className = '' }) {
  return (
    <div className={`theme-wp${className ? ` ${className}` : ''}`} aria-hidden="true">
      <div className="wp-tiles" />
      <div className="wp-water" />
      {FLOWERS.map((f, i) => (
        <span key={`f${i}`} className="wp-flower"
          style={{ left: `${f.l}%`, top: `${f.t}%`, width: f.s, height: f.s, animationDelay: `${f.d}s`, animationDuration: '5s' }} />
      ))}
      {FLOATS.map((f, i) => {
        const cls = f.kind === 'ring-striped' ? 'wp-ring striped'
          : f.kind === 'ring' ? 'wp-ring'
            : f.kind === 'ball-pink' ? 'wp-ball pink' : 'wp-ball'
        return (
          <span key={`o${i}`} className={cls}
            style={{ left: `${f.l}%`, top: `${f.t}%`, width: f.s, height: f.s,
              ...(f.c ? { '--c': f.c } : {}), '--rot': `${f.rot}deg`,
              animationDelay: `${f.d}s`, animationDuration: `${f.dur}s` }} />
        )
      })}
      {PLANTS.map((c) => (<span key={c} className={`wp-plant ${c}`}><Leaf /></span>))}
    </div>
  )
}
