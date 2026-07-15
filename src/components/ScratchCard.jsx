import { useEffect, useRef } from 'react'

// 동전으로 긁는 스크래치 카드. children(당첨 내용) 위를 은박 커버로 덮고,
// 문지른 자리를 지워 드러냄. revealAt(기본 55%) 이상 긁으면 나머지 자동 공개.
export default function ScratchCard({ height = 172, onReveal, onStart, reveal = false, revealAt = 0.55, coverText = '긁어서 확인하기', children }) {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const revealedRef = useRef(false)
  const drawingRef = useRef(false)
  const startedRef = useRef(false)
  const lastRef = useRef(null)
  const onRevealRef = useRef(onReveal)
  onRevealRef.current = onReveal
  const onStartRef = useRef(onStart)
  onStartRef.current = onStart

  // 외부에서 reveal=true 로 강제 공개(버튼으로 "결과 확인")
  useEffect(() => {
    if (!reveal || revealedRef.current) return
    revealedRef.current = true
    canvasRef.current?.classList.add('gone')
    onRevealRef.current?.()
  }, [reveal])

  useEffect(() => {
    const wrap = wrapRef.current
    const cv = canvasRef.current
    if (!wrap || !cv) return
    const ctx = cv.getContext('2d')
    const DPR = Math.min(window.devicePixelRatio || 1, 3)
    let W = wrap.clientWidth || 280
    let H = height

    function paintCover() {
      cv.width = W * DPR; cv.height = H * DPR
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
      const g = ctx.createLinearGradient(0, 0, W, H)
      g.addColorStop(0, '#c7c9d4'); g.addColorStop(0.5, '#a9abbb'); g.addColorStop(1, '#bcbecb')
      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = 'rgba(255,255,255,.10)'
      for (let x = -H; x < W; x += 15) { ctx.save(); ctx.translate(x, 0); ctx.rotate(-0.5); ctx.fillRect(0, 0, 5, H * 2); ctx.restore() }
      ctx.globalAlpha = 0.16; ctx.fillStyle = '#5b5d6b'; ctx.font = '19px sans-serif'
      for (let y = 26; y < H; y += 40) for (let x = 22; x < W; x += 50) ctx.fillText('🐾', x + ((y / 40) % 2 ? 16 : 0), y)
      ctx.globalAlpha = 1
    }
    paintCover()

    function pos(e) {
      const r = cv.getBoundingClientRect()
      const t = e.touches ? e.touches[0] : e
      return { x: (t.clientX - r.left) * (W / r.width), y: (t.clientY - r.top) * (H / r.height) }
    }
    function scratch(p) {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.lineWidth = 36; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
      const last = lastRef.current
      if (last) { ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke() }
      ctx.beginPath(); ctx.arc(p.x, p.y, 18, 0, 7); ctx.fill()
      lastRef.current = p
      wrap.classList.add('scratched')
    }
    function pct() {
      const s = ctx.getImageData(0, 0, cv.width, cv.height).data
      let clear = 0, total = 0
      for (let i = 3; i < s.length; i += 4 * 20) { total++; if (s[i] === 0) clear++ }
      return total ? clear / total : 0
    }
    function check() {
      if (revealedRef.current) return
      if (pct() > revealAt) {
        revealedRef.current = true
        cv.classList.add('gone')
        onRevealRef.current?.()
      }
    }
    function down(e) {
      if (revealedRef.current) return
      if (!startedRef.current) { startedRef.current = true; onStartRef.current?.() }  // 첫 긁기 = 사용 확정
      drawingRef.current = true; lastRef.current = null; scratch(pos(e)); e.preventDefault()
    }
    function move(e) { if (!drawingRef.current || revealedRef.current) return; scratch(pos(e)); check(); e.preventDefault() }
    function up() { if (drawingRef.current) { drawingRef.current = false; check() } }

    cv.addEventListener('mousedown', down)
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    cv.addEventListener('touchstart', down, { passive: false })
    cv.addEventListener('touchmove', move, { passive: false })
    window.addEventListener('touchend', up)
    return () => {
      cv.removeEventListener('mousedown', down)
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      cv.removeEventListener('touchstart', down)
      cv.removeEventListener('touchmove', move)
      window.removeEventListener('touchend', up)
    }
  }, [height, revealAt])

  return (
    <div className="scratch" ref={wrapRef} style={{ height }}>
      <div className="scratch-prize">{children}</div>
      <canvas className="scratch-cv" ref={canvasRef} />
      <div className="scratch-hint" aria-hidden="true"><span className="scratch-coin">🪙</span><span>{coverText}</span></div>
    </div>
  )
}
