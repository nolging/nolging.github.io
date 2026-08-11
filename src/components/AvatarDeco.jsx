// 아바타 꾸미기 데코레이션. 아바타 원(지름=size) 위에 SVG viewBox(0~100)로 그려 항상 비율이 맞는다.
//  - head: deco-sprout(새싹·앞) | deco-jaguar(까만 고양이 귀·뒤) | deco-wolf(강아지 귀·뒤)
//    | deco-angel-ring(천사 링·앞) | deco-tomato(토마토 꼭지·앞) | deco-bunny(토끼 귀·뒤) | deco-bear(곰 귀·뒤)
//    | deco-angel-wing(천사 날개·뒤) | deco-devil-wing(악마 날개·뒤) | deco-devil-horn(악마 뿔·앞)
//    | deco-kitty-ribbon(고양이 리본·앞) → 하나만
//  - face: deco-blush(양 볼 홍조) | deco-anger | deco-pixel-shades | deco-alien-shades | deco-bandage(오른 볼 반창고)
//    | deco-gum(풍선껌) | deco-bow-tie(나비넥타이·앞) → 하나만
// 귀(jaguar/wolf/bunny/bear)와 날개(angel-wing/devil-wing)는 아바타 "뒤" 레이어(back)에 그려,
// 프로필 사진에 가려진 채 옆으로 삐져나와 딱 맞게 보인다. 새싹·홍조·뿔·리본·나비넥타이는 "앞" 레이어(front).

export const DECO_HEAD = ['deco-sprout', 'deco-jaguar', 'deco-wolf', 'deco-angel-ring', 'deco-tomato', 'deco-bunny', 'deco-bear', 'deco-angel-wing', 'deco-devil-wing', 'deco-devil-horn', 'deco-kitty-ribbon']
export const DECO_FACE = ['deco-blush', 'deco-anger', 'deco-pixel-shades', 'deco-alien-shades', 'deco-bandage', 'deco-gum', 'deco-heart-shades', 'deco-bow-tie']
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
// 고양이/늑대 귀와 같은 까딱임(avd-twitch) — 양쪽 다 안쪽(가운데)으로 동시에 기운다.
function BearEars() {
  const ear = (
    <>
      <path fill="#654C36" d="M15.39 -0.4 C12.18 0.11 9.03 2.46 7.59 5.42 C5.47 9.74 6.1 14.67 9.31 19.05 C9.89 19.83 10.43 20.49 10.49 20.49 C10.57 20.49 11.03 20 11.55 19.4 C16.1 14.1 20.89 10.2 26.59 7.08 L28.62 5.99 L27.39 4.41 C24.61 0.86 19.66 -1.12 15.39 -0.4 Z" />
      <path fill="#87674B" d="M15.04 4.56 C11 6.42 9.17 11.66 11.17 15.64 C12.46 18.19 12.41 18.19 15.01 15.67 C17.79 12.98 21.06 10.37 23.47 8.91 C25.47 7.68 25.47 7.48 23.47 5.76 C21.17 3.81 17.71 3.3 15.04 4.56 Z" />
    </>
  )
  return (
    <>
      <g className="avd-twitch-l">{ear}</g>
      <g className="avd-twitch-r"><g transform="translate(100,0) scale(-1,1)">{ear}</g></g>
    </>
  )
}

// 천사 날개 / 악마 날개(머리 유형): 프로필 사진 양옆, 얼굴 중간 높이에서 뒤(back) 레이어로
// 삐져나온다. 날개 안쪽(사진에 가려지는 쪽)이 몸통에 붙는 지점 — 오른쪽으로 살짝 치우친
// 지점을 기준으로 파닥이는 회전(avd-wing-flap)을 준다.
// 천사 날개는 실루엣(흰 깃털 뭉치) 위에 깃털 결을 나누는 연한 라인(소용돌이 깃 끝 포함)을
// 겹쳐 그려야 원본 디테일이 살아난다 — 실루엣만으로는 뭉툭한 덩어리로 보임.
const ANGEL_WING_D = 'M-12.62 53.98 C-13.85 54.64 -14.43 57.22 -13.71 58.80 C-13.45 59.37 -13.54 59.66 -14.17 60.60 C-15.49 62.55 -14.57 64.18 -11.65 65.13 C-11.36 65.22 -11.16 65.56 -11.16 65.96 C-11.16 67.68 -9.01 68.85 -7.04 68.25 C-6.18 68.00 -6.06 68.02 -5.52 68.88 C-5.17 69.37 -4.43 70.03 -3.80 70.32 C-2.77 70.80 -2.62 70.83 -0.85 70.34 C1.04 69.86 2.51 68.91 3.57 67.48 C4.05 66.85 4.17 66.28 4.17 64.59 C4.17 62.72 4.08 62.35 3.31 61.26 C2.16 59.63 1.19 59.11 -2.31 58.25 C-3.94 57.85 -5.75 57.25 -6.38 56.96 C-7.95 56.13 -10.22 54.47 -10.42 53.98 C-10.62 53.44 -11.65 53.44 -12.62 53.98 Z'
const ANGEL_WING_LINES_D = 'M-12.12 53.95 C-13.67 54.61 -14.36 57.07 -13.50 58.67 C-13.15 59.30 -13.18 59.48 -13.78 60.36 C-14.15 60.94 -14.47 61.74 -14.47 62.20 C-14.47 63.23 -13.12 64.63 -11.92 64.86 C-11.29 65.01 -11.03 65.21 -11.03 65.61 C-11.03 67.44 -9.11 68.70 -7.16 68.16 C-6.16 67.90 -6.07 67.93 -4.87 69.19 L-3.61 70.51 L-1.78 70.36 C0.34 70.19 1.43 69.68 2.84 68.22 C4.73 66.21 4.90 63.52 3.27 61.25 C2.18 59.76 1.12 59.13 -1.26 58.53 C-6.07 57.30 -7.74 56.53 -10.03 54.35 C-11.06 53.40 -10.89 53.43 -12.12 53.95 M-9.34 55.81 C-7.05 57.47 -5.64 58.13 -2.72 58.79 C0.54 59.56 1.69 60.22 2.61 61.74 C4.15 64.38 4.04 66.15 2.23 67.90 C1.03 69.08 -0.80 69.85 -2.35 69.85 C-3.84 69.85 -5.30 68.30 -5.30 66.75 C-5.30 65.81 -5.13 65.47 -4.38 64.83 C-3.61 64.18 -3.27 64.09 -2.23 64.20 C-1.32 64.29 -1.00 64.23 -1.00 63.95 C-1.00 63.72 -1.32 63.49 -1.69 63.37 C-3.32 62.97 -5.82 64.63 -5.93 66.24 C-6.02 67.16 -6.76 67.56 -8.25 67.56 C-9.34 67.56 -9.68 67.36 -10.14 66.50 C-10.69 65.44 -10.52 65.01 -9.46 64.81 C-8.48 64.63 -7.94 64.23 -8.25 63.95 C-8.31 63.86 -8.97 63.95 -9.71 64.15 C-11.29 64.55 -12.29 64.32 -13.21 63.40 C-14.07 62.54 -14.07 61.80 -13.24 60.79 C-12.69 60.19 -12.46 60.08 -12.01 60.31 C-11.72 60.48 -10.97 60.68 -10.37 60.77 C-9.57 60.88 -9.31 60.82 -9.31 60.51 C-9.31 60.25 -9.63 60.11 -10.26 60.11 C-12.06 60.11 -13.52 58.30 -13.18 56.47 C-13.01 55.49 -12.15 54.38 -11.60 54.38 C-11.43 54.38 -10.43 55.01 -9.34 55.81 Z'
function AngelWing() {
  const wing = (
    <g className="avd-wing-flap">
      <path d={ANGEL_WING_D} fill="#ffffff" />
      <path d={ANGEL_WING_LINES_D} fill="#e9ebf3" />
    </g>
  )
  return (
    <>
      {wing}
      <g transform="translate(100,0) scale(-1,1)">{wing}</g>
    </>
  )
}

const DEVIL_WING_D = 'M-6.22 58.80 C-8.94 61.20 -11.89 64.47 -11.58 64.79 C-11.46 64.90 -10.83 64.84 -10.20 64.61 C-8.08 63.87 -6.65 64.18 -5.22 65.73 L-4.53 66.48 L-4.01 65.62 C-3.35 64.53 -2.35 64.30 -1.18 64.90 C-0.69 65.16 -0.23 65.33 -0.20 65.27 C-0.17 65.21 -0.03 64.81 0.14 64.33 C0.40 63.50 0.80 63.27 2.64 62.89 C3.38 62.75 3.44 62.64 3.35 61.66 L3.27 60.60 L1.40 60.43 C-1.20 60.17 -2.41 59.57 -3.35 58.19 C-3.78 57.54 -4.13 57.02 -4.16 57.02 C-4.18 57.02 -5.10 57.82 -6.22 58.80 Z'
function DevilWing() {
  const wing = (
    <g className="avd-wing-flap">
      <path d={DEVIL_WING_D} fill="#17171b" />
    </g>
  )
  return (
    <>
      {wing}
      <g transform="translate(100,0) scale(-1,1)">{wing}</g>
    </>
  )
}

// 악마 뿔(머리 유형): 앞(front) 레이어 — 사진 위 머리카락 경계에 살짝 겹치며 위로 솟는다.
const DEVIL_HORN_D = 'M17.91 8.74 C17.91 11.69 18.02 13.47 18.19 13.47 C18.37 13.47 18.48 13.24 18.48 12.92 C18.48 12.64 18.74 12.32 19.05 12.23 C19.37 12.15 19.74 11.75 19.91 11.35 C20.06 10.95 20.29 10.63 20.40 10.66 C20.54 10.69 21.20 10.37 21.86 9.91 C22.55 9.48 23.30 9.20 23.52 9.28 C23.75 9.37 23.93 9.26 23.93 9.05 C23.93 8.62 18.71 4.01 18.22 4.01 C17.99 4.01 17.91 5.47 17.91 8.74 Z'
function DevilHorn() {
  return (
    <>
      <path d={DEVIL_HORN_D} fill="#17171b" />
      <g transform="translate(100,0) scale(-1,1)"><path d={DEVIL_HORN_D} fill="#17171b" /></g>
    </>
  )
}

// 고양이 리본(머리 유형): 앞(front) 레이어, 오른쪽 위 머리 위에 얹힌 리본. 검정 "테두리만"
// (매듭의 두 작은 원 포함, 구멍 있는 도넛 형태) 위에 빨간 채움을 겹쳐 그려 이중톤을 표현.
// 두 경로는 원본에서 각각 검정/빨강 영역만 정확히 추출한 것이라, 서로 다른 원점을 쓴다 —
// 하나로 합쳐서 트레이싱하면 빨강이 테두리 대비 어긋나 보인다.
const KITTY_RIBBON_OUTLINE_D = 'M67.58 -2.94 C66.38 -2.51 65.72 -1.93 64.72 -0.33 C61.85 4.11 61.08 7.26 62.34 9.18 C63.49 10.96 67.04 12.36 70.39 12.36 C72.20 12.36 72.57 12.45 73.31 13.08 C73.80 13.48 74.60 13.94 75.12 14.14 C75.84 14.37 76.24 14.80 76.70 15.80 C78.27 19.10 82.25 21.93 84.60 21.42 C85.95 21.13 88.07 19.35 89.02 17.78 C91.45 13.62 91.65 13.19 91.60 11.68 C91.51 9.96 91.02 9.10 89.45 8.01 C87.44 6.63 86.09 6.29 82.80 6.26 C80.36 6.26 79.65 6.15 79.02 5.74 C78.59 5.46 78.01 5.17 77.76 5.14 C77.50 5.09 77.07 4.51 76.78 3.77 C75.09 -0.73 70.56 -4.03 67.58 -2.94 M71.45 -1.33 C72.20 -0.85 73.20 -0.04 73.69 0.47 C74.72 1.59 75.98 4.00 75.87 4.63 C75.72 5.40 74.35 5.54 73.03 4.88 C71.62 4.20 70.71 4.40 69.82 5.60 C68.99 6.72 69.62 8.29 71.40 9.41 C71.65 9.56 71.94 10.04 72.03 10.47 C72.20 11.19 72.11 11.27 71.19 11.45 C68.93 11.85 64.80 10.53 63.49 8.95 C62.77 8.12 62.68 7.84 62.80 6.37 C62.89 5.09 63.20 4.25 64.43 2.08 C65.26 0.59 66.18 -0.82 66.44 -1.08 C67.90 -2.48 69.50 -2.57 71.45 -1.33 M72.94 5.66 C73.40 6.03 73.43 6.17 73.11 6.60 C72.94 6.89 72.66 7.41 72.51 7.75 C72.34 8.07 72.08 8.44 71.94 8.55 C71.51 8.81 70.19 7.41 70.19 6.72 C70.19 5.46 71.80 4.83 72.94 5.66 M78.50 6.46 C79.30 6.98 79.99 8.15 80.13 9.27 C80.59 12.74 75.84 14.74 73.57 12.02 C72.57 10.79 72.57 8.64 73.57 7.32 C74.55 6.06 77.13 5.60 78.50 6.46 M87.84 8.27 C90.16 9.41 91.02 10.59 90.71 12.25 C90.45 13.62 87.76 18.18 86.55 19.21 C85.09 20.50 84.35 20.73 82.80 20.27 C80.94 19.73 77.87 16.75 77.36 15.03 C77.13 14.20 77.15 14.08 77.87 13.82 C78.47 13.57 78.82 13.62 79.45 13.97 C81.34 15.03 83.37 14.14 83.37 12.25 C83.37 11.25 82.51 9.99 81.68 9.70 C80.97 9.47 80.42 7.98 80.88 7.61 C81.97 6.72 85.29 7.03 87.84 8.27 M82.03 10.90 C82.57 11.53 82.68 12.11 82.40 12.91 C82.23 13.45 81.97 13.57 81.08 13.57 C80.48 13.57 79.91 13.45 79.82 13.31 C79.59 12.97 80.85 10.44 81.25 10.41 C81.42 10.41 81.77 10.64 82.03 10.90 Z'
const KITTY_RIBBON_RED_D = 'M66.90 -1.14 C66.33 -0.65 65.24 0.90 64.41 2.30 C63.09 4.62 62.95 5.05 62.92 6.74 C62.86 8.58 62.89 8.60 64.01 9.58 C64.64 10.12 65.35 10.55 65.61 10.58 C65.87 10.58 66.16 10.67 66.27 10.78 C66.36 10.90 66.62 11.01 66.82 11.04 C67.02 11.10 67.50 11.18 67.90 11.27 C69.11 11.53 71.14 11.67 71.52 11.53 C71.94 11.36 72.03 9.72 71.63 9.72 C71.49 9.72 70.88 9.29 70.34 8.75 C69.08 7.57 68.97 6.31 70.03 5.28 C70.86 4.45 72.00 4.36 73.43 5.02 C74.04 5.34 74.70 5.42 75.18 5.31 C75.84 5.14 75.93 5.02 75.76 4.34 C75.27 2.36 72.95 -0.34 70.74 -1.45 C69.14 -2.28 68.08 -2.20 66.90 -1.14 Z M70.63 5.97 C70.03 6.63 70.25 7.89 71.03 8.29 C71.86 8.72 71.97 8.66 72.72 7.37 C73.38 6.23 73.38 6.17 72.86 5.80 C72.15 5.25 71.20 5.34 70.63 5.97 Z M74.55 6.63 C74.21 6.80 73.66 7.46 73.29 8.12 C72.46 9.69 72.72 11.18 74.04 12.50 C74.81 13.28 75.21 13.45 76.19 13.45 C77.82 13.45 79.17 12.59 79.74 11.15 C80.31 9.69 80.08 8.49 78.91 7.26 C78.08 6.40 77.82 6.28 76.59 6.31 C75.81 6.31 74.90 6.46 74.55 6.63 Z M81.09 7.66 C80.51 8.06 80.94 9.58 81.77 9.95 C82.52 10.30 83.35 11.38 83.46 12.22 C83.58 12.90 82.92 14.19 82.35 14.42 C81.54 14.71 80.20 14.62 79.39 14.19 C78.45 13.71 77.33 14.05 77.33 14.82 C77.33 16.03 80.48 19.41 82.26 20.18 C83.81 20.81 84.47 20.73 85.99 19.69 C87.02 18.98 87.68 18.15 88.91 16.03 C91.37 11.79 91.17 10.30 87.93 8.49 C86.62 7.72 86.04 7.57 83.95 7.52 C82.60 7.46 81.31 7.52 81.09 7.66 Z M80.37 11.93 C79.77 12.96 79.68 13.30 79.97 13.50 C80.54 13.88 81.97 13.65 82.29 13.13 C82.69 12.50 82.32 11.24 81.66 10.87 C81.17 10.64 81.00 10.78 80.37 11.93 Z'
function KittyRibbon() {
  return (
    <g>
      <path d={KITTY_RIBBON_OUTLINE_D} fill="#17171b" />
      <path d={KITTY_RIBBON_RED_D} fill="#ff1832" />
    </g>
  )
}

// 나비넥타이(얼굴 유형): 앞(front) 레이어, 사진 아래쪽(턱·목 부근)에 걸린다.
const BOW_TIE_D = 'M39.27 97.77 C38.99 99.29 39.07 101.32 39.53 103.50 C40.28 107.08 40.45 107.17 44.69 105.88 C47.01 105.16 47.41 104.93 48.79 103.56 L50.28 101.98 L51.80 103.56 C53.14 104.93 53.54 105.16 55.86 105.88 C60.11 107.17 60.28 107.08 61.02 103.50 C61.48 101.32 61.57 99.29 61.28 97.77 L61.08 96.85 L58.04 96.97 C55.18 97.05 54.86 97.14 52.66 98.23 L50.28 99.37 L47.93 98.23 C45.69 97.14 45.38 97.05 42.51 96.97 L39.48 96.85 L39.27 97.77 Z'
function BowTie() {
  return <path d={BOW_TIE_D} fill="#17171b" />
}

function CatEars() {
  const ear = (
    <>
      <path fill="#101010" d="M17.68 -5.79 C16.91 -4.58 15.85 -1.78 15.21 0.72 C14.5 3.64 12.64 14.18 12.41 16.7 L12.23 18.51 L14.21 16.48 C18.28 12.23 24.64 7.74 29.31 5.73 C30.37 5.3 31.23 4.84 31.23 4.73 C31.23 4.64 30.26 3.47 29.08 2.18 C25.85 -1.4 21.98 -4.79 19.86 -5.85 C18.34 -6.59 18.22 -6.59 17.68 -5.79 Z" />
      <path fill="#F4CBD3" d="M18.54 -1.66 C17.91 -0.63 16.56 5.47 16.05 9.6 C15.87 10.95 15.62 12.75 15.5 13.64 L15.3 15.21 L18.28 12.72 C19.91 11.38 22.52 9.48 24.04 8.57 L26.85 6.88 L25.7 5.16 C24.44 3.3 19.48 -1.86 18.97 -1.86 C18.8 -1.86 18.6 -1.78 18.54 -1.66 Z" />
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
      <path fill="#BBB9B7" d="M17.28 -7.56 C15.44 -6.62 11.81 6.5 10.72 16.19 C10.17 21.23 10.14 21.09 11.38 19.6 C16.68 13.32 23.3 8.31 30.32 5.3 C32.81 4.24 33.18 4.01 32.95 3.58 C32.41 2.55 27.13 -2.72 25.13 -4.24 C22.87 -5.96 20.03 -7.51 18.74 -7.74 C18.28 -7.79 17.62 -7.74 17.28 -7.56 Z" />
      <path fill="#F9E3E5" d="M17.85 -4.79 C17.65 -4.67 17.31 -4.1 17.05 -3.52 C16.22 -1.52 14.07 7.48 13.35 12.03 C12.95 14.56 12.55 17.02 12.46 17.54 C12.32 18.4 12.38 18.37 14.24 16.42 C16.91 13.67 21.17 10.26 24.47 8.31 L27.22 6.65 L26.36 5.1 C23.07 -0.74 18.97 -5.47 17.85 -4.79 Z" />
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
  'deco-jaguar': '8 -10 84 32',
  'deco-wolf': '6 -11 88 36',
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
  'deco-angel-wing': '-17 51 134 21',
  'deco-devil-wing': '-17 51 134 21',
  'deco-devil-horn': '16 2 68 13',
  'deco-kitty-ribbon': '60 -5 33 28',
  'deco-bow-tie': '37 95 26 13',
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

export function DecoPreview({ id }) {
  const vb = PREVIEW_VB[id] || '0 0 100 100'
  return (
    <svg className="deco-preview" viewBox={vb} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {id === 'deco-sprout' && <Sprout />}
      {id === 'deco-tomato' && <Tomato />}
      {id === 'deco-bunny' && <BunnyEars />}
      {id === 'deco-bear' && <BearEars />}
      {id === 'deco-angel-wing' && <AngelWing />}
      {id === 'deco-devil-wing' && <DevilWing />}
      {id === 'deco-devil-horn' && <DevilHorn />}
      {id === 'deco-kitty-ribbon' && <KittyRibbon />}
      {id === 'deco-bow-tie' && <BowTie />}
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
  'deco-angel-wing': AngelWing, 'deco-devil-wing': DevilWing,
  'deco-devil-horn': DevilHorn, 'deco-kitty-ribbon': KittyRibbon, 'deco-bow-tie': BowTie,
}
// 테두리(원형 테두리) 유형: 아바타의 흰 테두리를 대체. 기본은 다른 꾸미기보다 뒤에 그려지되
// (후광), FRONTMOST_IDS 에 있으면(비눗방울) 예외적으로 항상 맨 앞에 그려진다.
export const BORDER_IDS = new Set(['deco-halo', 'deco-bubble'])
export const hasBorderDeco = (deco) => decoItems(deco).some((d) => BORDER_IDS.has(d.id))
const FRONTMOST_IDS = new Set(['deco-bubble'])
// 뒤(back) 레이어로 그릴 아이템(귀 + 날개 + 후광) — 나머지는 앞(front). 아트 종류로 결정.
const BACK_IDS = new Set(['deco-jaguar', 'deco-wolf', 'deco-halo', 'deco-bunny', 'deco-bear', 'deco-angel-wing', 'deco-devil-wing'])

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
