import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { buildEdges, piecePath } from '../lib/jigsaw'
import { uploadPuzzleImage } from '../lib/storage'
import { getGroupPuzzle, saveGroupPuzzle, updatePuzzlePositions, deleteGroupPuzzle } from '../lib/api'

const GRIDS = [{ n: 3, label: '쉬움 · 9' }, { n: 4, label: '보통 · 16' }, { n: 5, label: '어려움 · 25' }, { n: 6, label: '고수 · 36' }]

// 모든 좌표는 놀이영역 너비(playW) 기준 정규화(등방). 두 기기가 동일 배치.
function layout(cols, rows, aspect) {
  const bwN = 0.9, boardXN = 0.05, boardYN = 0.02
  const wN = bwN / cols
  const boardHN = bwN / (aspect || 1)
  const hN = boardHN / rows
  const tbN = Math.min(wN, hN) * 0.18
  const offN = tbN + 0.004
  const playHN = boardYN + boardHN + 0.06 + 0.6
  const homeN = (pr, pc) => ({ x: boardXN + pc * wN - offN, y: boardYN + pr * hN - offN })
  return { bwN, boardXN, boardYN, wN, hN, boardHN, tbN, offN, playHN, homeN }
}
function mul(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
// 시드 기반 흩뿌리기(정규화). 두 기기 동일.
function scatter(seed, cols, rows, L) {
  const rand = mul((seed >>> 0) + 12345)
  const out = {}
  const y0 = L.boardYN + L.boardHN + 0.06
  const wtot = L.wN + 2 * L.offN, htot = L.hN + 2 * L.offN
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    out[`${r}-${c}`] = { x: rand() * Math.max(0.02, 1 - wtot), y: y0 + rand() * Math.max(0.02, L.playHN - htot - y0), placed: false }
  }
  return out
}
function initialPositions(seed, cols, rows, L, stored) {
  const base = scatter(seed, cols, rows, L)
  if (stored) for (const k of Object.keys(base)) if (stored[k]) base[k] = stored[k]
  return base
}

export default function Puzzle() {
  const { groupId } = useParams()
  const { profile } = useAuth()
  const uid = profile?.id

  const wrapRef = useRef(null)
  const chanRef = useRef(null)
  const [playW, setPlayW] = useState(0)
  const [puzzle, setPuzzle] = useState(null)     // {image, cols, rows, seed}
  const [pos, setPos] = useState({})              // id -> {x,y,placed} 정규화
  const posRef = useRef(pos); posRef.current = pos
  const [aspect, setAspect] = useState(0)         // 이미지 가로/세로
  const [peerCount, setPeerCount] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 셋업
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState('')
  const [grid, setGrid] = useState(4)
  const [busy, setBusy] = useState(false)

  const drag = useRef(null)
  const saveT = useRef(0)
  const moveRaf = useRef(0)
  const movePend = useRef(null)
  const [activeId, setActiveId] = useState(null)

  // ---- 놀이영역 너비 측정 ----
  useEffect(() => {
    const el = wrapRef.current; if (!el) return
    const ro = new ResizeObserver(() => setPlayW(el.clientWidth))
    ro.observe(el); setPlayW(el.clientWidth)
    return () => ro.disconnect()
  }, [puzzle])

  const edges = useMemo(() => puzzle ? buildEdges(puzzle.cols, puzzle.rows, puzzle.seed) : null, [puzzle])
  const L = useMemo(() => puzzle && aspect ? layout(puzzle.cols, puzzle.rows, aspect) : null, [puzzle, aspect])

  // ---- 실시간 채널 + 저장분 로드 ----
  useEffect(() => {
    if (!groupId || !uid) return
    let alive = true
    getGroupPuzzle(groupId).then((row) => {
      if (!alive) return
      if (row) { setPuzzle({ image: row.image, cols: row.cols, rows: row.rows, seed: row.seed }); setPos(row.positions || {}) }
    }).catch((e) => setError(e.message)).finally(() => alive && setLoading(false))

    const ch = supabase.channel(`puzzle:${groupId}`, { config: { broadcast: { self: false }, presence: { key: uid } } })
    chanRef.current = ch
    ch.on('broadcast', { event: 'start' }, ({ payload }) => {
      setPuzzle({ image: payload.image, cols: payload.cols, rows: payload.rows, seed: payload.seed })
      setPos(payload.positions || {})
    })
    ch.on('broadcast', { event: 'move' }, ({ payload }) => {
      setPos((p) => (p[payload.id]?.placed ? p : { ...p, [payload.id]: { x: payload.x, y: payload.y, placed: false } }))
    })
    ch.on('broadcast', { event: 'place' }, ({ payload }) => {
      setPos((p) => ({ ...p, [payload.id]: { x: payload.x, y: payload.y, placed: true } }))
    })
    ch.on('broadcast', { event: 'reset' }, () => { setPuzzle(null); setPos({}); setAspect(0) })
    ch.on('presence', { event: 'sync' }, () => setPeerCount(Math.max(1, Object.keys(ch.presenceState()).length)))
    ch.subscribe(async (s) => { if (s === 'SUBSCRIBED') { try { await ch.track({ uid }) } catch { /* noop */ } } })
    return () => { alive = false; supabase.removeChannel(ch); chanRef.current = null }
  }, [groupId, uid])

  function persistSoon() {
    clearTimeout(saveT.current)
    saveT.current = setTimeout(() => { updatePuzzlePositions(groupId, posRef.current).catch(() => {}) }, 700)
  }

  // ---- 시작(이미지 업로드 + 조각화) ----
  async function start() {
    if (!file || busy) return
    setBusy(true); setError('')
    try {
      const blob = await resizeToJpeg(file, 1100)
      const url = await uploadPuzzleImage(blob.blob, uid)
      const asp = blob.w / blob.h
      const seed = Math.floor(Math.random() * 1e9)
      const cols = grid, rows = grid
      const Lx = layout(cols, rows, asp)
      const positions = scatter(seed, cols, rows, Lx)
      const pz = { image: url, cols, rows, seed }
      await saveGroupPuzzle(groupId, { ...pz, positions })
      setAspect(asp); setPuzzle(pz); setPos(positions)
      chanRef.current?.send({ type: 'broadcast', event: 'start', payload: { ...pz, positions } })
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  async function resetPuzzle() {
    if (!confirm('퍼즐을 지우고 새로 시작할까요?')) return
    try { await deleteGroupPuzzle(groupId) } catch { /* noop */ }
    setPuzzle(null); setPos({}); setAspect(0); setFile(null); setPreview('')
    chanRef.current?.send({ type: 'broadcast', event: 'reset' })
  }

  // ---- 드래그 ----
  function onPointerDown(e, id) {
    if (pos[id]?.placed) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const rect = wrapRef.current.getBoundingClientRect()
    const px = pos[id].x * playW, py = pos[id].y * playW
    drag.current = { id, dx: e.clientX - (rect.left + px), dy: e.clientY - (rect.top + py) }
    setActiveId(id)
  }
  function onPointerMove(e) {
    const d = drag.current; if (!d) return
    const rect = wrapRef.current.getBoundingClientRect()
    const nx = (e.clientX - rect.left - d.dx) / playW
    const ny = (e.clientY - rect.top - d.dy) / playW
    setPos((p) => ({ ...p, [d.id]: { x: nx, y: ny, placed: false } }))
    movePend.current = { id: d.id, x: nx, y: ny }
    if (!moveRaf.current) moveRaf.current = requestAnimationFrame(() => {
      moveRaf.current = 0
      const m = movePend.current
      if (m) chanRef.current?.send({ type: 'broadcast', event: 'move', payload: m })
    })
  }
  function onPointerUp() {
    const d = drag.current; drag.current = null; setActiveId(null)
    if (!d || !L) return
    const cur = posRef.current[d.id]; if (!cur) return
    const [pr, pc] = d.id.split('-').map(Number)
    const home = L.homeN(pr, pc)
    const snap = (L.wN) * 0.35
    if (Math.hypot(cur.x - home.x, cur.y - home.y) < snap) {
      const placed = { x: home.x, y: home.y, placed: true }
      setPos((p) => ({ ...p, [d.id]: placed }))
      chanRef.current?.send({ type: 'broadcast', event: 'place', payload: { id: d.id, x: home.x, y: home.y } })
    }
    persistSoon()
  }

  // ---- 조각 목록 & 완성 ----
  const pieces = useMemo(() => {
    if (!puzzle || !edges || !L || !playW) return []
    const W = playW, wpx = L.wN * W, hpx = L.hN * W, tbpx = L.tbN * W
    const arr = []
    for (let r = 0; r < puzzle.rows; r++) for (let c = 0; c < puzzle.cols; c++) {
      const id = `${r}-${c}`
      const pp = piecePath(r, c, puzzle.cols, puzzle.rows, wpx, hpx, tbpx, edges)
      arr.push({ id, r, c, pp })
    }
    return arr
  }, [puzzle, edges, L, playW])

  const total = puzzle ? puzzle.cols * puzzle.rows : 0
  const placedN = Object.values(pos).filter((p) => p?.placed).length
  const done = total > 0 && placedN === total

  // ---- 셋업 화면 ----
  if (!puzzle) {
    return (
      <div className="page pz-setup">
        <div className="pz-peers"><span className="draw-dot" style={{ background: '#7363e8', boxShadow: '0 0 0 3px #eeebfe' }} />{peerCount > 1 ? `${peerCount}명 접속 중` : '상대가 들어오면 같이 맞춰요'}</div>
        {error && <div className="alert alert-error">{error}</div>}
        <label className="pz-drop">
          {preview ? <img src={preview} alt="" className="pz-drop-img" /> : (
            <span className="pz-drop-in">
              <svg width="34" viewBox="0 0 24 24" fill="none" stroke="#7363e8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.6" /><path d="M21 15l-5-5L5 21" /></svg>
              <span className="pz-drop-t">사진을 올려 퍼즐로 만들기</span>
            </span>
          )}
          <input type="file" accept="image/*" hidden onChange={(e) => {
            const f = e.target.files?.[0]; if (!f) return
            setFile(f); setPreview(URL.createObjectURL(f))
          }} />
        </label>

        <div className="pz-grid-pick">
          <div className="pz-grid-label">조각 수</div>
          <div className="pz-grid-opts">
            {GRIDS.map((g) => (
              <button key={g.n} type="button" className={`pz-grid-btn ${grid === g.n ? 'on' : ''}`} onClick={() => setGrid(g.n)}>{g.label}</button>
            ))}
          </div>
        </div>

        <button type="button" className="pz-start" disabled={!file || busy} onClick={start}>{busy ? '만드는 중…' : '퍼즐 시작'}</button>
      </div>
    )
  }

  // ---- 플레이 화면 ----
  return (
    <div className="page pz-page">
      <div className="pz-bar">
        <span className="pz-peers"><span className="draw-dot" style={{ background: '#7363e8', boxShadow: '0 0 0 3px #eeebfe' }} />{peerCount > 1 ? `${peerCount}명이 함께` : '혼자 맞추는 중'}</span>
        <span className="pz-count">{placedN} / {total}</span>
        <button type="button" className="pz-reset" onClick={resetPuzzle} aria-label="새 퍼즐" title="새 퍼즐">
          <svg width="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36" /><polyline points="21 3 21 9 15 9" /></svg>
        </button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="pz-wrap" ref={wrapRef} style={{ height: L && playW ? L.playHN * playW : undefined }}
        onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        {/* 숨은 이미지: 종횡비 측정 */}
        {!aspect && <img src={puzzle.image} alt="" style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} onLoad={(e) => setAspect(e.target.naturalWidth / e.target.naturalHeight)} />}
        {L && playW > 0 && (
          <>
            {/* 완성 보드 실루엣 */}
            <div className="pz-board" style={{ left: L.boardXN * playW, top: L.boardYN * playW, width: L.bwN * playW, height: L.boardHN * playW }} />
            {pieces.map((pc) => {
              const p = pos[pc.id]; if (!p) return null
              const { d, off, sw, sh } = pc.pp
              const z = p.placed ? 1 : (activeId === pc.id ? 50 : 10)
              return (
                <svg key={pc.id} className={`pz-piece ${p.placed ? 'placed' : ''}`} width={sw} height={sh}
                  style={{ left: p.x * playW, top: p.y * playW, zIndex: z }}
                  onPointerDown={(e) => onPointerDown(e, pc.id)}>
                  <defs><clipPath id={`clip-${groupId}-${pc.id}`}><path d={d} /></clipPath></defs>
                  <image href={puzzle.image} x={off - pc.c * L.wN * playW} y={off - pc.r * L.hN * playW}
                    width={puzzle.cols * L.wN * playW} height={puzzle.rows * L.hN * playW} clipPath={`url(#clip-${groupId}-${pc.id})`}
                    preserveAspectRatio="none" />
                  <path d={d} fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="1" />
                </svg>
              )
            })}
          </>
        )}
        {done && (
          <div className="pz-done">
            <div className="pz-done-card">🎉<div className="pz-done-t">완성했어요!</div>
              <button type="button" className="pz-start pz-done-btn" onClick={resetPuzzle}>새 퍼즐 만들기</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// 파일 → 최대변 max 로 축소한 jpeg blob + 크기
function resizeToJpeg(file, max) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      let { width: w, height: h } = img
      if (Math.max(w, h) > max) { const s = max / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s) }
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h
      cv.getContext('2d').drawImage(img, 0, 0, w, h)
      cv.toBlob((b) => b ? resolve({ blob: b, w, h }) : reject(new Error('이미지 처리 실패')), 'image/jpeg', 0.86)
    }
    img.onerror = () => reject(new Error('이미지를 읽을 수 없어요'))
    img.src = URL.createObjectURL(file)
  })
}
