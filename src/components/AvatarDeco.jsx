// 아바타 꾸미기 데코레이션 오버레이. 아바타 원(지름=size) 위에 겹쳐 그리며,
// SVG viewBox(0~100)로 그려 아바타 크기에 항상 비율이 맞는다.
//  - head: deco-sprout(새싹) | deco-jaguar(까만 고양이 귀) | deco-wolf(강아지 귀)  → 머리 위, 하나만
//  - face: deco-blush(양 볼 홍조)                                                  → 얼굴

export const DECO_HEAD = ['deco-sprout', 'deco-jaguar', 'deco-wolf']
export const DECO_FACE = ['deco-blush']
export const DECO_IDS = [...DECO_HEAD, ...DECO_FACE]
export const decoSlot = (id) => (DECO_FACE.includes(id) ? 'face' : DECO_HEAD.includes(id) ? 'head' : null)

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
  return (
    <>
      <g className="avd-twitch-l">
        <polygon points="16,9 27,-31 45,5" fill="#24222b" stroke="#24222b" strokeWidth="4" strokeLinejoin="round" />
        <polygon points="24,4 28,-15 38,2" fill="#f2a9c2" />
      </g>
      <g className="avd-twitch-r">
        <polygon points="55,5 73,-31 84,9" fill="#24222b" stroke="#24222b" strokeWidth="4" strokeLinejoin="round" />
        <polygon points="62,2 72,-15 76,4" fill="#f2a9c2" />
      </g>
    </>
  )
}

function WolfEars() {
  return (
    <>
      <g className="avd-twitch-l">
        <path d="M14 11 C7 -8 12 -29 24 -33 C35 -19 43 1 45 9 C35 13 22 13 14 11 Z" fill="#726c7a" stroke="#726c7a" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M22 7 C18 -5 21 -20 28 -24 C35 -12 40 2 40 6 C33 9 27 9 22 7 Z" fill="#cfc9d6" />
      </g>
      <g className="avd-twitch-r">
        <path d="M86 11 C93 -8 88 -29 76 -33 C65 -19 57 1 55 9 C65 13 78 13 86 11 Z" fill="#726c7a" stroke="#726c7a" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M78 7 C82 -5 79 -20 72 -24 C65 -12 60 2 60 6 C67 9 73 9 78 7 Z" fill="#cfc9d6" />
      </g>
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

export default function AvatarDeco({ head, face }) {
  if (!head && !face) return null
  return (
    <svg className="avatar-deco" viewBox="0 0 100 100" width="100%" height="100%"
      preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {head === 'deco-sprout' && <Sprout />}
      {head === 'deco-jaguar' && <CatEars />}
      {head === 'deco-wolf' && <WolfEars />}
      {face === 'deco-blush' && <Blush />}
    </svg>
  )
}
