// 아바타 꾸미기 데코레이션. 아바타 원(지름=size) 위에 SVG viewBox(0~100)로 그려 항상 비율이 맞는다.
//  - head: deco-sprout(새싹·앞) | deco-jaguar(까만 고양이 귀·뒤) | deco-wolf(강아지 귀·뒤)  → 하나만
//  - face: deco-blush(양 볼 홍조·앞)
// 귀(jaguar/wolf)는 아바타 "뒤" 레이어(back)에 그려, 아랫부분이 둥근 아바타에 가려져 딱 맞게 보인다.
// 새싹·홍조는 "앞" 레이어(front).

export const DECO_HEAD = ['deco-sprout', 'deco-jaguar', 'deco-wolf']
export const DECO_FACE = ['deco-blush', 'deco-anger', 'deco-pixel-shades', 'deco-alien-shades']
export const DECO_IDS = [...DECO_HEAD, ...DECO_FACE]
export const decoSlot = (id) => (DECO_FACE.includes(id) ? 'face' : DECO_HEAD.includes(id) ? 'head' : null)
const isEars = (head) => head === 'deco-jaguar' || head === 'deco-wolf'

function Sprout() {
  // 줄기는 이파리 붙는 지점(1)까지만 + butt 캡 → 이파리 위로 튀어나오지 않음. 이파리도 더 작게.
  // 반짝임은 이파리 바깥(좌·우)으로 빼서 겹치지 않게.
  return (
    <g className="avd-sway">
      <g transform="translate(0,-4)">
        <path d="M50 13 C51.4 8 51.3 3 50 1" stroke="#5aa06a" strokeWidth="2.2" strokeLinecap="butt" fill="none" />
        <g transform="rotate(-28 50 1)">
          <path d="M50 1 C43 1 37 -5 34 -13 C42 -15 49 -8 50 1 Z" fill="#6bbd85" />
        </g>
        <g transform="rotate(28 50 1)">
          <path d="M50 1 C57 1 63 -5 66 -13 C58 -15 51 -8 50 1 Z" fill="#7ec994" />
        </g>
        <path className="avd-spark" d="M25 -13 l.9 2.6 l2.6 .9 l-2.6 .9 l-.9 2.6 l-.9 -2.6 l-2.6 -.9 l2.6 -.9 z" fill="#ffcb54" />
        <path className="avd-spark avd-spark-2" d="M75 -11 l.8 2.3 l2.3 .8 l-2.3 .8 l-.8 2.3 l-.8 -2.3 l-2.3 -.8 l2.3 -.8 z" fill="#ffcb54" />
        <path className="avd-spark avd-spark-3" d="M57 -18 l.7 2 l2 .7 l-2 .7 l-.7 2 l-.7 -2 l-2 -.7 l2 -.7 z" fill="#ffcb54" />
      </g>
    </g>
  )
}

function CatEars() {
  // 높이를 줄여 덜 뾰족하게(꼭지 -30 → -20)
  const ear = (
    <>
      <polygon points="12,30 27,-20 45,28" fill="#24222b" stroke="#24222b" strokeWidth="4" strokeLinejoin="round" />
      <polygon points="22,22 28,-5 35,20" fill="#f2a9c2" />
    </>
  )
  return (
    <>
      <g className="avd-twitch-l">{ear}</g>
      <g className="avd-twitch-r"><g transform="translate(100,0) scale(-1,1)">{ear}</g></g>
    </>
  )
}

function WolfEars() {
  // 귀 크기를 조금 축소(꼭지 -32 → -24, 폭도 소폭 축소)
  const ear = (
    <>
      <path d="M17 32 C11 11 16 -12 27 -16 C36 -4 43 13 45 30 C36 34 24 35 17 32 Z" fill="#726c7a" stroke="#726c7a" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M25 28 C21 12 25 -6 31 -10 C37 0 41 13 42 26 C35 29 29 29 25 28 Z" fill="#cfc9d6" />
    </>
  )
  return (
    <>
      <g className="avd-twitch-l">{ear}</g>
      <g className="avd-twitch-r"><g transform="translate(100,0) scale(-1,1)">{ear}</g></g>
    </>
  )
}

function Anger() {
  // 💢: 아바타 우측 상단에 둥근 곡선 호 네 개(회전 대칭). 둥근 부분이 안쪽(중심)을 향함. 살짝 커졌다 작아졌다(빠르게).
  const arc = 'M1.8 -5.8 Q2.6 -2.6 5.8 -1.8'
  return (
    <g transform="translate(81 18)">
      <g className="avd-anger">
        <g stroke="#e5484d" strokeWidth="1.5" strokeLinecap="round" fill="none">
          <path d={arc} />
          <path d={arc} transform="rotate(90)" />
          <path d={arc} transform="rotate(180)" />
          <path d={arc} transform="rotate(270)" />
        </g>
      </g>
    </g>
  )
}

function Blush() {
  // 양 볼: 넓은 홍조 + 시안처럼 가는 빗금(///)
  const cheek = (cx, rot) => (
    <g transform={`rotate(${rot} ${cx} 64)`}>
      <ellipse cx={cx} cy="64" rx="16" ry="10.5" fill="url(#avdBlush)" />
      <g stroke="#e0688f" strokeWidth="1.4" strokeLinecap="round" fill="none">
        <line x1={cx - 6} y1="67" x2={cx - 2} y2="60" />
        <line x1={cx - 2} y1="68" x2={cx + 2} y2="61" />
        <line x1={cx + 2} y1="67" x2={cx + 6} y2="60" />
      </g>
    </g>
  )
  return (
    <g className="avd-blush">
      <defs>
        <radialGradient id="avdBlush" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f58aaf" stopOpacity="0.72" />
          <stop offset="55%" stopColor="#f58aaf" stopOpacity="0.42" />
          <stop offset="100%" stopColor="#f58aaf" stopOpacity="0" />
        </radialGradient>
      </defs>
      {cheek(19, -8)}
      {cheek(81, 8)}
    </g>
  )
}

// 픽셀 선글라스: 왼쪽 알(10w) + 상단 브릿지(3) + 오른쪽 알(10w), 5행. F=검정 W=흰 .=빈칸
// (다리 없음. 사용자가 준 픽셀 도안 그대로)
const PIXEL_L = ['FFFFFFFFFF', 'FWFWFFFFFF', '.FWFWFFFFF', '..FWFWFFF.', '...FFFFF..']
const PIXEL_R = ['FFFFFFFFFF', 'WFWFFFFFFF', 'FWFWFFFFF.', '.FWFWFFF..', '..FFFFF...']
const PIXEL_BR = ['FFF', '...', '...', '...', '...']
const PIXEL_ROWS = PIXEL_L.map((l, i) => l + PIXEL_BR[i] + PIXEL_R[i])
const PIXEL_PX = 3.2, PIXEL_COLS = 23
const PIXEL_X0 = (100 - PIXEL_COLS * PIXEL_PX) / 2
const PIXEL_Y0 = 44 - (PIXEL_ROWS.length * PIXEL_PX) / 2

function PixelShades() {
  const cells = []
  PIXEL_ROWS.forEach((row, r) => {
    for (let c = 0; c < PIXEL_COLS; c++) {
      const ch = row[c]
      if (ch === '.') continue
      cells.push(
        <rect key={`${r}-${c}`} x={+(PIXEL_X0 + c * PIXEL_PX).toFixed(2)} y={+(PIXEL_Y0 + r * PIXEL_PX).toFixed(2)}
          width={PIXEL_PX} height={PIXEL_PX} fill={ch === 'W' ? '#ffffff' : '#17171b'} />,
      )
    }
  })
  return <g shapeRendering="crispEdges">{cells}</g>
}

// 럭비공(아몬드) 렌즈 path: 좌우로 뾰족, 위/아래 곡선
const almondPath = (l, r, b) => { const cx = (l + r) / 2; return `M${l} 45 Q${cx} ${45 - b} ${r} 45 Q${cx} ${45 + b} ${l} 45 Z` }

function AlienShades() {
  // 왹져(외계인) 선글라스: 럭비공(🏈) 모양 초록 테 + 검은 렌즈, 오른쪽=🏈·왼쪽=좌우반전. 다리/귀 없음.
  return (
    <g>
      <g transform="rotate(14 35 45)">
        <path d={almondPath(21, 49, 10)} fill="#35c14a" />
        <path d={almondPath(23.5, 46.5, 8)} fill="#141414" />
      </g>
      <g transform="rotate(-14 65 45)">
        <path d={almondPath(51, 79, 10)} fill="#35c14a" />
        <path d={almondPath(53.5, 76.5, 8)} fill="#141414" />
      </g>
      <path d="M46 44 Q50 41.5 54 44 Q50 47.5 46 44 Z" fill="#35c14a" />
      <circle cx="31" cy="43" r="1.7" fill="#fff" opacity="0.85" />
      <circle cx="61" cy="43" r="1.7" fill="#fff" opacity="0.85" />
    </g>
  )
}

// 상점/인벤토리 미리보기: 꾸미기 아이템만 크게. 단, 귀(고양이·강아지)는 아바타 원을 앞에 두어
// 실제 아바타처럼 아랫부분을 가림. 원 색은 귀 색과 동일(까만색/진한 회색).
const PREVIEW_VB = {
  'deco-sprout': '18 -27 64 44',
  'deco-jaguar': '8 -24 84 58',
  'deco-wolf': '12 -20 76 56',
  'deco-blush': '2 51 96 28',
  'deco-anger': '72 9 18 18',
  'deco-pixel-shades': '10 33 80 22',
  'deco-alien-shades': '16 28 68 34',
}
const EAR_CIRCLE = { 'deco-jaguar': '#24222b', 'deco-wolf': '#726c7a' }
export function DecoPreview({ id }) {
  const vb = PREVIEW_VB[id] || '0 0 100 100'
  const circle = EAR_CIRCLE[id]
  return (
    <svg className="deco-preview" viewBox={vb} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {id === 'deco-sprout' && <Sprout />}
      {id === 'deco-jaguar' && <CatEars />}
      {id === 'deco-wolf' && <WolfEars />}
      {id === 'deco-blush' && <Blush />}
      {id === 'deco-anger' && <Anger />}
      {id === 'deco-pixel-shades' && <PixelShades />}
      {id === 'deco-alien-shades' && <AlienShades />}
      {circle && <circle cx="50" cy="50" r="50" fill={circle} />}
    </svg>
  )
}

// layer: 'back'(귀 — 아바타 뒤) | 'front'(새싹·홍조 — 아바타 앞)
export default function AvatarDeco({ head, face, layer = 'front' }) {
  if (layer === 'back') {
    if (!isEars(head)) return null
    return (
      <svg className="avatar-deco avatar-deco-back" viewBox="0 0 100 100" width="100%" height="100%"
        preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        {head === 'deco-jaguar' && <CatEars />}
        {head === 'deco-wolf' && <WolfEars />}
      </svg>
    )
  }
  const hasFront = head === 'deco-sprout' || DECO_FACE.includes(face)
  if (!hasFront) return null
  return (
    <svg className="avatar-deco avatar-deco-front" viewBox="0 0 100 100" width="100%" height="100%"
      preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {head === 'deco-sprout' && <Sprout />}
      {face === 'deco-blush' && <Blush />}
      {face === 'deco-anger' && <Anger />}
      {face === 'deco-pixel-shades' && <PixelShades />}
      {face === 'deco-alien-shades' && <AlienShades />}
    </svg>
  )
}
