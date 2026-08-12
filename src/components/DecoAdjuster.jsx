import { useEffect, useRef, useState } from 'react'
import AvatarDeco, { DECO_TF0, decoAnchor, splitAnchor, SPLIT_IDS } from './AvatarDeco'
import { memberColor } from './MemberAvatar'
import CgToggle from './CgToggle'

// 프로필 꾸미기 아이템을 그룹 프로필 사진에 맞춰 조정하는 편집기.
//   · 한 손가락 끌기      → 위치
//   · 두 손가락 오므리기/벌리기 → 크기
//   · 두 손가락 돌리기    → 각도
// 마우스/키보드만 쓰는 환경을 위해 아래에 크기·각도 버튼도 둔다.
// 좌표는 아바타 SVG viewBox(0~100) 단위로 저장하므로 아바타 크기와 무관하게 같은 결과가 나온다.

// 좌우/상하는 "오프셋"이 아니라 "최종 위치"(기준점+오프셋)가 이 절대 범위 안에
// 들어오도록 클램프한다 — 고양이 리본처럼 기준점이 중앙(50,50)에서 오른쪽으로
// 치우친 아이템도, 좌/우 어느 쪽으로든 사진 밖까지 비슷한 정도로 보낼 수 있다.
// (기준점이 고정 오프셋만큼만 움직이는 방식이면 이미 가장자리에 가까운 쪽은
// 조금만 움직여도 사진을 벗어나고, 반대쪽은 아무리 움직여도 사진 안에 갇힌다.)
const ABS_POS = [-30, 130]
export const TF_LIMIT = { s: [0.4, 2.5] }
const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v))
// 각도는 -180~180 으로 감아 준다(한 바퀴 돌려도 값이 커지지 않게)
const wrap = (r) => { let v = ((r + 180) % 360 + 360) % 360 - 180; return v === -180 ? 180 : v }
const isIdentity = (t) => !t || (t.s === 1 && t.x === 0 && t.y === 0 && t.r === 0)
function clampAt(tf, [ax, ay]) {
  const t = tf || DECO_TF0
  return {
    s: +clamp(Number(t.s) || 1, TF_LIMIT.s).toFixed(3),
    x: +clamp(Number(t.x) || 0, [ABS_POS[0] - ax, ABS_POS[1] - ax]).toFixed(2),
    y: +clamp(Number(t.y) || 0, [ABS_POS[0] - ay, ABS_POS[1] - ay]).toFixed(2),
    r: +wrap(Number(t.r) || 0).toFixed(1),
  }
}
// 좌우 분리 가능한 아이템은 좌/우 서브 조정값도 각자의 기준점으로 클램프해 함께 반환한다
// (동일 위치·항등값이면 생략 — 기존 { s,x,y,r } 만 있던 저장 형태와 호환).
export function clampTf(tf, itemId) {
  const t = tf || DECO_TF0
  const out = clampAt(t, decoAnchor(itemId))
  if (SPLIT_IDS.has(itemId)) {
    const l = clampAt(t.left, splitAnchor(itemId, 'l'))
    const r = clampAt(t.right, splitAnchor(itemId, 'r'))
    if (!isIdentity(l)) out.left = l
    if (!isIdentity(r)) out.right = r
  }
  return out
}
export const isTf0 = (tf) => isIdentity(tf) && isIdentity(tf?.left) && isIdentity(tf?.right)

const centroid = (pts) => {
  let x = 0, y = 0
  for (const p of pts) { x += p.x; y += p.y }
  return { x: x / pts.length, y: y / pts.length }
}

export default function DecoAdjuster({ itemId, src, name = '?', seed, tf, onChange, size = 232 }) {
  const surfRef = useRef(null)
  const ptrs = useRef(new Map())      // pointerId → { x, y }
  const base = useRef(null)           // 두 손가락 제스처 시작 시점 스냅샷
  const last = useRef(null)           // 직전 중심점(이동량 계산용)
  const tapStart = useRef(null)       // 한 손가락으로 눌렀을 때 시작 좌표(탭인지 드래그인지 구분용)
  const tapMoved = useRef(false)      // 시작 후 임계값 이상 움직인 적 있으면 탭 아님(왕복해도 오탐 방지)
  const tfRef = useRef(tf)
  tfRef.current = tf || DECO_TF0

  const splittable = SPLIT_IDS.has(itemId)
  const [split, setSplit] = useState(false)   // 좌우 분리 모드
  const [side, setSide] = useState('l')       // 분리 모드에서 조정 중인 쪽('l' | 'r')

  const cur = tf || DECO_TF0
  const sideKey = side === 'r' ? 'right' : 'left'
  // 지금 손가락/버튼 조작이 실제로 향할 대상: 분리 모드면 선택된 쪽, 아니면 전체(같이 이동)
  const targetTf = () => {
    const base2 = tfRef.current || DECO_TF0
    return split ? (base2[sideKey] || DECO_TF0) : base2
  }
  const curTarget = split ? (cur[sideKey] || DECO_TF0) : cur
  function apply(patch) {
    const base2 = tfRef.current || DECO_TF0
    const next = split
      ? { ...base2, [sideKey]: { ...(base2[sideKey] || DECO_TF0), ...patch } }
      : { ...base2, ...patch }
    onChange(clampTf(next, itemId))
  }

  // Safari 의 페이지 확대 제스처가 편집을 가로채지 않게 막는다
  useEffect(() => {
    const el = surfRef.current
    if (!el) return
    const stop = (e) => e.preventDefault()
    el.addEventListener('gesturestart', stop)
    el.addEventListener('gesturechange', stop)
    return () => { el.removeEventListener('gesturestart', stop); el.removeEventListener('gesturechange', stop) }
  }, [])

  // 화면 px → viewBox(0~100) 단위
  const unit = () => 100 / (surfRef.current?.getBoundingClientRect().width || size)

  function pairState() {
    const [a, b] = [...ptrs.current.values()]
    return {
      dist: Math.hypot(b.x - a.x, b.y - a.y),
      ang: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI,
    }
  }

  function down(e) {
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch { /* 합성 이벤트 */ }
    last.current = centroid([...ptrs.current.values()])
    const t = targetTf()
    base.current = ptrs.current.size === 2
      ? { ...pairState(), s: t.s ?? 1, r: t.r ?? 0 }
      : null
    // 손가락 하나로 눌렀을 때만 탭 후보(두 손가락이면 핀치/회전이라 탭이 아님)
    tapStart.current = ptrs.current.size === 1 ? { x: e.clientX, y: e.clientY } : null
    tapMoved.current = false
  }

  function move(e) {
    if (!ptrs.current.has(e.pointerId)) return
    if (tapStart.current) {
      const d = Math.hypot(e.clientX - tapStart.current.x, e.clientY - tapStart.current.y)
      if (d >= 6) tapMoved.current = true
    }
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const pts = [...ptrs.current.values()]
    const c = centroid(pts)
    const u = unit()
    const patch = {}
    const t = targetTf()
    // 이동: 손가락 수와 무관하게 중심점이 움직인 만큼 (모드가 바뀌어도 튀지 않는다)
    if (last.current) {
      patch.x = (t.x ?? 0) + (c.x - last.current.x) * u
      patch.y = (t.y ?? 0) + (c.y - last.current.y) * u
    }
    // 크기·각도: 두 손가락 시작 시점 기준(누적 오차 없음)
    if (pts.length === 2 && base.current && base.current.dist > 0) {
      const now = pairState()
      patch.s = base.current.s * (now.dist / base.current.dist)
      patch.r = base.current.r + (now.ang - base.current.ang)
    }
    last.current = c
    apply(patch)
  }

  function up(e) {
    // 탭 판정: 손가락 하나로 시작해서(핀치 아님) 한 번도 임계값 이상 움직이지 않고 뗐으면 탭
    // — 분리 모드일 때 뗀 자리가 화면 왼쪽 절반이면 왼쪽, 오른쪽 절반이면 오른쪽을 선택한다
    // (좌우 미러 기준이 항상 정확히 x=50 이라 위치만으로 판단해도 어긋나지 않는다).
    if (split && ptrs.current.size === 1 && tapStart.current && !tapMoved.current) {
      const rect = surfRef.current.getBoundingClientRect()
      const localX = ((e.clientX - rect.left) / rect.width) * 100
      setSide(localX < 50 ? 'l' : 'r')
    }
    tapStart.current = null
    ptrs.current.delete(e.pointerId)
    const pts = [...ptrs.current.values()]
    // 2 → 1 로 줄면 남은 손가락 기준으로 다시 잡아 위치가 튀지 않게
    last.current = pts.length ? centroid(pts) : null
    base.current = null
  }

  const initial = (name || '?').trim()[0]?.toUpperCase() || '?'
  const c = memberColor(seed || name)

  // 초기화: 분리 모드면 지금 고른 쪽만, 아니면 전체(좌우 조정값 포함)를 완전히 기본값으로.
  function reset() {
    if (split) onChange(clampTf({ ...(tf || DECO_TF0), [sideKey]: { ...DECO_TF0 } }, itemId))
    else onChange({ ...DECO_TF0 })
  }
  const resetDisabled = split ? isTf0(curTarget) : isTf0(cur)

  return (
    <div className="deco-adj">
      <div ref={surfRef} className="deco-adj-surf" style={{ width: size, height: size }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <span className="deco-adj-face" style={src ? undefined : { background: c.bg, color: c.fg, fontSize: size * 0.34 }}>
          {src ? <img src={src} alt="" draggable={false} onContextMenu={(e) => e.preventDefault()} /> : initial}
        </span>
        <AvatarDeco items={[{ id: itemId, tf: cur }]} layer="back" />
        <AvatarDeco items={[{ id: itemId, tf: cur }]} layer="front" />
      </div>

      {splittable && (
        <div className="deco-adj-split-row">
          <span className="deco-adj-split-label">좌우 분리</span>
          <CgToggle on={split} onClick={() => setSplit((v) => !v)} />
          {split && (
            <div className="deco-adj-side-badges" role="radiogroup" aria-label="조정할 쪽">
              <button type="button" role="radio" aria-checked={side === 'l'}
                className={`deco-adj-side-badge${side === 'l' ? ' on' : ''}`} onClick={() => setSide('l')}>왼쪽</button>
              <button type="button" role="radio" aria-checked={side === 'r'}
                className={`deco-adj-side-badge${side === 'r' ? ' on' : ''}`} onClick={() => setSide('r')}>오른쪽</button>
            </div>
          )}
        </div>
      )}

      <div className="deco-adj-ctrl">
        <button type="button" onClick={() => apply({ s: curTarget.s - 0.1 })} aria-label="작게">－</button>
        <span className="deco-adj-val">{Math.round(curTarget.s * 100)}%</span>
        <button type="button" onClick={() => apply({ s: curTarget.s + 0.1 })} aria-label="크게">＋</button>
        <i className="deco-adj-sep" />
        <button type="button" onClick={() => apply({ r: curTarget.r - 10 })} aria-label="왼쪽으로 회전">↺</button>
        <span className="deco-adj-val">{Math.round(curTarget.r)}°</span>
        <button type="button" onClick={() => apply({ r: curTarget.r + 10 })} aria-label="오른쪽으로 회전">↻</button>
        <i className="deco-adj-sep" />
        <button type="button" className="deco-adj-reset" onClick={reset} disabled={resetDisabled}>초기화</button>
      </div>
    </div>
  )
}
