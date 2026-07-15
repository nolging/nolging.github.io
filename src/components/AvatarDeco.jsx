// 아바타 꾸미기 데코레이션. 아바타 원(지름=size) 위에 SVG viewBox(0~100)로 그려 항상 비율이 맞는다.
//  - head: deco-sprout(새싹·앞) | deco-jaguar(까만 고양이 귀·뒤) | deco-wolf(강아지 귀·뒤)  → 하나만
//  - face: deco-blush(양 볼 홍조·앞)
// 귀(jaguar/wolf)는 아바타 "뒤" 레이어(back)에 그려, 아랫부분이 둥근 아바타에 가려져 딱 맞게 보인다.
// 새싹·홍조는 "앞" 레이어(front).

export const DECO_HEAD = ['deco-sprout', 'deco-jaguar', 'deco-wolf']
export const DECO_FACE = ['deco-blush']
export const DECO_IDS = [...DECO_HEAD, ...DECO_FACE]
export const decoSlot = (id) => (DECO_FACE.includes(id) ? 'face' : DECO_HEAD.includes(id) ? 'head' : null)
const isEars = (head) => head === 'deco-jaguar' || head === 'deco-wolf'

function Sprout() {
  // 줄기는 이파리 붙는 지점(1)까지만 + butt 캡 → 이파리 위로 튀어나오지 않음. 이파리도 더 작게.
  // 반짝임은 이파리 바깥(좌·우)으로 빼서 겹치지 않게.
  return (
    <g className="avd-sway">
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
      <path d="M17 32 C11 9 16 -19 27 -24 C36 -9 43 12 45 30 C36 34 24 35 17 32 Z" fill="#726c7a" stroke="#726c7a" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M25 28 C21 11 25 -11 31 -16 C37 -4 41 12 42 26 C35 29 29 29 25 28 Z" fill="#cfc9d6" />
    </>
  )
  return (
    <>
      <g className="avd-twitch-l">{ear}</g>
      <g className="avd-twitch-r"><g transform="translate(100,0) scale(-1,1)">{ear}</g></g>
    </>
  )
}

function Blush() {
  // 양 볼 간격을 더 넓히고(cx 20/80), 그라데이션 범위도 키움(rx/ry ↑)
  return (
    <g className="avd-blush">
      <defs>
        <radialGradient id="avdBlush" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f58aaf" stopOpacity="0.72" />
          <stop offset="55%" stopColor="#f58aaf" stopOpacity="0.42" />
          <stop offset="100%" stopColor="#f58aaf" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="19" cy="64" rx="16" ry="10.5" fill="url(#avdBlush)" transform="rotate(-8 19 64)" />
      <ellipse cx="81" cy="64" rx="16" ry="10.5" fill="url(#avdBlush)" transform="rotate(8 81 64)" />
    </g>
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
  const hasFront = head === 'deco-sprout' || face === 'deco-blush'
  if (!hasFront) return null
  return (
    <svg className="avatar-deco avatar-deco-front" viewBox="0 0 100 100" width="100%" height="100%"
      preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {head === 'deco-sprout' && <Sprout />}
      {face === 'deco-blush' && <Blush />}
    </svg>
  )
}
