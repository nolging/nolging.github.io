// 직소 퍼즐 조각 형태 생성. 시드 기반이라 두 클라이언트가 동일한 조각을 그림.
// 인접 조각은 같은 경계선(같은 sign, 같은 곡선을 정/역방향)으로 그려 정확히 맞물림.

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 경계선 톡/홈 방향(±1). 시드로 결정.
export function buildEdges(cols, rows, seed) {
  const rand = mulberry32(seed >>> 0)
  const vSign = []                       // vSign[row][cb], cb=1..cols-1 (세로 경계선)
  for (let r = 0; r < rows; r++) { vSign[r] = []; for (let cb = 1; cb < cols; cb++) vSign[r][cb] = rand() < 0.5 ? -1 : 1 }
  const hSign = []                       // hSign[rb][col], rb=1..rows-1 (가로 경계선)
  for (let rb = 1; rb < rows; rb++) { hSign[rb] = []; for (let c = 0; c < cols; c++) hSign[rb][c] = rand() < 0.5 ? -1 : 1 }
  return { vSign, hSign }
}

// 가로 경계(왼→오): (x0,yl)→(x0+w,yl), 톡 방향 s(+1=아래로), 높이 tb
function hSegs(x0, yl, w, s, tb) {
  const t = s * tb, nw = 0.09 * w, kr = 0.17 * w, cx = x0 + 0.5 * w
  return [
    { t: 'L', x: cx - nw, y: yl },
    { t: 'C', a: cx - nw - 0.02 * w, b: yl + t * 0.28, c: cx - kr, d: yl + t, x: cx, y: yl + t },
    { t: 'C', a: cx + kr, b: yl + t, c: cx + nw + 0.02 * w, d: yl + t * 0.28, x: cx + nw, y: yl },
    { t: 'L', x: x0 + w, y: yl },
  ]
}
// 세로 경계(위→아래): (xl,y0)→(xl,y0+h), 톡 방향 s(+1=오른쪽), 높이 tb
function vSegs(xl, y0, h, s, tb) {
  const t = s * tb, nw = 0.09 * h, kr = 0.17 * h, cy = y0 + 0.5 * h
  return [
    { t: 'L', x: xl, y: cy - nw },
    { t: 'C', a: xl + t * 0.28, b: cy - nw - 0.02 * h, c: xl + t, d: cy - kr, x: xl + t, y: cy },
    { t: 'C', a: xl + t, b: cy + kr, c: xl + t * 0.28, d: cy + nw + 0.02 * h, x: xl, y: cy + nw },
    { t: 'L', x: xl, y: y0 + h },
  ]
}
function fwd(segs) {
  return segs.map((s) => s.t === 'L' ? `L ${s.x} ${s.y}` : `C ${s.a} ${s.b} ${s.c} ${s.d} ${s.x} ${s.y}`).join(' ')
}
// 정방향(start→...)의 역방향 문자열: start 제외, 끝점에서 start 로 되돌아옴
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

// 한 조각의 로컬 좌표 경로. 셀 좌상단은 (off,off), tab 은 바깥으로 off 만큼 돌출 가능.
export function piecePath(pr, pc, cols, rows, w, h, tb, edges) {
  const off = Math.ceil(tb) + 1
  const { vSign, hSign } = edges
  const x0 = off, y0 = off
  let d = `M ${x0} ${y0} `
  // top (L→R)
  d += pr === 0 ? `L ${x0 + w} ${y0} ` : fwd(hSegs(x0, y0, w, hSign[pr][pc], tb)) + ' '
  // right (T→B)
  d += pc === cols - 1 ? `L ${x0 + w} ${y0 + h} ` : fwd(vSegs(x0 + w, y0, h, vSign[pr][pc + 1], tb)) + ' '
  // bottom (R→L = reverse of L→R)
  d += pr === rows - 1 ? `L ${x0} ${y0 + h} ` : rev([x0, y0 + h], hSegs(x0, y0 + h, w, hSign[pr + 1][pc], tb)) + ' '
  // left (B→T = reverse of T→B)
  d += pc === 0 ? `L ${x0} ${y0} ` : rev([x0, y0], vSegs(x0, y0, h, vSign[pr][pc], tb)) + ' '
  d += 'Z'
  return { d, off, sw: w + 2 * off, sh: h + 2 * off }
}
