// 워터파크 테마: 위에서 내려다본 수영장 물(찰랑이는 caustics) 위로 튜브·비치볼이 둥둥 떠 흔들.
// 부모는 position:relative + overflow:hidden. 배경 레이어라 z-index:0(콘텐츠 뒤).
const FLOATS = [
  { type: 'ring', l: 6,  t: 14, s: 66, c: '#ff8aa6', d: 0,   dur: 5.0, rot: -6 },
  { type: 'ball', l: 68, t: 10, s: 46, d: 1.1, dur: 4.4, rot: 8 },
  { type: 'ring', l: 56, t: 54, s: 84, c: '#ffd24d', d: 0.6, dur: 5.8, rot: 5 },
  { type: 'ball', l: 15, t: 60, s: 40, d: 2.0, dur: 4.9, rot: -8 },
  { type: 'ring', l: 80, t: 38, s: 54, c: '#63cdf0', d: 1.6, dur: 5.3, rot: 7 },
  { type: 'ball', l: 40, t: 84, s: 34, d: 2.6, dur: 4.6, rot: -5 },
]

export default function ThemeWaterpark({ className = '' }) {
  return (
    <div className={`theme-wp${className ? ` ${className}` : ''}`} aria-hidden="true">
      <div className="wp-water" />
      {FLOATS.map((f, i) => (
        <span key={i} className={f.type === 'ring' ? 'wp-ring' : 'wp-ball'}
          style={{
            left: `${f.l}%`, top: `${f.t}%`, width: f.s, height: f.s,
            ...(f.c ? { '--c': f.c } : {}), '--rot': `${f.rot}deg`,
            animationDelay: `${f.d}s`, animationDuration: `${f.dur}s`,
          }} />
      ))}
    </div>
  )
}
