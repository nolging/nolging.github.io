// 버블버블 테마: 비눗방울이 바닥에서 솟아올라 위에서 톡 터지는 오버레이 (CSS만 사용).
// 부모는 position:relative + overflow:hidden 이어야 함(카드/페이지). ThemeHearts 와 동일 패턴.
const BUBBLES = [
  { l: 8,  d: 0.0, dur: 5.2, s: 26 },
  { l: 22, d: 1.8, dur: 6.1, s: 18 },
  { l: 37, d: 0.7, dur: 4.6, s: 33 },
  { l: 52, d: 2.7, dur: 5.6, s: 21 },
  { l: 66, d: 1.3, dur: 5.0, s: 25 },
  { l: 80, d: 3.3, dur: 6.4, s: 16 },
  { l: 30, d: 3.9, dur: 5.3, s: 22 },
  { l: 72, d: 4.6, dur: 4.9, s: 19 },
  { l: 90, d: 2.2, dur: 5.9, s: 14 },
  { l: 15, d: 4.9, dur: 5.5, s: 20 },
]

export default function ThemeBubbles({ durScale = 1, className = '' }) {
  return (
    <div className={`theme-bubbles${className ? ` ${className}` : ''}`} aria-hidden="true">
      {BUBBLES.map((b, i) => (
        <span key={i} className="theme-bubble"
          style={{
            left: `${b.l}%`, width: b.s, height: b.s,
            animationDelay: `${b.d * durScale}s`, animationDuration: `${b.dur * durScale}s`,
          }} />
      ))}
    </div>
  )
}
