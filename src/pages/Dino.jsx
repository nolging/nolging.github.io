// 다이노 짬푸 — 크롬 오프라인 공룡 게임 클론(프리미엄 그룹 전용, 대기실 없이 혼자 플레이).
// 캔버스에 직접 픽셀아트(사각형 조합)로 그리고, requestAnimationFrame 루프로 물리/충돌을 계산한다.
// 판이 끝나면 서버(submit_dino_score)에 점수를 올리고, 게임오버 화면 가운데에 그룹 내
// 기록 순위(닉네임 + 점수)를 캔버스에 함께 그려 보여준다.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useOutletContext } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { isCoupleGroup, isFriendGroup, submitDinoScore, getDinoLeaderboard } from '../lib/api'

const FONT = "'Cafe24Proup', sans-serif"

// ---- 논리 좌표계: 가로(W)는 600 고정, 세로(H)·바닥선(groundY)은 실제 캔버스 크기에 맞춰
// 매 프레임 동적으로 계산한다 — 상단바를 제외한 화면 전체 높이를 하늘로 쓰기 위함. ----
const W = 600
const GROUND_MARGIN = 34   // 바닥선이 캔버스 맨 아래에서 얼마나 떨어져 있는지(고정 여백)

// ---- 물리/속도 ----
const GRAVITY = 0.0022          // px / ms^2
const JUMP_V = -0.62            // px / ms (음수 = 위)
const START_SPEED = 0.32        // px / ms
const MAX_SPEED = 0.62
const SPEED_ACCEL = 0.000006    // px/ms 당 가속
const NIGHT_EVERY = 700         // 점수 이 값만큼마다 낮/밤 전환
const PTERO_FROM_SCORE = 250    // 이 점수부터 익룡 등장

// ---- 다이노 본체 크기(논리 px) ----
const DINO_W = 44, DINO_H = 46
const DUCK_W = 54, DUCK_H = 24

function rr(x) { return Math.round(x) }

// 사각형 조합으로 그리는 픽셀아트 공룡(옆모습, 오른쪽을 보고 달림). x,y = 바운딩 박스 좌상단.
// 몸통은 위→아래로 폭이 계단식으로 변하는 "쌓기" 방식(겹치는 둥근 사각형 대신)이라 실루엣이
// 또렷하다. pose: 'idle'(양발 모으고 정지) | 'runA'(앞다리 듦) | 'runB'(뒷다리 듦) | 'duck' | 'dead'
// legPhase: duck 자세일 때 다리 교차 애니메이션에만 쓰임(runA/runB 는 pose 자체가 프레임을 지정).
function drawDino(ctx, x, y, { pose, legPhase, color }) {
  ctx.fillStyle = color
  x = rr(x); y = rr(y)

  if (pose === 'duck') {
    // 웅크린 자세: 낮고 긴 몸통 + 앞으로 뻗은 머리
    ctx.fillRect(x + 4, y + 8, 38, 12)        // 몸통
    ctx.fillRect(x + 36, y, 14, 10)           // 머리(앞으로 낮게)
    ctx.fillRect(x + 48, y + 3, 6, 4)         // 주둥이
    ctx.fillRect(x, y + 10, 6, 5)             // 꼬리
    ctx.fillStyle = '#fff'; ctx.fillRect(x + 41, y + 2, 3, 3)
    ctx.fillStyle = '#535353'; ctx.fillRect(x + 42, y + 3, 2, 2)
    ctx.fillStyle = color
    ctx.fillRect(x + (legPhase ? 10 : 24), y + 20, 6, 4)
    ctx.fillRect(x + (legPhase ? 24 : 10), y + 20, 6, 4)
    return
  }

  // ---- 머리~목~등~몸통을 위에서 아래로 계단식으로 쌓아 완만한 곡선 실루엣을 만든다 ----
  ctx.fillRect(x + 24, y, 8, 4)          // 정수리
  ctx.fillRect(x + 20, y + 4, 14, 4)     // 머리 위쪽
  ctx.fillRect(x + 18, y + 8, 18, 5)     // 머리(눈 높이)
  ctx.fillRect(x + 14, y + 13, 14, 4)    // 목
  ctx.fillRect(x + 10, y + 17, 20, 4)    // 등 시작
  ctx.fillRect(x + 6, y + 21, 28, 7)     // 몸통(가장 넓은 부분)
  ctx.fillRect(x + 8, y + 28, 22, 5)     // 몸통 아래(다리로 이어짐)

  // ---- 주둥이(머리보다 오른쪽·아래로 튀어나와 턱선을 표현) ----
  ctx.fillRect(x + 34, y + 9, 8, 5)
  // ---- 눈 ----
  ctx.fillStyle = '#fff'; ctx.fillRect(x + 23, y + 9, 3, 3)
  ctx.fillStyle = '#535353'; ctx.fillRect(x + 24, y + 10, 2, 2)
  ctx.fillStyle = color

  // ---- 앞다리(짧은 팔 하나) — 가슴 앞쪽으로 또렷하게 튀어나오게 ----
  ctx.fillRect(x + 28, y + 19, 8, 5)

  // ---- 꼬리(몸통 왼쪽 아래로 갈수록 좁아지는 계단식) ----
  ctx.fillRect(x + 4, y + 21, 8, 5)
  ctx.fillRect(x + 1, y + 26, 6, 5)
  ctx.fillRect(x, y + 30, 4, 4)

  if (pose === 'dead') {
    // 게임오버: 다리는 가만히 선 자세 + 눈 위에 X(배경색과 무관하게 보이도록 흰/검 눈 위에 반대 톤으로)
    ctx.fillRect(x + 12, y + 33, 8, 13)
    ctx.fillRect(x + 22, y + 33, 8, 13)
    ctx.fillRect(x + 10, y + 44, 4, 2)
    ctx.fillRect(x + 28, y + 44, 4, 2)
    ctx.strokeStyle = color === '#535353' ? '#fff' : '#535353'
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.moveTo(x + 23, y + 9); ctx.lineTo(x + 26, y + 12)
    ctx.moveTo(x + 26, y + 9); ctx.lineTo(x + 23, y + 12)
    ctx.stroke()
    return
  }

  // ---- 다리: idle(양발 모음) / runA(앞다리 듦) / runB(뒷다리 듦) ----
  if (pose === 'runA') {
    ctx.fillRect(x + 12, y + 33, 8, 13)       // 뒷다리(땅 딛음)
    ctx.fillRect(x + 23, y + 29, 9, 9)        // 앞다리(듦)
    ctx.fillRect(x + 10, y + 44, 4, 2)        // 뒷발 발가락
  } else if (pose === 'runB') {
    ctx.fillRect(x + 22, y + 33, 8, 13)       // 앞다리(땅 딛음)
    ctx.fillRect(x + 11, y + 29, 9, 9)        // 뒷다리(듦)
    ctx.fillRect(x + 28, y + 44, 4, 2)        // 앞발 발가락
  } else {
    ctx.fillRect(x + 12, y + 33, 8, 13)       // idle: 양발 모음
    ctx.fillRect(x + 22, y + 33, 8, 13)
    ctx.fillRect(x + 10, y + 44, 4, 2)
    ctx.fillRect(x + 28, y + 44, 4, 2)
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
  const { isAdmin } = useAuth()
  const { setHeaderBg, setDinoNight } = useOutletContext()
  const canvasRef = useRef(null)
  const rafRef = useRef(0)
  // 캔버스 실제 크기에서 계산한 논리 높이/바닥선(리렌더 없이 매 프레임 참조).
  const dimsRef = useRef({ scale: 1, H: 400, groundY: 400 - GROUND_MARGIN })

  const [gate, setGate] = useState('checking')  // checking | blocked | ok
  const [phase, setPhase] = useState('ready')    // ready | running | over
  const [night, setNight] = useState(false)      // 상단바까지 까맣게 하기 위해 리액트 상태로도 들고 있음

  // 게임 내부 상태는 매 프레임 바뀌므로 ref 로(리렌더 없이 캔버스에만 반영)
  const st = useRef(null)
  const phaseRef = useRef('ready')
  useEffect(() => { phaseRef.current = phase }, [phase])
  const myBestRef = useRef(0)
  const boardRowsRef = useRef([])   // 게임오버 화면 가운데에 그릴 그룹 순위(닉네임+점수)
  const nightRef = useRef(false)

  // 밤 모드(700점마다 반전)일 땐 캔버스뿐 아니라 상단바까지 화면 전체가 까맣게.
  // setHeaderBg 는 상단바 배경을, setDinoNight(→ .dino-night 클래스) 는 그 위 글자·아이콘 색을 뒤집는다.
  useEffect(() => {
    setHeaderBg(night ? '#202124' : null)
    setDinoNight(night)
    return () => { setHeaderBg(null); setDinoNight(false) }
  }, [night, setHeaderBg, setDinoNight])

  const loadBoard = useCallback(async () => {
    try {
      const b = await getDinoLeaderboard(groupId)
      myBestRef.current = b?.my_best || 0
      boardRowsRef.current = (b?.rows || []).slice(0, 8)
    } catch { /* noop */ }
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
    const { groundY } = dimsRef.current
    st.current = {
      y: groundY - DINO_H, vy: 0, duck: false, onGround: true,
      speed: START_SPEED, distance: 0, score: 0, legPhase: false, legTimer: 0,
      obstacles: [], nextGapPx: 260, clouds: [{ x: 480, y: 30 }, { x: 300, y: 55 }],
      wingUp: false, wingTimer: 0, holdDuck: false,
    }
  }, [])

  const restart = useCallback(() => {
    resetState()
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

  // ---- 판 종료: 서버 제출 + 게임오버 화면에 그릴 그룹 순위 갱신 ----
  const finish = useCallback(async (score) => {
    setPhase('over')
    if (score <= 0 || !groupId) return
    try { await submitDinoScore(groupId, score) } catch { /* noop */ }
    loadBoard()
  }, [groupId, loadBoard])

  // ---- 게임 루프 ----
  // gate 가 'ok' 로 바뀌기 전엔 <canvas> 가 아직 렌더되지 않아 canvasRef.current 가 null.
  // gate 를 의존성에 넣지 않으면 그 순간 이 effect 가 조용히 아무것도 안 하고 끝나버리고,
  // 다시 실행할 계기가 없어 캔버스가 영원히 빈 채로 남는다 — gate 를 넣어 canvas 가 실제로
  // 생긴 시점에 반드시 한 번 더 돌게 한다. myBest/night 는 ref 로만 읽어 루프가 점수
  // 갱신 때마다 재시작되지 않게 한다.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || gate !== 'ok') return
    const ctx = canvas.getContext('2d')

    // 캔버스 표시 크기(부모 flex 가 정하는 실제 폭/높이)에 맞춰 비트맵 해상도와 논리 좌표계를
    // 다시 계산한다. 가로 논리폭은 항상 600 으로 고정하고, 세로(H)만 화면에 맞게 늘어난다.
    const resize = () => {
      const cw = canvas.clientWidth, ch = canvas.clientHeight
      if (!cw || !ch) return
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.round(cw * dpr)
      canvas.height = Math.round(ch * dpr)
      const scale = canvas.width / W
      const H = canvas.height / scale
      dimsRef.current = { scale, H, groundY: H - GROUND_MARGIN }
      ctx.setTransform(scale, 0, 0, scale, 0, 0)
      ctx.imageSmoothingEnabled = false
      // 화면 회전 등으로 바닥 위치가 바뀌면, 서 있는(웅크리지 않은) 다이노를 새 바닥에 맞춰 스냅.
      if (st.current?.onGround && !st.current.duck) st.current.y = dimsRef.current.groundY - DINO_H
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    let last = performance.now()

    const spawnObstacle = (s) => {
      const { groundY } = dimsRef.current
      const usePtero = s.score >= PTERO_FROM_SCORE && Math.random() < 0.28
      if (usePtero) {
        const off = PTERO_Y_OFFSETS[Math.floor(Math.random() * PTERO_Y_OFFSETS.length)]
        s.obstacles.push({ type: 'ptero', x: W + 10, w: 46, h: 34, y: groundY - 40 + off })
      } else {
        const n = Math.floor(Math.random() * CACTUS_DEFS.length)
        const def = CACTUS_DEFS[n]
        s.obstacles.push({ type: 'cactus', x: W + 10, w: def.w, h: def.h, y: groundY - def.h })
      }
      const minGap = 180 + s.speed * 220
      s.nextGapPx = minGap + Math.random() * 220
    }

    const step = (now) => {
      const dt = Math.min(40, now - last)
      last = now
      const { H, groundY } = dimsRef.current
      const s = st.current
      if (phaseRef.current === 'running' && s && !s.over) {
        s.speed = Math.min(MAX_SPEED, s.speed + SPEED_ACCEL * dt)
        s.distance += s.speed * dt
        s.score = Math.floor(s.distance / 8)

        // 물리
        if (!s.onGround) {
          s.vy += GRAVITY * dt
          s.y += s.vy * dt
          if (s.y >= groundY - DINO_H) { s.y = groundY - DINO_H; s.vy = 0; s.onGround = true; s.duck = s.holdDuck }
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
        for (const c of s.clouds) {
          c.x -= s.speed * dt * 0.25
          if (c.x < -50) { c.x = W + Math.random() * 60; c.y = 20 + Math.random() * Math.max(40, H * 0.4) }
        }

        // 충돌(약간 여유를 준 히트박스). 웅크리면 키가 줄어들지만 s.y 는 "서 있을 때" 기준
        // top 이라 그대로 쓰면 발이 땅에서 떠 보인다 — 웅크릴 때는 항상 땅에 붙어 있으므로
        // (점프 중엔 duck 이 true 가 될 수 없음) 바닥(groundY) 기준으로 top 을 다시 잡는다.
        const dw = s.duck ? DUCK_W : DINO_W, dh = s.duck ? DUCK_H : DINO_H
        const dTop = s.duck ? groundY - DUCK_H : s.y
        const inset = 6
        const dx0 = 30 + inset, dx1 = 30 + dw - inset, dy0 = dTop + inset, dy1 = dTop + dh - inset
        for (const o of s.obstacles) {
          const ox0 = o.x + 4, ox1 = o.x + o.w - 4, oy0 = o.y + 3, oy1 = o.y + o.h - 3
          if (dx0 < ox1 && dx1 > ox0 && dy0 < oy1 && dy1 > oy0) { s.over = true; finish(s.score); break }
        }
      }

      // ---- 렌더 ----
      const s2 = st.current
      const isNight = !!s2 && Math.floor(s2.score / NIGHT_EVERY) % 2 === 1
      if (isNight !== nightRef.current) { nightRef.current = isNight; setNight(isNight) }
      const fg = isNight ? '#f7f7f7' : '#535353'
      ctx.clearRect(0, 0, W, H)
      // 낮에는 배경을 채우지 않아 페이지 배경 위에서 그대로 플레이되게(흰 박스 없음).
      // 밤에는 반전 연출을 위해 캔버스+상단바(headerBg) 모두 어두운 배경을 채운다.
      if (isNight) { ctx.fillStyle = '#202124'; ctx.fillRect(0, 0, W, H) }

      if (s2) {
        for (const c of s2.clouds) drawCloud(ctx, c.x, c.y, isNight ? '#3a3a3d' : '#e0e0e0')
        // 바닥선 + 점선 텍스처
        ctx.fillStyle = fg
        ctx.fillRect(0, groundY, W, 2)
        const dashOffset = Math.floor(s2.distance / 3) % 24
        for (let x = -dashOffset; x < W; x += 24) ctx.fillRect(x, groundY, 12, 2)

        for (const o of s2.obstacles) {
          if (o.type === 'cactus') drawCactus(ctx, o.x, o.y, o.w, o.h, fg)
          else drawPtero(ctx, o.x, o.y, s2.wingUp, fg)
        }

        {
          const dead = phaseRef.current === 'over'
          const moving = phaseRef.current === 'running' && s2.onGround
          const pose = dead ? 'dead' : s2.duck ? 'duck' : moving ? (s2.legPhase ? 'runA' : 'runB') : 'idle'
          const drawY = s2.duck ? groundY - DUCK_H : s2.y
          drawDino(ctx, 30, drawY, { pose, legPhase: s2.legPhase, color: fg })
        }

        // 점수(우상단, 등폭 숫자)
        ctx.fillStyle = fg
        ctx.font = `700 38px ${FONT}`
        ctx.textAlign = 'right'
        ctx.textBaseline = 'top'
        const hi = Math.max(myBestRef.current || 0, s2.score)
        ctx.fillText(`HI ${String(hi).padStart(5, '0')}  ${String(s2.score).padStart(5, '0')}`, W - 12, 16)

        if (phaseRef.current === 'ready') {
          ctx.textAlign = 'center'
          ctx.font = `800 32px ${FONT}`
          ctx.fillText('탭하거나 스페이스바로 시작', W / 2, H / 2 - 18)
        }
        if (phaseRef.current === 'over') {
          const rows = boardRowsRef.current || []
          const rowH = 36, titleH = 64, gapAfterTitle = 26, gapAfterList = 30, promptH = 32
          const listH = rows.length * rowH
          const totalH = titleH + (rows.length ? gapAfterTitle + listH : 0) + gapAfterList + promptH
          let y = H / 2 - totalH / 2

          ctx.textAlign = 'center'
          ctx.font = `900 52px ${FONT}`
          ctx.fillText('GAME OVER', W / 2, y)
          y += titleH

          if (rows.length) {
            y += gapAfterTitle
            ctx.font = `700 27px ${FONT}`
            for (let i = 0; i < rows.length; i++) {
              const r = rows[i]
              ctx.textAlign = 'left'
              ctx.fillText(`${i + 1}. ${r.name}`, W / 2 - 160, y)
              ctx.textAlign = 'right'
              ctx.fillText(String(r.best), W / 2 + 160, y)
              y += rowH
            }
          }

          y += gapAfterList
          ctx.textAlign = 'center'
          ctx.font = `800 28px ${FONT}`
          ctx.fillText('탭해서 다시 시작', W / 2, y)
        }
      }

      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => { cancelAnimationFrame(rafRef.current); ro.disconnect() }
  }, [finish, gate])

  const onPointerDown = (e) => {
    e.preventDefault()
    doJump()
  }

  if (gate === 'checking') return <div className="page"><div className="spinner" /></div>
  if (gate === 'blocked') return <div className="page"><div className="empty">프리미엄 그룹(커플·우정)에서만 플레이할 수 있어요.</div></div>

  return (
    <div className="dino-page" style={night ? { background: '#202124' } : undefined}>
      <canvas ref={canvasRef} className="dino-canvas" onPointerDown={onPointerDown} />
      <div className="dino-controls">
        <button type="button" className="dino-btn dino-btn-jump" onPointerDown={(e) => { e.preventDefault(); doJump() }}>JUMP</button>
        <button type="button" className="dino-btn dino-btn-duck"
          onPointerDown={(e) => { e.preventDefault(); setDuck(true) }}
          onPointerUp={() => setDuck(false)}
          onPointerLeave={() => setDuck(false)}>DOWN</button>
      </div>
    </div>
  )
}
