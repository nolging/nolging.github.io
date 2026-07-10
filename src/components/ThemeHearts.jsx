// 그룹 꾸미기 테마 "하트 뿅뿅": 작은 하트가 바닥에서 화면 상단까지 뿅뿅 솟아오르는 오버레이.
// top(%)으로 애니메이션 → 부모(카드/페이지) 높이에 맞춰 항상 끝까지 올라감.
// 부모는 position:relative + overflow:hidden 이어야 함.
const HEARTS = [
  { l: 10, d: 0.0, dur: 4.2, s: 17 },
  { l: 26, d: 1.6, dur: 5.0, s: 13 },
  { l: 42, d: 0.7, dur: 3.8, s: 20 },
  { l: 57, d: 2.6, dur: 4.7, s: 14 },
  { l: 72, d: 1.2, dur: 4.1, s: 16 },
  { l: 86, d: 3.2, dur: 5.3, s: 12 },
  { l: 34, d: 3.8, dur: 4.4, s: 15 },
  { l: 64, d: 4.4, dur: 3.9, s: 13 },
]

const COLORS = ['#ff6b95', '#ff92b0', '#ff5c86', '#ff7ea3', '#ffa6c0']

export default function ThemeHearts() {
  return (
    <div className="theme-hearts" aria-hidden="true">
      {HEARTS.map((h, i) => (
        <span key={i} className="theme-heart"
          style={{
            left: `${h.l}%`, color: COLORS[i % COLORS.length], fontSize: h.s,
            animationDelay: `${h.d}s`, animationDuration: `${h.dur}s`,
          }}>♥</span>
      ))}
    </div>
  )
}
