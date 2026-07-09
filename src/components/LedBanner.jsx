import { useLayoutEffect, useRef, useState } from 'react'

// 도트 LED 전광판 마퀴. text 가 왼쪽으로 끊김 없이 계속 흐른다. 색상 6종.
export const LED_COLORS = ['amber', 'red', 'green', 'blue', 'pink', 'cyan']

export default function LedBanner({ text, color = 'amber', className = '' }) {
  const t = (text || '').trim() || ' '
  const col = LED_COLORS.includes(color) ? color : 'amber'
  const boardRef = useRef(null)
  const measureRef = useRef(null)
  // 한 세그먼트(문구 1회) 폭을 재서, 보드를 가득 채울 만큼 반복 → 두 벌 이어 붙여 -50% 무한 루프
  const [track, setTrack] = useState({ copies: 4, dur: 16 })

  useLayoutEffect(() => {
    const board = boardRef.current
    const one = measureRef.current
    if (!board || !one) return
    const measure = () => {
      const bw = board.offsetWidth || 1
      const ow = one.offsetWidth || 1
      const copies = Math.max(2, Math.ceil(bw / ow) + 1) // 한 벌이 보드보다 넓도록 여유 있게
      const dur = Math.max(8, (ow * copies) / 55)          // 55px/s 로 일정한 속도
      setTrack({ copies, dur })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(board)
    return () => ro.disconnect()
  }, [t])

  const half = Array.from({ length: track.copies }, (_, i) => (
    <span key={i} className="led-seg">{t}</span>
  ))

  return (
    <div className={`led-board led-${col} ${className}`} ref={boardRef} aria-label={t}>
      {/* 폭 측정용(숨김) 한 조각 */}
      <span className="led-seg led-measure" ref={measureRef} aria-hidden="true">{t}</span>
      <div className="led-track" style={{ animationDuration: `${track.dur}s` }}>
        <div className="led-half">{half}</div>
        <div className="led-half" aria-hidden="true">{half}</div>
      </div>
    </div>
  )
}
