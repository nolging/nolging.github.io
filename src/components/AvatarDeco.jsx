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
  return (
    <g className="avd-sway">
      <path d="M50 9 C52 2 52 -7 50 -15" stroke="#5aa06a" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      <g transform="rotate(-30 50 -5)">
        <path d="M50 -5 C41 -5 33 -13 29 -25 C40 -29 49 -20 50 -5 Z" fill="#6bbd85" />
      </g>
      <g transform="rotate(30 50 -5)">
        <path d="M50 -5 C59 -5 67 -13 71 -25 C60 -29 51 -20 50 -5 Z" fill="#7ec994" />
      </g>
      <path className="avd-spark" d="M30 -21 l1 3 l3 1 l-3 1 l-1 3 l-1 -3 l-3 -1 l3 -1 z" fill="#ffcb54" />
      <path className="avd-spark avd-spark-2" d="M70 -18 l.9 2.6 l2.6 .9 l-2.6 .9 l-.9 2.6 l-.9 -2.6 l-2.6 -.9 l2.6 -.9 z" fill="#ffcb54" />
    </g>
  )
}

function CatEars() {
  const ear = (
    <>
      <polygon points="12,30 27,-30 45,28" fill="#24222b" stroke="#24222b" strokeWidth="4" strokeLinejoin="round" />
      <polygon points="22,22 28,-11 35,20" fill="#f2a9c2" />
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
  const ear = (
    <>
      <path d="M12 32 C5 6 11 -26 26 -32 C37 -14 45 12 47 30 C37 35 22 36 12 32 Z" fill="#726c7a" stroke="#726c7a" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M22 28 C18 8 22 -16 29 -22 C37 -8 42 12 43 26 C35 30 27 30 22 28 Z" fill="#cfc9d6" />
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
  return (
    <g className="avd-blush">
      <defs>
        <radialGradient id="avdBlush" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f58aaf" stopOpacity="0.75" />
          <stop offset="60%" stopColor="#f58aaf" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#f58aaf" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="25" cy="64" rx="13" ry="8.5" fill="url(#avdBlush)" transform="rotate(-8 25 64)" />
      <ellipse cx="75" cy="64" rx="13" ry="8.5" fill="url(#avdBlush)" transform="rotate(8 75 64)" />
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
