// 직소 퍼즐 조각 형태 생성. 시드 기반이라 두 클라이언트가 동일한 조각을 그림.
// 인접 조각은 같은 경계선(같은 edge 객체를 정/역방향)으로 그려 정확히 맞물림.
// 톡: 목이 잘록하고 끝이 둥근 자연스러운 직소 형태 + 시드 기반 미세 변형.

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 경계선: {s:톡방향±1, ja:위치지터, jb:크기지터}
export function buildEdges(cols, rows, seed) {
  const rand = mulberry32(seed >>> 0)
  const jit = () => rand() * 2 - 1
  const v = []                       // v[r][cb], cb=1..cols-1 (세로 경계선)
  for (let r = 0; r < rows; r++) { v[r] = []; for (let cb = 1; cb < cols; cb++) v[r][cb] = { s: rand() < 0.5 ? -1 : 1, ja: jit(), jb: jit() } }
  const h = []                       // h[rb][c], rb=1..rows-1 (가로 경계선)
  for (let rb = 1; rb < rows; rb++) { h[rb] = []; for (let c = 0; c < cols; c++) h[rb][c] = { s: rand() < 0.5 ? -1 : 1, ja: jit(), jb: jit() } }
  return { v, h }
}

// 자연스러운 톡(mushroom): 잘록한 목 + 둥근 머리. 가로 경계(왼→오): (x0,yl)→(x0+w,yl)
function hSegs(x0, yl, w, e, tb) {
  const t = e.s * tb * (1 + e.jb * 0.12)
  const cx = x0 + (0.5 + e.ja * 0.05) * w
  const neck = 0.075 * w, kw = 0.135 * w
  return [
    { t: 'L', x: cx - neck, y: yl },
    { t: 'C', a: cx - neck, b: yl + t * 0.5, c: cx - kw, d: yl + t * 0.42, x: cx - kw, y: yl + t },
    { t: 'C', a: cx - kw, b: yl + t * 1.5, c: cx + kw, d: yl + t * 1.5, x: cx + kw, y: yl + t },
    { t: 'C', a: cx + kw, b: yl + t * 0.42, c: cx + neck, d: yl + t * 0.5, x: cx + neck, y: yl },
    { t: 'L', x: x0 + w, y: yl },
  ]
}
// 세로 경계(위→아래): (xl,y0)→(xl,y0+h)
function vSegs(xl, y0, h, e, tb) {
  const t = e.s * tb * (1 + e.jb * 0.12)
  const cy = y0 + (0.5 + e.ja * 0.05) * h
  const neck = 0.075 * h, kw = 0.135 * h
  return [
    { t: 'L', x: xl, y: cy - neck },
    { t: 'C', a: xl + t * 0.5, b: cy - neck, c: xl + t * 0.42, d: cy - kw, x: xl + t, y: cy - kw },
    { t: 'C', a: xl + t * 1.5, b: cy - kw, c: xl + t * 1.5, d: cy + kw, x: xl + t, y: cy + kw },
    { t: 'C', a: xl + t * 0.42, b: cy + kw, c: xl + t * 0.5, d: cy + neck, x: xl, y: cy + neck },
    { t: 'L', x: xl, y: y0 + h },
  ]
}
function fwd(segs) {
  return segs.map((s) => s.t === 'L' ? `L ${s.x} ${s.y}` : `C ${s.a} ${s.b} ${s.c} ${s.d} ${s.x} ${s.y}`).join(' ')
}
function rev(start, segs) {
  const pts = [start]
  for (const s of segs) pts.push([s.x, s.y])
  let out = ''
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i], p = pts[i]
    if (s.t === 'L') out += ` L ${p[0]} ${p[1]}`
    else out += ` C ${s.c} ${s.d} ${s.a} ${s.b} ${p[0]} ${p[1]}`
  }
  return out
}

// 같은 그룹(맞물린 조각들)은 항상 격자 정위치여야 한다 — 그룹의 앵커 조각을 기준으로
// 상대 위치를 재계산해 어긋남(유격)을 제거. 예전 버전이 어긋난 채 저장한 판도 열면 교정된다.
// pos: { "r-c": {x, y, g} }, L: { wN, hN } (정규화 셀 크기)
export function normalizeGroups(pos, L) {
  if (!L) return pos
  const out = { ...pos }
  const anchor = {}   // g -> {r, c, x, y}
  for (const id of Object.keys(out).sort()) {
    const p = out[id]; if (!p) continue
    const [r, c] = id.split('-').map(Number)
    const a = anchor[p.g]
    if (!a) { anchor[p.g] = { r, c, x: p.x, y: p.y }; continue }
    out[id] = { ...p, x: a.x + (c - a.c) * L.wN, y: a.y + (r - a.r) * L.hN }
  }
  return out
}

// 조각 정렬: '아무도 옮기지 않은' 조각(m=0)만 빈 칸에 겹치지 않게 정리한다.
// 누군가 옮긴 조각(m=1)이 차지한 칸은 피하고, 그 조각들은 그대로 둔다.
// 반환: { pos, placed(정렬한 개수), loose(정렬 대상 개수) }
export function arrangeLoosePieces(pos, L) {
  const p = { ...pos }
  const ids = Object.keys(p)
  const loose = ids.filter((id) => !p[id].m)
  if (!L || !loose.length) return { pos: p, placed: 0, loose: loose.length }
  const cw = L.wN + L.offN, ch = L.hN + L.offN     // 톡(요철) 여유를 포함한 한 칸
  const cols = Math.max(1, Math.floor(1 / cw))
  const rowsN = Math.max(1, Math.floor(L.playHN / ch))
  const occ = new Set()
  for (const id of ids) {
    const q = p[id]; if (!q.m) continue
    const c0 = Math.floor(q.x / cw), r0 = Math.floor(q.y / ch)
    for (let dr = 0; dr <= 1; dr++) for (let dc = 0; dc <= 1; dc++) occ.add(`${r0 + dr}-${c0 + dc}`)
  }
  let k = 0
  for (let r = 0; r < rowsN && k < loose.length; r++) {
    for (let c = 0; c < cols && k < loose.length; c++) {
      if (occ.has(`${r}-${c}`)) continue
      const id = loose[k++]
      p[id] = { ...p[id], x: c * cw, y: r * ch }     // m 은 0 그대로(다시 정렬 가능)
    }
  }
  return { pos: p, placed: k, loose: loose.length }
}

// 한 조각의 로컬 좌표 경로. 셀 좌상단 (off,off).
export function piecePath(pr, pc, cols, rows, w, h, tb, edges) {
  const off = Math.ceil(tb) + 1
  const { v, h: H } = edges
  const x0 = off, y0 = off
  let d = `M ${x0} ${y0} `
  d += pr === 0 ? `L ${x0 + w} ${y0} ` : fwd(hSegs(x0, y0, w, H[pr][pc], tb)) + ' '
  d += pc === cols - 1 ? `L ${x0 + w} ${y0 + h} ` : fwd(vSegs(x0 + w, y0, h, v[pr][pc + 1], tb)) + ' '
  d += pr === rows - 1 ? `L ${x0} ${y0 + h} ` : rev([x0, y0 + h], hSegs(x0, y0 + h, w, H[pr + 1][pc], tb)) + ' '
  d += pc === 0 ? `L ${x0} ${y0} ` : rev([x0, y0], vSegs(x0, y0, h, v[pr][pc], tb)) + ' '
  d += 'Z'
  return { d, off, sw: w + 2 * off, sh: h + 2 * off }
}
