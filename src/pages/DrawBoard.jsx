import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useOutletContext } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { listDrawingStrokes, addDrawingStroke, deleteDrawingStroke, clearGroupDrawing, getMyGroupMember, listBlockedFeatures } from '../lib/api'
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
// 차단 상태의 새로고침 버튼 연타 방지 최소 간격(DB 부하/전송량 보호)
const REFRESH_COOLDOWN_MS = 3000
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
  // 오프스크린 캐시: "지금 내가 그리는 획"을 뺀 배경(커밋된 획 + 다른 사람의 진행 중인 획)만
  // 미리 그려 둔 스냅샷. 형광펜/네온처럼 매 프레임 전체를 다시 그려야 하는 브러쉬가, 매번
  // 다른 모든 획을 replay하는 대신 이 스냅샷을 그대로 복사(drawImage)해 붙이고 지금 획만
  // 얹으면 되므로 획이 많이 쌓인 낙서장에서도 빠르게 반응한다.
  const bgCanvasRef = useRef(null)

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
  const membersRef = useRef([])               // 브로드캐스트 여부 판단용(나 혼자면 1) — state 는 비동기라 ref 로 즉시 참조
  const [busy, setBusy] = useState(false)
  const [isMember, setIsMember] = useState(false) // 이 그룹의 멤버인지(확정 전엔 false → 미가입이 잠깐도 낙서/track 되지 않게). 관전만.
  const isMemberRef = useRef(isMember); isMemberRef.current = isMember
  const [drawBlocked, setDrawBlocked] = useState(false) // 관리자가 그룹별 사용량 제어로 낙서장 실시간 반영을 차단했는지
  const [refreshBusy, setRefreshBusy] = useState(false)  // 새로고침 버튼 연타 방지(중복 요청/DB 부하 방지)
  const refreshBusyRef = useRef(false)

  // ---- 렌더 ----
  // 배경(커밋된 획 + 다른 사람의 진행 중인 획)을 캔버스에 그리고, 그 상태 그대로 오프스크린
  // 캐시(bgCanvasRef)에도 픽셀 그대로 복사해 둔다 — 실제 캔버스 해상도(dpr 반영된 backing
  // store) 기준 1:1 복사라 transform 을 잠깐 단위행렬로 돌려놓고 그린다.
  const syncBgCache = useCallback(() => {
    const cv = canvasRef.current; if (!cv) return
    let bg = bgCanvasRef.current
    if (!bg) { bg = document.createElement('canvas'); bgCanvasRef.current = bg }
    if (bg.width !== cv.width || bg.height !== cv.height) { bg.width = cv.width; bg.height = cv.height }
    bg.getContext('2d').drawImage(cv, 0, 0)
  }, [])
  const redrawAll = useCallback(() => {
    const ctx = ctxRef.current; if (!ctx) return
    const { w: W, h: H } = sizeRef.current
    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H)
    for (const s of committedRef.current) paintStroke(ctx, s, W, H)
    for (const s of liveRef.current.values()) paintStroke(ctx, s, W, H)
    syncBgCache()  // 지금까지(=내 진행 중 획 제외)를 캐시로 저장
    if (drawing.current) paintStroke(ctx, drawing.current, W, H)  // 내 진행 중 획(전체 리드로우 시)
  }, [syncBgCache])
  // 형광펜/네온처럼 한 획을 통째로 다시 그려야 하는 브러쉬용 — redrawAll 처럼 커밋된 획을
  // 전부 replay하지 않고, 마지막으로 캐시해 둔 배경 위에 지금 획만 다시 그린다.
  const restoreBgAndDrawCurrent = useCallback(() => {
    const ctx = ctxRef.current; const bg = bgCanvasRef.current
    if (!ctx) return
    const { w: W, h: H } = sizeRef.current
    if (bg) {
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)  // bg 는 이미 backing store 해상도라 dpr 배율 없이 그대로 복사
      ctx.drawImage(bg, 0, 0)
      ctx.restore()
    } else {
      ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H)
    }
    if (drawing.current) paintStroke(ctx, drawing.current, W, H)
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
    const newW = Math.round(rect.width * dpr), newH = Math.round(rect.height * dpr)
    sizeRef.current = { w: rect.width, h: rect.height }
    // cv.width/height 는 "같은 값"을 다시 대입해도 캔버스 내용을 통째로 지워 버리는 브라우저
    // 스펙(백킹 스토어 리셋)이라, 실제로 크기가 안 바뀌었으면 아예 건드리지 않는다 — ResizeObserver
    // 는 최종 크기가 그대로여도(레이아웃 미세 흔들림 등으로) 콜백이 다시 불릴 수 있는데, 예전
    // 코드는 이때도 매번 캔버스를 지우고 redrawAll() 로 다시 그렸다(로그에도 안 남는 조용한 지움).
    if (newW === cv.width && newH === cv.height) { setCanvasW(rect.width); return }
    cv.width = newW; cv.height = newH
    const ctx = cv.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctxRef.current = ctx
    setCanvasW(rect.width)
    redrawAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redrawAll])

  useEffect(() => {
    resize()
    const ro = new ResizeObserver(resize)
    if (canvasRef.current) ro.observe(canvasRef.current)
    return () => ro.disconnect()
  }, [resize])

  // GraffitiPad.jsx(푸린 마이크 낙서)에서 이미 겪었던 문제: React 는 성능을 위해
  // touchstart/touchmove 리스너를 passive 로 등록해서, JSX onPointerDown/onPointerMove
  // 안에서 e.preventDefault() 를 불러도 실제 터치 기본 동작(스크롤/텍스트 선택 loupe 등
  // 제스처 판별)이 안 막히는 경우가 있다(특히 iPadOS Safari + Apple Pencil) — 낙서장엔
  // 이 우회 코드가 빠져 있었다. CSS touch-action:none 만으로는 브라우저가 여전히 제스처
  // 판별에 나설 수 있고, 그 판별 과정에서 아주 짧고 빠른 펜 터치가 페이지로 아예 전달이
  // 안 되는 것으로 보인다(실제로 이 우회 코드 추가 후 애플펜슬 획 씹힘이 해결됨) — 캔버스에
  // 직접 passive:false 로 touchstart/touchmove 를 걸어 확실히 막는다.
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const stop = (e) => e.preventDefault()
    cv.addEventListener('touchstart', stop, { passive: false })
    cv.addEventListener('touchmove', stop, { passive: false })
    return () => {
      cv.removeEventListener('touchstart', stop)
      cv.removeEventListener('touchmove', stop)
    }
  }, [])

  // 저장된 획을 불러와 반영(최초 진입 + 차단 상태에서의 수동 새로고침 공용)
  const loadStrokes = useCallback(async () => {
    try {
      const rows = await listDrawingStrokes(groupId)
      for (const r of rows) addCommitted({ id: r.id, author: r.author, c: r.stroke.c, w: r.stroke.w, b: r.stroke.b, p: r.stroke.p })
      redrawAll()
    } catch { /* noop */ }
  }, [groupId, addCommitted, redrawAll])

  // 새로고침 버튼: 전체 획을 다시 select 해오는 요청이라 연타 시 DB 전송량/부하가 늘 수 있음 →
  // 요청 중엔 버튼을 잠그고, 끝난 뒤에도 쿨다운 동안 계속 잠가 둔다(연타 방지 신뢰도를 위해
  // "요청 완료 즉시 재활성화"가 아니라 버튼 비활성 상태 = 클릭 가능 여부를 그대로 보여준다).
  const handleRefresh = useCallback(() => {
    if (refreshBusyRef.current) return
    refreshBusyRef.current = true
    setRefreshBusy(true)
    loadStrokes().finally(() => {
      setTimeout(() => { refreshBusyRef.current = false; setRefreshBusy(false) }, REFRESH_COOLDOWN_MS)
    })
  }, [loadStrokes])

  // ---- 실시간 채널 + 저장분 로드 ----
  // 관리자가 그룹별 사용량 제어로 낙서장을 차단했으면 실시간 채널 자체를 만들지 않는다
  // (그림은 로컬에서 그리고 그대로 저장은 되지만, 다른 접속자의 낙서가 실시간으로는 안 보임 —
  // 새로고침/재진입 시 listDrawingStrokes 로 다시 불러오면 보인다). Realtime Messages 사용량도 0.
  useEffect(() => {
    if (!groupId || !uid) return
    let alive = true
    let ch = null

    ;(async () => {
      let blocked = false
      try { blocked = (await listBlockedFeatures(groupId)).includes('draw') } catch { /* noop */ }
      if (!alive) return
      setDrawBlocked(blocked)

      // 아이디(login_id)는 절대 브로드캐스트하지 않음 — 그룹 표시명/아바타만 track
      let meta = { uid, name: '', avatar: null }, mem = false
      try {
        const m = await getMyGroupMember(groupId, uid)
        if (m) { meta = { uid, name: m.display_nickname || '', avatar: m.avatar_url || null }; mem = true }
      } catch { /* noop */ }
      if (!alive) return
      setIsMember(mem); isMemberRef.current = mem

      await loadStrokes()
      if (!alive || blocked) return   // 차단 시 여기서 종료 — 채널 연결 없음

      ch = supabase.channel(`draw:${groupId}`, {
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
        membersRef.current = list
        setMembers(list.map((m) => ({ uid: m.uid, name: m.name, avatar: m.avatar })))
      })

      ch.subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return
        // 미가입(관리자 미리보기)이면 track 하지 않아 다른 멤버의 접속표시에 뜨지 않는다.
        if (mem) { try { await ch.track(meta) } catch { /* noop */ } }
      })
    })()

    return () => { alive = false; if (ch) { supabase.removeChannel(ch); chanRef.current = null } }
  }, [groupId, uid, loadStrokes])

  // ---- 전송 버퍼 flush ----
  const flush = useCallback((end) => {
    const cur = drawing.current
    if (!cur) return
    const pts = bufRef.current; bufRef.current = []
    if (!pts.length && !end) return
    if (membersRef.current.length <= 1) return   // 혼자면 브로드캐스트 생략(저장은 onUp 에서 별도로 함)
    chanRef.current?.send({ type: 'broadcast', event: 'seg', payload: { id: cur.id, uid, c: cur.c, w: cur.w, b: cur.b, p: pts, end: !!end } })
  }, [uid])

  // ---- 포인터 입력 ----
  // rect 를 매번 다시 재지 않고 밖에서 한 번만 재서 넘기게(포인트마다 getBoundingClientRect
  // 를 부르면 빠르게 그을 때(포인트가 뭉쳐 옴) 그만큼 반복 호출돼 반응이 느려진다).
  function posAt(e, rect) {
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
    return [Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4]
  }
  function onDown(e) {
    if (!isMemberRef.current) return   // 미가입(관리자 미리보기)은 관전만 — 낙서 불가
    if (e.button != null && e.button !== 0 && e.pointerType === 'mouse') return
    // 이미 획을 긋는 중이면(어떤 포인터든) 먼저 정상적으로 마무리(커밋+배경 캐시 반영+저장)
    // 해 두고 새 포인터로 넘어간다 — 낙서장은 애초에 손바닥 오탐(pointerType 구분)을 굳이
    // 따지지 않는 편이 더 안전했다(같은 방식으로 만든 GraffitiPad.jsx 는 포인터 종류를
    // 아예 구분하지 않는데도 잘 동작한다). 여러 겹치는 분기를 두는 대신 하나로 단순화했다.
    if (drawing.current) finishStroke(drawing.current)
    e.preventDefault()  // 드래그로 그릴 때 텍스트 블럭 선택 방지
    // setPointerCapture 는 그 시점에 이미 비활성화된 pointerId 를 넘기면(좁은 범위에 여러
    // 획을 빠르게 연달아 찍을 때, 펜슬의 pointerId 가 자주 재사용되면서 종종 생김)
    // InvalidPointerId 예외를 던진다. try 로 안 감싸면 이 예외가 그대로 튀어 올라가 onDown
    // 이 여기서 중단돼 획 자체(drawing.current 설정·점 그리기)가 통째로 시작을 못 해
    // "획이 씹힌" 것처럼 보인다(DecoAdjuster.jsx 의 동일 호출도 같은 이유로 try 로 감싸져 있음).
    try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch { /* 비활성화된 pointerId 재사용 */ }
    const p0 = posAt(e, canvasRef.current.getBoundingClientRect())
    const cur = { id: (crypto.randomUUID?.() || `${uid}-${Date.now()}-${Math.random()}`), pointerId: e.pointerId, c: colorRef.current, w: widthRef.current, b: brushRef.current, p: [p0] }
    drawing.current = cur
    bufRef.current = [p0]
    const ctx = ctxRef.current; const { w: W, h: H } = sizeRef.current
    if (ctx) paintStroke(ctx, cur, W, H)  // 점(dot)
    flush(false)
  }
  function onMove(e) {
    const cur = drawing.current; if (!cur) return
    // e 는 React SyntheticEvent 라 getCoalescedEvents 가 없음(화이트리스트에 없는 네이티브 전용 메서드) →
    // nativeEvent 에서 꺼내야 애플펜슬처럼 빠르게 움직일 때 뭉쳐서 오는 세부 좌표들을 놓치지 않는다.
    const ne = e.nativeEvent
    const events = ne?.getCoalescedEvents ? ne.getCoalescedEvents() : [e]
    const rect = canvasRef.current.getBoundingClientRect()  // 이 프레임의 뭉친 좌표들에 한 번만
    for (const ev of (events.length ? events : [e])) {
      const p = posAt(ev, rect)
      const last = cur.p[cur.p.length - 1]
      if (last && last[0] === p[0] && last[1] === p[1]) continue
      cur.p.push(p); bufRef.current.push(p)
    }
    // 예전엔 펜/점선만 새로 들어온 점만 증분으로 그렸는데(형광펜/네온만 매번 전체 재생),
    // 디버그로 확인해 보니 이 증분 방식에서 좁은 범위에 연달아 그을 때 일부 구간이 화면에
    // 반영이 안 되는 경우가 있었다(입력 데이터 자체는 온전한데도) — 브러쉬 종류와 무관하게
    // 항상 배경 캐시 위에 지금 획을 통째로 다시 그리는 방식으로 통일했다. 다만 이것도(네온
    // 브러쉬는 원래부터 이 방식이었는데도) 여전히 씹히는 게 확인돼, 매 pointermove(애플펜슬은
    // 이벤트가 매우 잦고 getCoalescedEvents 로 뭉쳐 옴)마다 동기적으로 전체 캔버스 크기의
    // drawImage+stroke 를 반복 호출하던 걸 화면 갱신 주기(rAF)당 한 번으로 묶는다 — 점 데이터
    // 자체는 이 아래에서 계속 빠짐없이 누적하고, 실제 무거운 다시 그리기만 프레임당 1회로 제한.
    if (!rafRef.current) rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      if (drawing.current) restoreBgAndDrawCurrent()
      flush(false)
    })
  }
  // 획 하나를 마무리(전체 다시 그리기 + 커밋 + 배경 캐시 반영 + 저장) — 정상적인 pointerup
  // 뿐 아니라, 빠르게 이어 쓸 때 이전 획의 pointerup 을 못 받고 다음 pointerdown 이 먼저
  // 오는 경우(onDown 의 자가복구 분기)에도 똑같이 거쳐야 한다.
  async function finishStroke(cur) {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0 }
    // 디버그 로그로 확인해 보니, pointerdown~up 이벤트와 점 데이터(cur.p)는 전부 정상인데도
    // 좁은 범위에 연달아 그을 때 화면엔 일부 구간이 안 그려진 채로 남는 경우가 있었다 —
    // onMove 의 증분(부분) stroke() 호출 중 일부가 어떤 이유로든(캔버스 합성 관련 기기별
    // 차이로 추정) 화면에 반영이 안 된 것으로 보인다. 데이터 자체는 온전하니, 획을 마무리할
    // 때 fromIdx 없이 전체를 한 번 더 그려서 빠진 구간이 있어도 확실히 채워지게 한다.
    const ctx = ctxRef.current
    if (ctx) { const { w: W, h: H } = sizeRef.current; paintStroke(ctx, cur, W, H) }
    addCommitted({ id: cur.id, author: uid, c: cur.c, w: cur.w, b: cur.b, p: cur.p })
    syncBgCache()
    try { await addDrawingStroke(groupId, cur.id, uid, { c: cur.c, w: cur.w, b: cur.b, p: cur.p }) }
    catch { /* noop */ }
  }
  async function onUp() {
    const cur = drawing.current; if (!cur) return
    drawing.current = null
    flush(true)
    await finishStroke(cur)
  }

  // ---- 되돌리기 / 지우기 ----
  async function undo() {
    if (busy) return
    const list = committedRef.current
    let idx = -1
    for (let i = list.length - 1; i >= 0; i--) { if (list[i].author === uid) { idx = i; break } }
    if (idx < 0) return
    const [s] = list.splice(idx, 1); idsRef.current.delete(s.id); redrawAll()
    if (membersRef.current.length > 1) chanRef.current?.send({ type: 'broadcast', event: 'remove', payload: { id: s.id } })
    try { await deleteDrawingStroke(s.id) } catch { /* noop */ }
  }
  async function clearAll() {
    if (busy) return
    if (!confirm('모두의 그림을 지울까요? 되돌릴 수 없어요.')) return
    setBusy(true)
    committedRef.current = []; idsRef.current = new Set(); liveRef.current.clear(); redrawAll()
    if (membersRef.current.length > 1) chanRef.current?.send({ type: 'broadcast', event: 'clear' })
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
        {drawBlocked ? (
          <div className="draw-blocked-row">
            <span className="draw-blocked-text">사용량 제어로 실시간 낙서 반영이 차단됐어요.<br />새로고침 시 상대방의 낙서를 확인할 수 있어요.</span>
            <button type="button" className="draw-refresh-btn" onClick={handleRefresh} disabled={refreshBusy} aria-label="새로고침">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                <polyline points="21 3 21 9 15 9" />
              </svg>
            </button>
          </div>
        ) : (
          <div className="draw-members">
            {/* 접속자가 없을 때의 "나" 자리표시 아바타는 실제 멤버에게만 — 미가입 관리자는
                접속 중인 사람이 없으면 아바타 자체를 표시하지 않는다(관전자는 자리에 없다). */}
            {(members.length ? members : (isMember ? [{ uid: 'me', name: '', avatar: null }] : [])).slice(0, 5).map((m) => (
              <Avatar key={m.uid} src={m.avatar} name={m.name} size={30} />
            ))}
            {members.length > 5 && <span className="draw-more">+{members.length - 5}</span>}
          </div>
        )}
      </div>

      {isMember ? (
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
      ) : (
        <div className="draw-viewonly">관전 중이에요 · 낙서는 멤버만 할 수 있어요</div>
      )}
    </div>
  )
}
