import Fireworks from './Fireworks'
import NightSky from './NightSky'

// 폭죽 팡팡 테마 오버레이.
//  page=true  → 그룹 상세: 밤하늘 별(뒤 레이어) + 실제 캔버스 폭죽(전체화면, 커플 기념일과 동일)
//  page=false → 대시보드 카드/상점 썸네일: 카드 크기에 맞춘 작은 별 + CSS 폭죽 터짐(가벼움)

// 카드용 별: 그룹 상세보다 작고 성기게(간격 넓게) — 작은 카드에서 커 보이지 않도록
const CARD_STARS = [
  { top: 14, left: 12, s: 1.6, c: '#fff', dur: 2.7, d: 0.0, glow: true },
  { top: 22, left: 82, s: 1.4, c: '#ffe9b0', dur: 3.1, d: 0.8 },
  { top: 40, left: 30, s: 1.2, c: '#fff', dur: 2.4, d: 1.3 },
  { top: 12, left: 54, s: 1.5, c: '#d9d2ff', dur: 3.4, d: 0.4 },
  { top: 62, left: 88, s: 1.3, c: '#fff', dur: 2.8, d: 1.0, glow: true },
  { top: 74, left: 20, s: 1.2, c: '#fff', dur: 3.2, d: 0.5 },
  { top: 52, left: 66, s: 1.4, c: '#ffe9b0', dur: 2.6, d: 1.5 },
  { top: 84, left: 48, s: 1.2, c: '#d9d2ff', dur: 3.0, d: 0.9 },
]
// 폭죽 두 발(터지는 위치·색·타이밍 다르게)
const BURSTS = [
  { cx: 32, cy: 34, c: '#ffd75e', r: 18, dur: 2.6, d: 0.1 },
  { cx: 70, cy: 30, c: '#ff5c8a', r: 16, dur: 2.6, d: 1.35 },
]
const PARTS = 12

export default function ThemeFireworks({ page = false }) {
  if (page) {
    return (
      <>
        <div className="theme-fw-stars" aria-hidden="true"><NightSky /></div>
        <Fireworks className="fw-over" />
      </>
    )
  }
  return (
    <div className="theme-fw-card" aria-hidden="true">
      {CARD_STARS.map((st, i) => (
        <span key={i} className={`csx-star${st.glow ? ' csx-star-glow' : ''}`}
          style={{ top: `${st.top}%`, left: `${st.left}%`, width: st.s, height: st.s, background: st.c,
            animationDuration: `${st.dur}s`, animationDelay: `${st.d}s` }} />
      ))}
      {BURSTS.map((b, i) => (
        <span key={i} className="fw-burst" style={{ left: `${b.cx}%`, top: `${b.cy}%`, color: b.c }}>
          <span className="fw-flash" style={{ animationDuration: `${b.dur}s`, animationDelay: `${b.d}s` }} />
          {Array.from({ length: PARTS }).map((_, j) => (
            <i key={j} className="fw-p"
              style={{ '--a': `${j * (360 / PARTS)}deg`, '--r': `${b.r}px`,
                animationDuration: `${b.dur}s`, animationDelay: `${b.d}s` }} />
          ))}
        </span>
      ))}
    </div>
  )
}
