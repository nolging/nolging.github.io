// 워터파크 테마: 위에서 본 수영장(휘어진 타일 바닥 + 유기적 물결) 위로 튜브·비치볼·꽃이
// 둥둥 흔들리고, 네 귀퉁이엔 서로 다른 트로피컬 잎. 배경 레이어(콘텐츠 뒤).

// 물결 변위 필터(타일 격자를 찰랑이는 물처럼 살짝 휘게)
const RippleDefs = () => (
  <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
    <filter id="wpRipple" x="-12%" y="-12%" width="124%" height="124%">
      <feTurbulence type="fractalNoise" baseFrequency="0.011 0.02" numOctaves="2" seed="7" result="n" />
      <feDisplacementMap in="SourceGraphic" in2="n" scale="9" xChannelSelector="R" yChannelSelector="G" />
    </filter>
  </svg>
)

// 서로 다른 잎 3종
const Leaf = ({ variant }) => {
  if (variant === 'frond') {
    return (
      <svg className="wp-leaf" viewBox="0 0 120 124" aria-hidden="true">
        <defs><linearGradient id="wpLfA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#67c979" /><stop offset="1" stopColor="#2f9c4c" /></linearGradient></defs>
        <g fill="url(#wpLfA)" stroke="#2b8f45" strokeWidth="0.8">
          {[-46, -31, -16, 0, 16, 31, 46].map((a) => (
            <path key={a} d="M60 118 C57 74 58 42 60 22 C62 42 63 74 60 118 Z" transform={`rotate(${a} 60 118)`} />
          ))}
        </g>
      </svg>
    )
  }
  if (variant === 'round') {
    return (
      <svg className="wp-leaf" viewBox="0 0 120 120" aria-hidden="true">
        <defs><linearGradient id="wpLfB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#67c979" /><stop offset="1" stopColor="#2f9c4c" /></linearGradient></defs>
        <path fill="url(#wpLfB)" fillRule="evenodd" d="M60 8 C90 8 112 32 112 62 C112 94 88 114 60 114 C32 114 8 94 8 62 C8 32 30 8 60 8 Z M60 114 L53 72 L67 72 Z" />
        <path d="M60 16 L60 108" stroke="#2b8f45" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        <g stroke="#2b8f45" strokeWidth="1.4" opacity=".6" fill="none" strokeLinecap="round">
          <path d="M60 42 L30 31" /><path d="M60 42 L90 31" />
          <path d="M60 70 L26 62" /><path d="M60 70 L94 62" />
        </g>
      </svg>
    )
  }
  // blade (뾰족한 잎)
  return (
    <svg className="wp-leaf" viewBox="0 0 64 128" aria-hidden="true">
      <defs><linearGradient id="wpLfC" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#67c979" /><stop offset="1" stopColor="#2f9c4c" /></linearGradient></defs>
      <path fill="url(#wpLfC)" d="M32 3 C52 34 55 78 32 125 C9 78 12 34 32 3 Z" />
      <path d="M32 12 L32 116" stroke="#2b8f45" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <g stroke="#2b8f45" strokeWidth="1.6" opacity=".65" fill="none" strokeLinecap="round">
        <path d="M32 34 L17 27" /><path d="M32 34 L47 27" />
        <path d="M32 60 L14 54" /><path d="M32 60 L50 54" />
        <path d="M32 86 L17 81" /><path d="M32 86 L47 81" />
      </g>
    </svg>
  )
}

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
const PLANTS = [
  { c: 'tl', v: 'frond' },
  { c: 'tr', v: 'round' },
  { c: 'bl', v: 'blade' },
  { c: 'br', v: 'frond' },
]

export default function ThemeWaterpark({ className = '' }) {
  return (
    <div className={`theme-wp${className ? ` ${className}` : ''}`} aria-hidden="true">
      <RippleDefs />
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
      {PLANTS.map((p) => (<span key={p.c} className={`wp-plant ${p.c}`}><Leaf variant={p.v} /></span>))}
    </div>
  )
}
