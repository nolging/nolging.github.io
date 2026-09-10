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
const GROUND_MARGIN = 70   // 바닥선이 캔버스 맨 아래에서 얼마나 떨어져 있는지(고정 여백) — 살짝 위로

// 바닥선 아래 모래 질감(짧은 마크를 불규칙한 폭·간격으로 반복) — 한 주기(GROUND_SAND_CYCLE)
// 안에서 크기가 제각각인 마크를 배치해 자연스러운 자갈/모래처럼 보이게 한다.
const GROUND_SAND_PATTERN = [
  { start: 3, w: 3 }, { start: 13, w: 6 }, { start: 25, w: 2 },
  { start: 34, w: 4 }, { start: 46, w: 2 }, { start: 54, w: 3 },
]
const GROUND_SAND_CYCLE = 64

// 공룡/장애물/구름 픽셀아트를 그릴 때 원래 좌표(아래 draw* 함수들의 fillRect 오프셋) 위에
// 곱해 그리는 배율 — 히트박스(DINO_W 등)·물리 상수는 이 배율에 맞춰 함께 2배로 스케일했다.
const SPRITE_SCALE = 2

// ---- 물리/속도 ----
// 점프 정점 높이(v²/2g)는 스프라이트와 같은 배율(SPRITE_SCALE)로 커야 장애물 높이와 맞는다.
// v0·g0(스케일 전 원래 값)를 그대로 SPRITE_SCALE 배 하면(k=1) 정점까지 걸리는 시간이 원래와
// 같아 상승이 가장 스냅있지만, 실측해 보니 가장 큰 장애물을 넘을 수 있는 점프 타이밍 여유가
// 너무 좁았다(약 90ms). 시간을 2배(k=2)로 늘리면 여유는 충분해지지만 상승이 "너무 느리게"
// 느껴졌고, 1.4배(약 280ms 여유)도 여전히 좀 더 빠르게 해 달라는 피드백을 받아 1.25배로
// 다시 낮췄다(여유 약 200ms — v→v0·S/k, g→g0·S/k² 로 스케일하면 높이(v²/2g)는 그대로,
// 시간(v/g)만 k배가 된다). 떨어질 때는 더 큰 중력(GRAVITY_DOWN)을 따로 적용해 하강만 더
// 빠르고 경쾌하게.
const GRAVITY_UP = (0.0022 * SPRITE_SCALE) / 1.25 ** 2   // px / ms^2
const GRAVITY_DOWN = GRAVITY_UP * 2                       // px / ms^2 — 하강은 더 빠르게
const JUMP_V = (-0.62 * SPRITE_SCALE) / 1.25   // px / ms (음수 = 위)
const START_SPEED = 0.48        // px / ms — 초반이 너무 느리다는 피드백으로 상향(기존 0.32)
const MAX_SPEED = 0.93
const SPEED_ACCEL = 0.000009    // px/ms 당 가속
const NIGHT_EVERY = 700         // 점수 이 값만큼마다 낮/밤 전환
const PTERO_FROM_SCORE = 250    // 이 점수부터 익룡 등장

// ---- 다이노 본체 크기(논리 px, SPRITE_SCALE 반영) ----
// DUCK_W/DUCK_H 는 duck 비트맵이 정의된 뒤(아래)에 그 크기로부터 구한다.
const DINO_W = 44 * SPRITE_SCALE, DINO_H = 46 * SPRITE_SCALE

function rr(x) { return Math.round(x) }
// 내부 좌표가 고정 리터럴인 픽셀아트 함수(drawDino/drawPtero/drawCloud)를 SPRITE_SCALE 배로
// 그린다 — (x,y) 는 그대로 두고 그 지점을 원점 삼아 확대하므로 좌상단 기준 크기만 커진다.
function drawScaled(ctx, x, y, fn) {
  ctx.save()
  ctx.translate(rr(x), rr(y))
  ctx.scale(SPRITE_SCALE, SPRITE_SCALE)
  fn()
  ctx.restore()
}

// [0,totalW) 구간에 가로띠를 그리되 gaps([gx0,gx1] 목록)에 해당하는 부분은 비워 둔다 —
// 바닥선/모래가 공룡 다리나 선인장 줄기 밑을 그대로 지나지 않고 양옆에 공백이 보이게 한다.
function fillRectGapped(ctx, y, h, totalW, gaps) {
  let x = 0
  for (const [gx0, gx1] of gaps.slice().sort((a, b) => a[0] - b[0])) {
    const cgx0 = Math.max(0, gx0), cgx1 = Math.min(totalW, gx1)
    if (cgx1 <= x) continue
    if (cgx0 > x) ctx.fillRect(x, y, cgx0 - x, h)
    x = Math.max(x, cgx1)
  }
  if (x < totalW) ctx.fillRect(x, y, totalW - x, h)
}

// 정지/달리기 자세 전용 20×22 비트맵(1=칠함, 0=빈칸). 머리~몸통~꼬리(0~17행)는 세 자세 모두
// 동일하고, 다리(18~21행)만 다르다 — idle: 양발 모음 / runA: 오른쪽(앞)다리 듦 / runB: 왼쪽(뒤)다리 듦.
const DINO_POSE_BITMAPS = {
  idle: [
    '00000000000111111110',
    '00000000001111111111',
    '00000000001101111111',
    '00000000001111111111',
    '00000000001111111111',
    '00000000001111111111',
    '00000000001111100000',
    '00000000001111111100',
    '10000000011111000000',
    '10000000111111000000',
    '11000011111111110000',
    '11100111111111010000',
    '11111111111111000000',
    '11111111111111000000',
    '01111111111111000000',
    '00111111111110000000',
    '00011111111100000000',
    '00001111111000000000',
    '00000111011000000000',
    '00000110001000000000',
    '00000100001000000000',
    '00000110001100000000',
  ],
  runA: [
    '00000000000111111110',
    '00000000001111111111',
    '00000000001101111111',
    '00000000001111111111',
    '00000000001111111111',
    '00000000001111111111',
    '00000000001111100000',
    '00000000001111111100',
    '10000000011111000000',
    '10000000111111000000',
    '11000011111111110000',
    '11100111111111010000',
    '11111111111111000000',
    '11111111111111000000',
    '01111111111111000000',
    '00111111111110000000',
    '00011111111100000000',
    '00001111111000000000',
    '00000111001110000000',
    '00000110000000000000',
    '00000100000000000000',
    '00000110000000000000',
  ],
  runB: [
    '00000000000111111110',
    '00000000001111111111',
    '00000000001101111111',
    '00000000001111111111',
    '00000000001111111111',
    '00000000001111111111',
    '00000000001111100000',
    '00000000001111111100',
    '10000000011111000000',
    '10000000111111000000',
    '11000011111111110000',
    '11100111111111010000',
    '11111111111111000000',
    '11111111111111000000',
    '01111111111111000000',
    '00111111111110000000',
    '00011111111100000000',
    '00001111111000000000',
    '00000110011000000000',
    '00000011001000000000',
    '00000000001000000000',
    '00000000001100000000',
  ],
  duck: [
    '100000000000000000111111110',
    '111000011111111001111111111',
    '111111111111111111101111111',
    '011111111111111111111111111',
    '001111111111111111111111111',
    '000111111111111111111111111',
    '000011111111111111111100000',
    '000001111111111100111111100',
    '000000111111001000000000000',
    '000001001110001100000000000',
    '000001101100000000000000000',
    '000000001000000000000000000',
    '000000001100000000000000000',
  ],
}
const DINO_BITMAP_PX = 2   // 격자 한 칸의 논리 픽셀 크기(20x22 → 40x44)
const GRID_CELL = DINO_BITMAP_PX * SPRITE_SCALE   // 격자 한 칸의 world 단위 크기(바닥 공백 폭 기준)
// 비트맵 실제 렌더 높이(SPRITE_SCALE 반영, world 단위) — 다리 부분이 비어 있는 칸이 많아
// DINO_H(히트박스 높이)보다 살짝 작다. 바닥에 닿았을 때 이 차이만큼 뜨는 걸 막고, 참고 이미지처럼
// 발이 바닥선보다 살짝 아래로 내려서 그린다.
const DINO_SPRITE_H = DINO_POSE_BITMAPS.idle.length * DINO_BITMAP_PX * SPRITE_SCALE
const GROUND_OVERLAP = 6      // world 단위 — 공룡이 바닥선과 겹치는 정도
const CACTUS_GROUND_OVERLAP = 6   // world 단위 — 선인장이 바닥선과 겹치는 정도
// duck 비트맵 크기(world 단위) — idle/runA/runB 와 같은 방식으로 히트박스도 비트맵 크기에서 구한다.
const DUCK_W = DINO_POSE_BITMAPS.duck[0].length * DINO_BITMAP_PX * SPRITE_SCALE
const DUCK_H = DINO_POSE_BITMAPS.duck.length * DINO_BITMAP_PX * SPRITE_SCALE

// 비트맵의 다리 행(아래에서 rowsFromBottom 번째 행부터 끝까지)에서 실제로 칠해진 칸의
// 최소~최대 열 index를 찾는다 — 바닥선을 "다리 양옆 몇 칸"만큼만 비워 그릴 때 그 다리가
// 정확히 어디 있는지 알아야 하기 때문.
function legColRange(bitmap, rowsFromBottom) {
  let min = Infinity, max = -Infinity
  for (let r = bitmap.length - rowsFromBottom; r < bitmap.length; r++) {
    const row = bitmap[r]
    for (let c = 0; c < row.length; c++) {
      if (row[c] === '1') { if (c < min) min = c; if (c > max) max = c }
    }
  }
  return { min, max }
}
const DINO_LEG_COL_RANGE = {
  idle: legColRange(DINO_POSE_BITMAPS.idle, 4),
  runA: legColRange(DINO_POSE_BITMAPS.runA, 4),
  runB: legColRange(DINO_POSE_BITMAPS.runB, 4),
  duck: legColRange(DINO_POSE_BITMAPS.duck, 5),
}
const DINO_LEG_GAP_PAD = 2 * GRID_CELL    // 다리 양옆으로 비울 여백 — 2칸
const CACTUS_GAP_PAD = 1 * GRID_CELL      // 선인장 줄기 양옆으로 비울 여백 — 1칸

// 격자를 칸별로 fillRect 하면 메인 캔버스의 소수점 스케일(디바이스 배율×SPRITE_SCALE) 때문에
// 칸 사이에 미세한 틈(격자 선)이 보인다. 그래서 실제 픽셀 크기(20×22)의 오프스크린 캔버스에
// 딱 한 번 그려두고, 화면엔 그 이미지를 통째로 drawImage 로 확대해 붙인다 — 이러면 이어진
// 하나의 이미지로 렌더되고, image-rendering 설정(픽셀아트 크리스프 확대)도 그대로 적용된다.
const dinoBitmapCache = new Map()
function getDinoBitmapCanvas(pose, color) {
  const key = pose + ':' + color
  let c = dinoBitmapCache.get(key)
  if (c) return c
  const bitmap = DINO_POSE_BITMAPS[pose]
  const w = bitmap[0].length, h = bitmap.length
  c = document.createElement('canvas')
  c.width = w; c.height = h
  const cx = c.getContext('2d')
  cx.fillStyle = color
  for (let r = 0; r < h; r++) {
    const row = bitmap[r]
    let runStart = -1
    for (let col = 0; col <= row.length; col++) {
      const on = col < row.length && row[col] === '1'
      if (on && runStart === -1) runStart = col
      else if (!on && runStart !== -1) { cx.fillRect(runStart, r, col - runStart, 1); runStart = -1 }
    }
  }
  dinoBitmapCache.set(key, c)
  return c
}

function drawDinoBitmapPose(ctx, x, y, pose, color) {
  x = rr(x); y = rr(y)
  const bmp = getDinoBitmapCanvas(pose, color)
  ctx.drawImage(bmp, x, y, bmp.width * DINO_BITMAP_PX, bmp.height * DINO_BITMAP_PX)
}

// 픽셀아트 공룡(옆모습, 오른쪽을 보고 달림) — idle/runA/runB/duck 네 자세 모두 비트맵으로
// 그린다. 게임오버는 별도 자세 없이 충돌 순간의 자세(물리가 멈추므로 자연히 그 프레임 그대로
// 고정됨)를 그대로 보여준다.
function drawDino(ctx, x, y, { pose, color }) {
  drawDinoBitmapPose(ctx, x, y, pose, color)
}

// 선인장 줄기의 x 범위(바닥선에 닿는 부분) — 바닥 렌더링에서 이 구간만큼 선을 비워 그리는 데도
// 같이 쓰기 때문에 drawCactus 와 별도 함수로 뺐다(둘이 어긋나지 않도록).
function cactusStemBounds(x, w) {
  x = rr(x)
  const stemW = Math.max(5, Math.round(w * 0.24))
  const stemX = x + Math.round((w - stemW) / 2)
  return { stemX, stemW }
}

// 참고 이미지처럼 줄기 옆에서 뻗어 나와 위로 꺾이는 "갈고리" 모양 팔 두 개(왼쪽은 아래쪽에서
// 낮게, 오른쪽은 위쪽에서 높게) — 실제 사구아로 선인장 실루엣에 가깝게.
function drawCactus(ctx, x, y, w, h, color) {
  ctx.fillStyle = color
  x = rr(x); y = rr(y)
  const { stemX, stemW } = cactusStemBounds(x, w)
  ctx.fillRect(stemX, y, stemW, h)
  if (w > stemW + 8) {
    const nub = Math.max(3, Math.round(stemW * 0.6))       // 팔 두께
    const armLen = Math.max(4, Math.round(stemW * 0.7))    // 줄기에서 옆으로 뻗는 길이
    const upLen = Math.round(h * 0.24)                      // 꺾여서 위로 이어지는 길이
    // 왼쪽 팔: 줄기 아래쪽에서 왼쪽으로 뻗은 뒤 위로 꺾임
    const lY = y + Math.round(h * 0.42)
    ctx.fillRect(stemX - armLen, lY, armLen + 2, nub)
    ctx.fillRect(stemX - armLen, lY - upLen, nub, upLen + nub)
    // 오른쪽 팔: 줄기 위쪽에서 오른쪽으로 뻗은 뒤 위로 꺾임
    const rY = y + Math.round(h * 0.18)
    ctx.fillRect(stemX + stemW - 2, rY, armLen + 2, nub)
    ctx.fillRect(stemX + stemW + armLen - nub - 2, rY - upLen, nub, upLen + nub)
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

// 가로로 넓은 밑단 위에 높이가 다른 뭉치 두 개를 비대칭으로 얹어 뭉게구름처럼 보이게 한다.
function drawCloud(ctx, x, y, color) {
  ctx.fillStyle = color
  x = rr(x); y = rr(y)
  ctx.fillRect(x, y + 7, 36, 5)
  ctx.fillRect(x + 3, y + 3, 18, 5)
  ctx.fillRect(x + 19, y, 13, 4)
}

// 장애물 정의(폭/높이/그라운드 기준 y, SPRITE_SCALE 반영). 익룡은 3가지 높이 중 하나로 등장.
const CACTUS_DEFS = [
  { w: 17, h: 35 }, { w: 34, h: 35 }, { w: 51, h: 35 },   // 작은 선인장 1~3개
  { w: 25, h: 47 }, { w: 50, h: 47 },                      // 큰 선인장 1~2개
].map((d) => ({ w: d.w * SPRITE_SCALE, h: d.h * SPRITE_SCALE }))
const PTERO_Y_OFFSETS = [0, -34 * SPRITE_SCALE, -68 * SPRITE_SCALE]   // 그라운드 기준(낮음=점프 필요) ~ 높음(그냥 지나감)

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
      obstacles: [], nextGapPx: 260,
      // 구름은 하늘 위쪽이 아니라 땅에 가까운 아래쪽에(바닥선의 45~80%쯤) 뜨게.
      clouds: [{ x: 480, y: groundY * 0.5 }, { x: 300, y: groundY * 0.68 }],
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
        s.obstacles.push({ type: 'ptero', x: W + 10, w: 46 * SPRITE_SCALE, h: 34 * SPRITE_SCALE, y: groundY - 40 * SPRITE_SCALE + off })
      } else {
        const n = Math.floor(Math.random() * CACTUS_DEFS.length)
        const def = CACTUS_DEFS[n]
        s.obstacles.push({ type: 'cactus', x: W + 10, w: def.w, h: def.h, y: groundY - def.h + CACTUS_GROUND_OVERLAP })
      }
      // 장애물이 커진 만큼 간격도 같은 배율로 넓혀야 상대적인 여유가 그대로 유지된다.
      const minGap = (180 + s.speed * 220) * SPRITE_SCALE
      s.nextGapPx = minGap + Math.random() * 220 * SPRITE_SCALE
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

        // 물리 — 올라갈 땐 느린 중력, 떨어질 땐 빠른 중력(하강이 경쾌하게 느껴지도록)
        if (!s.onGround) {
          s.vy += (s.vy < 0 ? GRAVITY_UP : GRAVITY_DOWN) * dt
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

        // 구름 — 하늘 위쪽이 아니라 땅에 가까운 아래쪽(바닥선의 45~80%쯤)에 뜨게.
        for (const c of s.clouds) {
          c.x -= s.speed * dt * 0.25
          if (c.x < -50 * SPRITE_SCALE) {
            c.x = W + Math.random() * 60
            c.y = groundY * 0.45 + Math.random() * (groundY * 0.35)
          }
        }

        // 충돌(약간 여유를 준 히트박스). 웅크리면 키가 줄어들지만 s.y 는 "서 있을 때" 기준
        // top 이라 그대로 쓰면 발이 땅에서 떠 보인다 — 웅크릴 때는 항상 땅에 붙어 있으므로
        // (점프 중엔 duck 이 true 가 될 수 없음) 바닥(groundY) 기준으로 top 을 다시 잡는다.
        const dw = s.duck ? DUCK_W : DINO_W, dh = s.duck ? DUCK_H : DINO_H
        const dTop = s.duck ? groundY - DUCK_H : s.y
        const inset = 6 * SPRITE_SCALE
        const dx0 = 30 + inset, dx1 = 30 + dw - inset, dy0 = dTop + inset, dy1 = dTop + dh - inset
        for (const o of s.obstacles) {
          const ox0 = o.x + 4 * SPRITE_SCALE, ox1 = o.x + o.w - 4 * SPRITE_SCALE, oy0 = o.y + 3 * SPRITE_SCALE, oy1 = o.y + o.h - 3 * SPRITE_SCALE
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
        for (const c of s2.clouds) {
          const cloudColor = isNight ? '#3a3a3d' : '#e0e0e0'
          drawScaled(ctx, c.x, c.y, () => drawCloud(ctx, 0, 0, cloudColor))
        }

        // 게임오버 시에는 별도 자세 없이 충돌 순간 그대로 멈춘 모습(물리 업데이트가 멈추므로
        // duck/onGround/legPhase 가 충돌 시점 값으로 고정돼 자연히 그 프레임이 유지된다).
        const moving = (phaseRef.current === 'running' || phaseRef.current === 'over') && s2.onGround
        const pose = s2.duck ? 'duck' : moving ? (s2.legPhase ? 'runA' : 'runB') : 'idle'

        // 바닥선이 공룡 다리(접지 중일 때)·선인장 줄기 밑을 그대로 지나지 않도록 그 구간만
        // 비워서 그린다 — 다리/줄기 양옆으로 딱 필요한 만큼만(다리는 2칸, 선인장은 1칸) 비워서
        // 참고 이미지처럼 바닥선과 살짝 떨어져 보이게 한다(비트맵 전체 폭을 비우면 너무 넓어짐).
        const groundGaps = []
        if (s2.onGround) {
          const range = DINO_LEG_COL_RANGE[pose]
          const gx0 = 30 + range.min * GRID_CELL - DINO_LEG_GAP_PAD
          const gx1 = 30 + (range.max + 1) * GRID_CELL + DINO_LEG_GAP_PAD
          groundGaps.push([gx0, gx1])
        }
        for (const o of s2.obstacles) {
          if (o.type !== 'cactus') continue
          const { stemX, stemW } = cactusStemBounds(o.x, o.w)
          groundGaps.push([stemX - CACTUS_GAP_PAD, stemX + stemW + CACTUS_GAP_PAD])
        }

        // 바닥선 + 모래 질감(선 아래에 크기가 다른 짧은 마크를 불규칙 간격으로 반복)
        ctx.fillStyle = fg
        fillRectGapped(ctx, groundY, 2 * SPRITE_SCALE, W, groundGaps)
        const sandY = groundY + 5 * SPRITE_SCALE
        const sandUnit = GROUND_SAND_CYCLE * SPRITE_SCALE
        const sandOffset = Math.floor(s2.distance / 3) % sandUnit
        for (let base = -sandOffset; base < W; base += sandUnit) {
          for (const m of GROUND_SAND_PATTERN) {
            const mx0 = base + m.start * SPRITE_SCALE, mx1 = mx0 + m.w * SPRITE_SCALE
            if (groundGaps.some(([g0, g1]) => mx1 > g0 && mx0 < g1)) continue
            ctx.fillRect(mx0, sandY, m.w * SPRITE_SCALE, 2)
          }
        }

        for (const o of s2.obstacles) {
          if (o.type === 'cactus') drawCactus(ctx, o.x, o.y, o.w, o.h, fg)
          else drawScaled(ctx, o.x, o.y, () => drawPtero(ctx, 0, 0, s2.wingUp, fg))
        }

        {
          // idle/runA/runB 비트맵은 히트박스(DINO_H)보다 살짝 낮아서, 히트박스 바닥
          // (s2.y+DINO_H, 접지 시 groundY)에 스프라이트 바닥을 맞추고 GROUND_OVERLAP 만큼 더
          // 내려 바닥선과 살짝 겹치게 한다. duck 은 비트맵 높이가 곧 DUCK_H 라 그대로 적용.
          const drawY = s2.duck ? groundY - DUCK_H + GROUND_OVERLAP : s2.y + DINO_H - DINO_SPRITE_H + GROUND_OVERLAP
          drawScaled(ctx, 30, drawY, () => drawDino(ctx, 0, 0, { pose, color: fg }))
        }

        // 점수(우상단, 등폭 숫자)
        ctx.fillStyle = fg
        ctx.font = `700 38px ${FONT}`
        ctx.textAlign = 'right'
        ctx.textBaseline = 'top'
        const hi = Math.max(myBestRef.current || 0, s2.score)
        ctx.fillText(`HI ${String(hi).padStart(5, '0')}  ${String(s2.score).padStart(5, '0')}`, W - 12, 16)

        // 대기 화면(ready)과 게임오버 화면(over) 모두 가운데에 "제목 + 그룹 순위 + 안내 문구"를
        // 같은 레이아웃으로 그린다. 대기 화면은 큰 로고("DINO JUMP")를, 게임오버는 결과 문구를 쓴다.
        if (phaseRef.current === 'ready' || phaseRef.current === 'over') {
          const isReady = phaseRef.current === 'ready'
          const rows = boardRowsRef.current || []
          const rowH = 36, titleH = isReady ? 76 : 64, gapAfterTitle = 26, gapAfterList = 30, promptH = 32
          const listH = rows.length * rowH
          const totalH = titleH + (rows.length ? gapAfterTitle + listH : 0) + gapAfterList + promptH
          let y = H / 2 - totalH / 2

          ctx.textAlign = 'center'
          ctx.font = `900 ${isReady ? 62 : 52}px ${FONT}`
          ctx.fillText(isReady ? 'DINO JUMP' : 'GAME OVER', W / 2, y)
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
          // 안내 문구는 0.6초 간격으로 깜빡이게.
          if (Math.floor(now / 600) % 2 === 0) {
            ctx.textAlign = 'center'
            ctx.font = `800 28px ${FONT}`
            ctx.fillText(isReady ? 'Tap to start' : 'Tap to retry', W / 2, y)
          }
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
