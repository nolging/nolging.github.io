// 커플 기념일 다크 모드 배경의 반짝이는 밤하늘 별. (장식용, 조작 방해 없음)
const STARS = [
  { top: 9, left: 10, s: 3, c: '#fff', glow: true, dur: 2.6, d: 0 },
  { top: 12, left: 78, s: 2, c: '#ffe9b0', dur: 3.1, d: 0.6 },
  { top: 16, left: 18, s: 2, c: '#fff', dur: 2.3, d: 1.1 },
  { top: 7, left: 52, s: 2, c: '#d9d2ff', dur: 3.5, d: 0.3 },
  { top: 19, left: 86, s: 3, c: '#fff', glow: true, dur: 2.8, d: 0.9 },
  { top: 24, left: 12, s: 2, c: '#fff', dur: 3.2, d: 1.4 },
  { top: 28, left: 90, s: 2, c: '#ffe9b0', dur: 2.5, d: 0.2 },
  { top: 33, left: 7, s: 3, c: '#d9d2ff', glow: true, dur: 3.0, d: 0.7 },
  { top: 40, left: 84, s: 2, c: '#fff', dur: 2.4, d: 1.2 },
  { top: 5, left: 38, s: 2, c: '#fff', dur: 3.6, d: 0.5 },
  { top: 17, left: 68, s: 2, c: '#ffe9b0', dur: 2.2, d: 1.0 },
  { top: 45, left: 15, s: 2, c: '#fff', dur: 3.0, d: 0.4 },
  { top: 14, left: 88, s: 3, c: '#fff', glow: true, dur: 2.7, d: 1.3 },
  { top: 9, left: 64, s: 2, c: '#d9d2ff', dur: 3.3, d: 0.8 },
  { top: 27, left: 6, s: 2, c: '#fff', dur: 2.6, d: 1.5 },
  { top: 48, left: 54, s: 2, c: '#fff', dur: 3.1, d: 0.1 },
]

export default function NightSky() {
  return (
    <div className="csx-stars" aria-hidden="true">
      {STARS.map((st, i) => (
        <span key={i} className={`csx-star${st.glow ? ' csx-star-glow' : ''}`}
          style={{
            top: `${st.top}%`, left: `${st.left}%`, width: st.s, height: st.s, background: st.c,
            animationDuration: `${st.dur}s`, animationDelay: `${st.d}s`,
          }} />
      ))}
    </div>
  )
}
