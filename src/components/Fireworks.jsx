// 커플 기념일 축하 폭죽 오버레이. 여러 지점에서 시차를 두고 반복적으로 터진다.
// 부모(또는 fixed 오버레이)에 얹어 사용. pointer-events:none 이라 조작을 방해하지 않음.
const BURSTS = [
  { l: 22, t: 24, d: 0.0, hue: 340, size: 1.0 },
  { l: 76, t: 18, d: 0.7, hue: 45, size: 0.85 },
  { l: 50, t: 12, d: 1.5, hue: 205, size: 1.1 },
  { l: 32, t: 44, d: 2.3, hue: 285, size: 0.9 },
  { l: 68, t: 38, d: 3.0, hue: 130, size: 1.0 },
  { l: 15, t: 56, d: 3.7, hue: 15, size: 0.8 },
  { l: 85, t: 52, d: 4.4, hue: 315, size: 0.95 },
]
const SPARKS = 14

export default function Fireworks({ className = '' }) {
  return (
    <div className={`fireworks${className ? ` ${className}` : ''}`} aria-hidden="true">
      {BURSTS.map((b, i) => (
        <span key={i} className="fw" style={{ left: `${b.l}%`, top: `${b.t}%`, animationDelay: `${b.d}s` }}>
          {Array.from({ length: SPARKS }, (_, j) => (
            <span key={j} className="fw-spark"
              style={{
                '--a': `${(360 / SPARKS) * j}deg`,
                '--dist': `${64 * b.size}px`,
                background: `hsl(${b.hue + j * (50 / SPARKS)} 92% 62%)`,
              }} />
          ))}
        </span>
      ))}
    </div>
  )
}
