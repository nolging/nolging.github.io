// 버블버블 테마: 비눗방울이 대각선(가로로 흐르며 살짝 위로)으로 떠오르다가 위에서 톡! 터지는 오버레이.
// 부모는 position:relative + overflow:hidden 이어야 함(카드/페이지). ThemeHearts 와 동일 패턴.
// dx = 가로 이동량(px, 부호=방향). CSS 변수(--dur/--delay/--dx)로 넘겨 ::after 팝 링과 타이밍을 맞춤.
// l=시작 가로위치(%) · s=크기(px) · dx=가로 이동량(px,부호=방향) · ry=터지는 높이(bottom %)
const BUBBLES = [
  { l: 4,  d: 0.0, dur: 6.6, s: 24, dx: 96,  ry: 62 },
  { l: 16, d: 2.0, dur: 7.4, s: 17, dx: 78,  ry: 84 },
  { l: 30, d: 0.9, dur: 6.0, s: 30, dx: -84, ry: 52 },
  { l: 44, d: 3.1, dur: 7.0, s: 20, dx: 108, ry: 90 },
  { l: 58, d: 1.5, dur: 6.4, s: 25, dx: -76, ry: 70 },
  { l: 70, d: 3.7, dur: 7.8, s: 15, dx: 70,  ry: 94 },
  { l: 22, d: 4.6, dur: 6.8, s: 21, dx: 92,  ry: 58 },
  { l: 64, d: 5.4, dur: 6.2, s: 18, dx: -100, ry: 80 },
  { l: 84, d: 2.5, dur: 7.2, s: 13, dx: -72, ry: 88 },
  { l: 10, d: 5.8, dur: 6.9, s: 19, dx: 84,  ry: 66 },
]

export default function ThemeBubbles({ durScale = 1, className = '' }) {
  return (
    <div className={`theme-bubbles${className ? ` ${className}` : ''}`} aria-hidden="true">
      {BUBBLES.map((b, i) => (
        <span key={i} className="theme-bubble"
          style={{
            left: `${b.l}%`, width: b.s, height: b.s,
            '--dur': `${b.dur * durScale}s`, '--delay': `${b.d * durScale}s`,
            '--dx': `${b.dx}px`, '--ry': `${b.ry}%`,
          }} />
      ))}
    </div>
  )
}
