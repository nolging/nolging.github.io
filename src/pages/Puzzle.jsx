import { useEffect, useRef, useState, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { buildEdges, piecePath } from '../lib/jigsaw'
import { uploadPuzzleImage, deletePuzzleImageByUrl } from '../lib/storage'
import { getGroupPuzzle, saveGroupPuzzle, updatePuzzlePositions, deleteGroupPuzzle } from '../lib/api'

const GRIDS = [{ n: 3, l: '9' }, { n: 4, l: '16' }, { n: 5, l: '25' }, { n: 6, l: '36' }, { n: 7, l: '49' }, { n: 8, l: '64' }]

// 좌표는 놀이영역 너비 기준 정규화(등방). 두 기기 동일 배치. 보드 없이 조각끼리 연결.
function layout(cols, rows, aspect) {
  const picW = 0.9, wN = picW / cols
  const picH = picW / (aspect || 1), hN = picH / rows
  const tbN = Math.min(wN, hN) * 0.2
  const offN = tbN + 0.004
  const playHN = Math.max(1.0, picH) + 0.7
  return { wN, hN, tbN, offN, playHN }
}
function mul(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
function scatter(seed, cols, rows, L) {
  const rand = mul((seed >>> 0) + 12345), out = {}, wtot = L.wN + 2 * L.offN, htot = L.hN + 2 * L.offN
  let i = 0
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out[`${r}-${c}`] = { x: rand() * Math.max(0.02, 1 - wtot), y: rand() * Math.max(0.02, L.playHN - htot), g: i++ }
  return out
}

export default function Puzzle() {
  const { groupId } = useParams()
  const { profile } = useAuth()
  const uid = profile?.id

  const wrapRef = useRef(null)
  const chanRef = useRef(null)
  const [playW, setPlayW] = useState(0)
  const [puzzle, setPuzzle] = useState(null)     // {image, cols, rows, seed}
  const [pos, setPos] = useState({})              // id -> {x,y,g}
  const posRef = useRef(pos); posRef.current = pos
  const [aspect, setAspect] = useState(0)
  const [peerCount, setPeerCount] = useState(1)
  const [activeG, setActiveG] = useState(null)
  const [showRef, setShowRef] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState('')
  const [grid, setGrid] = useState(4)
  const [busy, setBusy] = useState(false)

  const drag = useRef(null)
  const saveT = useRef(0)
  const moveRaf = useRef(0)
  const movePend = useRef(null)

  useEffect(() => {
    const el = wrapRef.current; if (!el) return
    const ro = new ResizeObserver(() => setPlayW(el.clientWidth))
    ro.observe(el); setPlayW(el.clientWidth)
    return () => ro.disconnect()
  }, [puzzle])

  const edges = useMemo(() => puzzle ? buildEdges(puzzle.cols, puzzle.rows, puzzle.seed) : null, [puzzle])
  const L = useMemo(() => puzzle && aspect ? layout(puzzle.cols, puzzle.rows, aspect) : null, [puzzle, aspect])

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
      setPuzzle({ image: payload.image, cols: payload.cols, rows: payload.rows, seed: payload.seed }); setPos(payload.positions || {}); setAspect(0)
    })
    ch.on('broadcast', { event: 'upd' }, ({ payload }) => {
      setPos((p) => { const n = { ...p }; for (const q of payload.pieces) n[q.id] = { x: q.x, y: q.y, g: q.g }; return n })
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

  async function start() {
    if (!file || busy) return
    setBusy(true); setError('')
    try {
      const r = await resizeToJpeg(file, 1100)
      const url = await uploadPuzzleImage(r.blob, groupId, uid)
      const asp = r.w / r.h, seed = Math.floor(Math.random() * 1e9), cols = grid, rows = grid
      const positions = scatter(seed, cols, rows, layout(cols, rows, asp))
      const pz = { image: url, cols, rows, seed }
      await saveGroupPuzzle(groupId, { ...pz, positions })
      setAspect(asp); setPuzzle(pz); setPos(positions)
      chanRef.current?.send({ type: 'broadcast', event: 'start', payload: { ...pz, positions } })
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  async function resetPuzzle() {
    if (!confirm('퍼즐을 지우고 새로 시작할까요?')) return
    const oldImage = puzzle?.image
    try { await deleteGroupPuzzle(groupId) } catch { /* noop */ }
    // 더 이상 띄우지 않는 퍼즐 이미지는 스토리지에서 정리 (best-effort)
    if (oldImage) deletePuzzleImageByUrl(oldImage)
    setPuzzle(null); setPos({}); setAspect(0); setFile(null); setPreview('')
    chanRef.current?.send({ type: 'broadcast', event: 'reset' })
  }

  // ---- 드래그(그룹 단위) ----
  function members(g, p = posRef.current) { return Object.keys(p).filter((id) => p[id].g === g) }
  function onPointerDown(e, id) {
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const g = pos[id].g
    const start = {}; for (const m of members(g)) start[m] = { x: pos[m].x, y: pos[m].y }
    drag.current = { g, ox: e.clientX, oy: e.clientY, start }
    setActiveG(g)
  }
  function onPointerMove(e) {
    const d = drag.current; if (!d || !playW) return
    const dx = (e.clientX - d.ox) / playW, dy = (e.clientY - d.oy) / playW
    setPos((p) => { const n = { ...p }; for (const m in d.start) n[m] = { ...n[m], x: d.start[m].x + dx, y: d.start[m].y + dy }; return n })
    movePend.current = Object.keys(d.start).map((m) => ({ id: m, x: d.start[m].x + dx, y: d.start[m].y + dy, g: d.g }))
    if (!moveRaf.current) moveRaf.current = requestAnimationFrame(() => { moveRaf.current = 0; const m = movePend.current; if (m) chanRef.current?.send({ type: 'broadcast', event: 'upd', payload: { pieces: m } }) })
  }
  function onPointerUp() {
    const d = drag.current; drag.current = null; setActiveG(null)
    if (!d || !L || !puzzle) return
    const { cols, rows } = puzzle
    const p = { ...posRef.current }
    const tol = Math.min(L.wN, L.hN) * 0.35
    const NB = [[0, 1], [0, -1], [1, 0], [-1, 0]]
    // 잡은 그룹이 다른 그룹과 올바른 위치로 인접하면 스냅(정렬)
    let snapped = false
    const mem = members(d.g, p)
    for (const id of mem) {
      const [pr, pc] = id.split('-').map(Number)
      for (const [dr, dc] of NB) {
        const nr = pr + dr, nc = pc + dc
        if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue
        const nb = p[`${nr}-${nc}`]; if (!nb || nb.g === d.g) continue
        const relx = (pc - nc) * L.wN, rely = (pr - nr) * L.hN
        const ex = (p[id].x - nb.x) - relx, ey = (p[id].y - nb.y) - rely
        if (Math.hypot(ex, ey) < tol) { for (const m of mem) p[m] = { ...p[m], x: p[m].x - ex, y: p[m].y - ey }; snapped = true; break }
      }
      if (snapped) break
    }
    if (snapped) {
      // 정렬된 상태에서 인접·정위치인 서로 다른 그룹들을 하나로 합침
      let changed = true
      while (changed) {
        changed = false
        for (const id of Object.keys(p)) {
          const [pr, pc] = id.split('-').map(Number)
          for (const [dr, dc] of [[0, 1], [1, 0]]) {
            const nr = pr + dr, nc = pc + dc; if (nr >= rows || nc >= cols) continue
            const a = p[id], b = p[`${nr}-${nc}`]; if (!b || a.g === b.g) continue
            const ex = (a.x - b.x) - (pc - nc) * L.wN, ey = (a.y - b.y) - (pr - nr) * L.hN
            if (Math.hypot(ex, ey) < tol) { const keep = Math.min(a.g, b.g), drop = Math.max(a.g, b.g); for (const k in p) if (p[k].g === drop) p[k] = { ...p[k], g: keep }; changed = true }
          }
        }
      }
    }
    setPos(p)
    chanRef.current?.send({ type: 'broadcast', event: 'upd', payload: { pieces: Object.keys(p).map((id) => ({ id, ...p[id] })) } })
    persistSoon()
  }

  const pieces = useMemo(() => {
    if (!puzzle || !edges || !L || !playW) return []
    const W = playW, wpx = L.wN * W, hpx = L.hN * W, tbpx = L.tbN * W, arr = []
    for (let r = 0; r < puzzle.rows; r++) for (let c = 0; c < puzzle.cols; c++)
      arr.push({ id: `${r}-${c}`, r, c, pp: piecePath(r, c, puzzle.cols, puzzle.rows, wpx, hpx, tbpx, edges) })
    return arr
  }, [puzzle, edges, L, playW])

  const groupsN = new Set(Object.values(pos).map((p) => p.g)).size
  const total = puzzle ? puzzle.cols * puzzle.rows : 0
  const done = total > 0 && Object.keys(pos).length === total && groupsN === 1

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
          <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; setFile(f); setPreview(URL.createObjectURL(f)) }} />
        </label>
        <div className="pz-grid-pick">
          <div className="pz-grid-label">조각 수</div>
          <div className="pz-grid-opts pz-grid-opts6">
            {GRIDS.map((g) => <button key={g.n} type="button" className={`pz-grid-btn ${grid === g.n ? 'on' : ''}`} onClick={() => setGrid(g.n)}>{g.l}</button>)}
          </div>
        </div>
        <button type="button" className="pz-start" disabled={!file || busy} onClick={start}>{busy ? '만드는 중…' : '퍼즐 시작'}</button>
      </div>
    )
  }

  return (
    <div className="page pz-page">
      <div className="pz-bar">
        <span className="pz-peers"><span className="draw-dot" style={{ background: '#7363e8', boxShadow: '0 0 0 3px #eeebfe' }} />{peerCount > 1 ? `${peerCount}명이 함께` : '혼자 맞추는 중'}</span>
        <button type="button" className="pz-thumb" onClick={() => setShowRef((v) => !v)} aria-label="완성 그림 보기" title="완성 그림 보기">
          <img src={puzzle.image} alt="" />
        </button>
        <button type="button" className="pz-reset" onClick={resetPuzzle} aria-label="새 퍼즐" title="새 퍼즐">
          <svg width="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36" /><polyline points="21 3 21 9 15 9" /></svg>
        </button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="pz-wrap" ref={wrapRef} style={{ height: L && playW ? L.playHN * playW : undefined }}
        onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        {!aspect && <img src={puzzle.image} alt="" style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} onLoad={(e) => setAspect(e.target.naturalWidth / e.target.naturalHeight)} />}
        {L && playW > 0 && pieces.map((pc) => {
          const p = pos[pc.id]; if (!p) return null
          const { d, off, sw } = pc.pp
          return (
            <svg key={pc.id} className="pz-piece" width={sw} height={pc.pp.sh}
              style={{ left: p.x * playW, top: p.y * playW, zIndex: activeG === p.g ? 100 : 10 }}
              onPointerDown={(e) => onPointerDown(e, pc.id)}>
              <defs><clipPath id={`clip-${groupId}-${pc.id}`}><path d={d} /></clipPath></defs>
              <image href={puzzle.image} x={off - pc.c * L.wN * playW} y={off - pc.r * L.hN * playW}
                width={puzzle.cols * L.wN * playW} height={puzzle.rows * L.hN * playW} clipPath={`url(#clip-${groupId}-${pc.id})`} preserveAspectRatio="none" />
              <path d={d} fill="none" stroke="rgba(255,255,255,.5)" strokeWidth="1" />
            </svg>
          )
        })}
        {showRef && (
          <button type="button" className="pz-ref" onClick={() => setShowRef(false)}><img src={puzzle.image} alt="완성 그림" /></button>
        )}
        {done && (
          <div className="pz-done"><div className="pz-done-card">🎉<div className="pz-done-t">완성했어요!</div>
            <button type="button" className="pz-start pz-done-btn" onClick={resetPuzzle}>새 퍼즐 만들기</button></div></div>
        )}
      </div>
    </div>
  )
}

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
