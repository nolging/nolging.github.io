import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { listDrawingStrokes, addDrawingStroke, deleteDrawingStroke, clearGroupDrawing } from '../lib/api'

// 펜 색상(각자 선택). 흰색은 지우개(배경색으로 덧칠)
const COLORS = ['#191722', '#e5484d', '#f5860a', '#f5c211', '#4a9d6a', '#3b82f6', '#7363e8', '#ec4899', '#ffffff']
// 펜 굵기 = 캔버스 너비 대비 비율(화면 크기 달라도 동일 비율로 렌더)
const WIDTHS = [0.008, 0.016, 0.028, 0.046]
const BG = '#ffffff'

function paintStroke(ctx, s, W, H, fromIdx = 0) {
  const p = s.p
  if (!p || !p.length) return
  ctx.strokeStyle = s.c; ctx.fillStyle = s.c
  ctx.lineWidth = Math.max(0.5, s.w * W)
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'
  if (p.length === 1) {
    ctx.beginPath(); ctx.arc(p[0][0] * W, p[0][1] * H, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); return
  }
  const start = Math.max(1, fromIdx)
  ctx.beginPath(); ctx.moveTo(p[start - 1][0] * W, p[start - 1][1] * H)
  for (let i = start; i < p.length; i++) ctx.lineTo(p[i][0] * W, p[i][1] * H)
  ctx.stroke()
}

export default function DrawBoard() {
  const { groupId } = useParams()
  const { profile } = useAuth()
  const uid = profile?.id

  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const ctxRef = useRef(null)
  const sizeRef = useRef({ w: 1, h: 1 })

  const committedRef = useRef([])       // [{id, author, c, w, p}]
  const idsRef = useRef(new Set())       // 커밋된 stroke id (중복 방지)
  const liveRef = useRef(new Map())      // id -> {c,w,p} 진행 중(피어)
  const chanRef = useRef(null)

  const drawing = useRef(null)           // 내 현재 stroke {id,c,w,p}
  const bufRef = useRef([])              // 전송 대기 포인트
  const rafRef = useRef(0)

  const [color, setColor] = useState('#191722')
  const [width, setWidth] = useState(WIDTHS[1])
  const colorRef = useRef(color); colorRef.current = color
  const widthRef = useRef(width); widthRef.current = width

  const [peers, setPeers] = useState(1)
  const [busy, setBusy] = useState(false)

  // ---- 렌더 ----
  const redrawAll = useCallback(() => {
    const ctx = ctxRef.current; if (!ctx) return
    const { w: W, h: H } = sizeRef.current
    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H)
    for (const s of committedRef.current) paintStroke(ctx, s, W, H)
    for (const s of liveRef.current.values()) paintStroke(ctx, s, W, H)
  }, [])

  const addCommitted = useCallback((s) => {
    if (idsRef.current.has(s.id)) return
    idsRef.current.add(s.id); committedRef.current.push(s)
  }, [])

  // ---- 캔버스 크기(DPR 대응). 표시 크기(canvas rect)를 재서 백스토어 해상도 설정 ----
  const resize = useCallback(() => {
    const cv = canvasRef.current
    if (!cv) return
    const rect = cv.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    cv.width = Math.round(rect.width * dpr); cv.height = Math.round(rect.height * dpr)
    const ctx = cv.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctxRef.current = ctx
    sizeRef.current = { w: rect.width, h: rect.height }
    redrawAll()
  }, [redrawAll])

  useEffect(() => {
    resize()
    const ro = new ResizeObserver(resize)
    if (canvasRef.current) ro.observe(canvasRef.current)
    return () => ro.disconnect()
  }, [resize])

  // ---- 실시간 채널 + 저장분 로드 ----
  useEffect(() => {
    if (!groupId || !uid) return
    const ch = supabase.channel(`draw:${groupId}`, {
      config: { broadcast: { self: false }, presence: { key: uid } },
    })
    chanRef.current = ch

    ch.on('broadcast', { event: 'seg' }, ({ payload: pl }) => {
      if (idsRef.current.has(pl.id)) return
      let s = liveRef.current.get(pl.id)
      const ctx = ctxRef.current; const { w: W, h: H } = sizeRef.current
      if (!s) { s = { id: pl.id, c: pl.c, w: pl.w, p: [] }; liveRef.current.set(pl.id, s) }
      const from = s.p.length
      if (pl.p && pl.p.length) { for (const q of pl.p) s.p.push(q); if (ctx) paintStroke(ctx, s, W, H, from) }
      if (pl.end) { liveRef.current.delete(pl.id); addCommitted({ id: s.id, author: pl.uid, c: s.c, w: s.w, p: s.p }) }
    })
    ch.on('broadcast', { event: 'remove' }, ({ payload: pl }) => {
      const i = committedRef.current.findIndex((x) => x.id === pl.id)
      if (i >= 0) { committedRef.current.splice(i, 1); idsRef.current.delete(pl.id) }
      liveRef.current.delete(pl.id)
      redrawAll()
    })
    ch.on('broadcast', { event: 'clear' }, () => {
      committedRef.current = []; idsRef.current = new Set(); liveRef.current.clear(); redrawAll()
    })
    ch.on('presence', { event: 'sync' }, () => {
      setPeers(Math.max(1, Object.keys(ch.presenceState()).length))
    })

    ch.subscribe(async (status) => {
      if (status !== 'SUBSCRIBED') return
      try { await ch.track({ uid, name: profile?.login_id || '' }) } catch { /* noop */ }
      try {
        const rows = await listDrawingStrokes(groupId)
        for (const r of rows) addCommitted({ id: r.id, author: r.author, c: r.stroke.c, w: r.stroke.w, p: r.stroke.p })
        redrawAll()
      } catch { /* noop */ }
    })

    return () => { supabase.removeChannel(ch); chanRef.current = null }
  }, [groupId, uid, profile?.login_id, addCommitted, redrawAll])

  // ---- 전송 버퍼 flush ----
  const flush = useCallback((end) => {
    const cur = drawing.current
    if (!cur) return
    const pts = bufRef.current; bufRef.current = []
    if (!pts.length && !end) return
    chanRef.current?.send({ type: 'broadcast', event: 'seg', payload: { id: cur.id, uid, c: cur.c, w: cur.w, p: pts, end: !!end } })
  }, [uid])

  // ---- 포인터 입력 ----
  function pos(e) {
    const rect = canvasRef.current.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
    return [Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4]
  }
  function onDown(e) {
    if (e.button != null && e.button !== 0 && e.pointerType === 'mouse') return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const p0 = pos(e)
    const cur = { id: (crypto.randomUUID?.() || `${uid}-${Date.now()}-${Math.random()}`), c: colorRef.current, w: widthRef.current, p: [p0] }
    drawing.current = cur
    bufRef.current = [p0]
    const ctx = ctxRef.current; const { w: W, h: H } = sizeRef.current
    if (ctx) paintStroke(ctx, cur, W, H)  // 점(dot)
    flush(false)
  }
  function onMove(e) {
    const cur = drawing.current; if (!cur) return
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e]
    const ctx = ctxRef.current; const { w: W, h: H } = sizeRef.current
    for (const ev of (events.length ? events : [e])) {
      const p = pos(ev)
      const last = cur.p[cur.p.length - 1]
      if (last && last[0] === p[0] && last[1] === p[1]) continue
      const from = cur.p.length
      cur.p.push(p); bufRef.current.push(p)
      if (ctx) paintStroke(ctx, cur, W, H, from)
    }
    if (!rafRef.current) rafRef.current = requestAnimationFrame(() => { rafRef.current = 0; flush(false) })
  }
  async function onUp() {
    const cur = drawing.current; if (!cur) return
    drawing.current = null
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0 }
    flush(true)
    addCommitted({ id: cur.id, author: uid, c: cur.c, w: cur.w, p: cur.p })
    try { await addDrawingStroke(groupId, cur.id, uid, { c: cur.c, w: cur.w, p: cur.p }) } catch { /* noop */ }
  }

  // ---- 되돌리기 / 지우기 ----
  async function undo() {
    if (busy) return
    const list = committedRef.current
    let idx = -1
    for (let i = list.length - 1; i >= 0; i--) { if (list[i].author === uid) { idx = i; break } }
    if (idx < 0) return
    const [s] = list.splice(idx, 1); idsRef.current.delete(s.id); redrawAll()
    chanRef.current?.send({ type: 'broadcast', event: 'remove', payload: { id: s.id } })
    try { await deleteDrawingStroke(s.id) } catch { /* noop */ }
  }
  async function clearAll() {
    if (busy) return
    if (!confirm('모두의 그림을 지울까요? 되돌릴 수 없어요.')) return
    setBusy(true)
    committedRef.current = []; idsRef.current = new Set(); liveRef.current.clear(); redrawAll()
    chanRef.current?.send({ type: 'broadcast', event: 'clear' })
    try { await clearGroupDrawing(groupId) } catch { /* noop */ } finally { setBusy(false) }
  }

  return (
    <div className="page draw-page">
      <div className="draw-peers">
        <span className="draw-dot" aria-hidden="true" />
        {peers > 1 ? `${peers}명이 함께 그리는 중` : '나 혼자 그리는 중'}
      </div>

      <div className="draw-wrap" ref={wrapRef}>
        <canvas ref={canvasRef} className="draw-canvas"
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
      </div>

      <div className="draw-tools">
        <div className="draw-colors">
          {COLORS.map((c) => (
            <button key={c} type="button" aria-label={`색상 ${c}`}
              className={`draw-sw ${color === c ? 'on' : ''} ${c === '#ffffff' ? 'is-white' : ''}`}
              style={{ background: c }} onClick={() => setColor(c)} />
          ))}
        </div>
        <div className="draw-row">
          <div className="draw-widths">
            {WIDTHS.map((w) => (
              <button key={w} type="button" aria-label={`굵기 ${w}`}
                className={`draw-wbtn ${width === w ? 'on' : ''}`} onClick={() => setWidth(w)}>
                <span style={{ width: Math.max(4, w * 150), height: Math.max(4, w * 150), background: color === '#ffffff' ? '#c9c6d6' : color }} />
              </button>
            ))}
          </div>
          <div className="draw-actions">
            <button type="button" className="draw-act" onClick={undo} aria-label="되돌리기" title="되돌리기">
              <svg width="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 5 5v1" /></svg>
            </button>
            <button type="button" className="draw-act danger" onClick={clearAll} aria-label="전체 지우기" title="전체 지우기">
              <svg width="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M6 6l1 14h10l1-14" /></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
