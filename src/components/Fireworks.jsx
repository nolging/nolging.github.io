import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

// 커플 기념일 축하 폭죽 (캔버스). 로켓이 솟아올라 터지며 색색의 불꽃이 중력으로 흩어진다.
const PALETTE = ['#ffd75e', '#ff8a3d', '#ff5c8a', '#4aa3ff', '#37c98b', '#a06bff']

export default function Fireworks({ className = '' }) {
  const ref = useRef(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return

    const R = (a, b) => a + Math.random() * (b - a)
    const pick = () => PALETTE[(Math.random() * PALETTE.length) | 0]
    let ctx, W, H, P = [], rockets = [], timer = 0, raf = 0

    const setup = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      W = cv.clientWidth || window.innerWidth
      H = cv.clientHeight || window.innerHeight
      cv.width = W * dpr; cv.height = H * dpr
      ctx = cv.getContext('2d')
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const explode = (x, y, n, spd) => {
      for (let i = 0; i < n; i++) {
        const a = (Math.PI * 2 * i) / n + R(-0.12, 0.12)
        const v = R(spd * 0.5, spd)
        P.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, dec: R(0.008, 0.016), c: pick(), r: R(2.0, 3.0), g: 0.045 })
      }
    }
    const fire = () => {
      for (let i = 0; i < 3; i++) rockets.push({ x: R(W * 0.2, W * 0.8), y: H + R(0, 18), vy: -R(5.4, 7), ty: R(H * 0.14, H * 0.42), c: pick() })
    }

    const frame = () => {
      timer++
      // 잔상이 서서히 지워지도록(투명 배경)
      ctx.globalCompositeOperation = 'destination-out'
      ctx.fillStyle = 'rgba(0,0,0,0.2)'
      ctx.fillRect(0, 0, W, H)
      ctx.globalCompositeOperation = 'source-over'

      if (timer % 40 === 0) rockets.push({ x: R(W * 0.18, W * 0.82), y: H, vy: -R(5.4, 7), ty: R(H * 0.14, H * 0.44), c: pick() })

      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i]; r.y += r.vy
        ctx.globalAlpha = 1; ctx.fillStyle = r.c
        ctx.beginPath(); ctx.arc(r.x, r.y, 1.8, 0, 6.283); ctx.fill()
        if (r.y <= r.ty) { explode(r.x, r.y, (R(34, 46)) | 0, R(3, 4.2)); rockets.splice(i, 1) }
      }
      for (let i = P.length - 1; i >= 0; i--) {
        const p = P[i]
        p.vy += p.g; p.vx *= 0.985; p.vy *= 0.985; p.x += p.vx; p.y += p.vy; p.life -= p.dec
        ctx.globalAlpha = Math.max(p.life, 0); ctx.fillStyle = p.c
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(p.r * p.life, 0.3), 0, 6.283); ctx.fill()
        if (p.life <= 0) P.splice(i, 1)
      }
      ctx.globalAlpha = 1
      raf = requestAnimationFrame(frame)
    }

    setup()
    const onResize = () => setup()
    window.addEventListener('resize', onResize)
    frame()
    const kick = setTimeout(fire, 240)
    return () => { cancelAnimationFrame(raf); clearTimeout(kick); window.removeEventListener('resize', onResize) }
  }, [])

  // 페이지 스택 컨텍스트에 갇히지 않도록 body 최상위에 오버레이
  return createPortal(
    <canvas ref={ref} className={`fireworks-canvas${className ? ` ${className}` : ''}`} aria-hidden="true" />,
    document.body,
  )
}
