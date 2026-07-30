import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

// 커플 기념일 축하 폭죽 (캔버스). 로켓이 솟아올라 터지며 색색의 불꽃이 중력으로 흩어진다.
// contained=true → 부모(카드) 안에 담기는 축소판(포탈/fixed 대신 absolute inset:0). 물리량은 높이에 비례.
const PALETTE = ['#ffd75e', '#ff8a3d', '#ff5c8a', '#4aa3ff', '#37c98b', '#a06bff']

export default function Fireworks({ className = '', contained = false }) {
  const ref = useRef(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return

    const R = (a, b) => a + Math.random() * (b - a)
    const pick = () => PALETTE[(Math.random() * PALETTE.length) | 0]
    let ctx, W, H, k = 1, P = [], rockets = [], timer = 0, raf = 0

    const setup = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      W = cv.clientWidth || window.innerWidth
      H = cv.clientHeight || window.innerHeight
      cv.width = W * dpr; cv.height = H * dpr
      ctx = cv.getContext('2d')
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      // 전체화면=1, 작은 카드=축소(단 카드는 기준을 낮춰 폭죽을 2배+ 크게)
      k = Math.max(contained ? 0.34 : 0.16, Math.min(1, H / (contained ? 320 : 700)))
    }

    const explode = (x, y, n, spd) => {
      for (let i = 0; i < n; i++) {
        const a = (Math.PI * 2 * i) / n + R(-0.12, 0.12)
        const v = R(spd * 0.5, spd) * k
        P.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, dec: R(0.008, 0.016), c: pick(), r: R(2.0, 3.0) * k, g: 0.045 * k })
      }
    }
    const launch = () => ({ x: R(W * 0.18, W * 0.82), y: H + R(0, 18), vy: -R(5.4, 7) * k, ty: R(H * 0.14, H * 0.44), c: pick() })
    const fire = () => { for (let i = 0; i < (contained ? 2 : 3); i++) rockets.push(launch()) }

    const TAIL = 2.6 // 속도 기반 꼬리 길이(프레임 수). 매 프레임 완전 지우므로 잔상이 남지 않음.
    const CADENCE = contained ? 64 : 40
    const frame = () => {
      timer++
      // 매 프레임 캔버스를 완전히 비운다 → 반투명 누적으로 인한 흐릿한 잔상이 안 생김
      ctx.clearRect(0, 0, W, H)
      ctx.lineCap = 'round'

      if (timer % CADENCE === 0) rockets.push(launch())

      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i]; r.y += r.vy
        ctx.globalAlpha = 1; ctx.strokeStyle = r.c; ctx.lineWidth = Math.max(1, 2 * k)
        ctx.beginPath(); ctx.moveTo(r.x, r.y - r.vy * TAIL); ctx.lineTo(r.x, r.y); ctx.stroke()
        if (r.y <= r.ty) { explode(r.x, r.y, (R(34, 46)) | 0, R(3, 4.2)); rockets.splice(i, 1) }
      }
      for (let i = P.length - 1; i >= 0; i--) {
        const p = P[i]
        p.vy += p.g; p.vx *= 0.985; p.vy *= 0.985; p.x += p.vx; p.y += p.vy; p.life -= p.dec
        if (p.life <= 0) { P.splice(i, 1); continue }
        ctx.globalAlpha = p.life
        ctx.strokeStyle = p.c; ctx.lineWidth = Math.max(p.r * p.life, 0.5)
        ctx.beginPath(); ctx.moveTo(p.x - p.vx * TAIL, p.y - p.vy * TAIL); ctx.lineTo(p.x, p.y); ctx.stroke()
      }
      ctx.globalAlpha = 1
      raf = requestAnimationFrame(frame)
    }

    setup()
    const onResize = () => setup()
    window.addEventListener('resize', onResize)
    let ro
    if (contained && 'ResizeObserver' in window) { ro = new ResizeObserver(setup); ro.observe(cv) }
    frame()
    const kick = setTimeout(fire, 240)
    return () => { cancelAnimationFrame(raf); clearTimeout(kick); window.removeEventListener('resize', onResize); ro?.disconnect() }
  }, [contained])

  const canvas = <canvas ref={ref} className={`fireworks-canvas${contained ? ' fireworks-contained' : ''}${className ? ` ${className}` : ''}`} aria-hidden="true" />
  // 카드 내부용은 그대로, 전체화면 오버레이는 스택 컨텍스트에 갇히지 않도록 body 최상위에
  return contained ? canvas : createPortal(canvas, document.body)
}
