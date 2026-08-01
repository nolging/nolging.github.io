// 아바타 꾸미기 데코레이션. 아바타 원(지름=size) 위에 SVG viewBox(0~100)로 그려 항상 비율이 맞는다.
//  - head: deco-sprout(새싹·앞) | deco-jaguar(까만 고양이 귀·뒤) | deco-wolf(강아지 귀·뒤)  → 하나만
//  - face: deco-blush(양 볼 홍조) | deco-anger | deco-pixel-shades | deco-alien-shades | deco-bandage(오른 볼 반창고) | deco-gum(풍선껌) → 하나만
// 귀(jaguar/wolf)는 아바타 "뒤" 레이어(back)에 그려, 아랫부분이 둥근 아바타에 가려져 딱 맞게 보인다.
// 새싹·홍조는 "앞" 레이어(front).

export const DECO_HEAD = ['deco-sprout', 'deco-jaguar', 'deco-wolf']
export const DECO_FACE = ['deco-blush', 'deco-anger', 'deco-pixel-shades', 'deco-alien-shades', 'deco-bandage', 'deco-gum', 'deco-heart-shades']
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
      {id === 'deco-jaguar' && <CatEars />}
      {id === 'deco-wolf' && <WolfEars />}
      {id === 'deco-blush' && <Blush />}
      {id === 'deco-anger' && <Anger />}
      {id === 'deco-pixel-shades' && <PixelShades />}
      {id === 'deco-alien-shades' && <AlienShades />}
      {id === 'deco-bandage' && <Bandage />}
      {id === 'deco-gum' && <BubbleGum />}
      {id === 'deco-heart-shades' && <HeartShades />}
      {circle && <circle cx="50" cy="50" r="50" fill={circle} />}
    </svg>
  )
}

// 슬롯별 장식 본체 (조정값 적용은 호출부에서 <Tf> 로 감싼다)
const HeadArt = ({ head }) => (
  head === 'deco-sprout' ? <Sprout />
    : head === 'deco-jaguar' ? <CatEars />
      : head === 'deco-wolf' ? <WolfEars /> : null
)
const FaceArt = ({ face }) => (
  face === 'deco-blush' ? <Blush />
    : face === 'deco-anger' ? <Anger />
      : face === 'deco-pixel-shades' ? <PixelShades />
        : face === 'deco-alien-shades' ? <AlienShades />
          : face === 'deco-bandage' ? <Bandage />
            : face === 'deco-gum' ? <BubbleGum />
              : face === 'deco-heart-shades' ? <HeartShades /> : null
)

// layer: 'back'(귀 — 아바타 뒤) | 'front'(새싹·홍조 — 아바타 앞)
// headTf/faceTf: 그룹 프로필 사진에 맞춘 { s, x, y, r } 조정값(선택)
export default function AvatarDeco({ head, face, layer = 'front', headTf, faceTf }) {
  if (layer === 'back') {
    if (!isEars(head)) return null
    return (
      <svg className="avatar-deco avatar-deco-back" viewBox="0 0 100 100" width="100%" height="100%"
        preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <Tf id={head} tf={headTf}><HeadArt head={head} /></Tf>
      </svg>
    )
  }
  const hasFront = head === 'deco-sprout' || DECO_FACE.includes(face)
  if (!hasFront) return null
  return (
    <svg className="avatar-deco avatar-deco-front" viewBox="0 0 100 100" width="100%" height="100%"
      preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {head === 'deco-sprout' && <Tf id={head} tf={headTf}><Sprout /></Tf>}
      {DECO_FACE.includes(face) && <Tf id={face} tf={faceTf}><FaceArt face={face} /></Tf>}
    </svg>
  )
}
