import { useEffect, useRef } from 'react'
import AvatarDeco, { DECO_TF0, decoAnchor } from './AvatarDeco'
import { memberColor } from './MemberAvatar'

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
export function clampTf(tf, itemId) {
  const [ax, ay] = decoAnchor(itemId)
  return {
    s: +clamp(Number(tf.s) || 1, TF_LIMIT.s).toFixed(3),
    x: +clamp(Number(tf.x) || 0, [ABS_POS[0] - ax, ABS_POS[1] - ax]).toFixed(2),
    y: +clamp(Number(tf.y) || 0, [ABS_POS[0] - ay, ABS_POS[1] - ay]).toFixed(2),
    r: +wrap(Number(tf.r) || 0).toFixed(1),
  }
}
export const isTf0 = (tf) => !tf || (tf.s === 1 && tf.x === 0 && tf.y === 0 && tf.r === 0)

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
  const tfRef = useRef(tf)
  tfRef.current = tf || DECO_TF0

  const cur = tf || DECO_TF0
  const apply = (patch) => onChange(clampTf({ ...tfRef.current, ...patch }, itemId))

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
    base.current = ptrs.current.size === 2
      ? { ...pairState(), s: tfRef.current.s ?? 1, r: tfRef.current.r ?? 0 }
      : null
  }

  function move(e) {
    if (!ptrs.current.has(e.pointerId)) return
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const pts = [...ptrs.current.values()]
    const c = centroid(pts)
    const u = unit()
    const patch = {}
    // 이동: 손가락 수와 무관하게 중심점이 움직인 만큼 (모드가 바뀌어도 튀지 않는다)
    if (last.current) {
      patch.x = (tfRef.current.x ?? 0) + (c.x - last.current.x) * u
      patch.y = (tfRef.current.y ?? 0) + (c.y - last.current.y) * u
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
    ptrs.current.delete(e.pointerId)
    const pts = [...ptrs.current.values()]
    // 2 → 1 로 줄면 남은 손가락 기준으로 다시 잡아 위치가 튀지 않게
    last.current = pts.length ? centroid(pts) : null
    base.current = null
  }

  const initial = (name || '?').trim()[0]?.toUpperCase() || '?'
  const c = memberColor(seed || name)

  return (
    <div className="deco-adj">
      <div ref={surfRef} className="deco-adj-surf" style={{ width: size, height: size }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <span className="deco-adj-face" style={src ? undefined : { background: c.bg, color: c.fg, fontSize: size * 0.34 }}>
          {src ? <img src={src} alt="" /> : initial}
        </span>
        <AvatarDeco items={[{ id: itemId, tf: cur }]} layer="back" />
        <AvatarDeco items={[{ id: itemId, tf: cur }]} layer="front" />
      </div>

      <p className="deco-adj-hint">손가락으로도 위치, 크기, 각도 조정 가능해요.</p>

      <div className="deco-adj-ctrl">
        <button type="button" onClick={() => apply({ s: cur.s - 0.1 })} aria-label="작게">－</button>
        <span className="deco-adj-val">{Math.round(cur.s * 100)}%</span>
        <button type="button" onClick={() => apply({ s: cur.s + 0.1 })} aria-label="크게">＋</button>
        <i className="deco-adj-sep" />
        <button type="button" onClick={() => apply({ r: cur.r - 10 })} aria-label="왼쪽으로 회전">↺</button>
        <span className="deco-adj-val">{Math.round(cur.r)}°</span>
        <button type="button" onClick={() => apply({ r: cur.r + 10 })} aria-label="오른쪽으로 회전">↻</button>
        <i className="deco-adj-sep" />
        <button type="button" className="deco-adj-reset" onClick={() => onChange({ ...DECO_TF0 })}
          disabled={isTf0(cur)}>초기화</button>
      </div>
    </div>
  )
}
