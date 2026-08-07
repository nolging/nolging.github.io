import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

// 푸린 마이크: 짝꿍 프로필 사진 위에 낙서하는 캔버스. 사진은 배경으로만 보여주고(참고용),
// 실제로 저장되는 건 투명 배경 위의 낙서(canvas)뿐 — 그걸 프로필 사진 위 오버레이로 합성한다.
// 기존 낙서(initialImageUrl)가 있으면 캔버스에 먼저 그려둬서 이어서 수정할 수 있다.
const COLORS = [
  { id: 'black', hex: '#1c1c1c' },
  { id: 'white', hex: '#ffffff' },
  { id: 'red', hex: '#e5484d' },
  { id: 'blue', hex: '#4f7fe0' },
]
const WIDTHS = [4, 8, 14]
const MAX_UNDO = 20

const EraserIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18.5 13.5 8 3 3 8l10.5 10.5" /><path d="M13.5 18.5H21" /><path d="M8 3l8 8" />
  </svg>
)
const UndoStrokeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 12a9 9 0 1 0 3-6.7" /><polyline points="3 3 3 8 8 8" />
  </svg>
)
const TrashIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M6 6l1 14h10l1-14" />
  </svg>
)

const GraffitiPad = forwardRef(function GraffitiPad({ photoUrl, initialImageUrl, size = 260 }, ref) {
  const canvasRef = useRef(null)
  const drawingRef = useRef(false)
  const lastPtRef = useRef(null)
  const historyRef = useRef([]) // 획 시작 전 스냅샷 스택(ImageData) — 한 획 취소용
  const [color, setColor] = useState(COLORS[0].hex)
  const [width, setWidth] = useState(WIDTHS[1])
  const [erasing, setErasing] = useState(false)
  const [loading, setLoading] = useState(!!initialImageUrl)
  const [canUndo, setCanUndo] = useState(false)

  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    cv.width = size * dpr
    cv.height = size * dpr
    const ctx = cv.getContext('2d')
    ctx.scale(dpr, dpr)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    historyRef.current = []
    setCanUndo(false)
    if (initialImageUrl) {
      setLoading(true)
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => { ctx.drawImage(img, 0, 0, size, size); setLoading(false) }
      img.onerror = () => setLoading(false)
      img.src = initialImageUrl
    } else {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialImageUrl, size])

  function posFromEvent(e) {
    const rect = canvasRef.current.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }
  function pushHistory() {
    const cv = canvasRef.current
    try {
      const snap = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height)
      historyRef.current.push(snap)
      if (historyRef.current.length > MAX_UNDO) historyRef.current.shift()
      setCanUndo(true)
    } catch { /* getImageData 실패 시(예: 이미지 오염) undo 만 조용히 비활성 */ }
  }
  function onPointerDown(e) {
    e.preventDefault()
    canvasRef.current.setPointerCapture?.(e.pointerId)
    pushHistory()
    drawingRef.current = true
    lastPtRef.current = posFromEvent(e)
    // 점 하나만 찍고 떼는 탭도 자국이 남게, 시작점에 짧은 stroke 를 바로 하나 그림
    const pt = lastPtRef.current
    drawSegment(pt, { x: pt.x + 0.1, y: pt.y + 0.1 })
  }
  function drawSegment(from, to) {
    const ctx = canvasRef.current.getContext('2d')
    ctx.globalCompositeOperation = erasing ? 'destination-out' : 'source-over'
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
  }
  function onPointerMove(e) {
    if (!drawingRef.current) return
    const pt = posFromEvent(e)
    drawSegment(lastPtRef.current, pt)
    lastPtRef.current = pt
  }
  function onPointerUp() {
    drawingRef.current = false
    lastPtRef.current = null
  }
  function undo() {
    const snap = historyRef.current.pop()
    if (!snap) return
    canvasRef.current.getContext('2d').putImageData(snap, 0, 0)
    setCanUndo(historyRef.current.length > 0)
  }
  function clearAll() {
    pushHistory() // 전체 초기화도 되돌릴 수 있게
    canvasRef.current.getContext('2d').clearRect(0, 0, size, size)
  }

  useImperativeHandle(ref, () => ({
    exportBlob: () => new Promise((resolve) => canvasRef.current.toBlob((b) => resolve(b), 'image/png')),
  }))

  return (
    <div className="graf-pad">
      <div className="graf-canvas-wrap" style={{ width: size, height: size }}>
        {photoUrl && <img className="graf-bg" src={photoUrl} alt="" draggable={false} />}
        {loading && <div className="graf-loading"><span className="spinner spinner-sm" /></div>}
        <canvas ref={canvasRef} className="graf-canvas" style={{ width: size, height: size }}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} />
      </div>
      <div className="graf-tools">
        {/* 컬러 팔레트(낙서장 DrawBoard 와 동일한 원형 스와치 + 흰/먹색 링) + 펜 굵기를 한 줄에 */}
        <div className="graf-row">
          <div className="graf-colors">
            {COLORS.map((c) => (
              <button key={c.id} type="button" aria-label={`색상 ${c.id}`}
                className={`graf-sw ${!erasing && color === c.hex ? 'on' : ''} ${c.id === 'white' ? 'is-white' : ''}`}
                style={{ background: c.hex }} onClick={() => { setColor(c.hex); setErasing(false) }} />
            ))}
          </div>
          <span className="graf-vsep" />
          <div className="graf-widths">
            {WIDTHS.map((w, i) => (
              <button key={w} type="button" className={`graf-width ${!erasing && width === w ? 'on' : ''}`}
                onClick={() => { setWidth(w); setErasing(false) }} aria-label={`굵기 ${i + 1}`}>
                <span style={{ width: 5 + i * 4.5, height: 5 + i * 4.5 }} />
              </button>
            ))}
          </div>
        </div>
        <div className="graf-row">
          <button type="button" className={`graf-icon-btn ${erasing ? 'is-active' : ''}`} onClick={() => setErasing((v) => !v)} aria-label="지우개">
            <EraserIcon />
          </button>
          <button type="button" className="graf-icon-btn" onClick={undo} disabled={!canUndo} aria-label="한 획 취소">
            <UndoStrokeIcon />
          </button>
          <button type="button" className="graf-icon-btn" onClick={clearAll} aria-label="전체 초기화">
            <TrashIcon />
          </button>
        </div>
      </div>
    </div>
  )
})
export default GraffitiPad
