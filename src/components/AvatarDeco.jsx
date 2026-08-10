// 아바타 꾸미기 데코레이션. 아바타 원(지름=size) 위에 SVG viewBox(0~100)로 그려 항상 비율이 맞는다.
//  - head: deco-sprout(새싹·앞) | deco-jaguar(까만 고양이 귀·뒤) | deco-wolf(강아지 귀·뒤)
//    | deco-angel-ring(천사 링·앞) | deco-tomato(토마토 꼭지·앞) | deco-bunny(토끼 귀·뒤) | deco-bear(곰 귀·뒤) → 하나만
//  - face: deco-blush(양 볼 홍조) | deco-anger | deco-pixel-shades | deco-alien-shades | deco-bandage(오른 볼 반창고) | deco-gum(풍선껌) → 하나만
// 귀(jaguar/wolf/bunny/bear)는 아바타 "뒤" 레이어(back)에 그려, 아랫부분이 둥근 아바타에 가려져 딱 맞게 보인다.
// 새싹·홍조는 "앞" 레이어(front).

export const DECO_HEAD = ['deco-sprout', 'deco-jaguar', 'deco-wolf', 'deco-angel-ring', 'deco-tomato', 'deco-bunny', 'deco-bear']
export const DECO_FACE = ['deco-blush', 'deco-anger', 'deco-pixel-shades', 'deco-alien-shades', 'deco-bandage', 'deco-gum', 'deco-heart-shades']
export const DECO_IDS = [...DECO_HEAD, ...DECO_FACE]
export const decoSlot = (id) => (DECO_FACE.includes(id) ? 'face' : DECO_HEAD.includes(id) ? 'head' : null)

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

// 토마토(머리 유형): 빨간 몸통 없이 초록 꼭지(꽃받침)만 — 뾰족뾰족한 별 모양으로,
// 프로필 사진 윗부분에 살짝 겹치도록 짧게 늘어뜨린다.
function Tomato() {
  return (
    <g transform="translate(50 0)">
      <path fill="#53C257" d="M5.02 -8.02 C3.32 -7.01 1.62 -4.51 1.18 -2.45 L0.97 -1.5 L0.22 -2.24 C-0.16 -2.63 -0.97 -3.17 -1.53 -3.41 C-2.87 -3.97 -6.36 -3.91 -8.95 -3.29 C-11.27 -2.72 -11.92 -2.04 -10.17 -2.04 C-9.48 -2.04 -8.35 -1.65 -7.25 -1.08 L-5.46 -0.1 L-7.64 0.26 C-8.86 0.46 -10.26 0.79 -10.76 0.97 C-11.87 1.42 -17.16 4.81 -17.16 5.08 C-17.16 5.17 -14.93 5.26 -12.16 5.26 C-6.92 5.26 -5.28 5.47 -5.79 6.09 C-6.65 7.19 -7.7 12.58 -7.13 12.94 C-6.95 13.06 -6.33 12.4 -5.76 11.54 C-4.93 10.29 -4.12 9.58 -2.22 8.41 C-0.88 7.58 0.46 6.9 0.76 6.9 C1.5 6.9 5.7 11.15 6.74 12.94 C7.93 15.05 8.26 14.58 8.02 10.95 C7.93 9.28 7.76 7.46 7.67 6.87 L7.49 5.79 L10.2 5.44 C12.94 5.05 16.12 5.2 17.16 5.73 C18.24 6.33 17.67 4.87 16.36 3.71 C14.22 1.83 11.84 0.55 10.23 0.4 C9.39 0.35 8.74 0.17 8.74 0.05 C8.74 -0.43 11.18 -2.36 12.01 -2.54 C14.1 -2.93 12.34 -3.82 9.48 -3.82 C7.37 -3.82 5.05 -3.08 3.47 -1.86 C2.96 -1.47 2.46 -1.14 2.4 -1.14 C2.01 -1.14 4.12 -4.51 5.46 -6.03 C6.68 -7.4 6.89 -7.84 6.62 -8.17 C6.18 -8.71 6.09 -8.71 5.02 -8.02 Z" />
    </g>
  )
}

// 토깽이(머리 유형): 위로 쫑긋 선 작은 토끼 귀 한 쌍(가운데서 거의 맞닿음). 고양이/강아지
// 귀와 같은 뒤(back) 레이어 — 아랫부분이 프로필 사진에 가려져 사진과 귀 사이에 틈이 없다.
// 가끔 귀 끝이 살짝 접혔다 펴지는 "쫑긋" 모션(avd-perk) — 아랫부분(프로필 사진에 붙은 자리)은
// 고정되고 윗부분만 오르내리도록 fill-box 기준점을 밑변 가운데(bottom center)로 둔다.
function BunnyEars() {
  const ear = (
    <g className="avd-perk">
      <path fill="#F4CBD3" d="M42.01 -12.41 C39.66 -10.06 39 -4.9 40.46 -0.43 C41.26 2.03 40.72 1.86 46.07 1.43 L49 1.2 L49 -1.12 C49 -3.84 48.37 -8.31 47.71 -10.23 C47.45 -10.97 46.88 -11.98 46.42 -12.46 C45.76 -13.18 45.39 -13.32 44.27 -13.32 C43.12 -13.32 42.78 -13.18 42.01 -12.41 Z" />
      <path fill="#FFE6EB" d="M43.47 -7.36 C42.23 -5.99 41.86 -3.5 42.44 -0.2 L42.78 1.66 L44.93 1.46 C46.1 1.38 47.13 1.26 47.16 1.2 C47.22 1.15 47.13 -0.52 47.02 -2.55 C46.82 -5.5 46.68 -6.36 46.22 -6.96 C45.5 -7.94 44.15 -8.14 43.47 -7.36 Z" />
    </g>
  )
  return (
    <>
      {ear}
      <g transform="translate(100,0) scale(-1,1)">{ear}</g>
    </>
  )
}

// 곰돌이(머리 유형): 양옆에 붙은 둥근 곰 귀 한 쌍. 토깽이와 마찬가지로 뒤(back) 레이어.
function BearEars() {
  const ear = (
    <>
      <path fill="#654C36" d="M15.39 -0.4 C12.18 0.11 9.03 2.46 7.59 5.42 C5.47 9.74 6.1 14.67 9.31 19.05 C9.89 19.83 10.43 20.49 10.49 20.49 C10.57 20.49 11.03 20 11.55 19.4 C16.1 14.1 20.89 10.2 26.59 7.08 L28.62 5.99 L27.39 4.41 C24.61 0.86 19.66 -1.12 15.39 -0.4 Z" />
      <path fill="#87674B" d="M15.04 4.56 C11 6.42 9.17 11.66 11.17 15.64 C12.46 18.19 12.41 18.19 15.01 15.67 C17.79 12.98 21.06 10.37 23.47 8.91 C25.47 7.68 25.47 7.48 23.47 5.76 C21.17 3.81 17.71 3.3 15.04 4.56 Z" />
    </>
  )
  return (
    <>
      {ear}
      <g transform="translate(100,0) scale(-1,1)">{ear}</g>
    </>
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

function BubbleGum() {
  // 입 아래쪽에서 부는 풍선껌. 테두리 없이 거의 흰 하늘색 + 반투명이라 프로필 사진이
  // 살짝 비쳐 보인다. 가장자리만 조금 진하게(비눗방울 느낌).
  // 커졌다 작아지는 건 CSS(.avd-gum) — 중심점은 풍선 가운데.
  return (
    <g className="avd-gum">
      <defs>
        <radialGradient id="avdGum" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f2faff" stopOpacity="0.4" />
          <stop offset="70%" stopColor="#eaf6ff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#d7ecfd" stopOpacity="0.9" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="81" r="11" fill="url(#avdGum)" />
      <ellipse cx="45.4" cy="76.4" rx="3.1" ry="2" fill="#ffffff" fillOpacity="0.55"
        transform="rotate(-28 45.4 76.4)" />
    </g>
  )
}

// 반창고: 곧은 띠를 기울여 오른쪽 끝만 살짝 올라가게. 띠·패드·통기공이 한 그룹으로
// 같이 회전하므로 안쪽 구성까지 항상 같은 각도로 맞는다.
function Bandage() {
  const CX = 82, CY = 64, W = 27, H = 9
  const x = CX - W / 2, y = CY - H / 2
  const hole = (dx, dy) => <circle key={`${dx},${dy}`} cx={CX + dx} cy={CY + dy} r="0.8" fill="#d9925f" opacity="0.8" />
  return (
    <g transform={`rotate(-24 ${CX} ${CY})`}>
      <rect x={x} y={y} width={W} height={H} rx={H / 2} fill="#f8c69e" stroke="#e0a074" strokeWidth="1" />
      <rect x={CX - 6} y={y + 1.9} width="12" height={H - 3.8} rx="1.5" fill="#fdeada" />
      {[[-10.6, -1.9], [-10.6, 1.9], [-8, 0], [10.6, -1.9], [10.6, 1.9], [8, 0]].map(([dx, dy]) => hole(dx, dy))}
    </g>
  )
}

// 픽셀 선글라스: 왼쪽 알(10w) + 상단 브릿지(3) + 오른쪽 알(10w), 5행. F=검정 W=흰 .=빈칸
// (다리 없음. 사용자가 준 픽셀 도안 그대로)
const PIXEL_L = ['FFFFFFFFFF', 'FWFWFFFFFF', '.FWFWFFFFF', '..FWFWFFF.', '...FFFFF..']
const PIXEL_R = ['FFFFFFFFFF', 'WFWFFFFFFF', 'FWFWFFFFF.', '.FWFWFFF..', '..FFFFF...']
const PIXEL_BR = ['FFF', '...', '...', '...', '...']
const PIXEL_ROWS = PIXEL_L.map((l, i) => l + PIXEL_BR[i] + PIXEL_R[i])
const PIXEL_PX = 3.5, PIXEL_COLS = 23, PIXEL_CY = 46.5
const PIXEL_X0 = (100 - PIXEL_COLS * PIXEL_PX) / 2
const PIXEL_Y0 = PIXEL_CY - (PIXEL_ROWS.length * PIXEL_PX) / 2

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

// 럭비공(끝 살짝 둥근) 렌즈 path: 통통한 몸통 + 살짝 둥근 좌우 끝
const football = (cx, cy, a, b, ty) => {
  const rx = a * 0.5
  return `M${cx - a} ${cy} C${cx - a} ${cy - ty} ${cx - rx} ${cy - b} ${cx} ${cy - b}`
    + ` C${cx + rx} ${cy - b} ${cx + a} ${cy - ty} ${cx + a} ${cy}`
    + ` C${cx + a} ${cy + ty} ${cx + rx} ${cy + b} ${cx} ${cy + b}`
    + ` C${cx - rx} ${cy + b} ${cx - a} ${cy + ty} ${cx - a} ${cy} Z`
}

function AlienShades() {
  // 왹져(외계인) 선글라스: 통통한 럭비공 초록 테 + 검은 렌즈.
  // 왼쪽 알은 오른쪽으로(치켜), 오른쪽 알은 왼쪽으로 45° 기울임. 브릿지는 직선으로 양 알에 닿음. 다리/귀 없음.
  const A = 21, B = 11, TY = 5, LC = 34, RC = 66
  return (
    <g>
      {/* 브릿지: 렌즈 뒤에 넓게 깔아 렌즈가 양끝을 덮게 → 틈 없이 이어짐 */}
      <rect x="30" y="43" width="40" height="6" fill="#35c14a" />
      <g transform={`rotate(53 ${LC} 46)`}>
        <path d={football(LC, 46, A, B, TY)} fill="#35c14a" />
        <path d={football(LC, 46, A - 2.6, B - 2.2, TY)} fill="#141414" />
      </g>
      <g transform={`rotate(-53 ${RC} 46)`}>
        <path d={football(RC, 46, A, B, TY)} fill="#35c14a" />
        <path d={football(RC, 46, A - 2.6, B - 2.2, TY)} fill="#141414" />
      </g>
      <circle cx={LC + 1} cy="39" r="1.7" fill="#fff" opacity="0.85" />
      <circle cx={RC - 1} cy="39" r="1.7" fill="#fff" opacity="0.85" />
    </g>
  )
}

// 하트 렌즈 path (중심 cx,cy · 반폭 a). 통통한 봉우리 + 짧고 둥근 아래 꼭짓점.
const heartPath = (cx, cy, a) =>
  `M${cx} ${cy - a * 0.36}`
  + ` C${cx - a * 0.36} ${cy - a * 1.06} ${cx - a * 1.04} ${cy - a * 0.88} ${cx - a} ${cy - a * 0.14}`
  + ` C${cx - a * 0.98} ${cy + a * 0.34} ${cx - a * 0.52} ${cy + a * 0.62} ${cx} ${cy + a * 0.88}`
  + ` C${cx + a * 0.52} ${cy + a * 0.62} ${cx + a * 0.98} ${cy + a * 0.34} ${cx + a} ${cy - a * 0.14}`
  + ` C${cx + a * 1.04} ${cy - a * 0.88} ${cx + a * 0.36} ${cy - a * 1.06} ${cx} ${cy - a * 0.36} Z`

function HeartShades() {
  // 하트 알 두 개 + 코 브릿지. 테는 분홍, 알은 까만색이지만 살짝 투명(프로필 사진이 비침).
  const LC = 30, RC = 70, CY = 47, A = 17
  const FRAME = '#ff77aa'
  return (
    <g>
      {/* 브릿지(하트 사이) — 먼저 깔고 하트 테가 양끝을 덮어 이어지게 */}
      <rect x="45.5" y="43.5" width="9" height="4.2" rx="2.1" fill={FRAME} />
      {[LC, RC].map((cx, i) => (
        <path key={i} d={heartPath(cx, CY, A)} fill="#141414" fillOpacity="0.6"
          stroke={FRAME} strokeWidth="3" strokeLinejoin="round" />
      ))}
    </g>
  )
}

// 후광(테두리 유형): 솔리드 링 없이 금빛 그라데이션만 — 안쪽이 진하고 바깥으로 옅어지며 번짐.
// 아바타 뒤(back)에 그려 다른 꾸미기보다 항상 뒤에 보인다. 펄스로 은은하게 퍼짐.
// 그 위에 작은 반짝이 입자들이 각각 다른 타이밍으로 깜빡인다.
const HALO_SPARK_PATH = 'M0,-1 C0.16,-0.16 0.16,-0.16 1,0 C0.16,0.16 0.16,0.16 0,1 C-0.16,0.16 -0.16,0.16 -1,0 C-0.16,-0.16 -0.16,-0.16 0,-1 Z'
const HALO_SPARKS = [
  { x: 50, y: -6, s: 3.6, d: 0, dur: 1.7 },
  { x: 91, y: 16, s: 2.6, d: 0.5, dur: 2.1 },
  { x: 105, y: 57, s: 3.1, d: 1.1, dur: 1.5 },
  { x: 74, y: 103, s: 2.4, d: 0.8, dur: 2.3 },
  { x: 26, y: 101, s: 3.3, d: 0.2, dur: 1.9 },
  { x: -4, y: 61, s: 2.7, d: 1.4, dur: 1.6 },
  { x: 9, y: 17, s: 2.9, d: 0.9, dur: 2.0 },
]
function Halo() {
  return (
    <g className="avd-halo">
      <defs>
        <radialGradient id="haloGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#ffe58a" stopOpacity="0.9" />
          <stop offset="60%" stopColor="#ffd23f" stopOpacity="0.78" />
          <stop offset="82%" stopColor="#ffcf3a" stopOpacity="0.36" />
          <stop offset="100%" stopColor="#ffcf3a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle className="avd-halo-glow" cx="50" cy="50" r="66" fill="url(#haloGlow)" />
      {HALO_SPARKS.map((sp, i) => (
        <g key={i} transform={`translate(${sp.x} ${sp.y}) scale(${sp.s})`}>
          <path
            className="avd-halo-spark"
            style={{ animationDelay: `${sp.d}s`, animationDuration: `${sp.dur}s` }}
            d={HALO_SPARK_PATH}
            fill="#fff6d0"
          />
        </g>
      ))}
    </g>
  )
}

// 천사 링(머리 유형): 후광(halo)과 달리 아바타 테두리가 아니라 머리 위 공간에 뜨는 독립된
// 금빛 링 — 앞(front) 레이어로 그려 위아래로만 아주 살짝 둥실댄다(CSS 로 상하 bob, 회전 없음).
function AngelRing() {
  return (
    <g className="avd-angel-ring">
      <defs>
        <radialGradient id="angelRingGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#fff6d0" stopOpacity="0.85" />
          <stop offset="55%" stopColor="#ffe58a" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#ffe58a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="angelRingMetal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fffbe6" />
          <stop offset="45%" stopColor="#ffe17a" />
          <stop offset="100%" stopColor="#ffc93f" />
        </linearGradient>
      </defs>
      <ellipse cx="50" cy="-7" rx="26" ry="11" fill="url(#angelRingGlow)" />
      <ellipse cx="50" cy="-7" rx="18" ry="6.4" fill="none" stroke="url(#angelRingMetal)" strokeWidth="3.2" />
      <path className="avd-angel-spark" d={HALO_SPARK_PATH} transform="translate(29 -11) scale(2.4)" fill="#fff6d0" />
      <path className="avd-angel-spark avd-angel-spark-2" d={HALO_SPARK_PATH} transform="translate(71 -3) scale(2)" fill="#fff6d0" />
    </g>
  )
}

// 비눗방울(테두리 유형): 아바타 전체를 무지갯빛 막으로 감싼다. 바깥 경계(원 자체)는
// 또렷하고, 색은 mask 로 테두리→중심 방향으로만 옅어져 가운데는 거의 투명해 프로필
// 사진이 그대로 비친다. 왼쪽 위엔 흰 그라데이션 하이라이트 반점, 반짝임도 있다.
// 다른 테두리(후광)와 달리 항상 다른 모든 꾸미기보다 앞(맨 위)에 그려짐 → FRONTMOST_IDS.
// 표면장력으로 미세하게 일렁이는 느낌은 순수 CSS 로: 링 전체를 가로/세로 번갈아 살짝
// 눌렀다 늘렸다(scale) 하는 것만으로 원이 미묘하게 찌그러져 보인다.
// (반짝임 위치는 링 반지름 52 기준. 각 요소는 "위치용 바깥 g(transform 속성)" +
// "애니메이션용 안쪽 g(CSS 클래스)"로 분리 — 같은 엘리먼트에 transform 속성과 CSS
// transform 애니메이션을 같이 걸면 CSS 쪽이 속성을 통째로 덮어써 위치가 원점으로
// 튀어버린다(반짝임이 안 보이던 원인). 아래처럼 두 겹으로 나누면 안전하다.)
const BUBBLE_SPARKS = [
  { x: 18, y: 9, s: 4.0, d: 0, dur: 2.1 },
  { x: 88, y: 19, s: 3.0, d: 0.6, dur: 1.8 },
  { x: 94, y: 64, s: 3.6, d: 1.2, dur: 2.3 },
  { x: 29, y: 95, s: 3.2, d: 0.3, dur: 1.9 },
  { x: 71, y: 94, s: 2.4, d: 1.6, dur: 1.6 },
]
function Bubble() {
  return (
    <g className="avd-bubble">
      <defs>
        <linearGradient id="bubbleRim" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ff8dc4" />
          <stop offset="35%" stopColor="#c48ff5" />
          <stop offset="65%" stopColor="#7ab0ff" />
          <stop offset="100%" stopColor="#ffdb80" />
        </linearGradient>
        {/* 중심(0)→테두리(100)를 표준 offset(0=중심,100=테두리)으로 보면: 테두리에서
            안쪽으로 40(=offset 60) 지점에서 이미 "거의 투명"에 가깝고, 거기서 더
            안쪽으로 갈수록 자연스럽게 완전히 사라진다. "뚝" 끊기는 kink 가 안 보이게
            스탑을 여러 단으로 나눠 기울기가 점점 커지는(ease-in) 곡선을 흉내낸다.
            색은 항상 흰색으로 고정하고 stopOpacity 만 바꿔야 한다 — 검정(#000)에서
            흰색(#fff)으로 넘어가는 구간을 만들면 색상 채널과 투명도 채널이 각각
            보간되면서 중간 지점의 실효 밝기가 양쪽 끝보다 커지는 "가짜 링"이 생긴다
            (실제로 발생했던 문제). */}
        <radialGradient id="bubbleFadeMask" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0" />
          <stop offset="42%" stopColor="#fff" stopOpacity="0" />
          <stop offset="58%" stopColor="#fff" stopOpacity="0.04" />
          <stop offset="70%" stopColor="#fff" stopOpacity="0.14" />
          <stop offset="82%" stopColor="#fff" stopOpacity="0.4" />
          <stop offset="92%" stopColor="#fff" stopOpacity="0.72" />
          <stop offset="100%" stopColor="#fff" stopOpacity="1" />
        </radialGradient>
        <mask id="bubbleFade">
          <circle cx="50" cy="50" r="54" fill="url(#bubbleFadeMask)" />
        </mask>
        <radialGradient id="bubbleHighlight" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="bubbleSparkGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.8" />
          <stop offset="45%" stopColor="#ffffff" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* 무지갯빛 채우기 + 안쪽으로만 번지는 마스크 → 바깥 경계(원 자체)는 또렷하고
          색은 테두리에서 중심으로 갈수록 자연스럽게 옅어짐. 전체 opacity 를 낮춰
          가장 진한 테두리조차 완전히 불투명하지 않게(사진이 은은하게 비침). */}
      <circle cx="50" cy="50" r="54" fill="url(#bubbleRim)" mask="url(#bubbleFade)" opacity="0.82" />
      {/* 왼쪽 위 유리 하이라이트: 그 자리에서 가장 진하고 바깥으로 갈수록 옅어지는
          흰 그라데이션 반점 — 더 크고 길쭉한 타원으로 */}
      <ellipse cx="21" cy="18" rx="19" ry="9" fill="url(#bubbleHighlight)" transform="rotate(-32 21 18)" />
      {BUBBLE_SPARKS.map((sp, i) => (
        <g key={i} transform={`translate(${sp.x} ${sp.y})`}>
          <g className="avd-bubble-spark" style={{ animationDelay: `${sp.d}s`, animationDuration: `${sp.dur}s` }}>
            <circle r={sp.s * 1.2} fill="url(#bubbleSparkGlow)" />
            <path d={HALO_SPARK_PATH} transform={`scale(${sp.s})`} fill="#ffffff" />
          </g>
        </g>
      ))}
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
  'deco-pixel-shades': '6 35 88 23',
  'deco-alien-shades': '17 27 66 38',
  'deco-bandage': '64 51 36 24',
  'deco-gum': '36 67 28 28',
  'deco-heart-shades': '11 28 78 37',
  'deco-halo': '-18 -18 136 136',
  'deco-angel-ring': '18 -22 64 42',
  'deco-bubble': '-14 -14 128 128',
  'deco-tomato': '30 -11 40 27',
  'deco-bunny': '36 -17 28 23',
  'deco-bear': '2 -4 96 29',
}
// 아이템별 기준점(회전·확대의 중심) = 미리보기 뷰박스의 중앙 = 그 장식의 시각적 중심.
// 이 점을 기준으로 돌리고 키워야 "제자리에서" 조정되는 것처럼 느껴진다.
export function decoAnchor(id) {
  const vb = PREVIEW_VB[id]
  if (!vb) return [50, 50]
  const [x, y, w, h] = vb.split(' ').map(Number)
  return [x + w / 2, y + h / 2]
}

// 그룹 프로필 사진에 맞춘 조정값 → SVG transform.
// 기준점에서 회전·확대한 뒤 이동. (translate 를 먼저 쓰면 회전에 끌려 위치가 틀어진다)
export const DECO_TF0 = { s: 1, x: 0, y: 0, r: 0 }
export function decoTransform(id, tf) {
  if (!tf) return undefined
  const s = Number(tf.s) || 1, x = Number(tf.x) || 0, y = Number(tf.y) || 0, r = Number(tf.r) || 0
  if (s === 1 && x === 0 && y === 0 && r === 0) return undefined
  const [ax, ay] = decoAnchor(id)
  return `translate(${x} ${y}) translate(${ax} ${ay}) rotate(${r}) scale(${s}) translate(${-ax} ${-ay})`
}
// 조정값이 있을 때만 그룹으로 감싼다(없으면 DOM 을 늘리지 않음)
const Tf = ({ id, tf, children }) => {
  const t = decoTransform(id, tf)
  return t ? <g transform={t}>{children}</g> : children
}

const EAR_CIRCLE = { 'deco-jaguar': '#24222b', 'deco-wolf': '#726c7a' }
export function DecoPreview({ id }) {
  const vb = PREVIEW_VB[id] || '0 0 100 100'
  const circle = EAR_CIRCLE[id]
  return (
    <svg className="deco-preview" viewBox={vb} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {id === 'deco-sprout' && <Sprout />}
      {id === 'deco-tomato' && <Tomato />}
      {id === 'deco-bunny' && <BunnyEars />}
      {id === 'deco-bear' && <BearEars />}
      {id === 'deco-jaguar' && <CatEars />}
      {id === 'deco-wolf' && <WolfEars />}
      {id === 'deco-blush' && <Blush />}
      {id === 'deco-anger' && <Anger />}
      {id === 'deco-pixel-shades' && <PixelShades />}
      {id === 'deco-alien-shades' && <AlienShades />}
      {id === 'deco-bandage' && <Bandage />}
      {id === 'deco-gum' && <BubbleGum />}
      {id === 'deco-heart-shades' && <HeartShades />}
      {id === 'deco-halo' && <Halo />}
      {id === 'deco-angel-ring' && <AngelRing />}
      {id === 'deco-bubble' && <Bubble />}
      {circle && <circle cx="50" cy="50" r="50" fill={circle} />}
    </svg>
  )
}

// 아이템 id → 장식 컴포넌트. (슬롯과 무관 — 렌더는 아이템별 아트로 결정)
const ART = {
  'deco-sprout': Sprout, 'deco-jaguar': CatEars, 'deco-wolf': WolfEars,
  'deco-blush': Blush, 'deco-anger': Anger, 'deco-pixel-shades': PixelShades,
  'deco-alien-shades': AlienShades, 'deco-bandage': Bandage, 'deco-gum': BubbleGum,
  'deco-heart-shades': HeartShades, 'deco-halo': Halo, 'deco-angel-ring': AngelRing,
  'deco-bubble': Bubble, 'deco-tomato': Tomato, 'deco-bunny': BunnyEars, 'deco-bear': BearEars,
}
// 테두리(원형 테두리) 유형: 아바타의 흰 테두리를 대체. 기본은 다른 꾸미기보다 뒤에 그려지되
// (후광), FRONTMOST_IDS 에 있으면(비눗방울) 예외적으로 항상 맨 앞에 그려진다.
export const BORDER_IDS = new Set(['deco-halo', 'deco-bubble'])
export const hasBorderDeco = (deco) => decoItems(deco).some((d) => BORDER_IDS.has(d.id))
const FRONTMOST_IDS = new Set(['deco-bubble'])
// 뒤(back) 레이어로 그릴 아이템(귀 + 후광) — 나머지는 앞(front). 아트 종류로 결정.
const BACK_IDS = new Set(['deco-jaguar', 'deco-wolf', 'deco-halo', 'deco-bunny', 'deco-bear'])

// deco prop 정규화 → [{ id, tf }]. 배열(신규) 또는 레거시 { head, face, headTf, faceTf } 모두 허용.
export function decoItems(deco) {
  if (Array.isArray(deco)) return deco.filter((d) => d && d.id)
  if (deco && (deco.head || deco.face)) {
    return [
      deco.head && { id: deco.head, tf: deco.headTf },
      deco.face && { id: deco.face, tf: deco.faceTf },
    ].filter(Boolean)
  }
  return []
}

// items: [{ id, tf }] — 장착된 데코 목록(여러 유형 동시 렌더). layer: 'back' | 'front'
export default function AvatarDeco({ items, layer = 'front' }) {
  // 그리는 순서(뒤→앞) = 테두리(후광) → 일반 꾸미기 → FRONTMOST(비눗방울, 항상 맨 위)
  // FRONTMOST_IDS 를 먼저 확인해야 한다 — 비눗방울은 BORDER_IDS 에도 들어 있어서
  // (흰 테두리 대체용) 순서를 반대로 하면 항상 뒤로 가라앉아 버린다.
  const rank = (id) => (FRONTMOST_IDS.has(id) ? 2 : BORDER_IDS.has(id) ? 0 : 1)
  const show = decoItems(items)
    .filter((d) => ART[d.id] && (BACK_IDS.has(d.id) === (layer === 'back')))
    .sort((a, b) => rank(a.id) - rank(b.id))
  if (!show.length) return null
  return (
    <svg className={`avatar-deco avatar-deco-${layer}`} viewBox="0 0 100 100" width="100%" height="100%"
      preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {show.map((d) => { const Art = ART[d.id]; return <Tf key={d.id} id={d.id} tf={d.tf}><Art /></Tf> })}
    </svg>
  )
}
