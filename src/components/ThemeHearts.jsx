// 그룹 꾸미기 테마 "하트 뿅뿅": 작은 하트가 아래에서 뿅뿅 솟아오르는 오버레이.
// 부모는 position:relative + overflow:hidden 이어야 함(카드/페이지 컨테이너).
const HEARTS = [
  { l: 10, d: 0.0, dur: 3.4, s: 13, c: '#ff6b95' },
  { l: 26, d: 1.3, dur: 4.1, s: 9, c: '#ff92b0' },
  { l: 42, d: 0.6, dur: 3.0, s: 15, c: '#ff5c86' },
  { l: 57, d: 2.1, dur: 3.8, s: 10, c: '#ff7ea3' },
  { l: 72, d: 1.0, dur: 3.3, s: 12, c: '#ff6b95' },
  { l: 86, d: 2.6, dur: 4.3, s: 8, c: '#ffa6c0' },
  { l: 34, d: 3.0, dur: 3.6, s: 11, c: '#ff5c86' },
  { l: 64, d: 3.6, dur: 3.1, s: 9, c: '#ff92b0' },
]

export default function ThemeHearts({ rise = 130 }) {
  return (
    <div className="theme-hearts" aria-hidden="true">
      {HEARTS.map((h, i) => (
        <span key={i} className="theme-heart"
          style={{
            left: `${h.l}%`, color: h.c, fontSize: h.s,
            animationDelay: `${h.d}s`, animationDuration: `${h.dur}s`,
            '--rise': `${rise}px`,
          }}>♥</span>
      ))}
    </div>
  )
}
