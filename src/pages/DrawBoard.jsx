import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useOutletContext } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { listDrawingStrokes, addDrawingStroke, deleteDrawingStroke, clearGroupDrawing, getMyGroupMember } from '../lib/api'
import Avatar from '../components/Avatar'

// 펜 색상(각자 선택). 흰색은 지우개(배경색으로 덧칠)
const COLORS = ['#191722', '#e5484d', '#f5860a', '#f5c211', '#4a9d6a', '#3b82f6', '#7363e8', '#ec4899', '#ffffff']
// 펜 굵기 = 캔버스 너비 대비 비율(화면 크기 달라도 동일 비율로 렌더)
const WIDTHS = [0.008, 0.016, 0.028, 0.046]
// 브러쉬 종류(그린 뒤 실시간/저장에 stroke.b 로 함께 기록 → 피어도 동일하게 렌더)
const BRUSHES = [
  { id: 'pen', label: '펜' },
  { id: 'highlighter', label: '형광펜' },
  { id: 'neon', label: '네온' },
  { id: 'dashed', label: '점선' },
]
// 반투명/발광 브러쉬는 획을 한 번에 그려야 이음매(끊김)가 안 생김 → 증분 대신 전체 리드로우
const SMOOTH = new Set(['highlighter', 'neon'])
const BG = '#ffffff'

// 정규화 좌표 폴리라인을 한 번에 stroke
function strokePolyline(ctx, p, W, H, start) {
  ctx.beginPath(); ctx.moveTo(p[start - 1][0] * W, p[start - 1][1] * H)
  for (let i = start; i < p.length; i++) ctx.lineTo(p[i][0] * W, p[i][1] * H)
  ctx.stroke()
}

function paintStroke(ctx, s, W, H, fromIdx = 0) {
  const p = s.p
  if (!p || !p.length) return
  const b = s.b || 'pen'
  const lw = Math.max(0.5, s.w * W)
  ctx.save()
  ctx.strokeStyle = s.c; ctx.fillStyle = s.c
  ctx.lineWidth = lw
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'

  if (b === 'highlighter') { ctx.globalAlpha = 0.3; ctx.lineWidth = lw * 1.7 }
  else if (b === 'neon') { ctx.shadowColor = s.c; ctx.shadowBlur = Math.max(6, lw * 1.6) }
  else if (b === 'dashed') { ctx.setLineDash([Math.max(1, lw * 0.15), lw * 1.5 + 2]) }

  if (p.length === 1) {
    ctx.beginPath(); ctx.arc(p[0][0] * W, p[0][1] * H, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); ctx.restore(); return
  }
  // 매끄러운 브러쉬은 항상 처음부터(한 획), 펜/점선은 증분(fromIdx)으로 빠르게
  const start = SMOOTH.has(b) ? 1 : Math.max(1, fromIdx)
  strokePolyline(ctx, p, W, H, start)
  ctx.restore()
}

export default function DrawBoard() {
  const { groupId } = useParams()
  const { setHeaderSave } = useOutletContext() || {}
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
  const [brush, setBrush] = useState('pen')
  const colorRef = useRef(color); colorRef.current = color
  const widthRef = useRef(width); widthRef.current = width
  const brushRef = useRef(brush); brushRef.current = brush

  const [canvasW, setCanvasW] = useState(0)   // 실제 캔버스 표시 너비(굵기 미리보기 = 실제 굵기)
  const [members, setMembers] = useState([])  // 접속 중 멤버 [{uid,name,avatar}]
  const [busy, setBusy] = useState(false)

  // ---- 렌더 ----
  const redrawAll = useCallback(() => {
    const ctx = ctxRef.current; if (!ctx) return
    const { w: W, h: H } = sizeRef.current
    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H)
    for (const s of committedRef.current) paintStroke(ctx, s, W, H)
    for (const s of liveRef.current.values()) paintStroke(ctx, s, W, H)
    if (drawing.current) paintStroke(ctx, drawing.current, W, H)  // 내 진행 중 획(전체 리드로우 시)
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
    setCanvasW(rect.width)
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
      if (!s) { s = { id: pl.id, c: pl.c, w: pl.w, b: pl.b, p: [] }; liveRef.current.set(pl.id, s) }
      const from = s.p.length
      if (pl.p && pl.p.length) {
        for (const q of pl.p) s.p.push(q)
        if (ctx) { if (SMOOTH.has(s.b)) redrawAll(); else paintStroke(ctx, s, W, H, from) }
      }
      if (pl.end) { liveRef.current.delete(pl.id); addCommitted({ id: s.id, author: pl.uid, c: s.c, w: s.w, b: s.b, p: s.p }) }
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
      const st = ch.presenceState()
      const list = Object.values(st).map((arr) => arr[0]).filter(Boolean)
      setMembers(list.map((m) => ({ uid: m.uid, name: m.name, avatar: m.avatar })))
    })

    ch.subscribe(async (status) => {
      if (status !== 'SUBSCRIBED') return
      // 아이디(login_id)는 절대 브로드캐스트하지 않음 — 그룹 표시명/아바타만 track
      let meta = { uid, name: '', avatar: null }
      try {
        const m = await getMyGroupMember(groupId, uid)
        if (m) meta = { uid, name: m.display_nickname || '', avatar: m.avatar_url || null }
      } catch { /* noop */ }
      try { await ch.track(meta) } catch { /* noop */ }
      try {
        const rows = await listDrawingStrokes(groupId)
        for (const r of rows) addCommitted({ id: r.id, author: r.author, c: r.stroke.c, w: r.stroke.w, b: r.stroke.b, p: r.stroke.p })
        redrawAll()
      } catch { /* noop */ }
    })

    return () => { supabase.removeChannel(ch); chanRef.current = null }
  }, [groupId, uid, addCommitted, redrawAll])

  // ---- 전송 버퍼 flush ----
  const flush = useCallback((end) => {
    const cur = drawing.current
    if (!cur) return
    const pts = bufRef.current; bufRef.current = []
    if (!pts.length && !end) return
    chanRef.current?.send({ type: 'broadcast', event: 'seg', payload: { id: cur.id, uid, c: cur.c, w: cur.w, b: cur.b, p: pts, end: !!end } })
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
    const cur = { id: (crypto.randomUUID?.() || `${uid}-${Date.now()}-${Math.random()}`), c: colorRef.current, w: widthRef.current, b: brushRef.current, p: [p0] }
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
    const smooth = SMOOTH.has(cur.b)
    let added = false
    for (const ev of (events.length ? events : [e])) {
      const p = pos(ev)
      const last = cur.p[cur.p.length - 1]
      if (last && last[0] === p[0] && last[1] === p[1]) continue
      const from = cur.p.length
      cur.p.push(p); bufRef.current.push(p); added = true
      if (ctx && !smooth) paintStroke(ctx, cur, W, H, from)  // 펜/점선: 증분
    }
    if (added && smooth) redrawAll()  // 형광펜/네온/크레용: 한 획으로 전체 리드로우(끊김 방지)
    if (!rafRef.current) rafRef.current = requestAnimationFrame(() => { rafRef.current = 0; flush(false) })
  }
  async function onUp() {
    const cur = drawing.current; if (!cur) return
    drawing.current = null
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0 }
    flush(true)
    addCommitted({ id: cur.id, author: uid, c: cur.c, w: cur.w, b: cur.b, p: cur.p })
    try { await addDrawingStroke(groupId, cur.id, uid, { c: cur.c, w: cur.w, b: cur.b, p: cur.p }) } catch { /* noop */ }
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

  // ---- 이미지로 저장 (서버 X, 내 기기 갤러리/사진에 저장) ----
  const saveImage = useCallback(async () => {
    const cv = canvasRef.current; if (!cv) return
    let blob = null
    try { blob = await new Promise((res) => cv.toBlob(res, 'image/png')) } catch { blob = null }
    if (!blob) return
    const t = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    const name = `nolging-낙서-${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}-${pad(t.getHours())}${pad(t.getMinutes())}.png`
    const file = new File([blob], name, { type: 'image/png' })
    // 모바일: 공유 시트로 "이미지 저장"(사진/갤러리) 지원 → 실패/미지원 시 다운로드 폴백
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return } catch (e) { if (e?.name === 'AbortError') return }
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = name
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1500)
  }, [])

  // 상단바 우측 저장 버튼에 핸들러 등록
  useEffect(() => {
    setHeaderSave?.(() => saveImage)
    return () => setHeaderSave?.(null)
  }, [setHeaderSave, saveImage])

  return (
    <div className="page draw-page">
      <div className="draw-wrap" ref={wrapRef}>
        <canvas ref={canvasRef} className="draw-canvas"
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
        <div className="draw-spring" aria-hidden="true">
          {Array.from({ length: 16 }).map((_, i) => <span key={i} className="draw-coil" />)}
        </div>
        <div className="draw-members">
          {(members.length ? members : [{ uid: 'me', name: '', avatar: null }]).slice(0, 5).map((m) => (
            <Avatar key={m.uid} src={m.avatar} name={m.name} size={30} />
          ))}
          {members.length > 5 && <span className="draw-more">+{members.length - 5}</span>}
        </div>
      </div>

      <div className="draw-tools">
        <div className="draw-colors">
          {COLORS.map((c) => (
            <button key={c} type="button" aria-label={`색상 ${c}`}
              className={`draw-sw ${color === c ? 'on' : ''} ${c === '#ffffff' ? 'is-white' : ''}`}
              style={{ background: c }} onClick={() => setColor(c)} />
          ))}
        </div>
        <div className="draw-brushes">
          {BRUSHES.map((b) => (
            <button key={b.id} type="button" aria-label={`브러쉬 ${b.label}`}
              className={`draw-bbtn ${brush === b.id ? 'on' : ''}`} onClick={() => setBrush(b.id)}>
              <span className={`draw-bprev bp-${b.id}`}
                style={{ color: color === '#ffffff' ? '#c9c6d6' : color }} />
            </button>
          ))}
        </div>
        <div className="draw-row">
          <div className="draw-widths">
            {WIDTHS.map((w) => {
              const d = Math.max(4, Math.round(w * (canvasW || 340)))
              return (
                <button key={w} type="button" aria-label={`굵기 ${w}`}
                  className={`draw-wbtn ${width === w ? 'on' : ''}`} onClick={() => setWidth(w)}>
                  <span style={{ width: d, height: d, background: color === '#ffffff' ? '#c9c6d6' : color }} />
                </button>
              )
            })}
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
