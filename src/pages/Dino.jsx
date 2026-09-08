// 다이노 짬푸 — 크롬 오프라인 공룡 게임 클론(프리미엄 그룹 전용, 대기실 없이 혼자 플레이).
// 캔버스에 직접 픽셀아트(사각형 조합)로 그리고, requestAnimationFrame 루프로 물리/충돌을 계산한다.
// 판이 끝나면 서버(submit_dino_score)에 점수를 올리고, 그룹 내 전체 기록 순위를 다시 불러온다.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { isCoupleGroup, isFriendGroup, submitDinoScore, getDinoLeaderboard } from '../lib/api'
import Avatar from '../components/Avatar'

// ---- 논리 캔버스 좌표계(크롬 공룡 게임과 동일한 4:1 비율) ----
const W = 600, H = 150
const GROUND_Y = 130

// ---- 물리/속도 ----
const GRAVITY = 0.0022          // px / ms^2
const JUMP_V = -0.62            // px / ms (음수 = 위)
const START_SPEED = 0.32        // px / ms
const MAX_SPEED = 0.62
const SPEED_ACCEL = 0.000006    // px/ms 당 가속
const NIGHT_EVERY = 700         // 점수 이 값만큼마다 낮/밤 전환
const PTERO_FROM_SCORE = 250    // 이 점수부터 익룡 등장

// ---- 다이노 본체 크기(논리 px) ----
const DINO_W = 34, DINO_H = 42
const DUCK_W = 46, DUCK_H = 24

function rr(x) { return Math.round(x) }

// 사각형 조합으로 그리는 픽셀아트 공룡(옆모습, 오른쪽을 보고 달림).
// x,y = 바운딩 박스 좌상단. duck/dead/legPhase 로 자세 결정.
function drawDino(ctx, x, y, { duck, dead, legPhase, color }) {
  ctx.fillStyle = color
  x = rr(x); y = rr(y)
  if (duck) {
    // 웅크린 자세: 낮고 긴 몸통 + 앞으로 뻗은 머리
    ctx.fillRect(x, y + 6, 34, 14)          // 몸통
    ctx.fillRect(x + 30, y, 16, 12)         // 머리(앞으로 낮게)
    ctx.fillRect(x + 42, y + 3, 6, 4)       // 주둥이
    ctx.fillStyle = '#fff'
    ctx.fillRect(x + 40, y + 3, 2, 2)       // 눈
    ctx.fillStyle = color
    ctx.fillRect(x, y + 12, 8, 6)           // 꼬리
    // 다리(짧게, 교차 애니메이션)
    ctx.fillRect(x + (legPhase ? 6 : 20), y + 20, 6, 4)
    ctx.fillRect(x + (legPhase ? 20 : 6), y + 20, 6, 4)
    return
  }
  // 서 있는/달리는 자세
  ctx.fillRect(x + 6, y, 14, 8)            // 등 위쪽(목~등)
  ctx.fillRect(x + 2, y + 8, 20, 14)       // 몸통
  ctx.fillRect(x + 4, y + 22, 16, 6)       // 골반
  ctx.fillRect(x + 20, y - 4, 13, 12)      // 머리
  ctx.fillRect(x + 30, y, 7, 5)            // 주둥이
  ctx.fillStyle = dead ? '#fff' : '#fff'
  ctx.fillRect(x + 27, y - 1, 2, 2)        // 눈(흰자)
  if (!dead) { ctx.fillStyle = '#535353'; ctx.fillRect(x + 27, y - 1, 2, 2) }
  ctx.fillStyle = color
  ctx.fillRect(x + 22, y + 10, 5, 3)       // 앞다리(짧은 팔)
  ctx.fillRect(x - 6, y + 8, 9, 6)         // 꼬리 뿌리
  ctx.fillRect(x - 10, y + 10, 6, 4)       // 꼬리 끝
  if (dead) {
    // 게임오버: 다리는 가만히 선 자세 + 눈에 X
    ctx.fillRect(x + 4, y + 28, 6, 10)
    ctx.fillRect(x + 16, y + 28, 6, 10)
    ctx.strokeStyle = color; ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.moveTo(x + 26, y); ctx.lineTo(x + 30, y + 4)
    ctx.moveTo(x + 30, y); ctx.lineTo(x + 26, y + 4)
    ctx.stroke()
    return
  }
  // 달리는 다리(2프레임 교차)
  if (legPhase) {
    ctx.fillRect(x + 4, y + 28, 6, 12)
    ctx.fillRect(x + 16, y + 28, 6, 8)
  } else {
    ctx.fillRect(x + 4, y + 28, 6, 8)
    ctx.fillRect(x + 16, y + 28, 6, 12)
  }
}

function drawCactus(ctx, x, y, w, h, color) {
  ctx.fillStyle = color
  x = rr(x); y = rr(y)
  const stemW = Math.max(6, Math.floor(w * 0.34))
  const stemX = x + Math.floor((w - stemW) / 2)
  ctx.fillRect(stemX, y, stemW, h)
  // 팔(가지) — 폭이 넉넉할 때만
  if (w > stemW + 6) {
    const armW = Math.max(4, Math.floor(stemW * 0.7))
    ctx.fillRect(x, y + Math.floor(h * 0.28), armW, Math.floor(h * 0.4))
    ctx.fillRect(x + w - armW, y + Math.floor(h * 0.12), armW, Math.floor(h * 0.4))
  }
}

function drawPtero(ctx, x, y, wingUp, color) {
  ctx.fillStyle = color
  x = rr(x); y = rr(y)
  ctx.fillRect(x + 10, y + 8, 24, 8)                      // 몸통
  ctx.fillRect(x + 30, y + 6, 10, 5)                       // 머리
  ctx.fillRect(x + 38, y + 7, 6, 3)                        // 부리
  ctx.fillRect(x, y + 10, 10, 4)                           // 꼬리
  if (wingUp) { ctx.fillRect(x + 14, y - 6, 20, 8); ctx.fillRect(x + 6, y + 2, 10, 6) }
  else { ctx.fillRect(x + 14, y + 14, 20, 8); ctx.fillRect(x + 6, y + 14, 10, 6) }
}

function drawCloud(ctx, x, y, color) {
  ctx.fillStyle = color
  x = rr(x); y = rr(y)
  ctx.fillRect(x + 4, y, 30, 8)
  ctx.fillRect(x, y + 4, 40, 6)
}

// 장애물 정의(폭/높이/그라운드 기준 y). 익룡은 3가지 높이 중 하나로 등장.
const CACTUS_DEFS = [
  { w: 17, h: 35 }, { w: 34, h: 35 }, { w: 51, h: 35 },   // 작은 선인장 1~3개
  { w: 25, h: 47 }, { w: 50, h: 47 },                      // 큰 선인장 1~2개
]
const PTERO_Y_OFFSETS = [0, -34, -68]   // 그라운드 기준(낮음=점프 필요) ~ 높음(그냥 지나감)

export default function Dino() {
  const { groupId } = useParams()
  const { user, profile, isAdmin } = useAuth()
  const canvasRef = useRef(null)
  const rafRef = useRef(0)

  const [gate, setGate] = useState('checking')  // checking | blocked | ok
  const [phase, setPhase] = useState('ready')    // ready | running | over
  const [board, setBoard] = useState({ rows: [], my_best: 0 })
  const [boardLoading, setBoardLoading] = useState(true)
  const [lastScore, setLastScore] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  // 게임 내부 상태는 매 프레임 바뀌므로 ref 로(리렌더 없이 캔버스에만 반영)
  const st = useRef(null)
  const phaseRef = useRef('ready')
  useEffect(() => { phaseRef.current = phase }, [phase])

  const loadBoard = useCallback(async () => {
    setBoardLoading(true)
    try { setBoard(await getDinoLeaderboard(groupId)) } catch { /* noop */ }
    finally { setBoardLoading(false) }
  }, [groupId])

  useEffect(() => {
    let on = true
    Promise.all([isCoupleGroup(groupId), isFriendGroup(groupId)]).then(([c, f]) => {
      if (on) setGate((c || f || isAdmin) ? 'ok' : 'blocked')
    })
    loadBoard()
    return () => { on = false }
  }, [groupId, isAdmin, loadBoard])

  const resetState = useCallback(() => {
    st.current = {
      y: GROUND_Y - DINO_H, vy: 0, duck: false, onGround: true,
      speed: START_SPEED, distance: 0, score: 0, legPhase: false, legTimer: 0,
      obstacles: [], nextGapPx: 260, clouds: [{ x: 480, y: 30 }, { x: 300, y: 55 }],
      wingUp: false, wingTimer: 0, holdDuck: false,
    }
  }, [])

  const restart = useCallback(() => {
    resetState()
    setLastScore(null)
    setPhase('running')
  }, [resetState])

  // ---- 입력 ----
  const doJump = useCallback(() => {
    const s = st.current
    if (phaseRef.current === 'ready') { setPhase('running'); return }
    if (phaseRef.current === 'over') { restart(); return }
    if (!s) return
    if (s.onGround) { s.vy = JUMP_V; s.onGround = false; s.duck = false }
  }, [restart])
  const setDuck = useCallback((v) => {
    const s = st.current
    if (!s) return
    s.holdDuck = v
    if (s.onGround) s.duck = v
  }, [])

  useEffect(() => { resetState() }, [resetState])

  // 키보드
  useEffect(() => {
    const onDown = (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); doJump() }
      else if (e.code === 'ArrowDown') { e.preventDefault(); setDuck(true) }
    }
    const onUp = (e) => { if (e.code === 'ArrowDown') setDuck(false) }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp) }
  }, [doJump, setDuck])

  // ---- 판 종료: 서버 제출 + 순위 갱신 ----
  const finish = useCallback(async (score) => {
    setPhase('over')
    setLastScore(score)
    if (score <= 0 || !groupId) return
    setSubmitting(true)
    try { await submitDinoScore(groupId, score) } catch { /* noop */ }
    finally { setSubmitting(false) }
    loadBoard()
  }, [groupId, loadBoard])

  // ---- 게임 루프 ----
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = false
    let last = performance.now()

    const spawnObstacle = (s) => {
      const usePtero = s.score >= PTERO_FROM_SCORE && Math.random() < 0.28
      if (usePtero) {
        const off = PTERO_Y_OFFSETS[Math.floor(Math.random() * PTERO_Y_OFFSETS.length)]
        s.obstacles.push({ type: 'ptero', x: W + 10, w: 46, h: 34, y: GROUND_Y - 40 + off })
      } else {
        const n = Math.floor(Math.random() * CACTUS_DEFS.length)
        const def = CACTUS_DEFS[n]
        s.obstacles.push({ type: 'cactus', x: W + 10, w: def.w, h: def.h, y: GROUND_Y - def.h })
      }
      const minGap = 180 + s.speed * 220
      s.nextGapPx = minGap + Math.random() * 220
    }

    const step = (now) => {
      const dt = Math.min(40, now - last)
      last = now
      const s = st.current
      if (phaseRef.current === 'running' && s && !s.over) {
        s.speed = Math.min(MAX_SPEED, s.speed + SPEED_ACCEL * dt)
        s.distance += s.speed * dt
        s.score = Math.floor(s.distance / 8)

        // 물리
        if (!s.onGround) {
          s.vy += GRAVITY * dt
          s.y += s.vy * dt
          if (s.y >= GROUND_Y - DINO_H) { s.y = GROUND_Y - DINO_H; s.vy = 0; s.onGround = true; s.duck = s.holdDuck }
        } else {
          s.duck = s.holdDuck
        }

        // 다리 애니메이션
        s.legTimer += dt
        const legInterval = Math.max(60, 140 - s.speed * 100)
        if (s.legTimer > legInterval) { s.legTimer = 0; s.legPhase = !s.legPhase }
        s.wingTimer += dt
        if (s.wingTimer > 180) { s.wingTimer = 0; s.wingUp = !s.wingUp }

        // 장애물 이동/스폰/제거
        for (const o of s.obstacles) o.x -= s.speed * dt
        s.obstacles = s.obstacles.filter((o) => o.x + o.w > -10)
        s.gapAcc = (s.gapAcc || 0) + s.speed * dt
        if (s.gapAcc >= s.nextGapPx) { s.gapAcc = 0; spawnObstacle(s) }

        // 구름
        for (const c of s.clouds) { c.x -= s.speed * dt * 0.25; if (c.x < -50) { c.x = W + Math.random() * 60; c.y = 20 + Math.random() * 40 } }

        // 충돌(약간 여유를 준 히트박스)
        const dw = s.duck ? DUCK_W : DINO_W, dh = s.duck ? DUCK_H : DINO_H
        const inset = 6
        const dx0 = 30 + inset, dx1 = 30 + dw - inset, dy0 = s.y + inset, dy1 = s.y + dh - inset
        for (const o of s.obstacles) {
          const ox0 = o.x + 4, ox1 = o.x + o.w - 4, oy0 = o.y + 3, oy1 = o.y + o.h - 3
          if (dx0 < ox1 && dx1 > ox0 && dy0 < oy1 && dy1 > oy0) { s.over = true; finish(s.score); break }
        }
      }

      // ---- 렌더 ----
      const s2 = st.current
      const night = s2 && Math.floor(s2.score / NIGHT_EVERY) % 2 === 1
      const bg = night ? '#202124' : '#fff'
      const fg = night ? '#f7f7f7' : '#535353'
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, W, H)

      if (s2) {
        ctx.fillStyle = night ? '#3a3a3d' : '#e8e8e8'
        for (const c of s2.clouds) drawCloud(ctx, c.x, c.y, night ? '#3a3a3d' : '#e0e0e0')
        // 바닥선 + 점선 텍스처
        ctx.fillStyle = fg
        ctx.fillRect(0, GROUND_Y, W, 2)
        const dashOffset = Math.floor(s2.distance / 3) % 24
        for (let x = -dashOffset; x < W; x += 24) ctx.fillRect(x, GROUND_Y, 12, 2)

        for (const o of s2.obstacles) {
          if (o.type === 'cactus') drawCactus(ctx, o.x, o.y, o.w, o.h, fg)
          else drawPtero(ctx, o.x, o.y, s2.wingUp, fg)
        }

        drawDino(ctx, 30, s2.y, { duck: s2.duck, dead: phaseRef.current === 'over', legPhase: s2.legPhase, color: fg })

        // 점수(우상단, 등폭 숫자)
        ctx.fillStyle = fg
        ctx.font = '700 16px monospace'
        ctx.textAlign = 'right'
        ctx.textBaseline = 'top'
        const hi = Math.max(board.my_best || 0, s2.score)
        ctx.fillText(`HI ${String(hi).padStart(5, '0')}  ${String(s2.score).padStart(5, '0')}`, W - 6, 8)

        if (phaseRef.current === 'ready') {
          ctx.textAlign = 'center'
          ctx.font = '700 14px sans-serif'
          ctx.fillText('탭하거나 스페이스바로 시작', W / 2, H / 2 - 8)
        }
        if (phaseRef.current === 'over') {
          ctx.textAlign = 'center'
          ctx.font = '900 20px monospace'
          ctx.fillText('GAME OVER', W / 2, H / 2 - 26)
          ctx.font = '700 13px sans-serif'
          ctx.fillText('탭해서 다시 시작', W / 2, H / 2 - 2)
        }
      }

      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [finish, board.my_best])

  const onPointerDown = (e) => {
    e.preventDefault()
    doJump()
  }

  if (gate === 'checking') return <div className="page"><div className="spinner" /></div>
  if (gate === 'blocked') return <div className="page"><div className="empty">프리미엄 그룹(커플·우정)에서만 플레이할 수 있어요.</div></div>

  return (
    <div className="page dino-page">
      <div className="dino-wrap">
        <canvas ref={canvasRef} width={W} height={H} className="dino-canvas"
          onPointerDown={onPointerDown} />
        <div className="dino-controls">
          <button type="button" className="dino-btn dino-btn-jump" onPointerDown={(e) => { e.preventDefault(); doJump() }}>▲ 점프</button>
          <button type="button" className="dino-btn dino-btn-duck"
            onPointerDown={(e) => { e.preventDefault(); setDuck(true) }}
            onPointerUp={() => setDuck(false)}
            onPointerLeave={() => setDuck(false)}>▼ 숙이기</button>
        </div>
        {lastScore != null && phase === 'over' && (
          <div className="dino-result">
            {submitting ? '기록 제출 중…' : `이번 점수 ${lastScore}점${lastScore >= (board.my_best || 0) ? ' · 신기록!' : ''}`}
          </div>
        )}
      </div>

      <div className="dino-board">
        <div className="dino-board-title">그룹 내 기록 순위</div>
        {boardLoading ? (
          <div className="spinner spinner-sm" />
        ) : board.rows.length === 0 ? (
          <div className="empty">아직 기록이 없어요. 첫 기록을 남겨 보세요!</div>
        ) : (
          <ol className="dino-board-list">
            {board.rows.map((r, i) => (
              <li key={r.user_id} className={`dino-board-row ${r.user_id === user?.id ? 'is-me' : ''}`}>
                <span className="dino-rank">{i + 1}</span>
                <Avatar src={r.avatar} name={r.name} size={28} />
                <span className="dino-name">{r.name}</span>
                <span className="dino-score">{r.best.toLocaleString('ko-KR')}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
