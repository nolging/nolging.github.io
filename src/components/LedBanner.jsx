// 도트 LED 전광판 마퀴. text 가 왼쪽으로 계속 흐른다. 색상 6종.
export const LED_COLORS = ['amber', 'red', 'green', 'blue', 'pink', 'cyan']

export default function LedBanner({ text, color = 'amber', className = '' }) {
  const t = (text || '').trim() || ' '
  // 텍스트 길이에 따라 재생 시간을 조정해 읽는 속도를 비슷하게 유지
  const dur = Math.max(10, Math.min(60, t.length * 0.7))
  const col = LED_COLORS.includes(color) ? color : 'amber'
  return (
    <div className={`led-board led-${col} ${className}`} aria-label={t}>
      <div className="led-track" style={{ animationDuration: `${dur}s` }}>
        <span className="led-seg">{t}</span>
        <span className="led-seg" aria-hidden="true">{t}</span>
      </div>
    </div>
  )
}
