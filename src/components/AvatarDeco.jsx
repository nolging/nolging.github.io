import kittyRibbonPng from '../assets/deco/kitty-ribbon.png'
import partyHatPng from '../assets/deco/party-hat.png'
import cherryCreamPng from '../assets/deco/cherry-cream.png'
import bandagePng from '../assets/deco/bandage.png'
import alienShadesPng from '../assets/deco/alien-shades.png'
import koreaPng from '../assets/deco/korea.png'
import redHoodPng from '../assets/deco/red-hood.png'

// 아바타 꾸미기 데코레이션. 아바타 원(지름=size) 위에 SVG viewBox(0~100)로 그려 항상 비율이 맞는다.
//  - head: deco-sprout(새싹·앞) | deco-jaguar(까만 고양이 귀·뒤) | deco-wolf(강아지 귀·뒤)
//    | deco-angel-ring(천사 링·앞) | deco-tomato(토마토 꼭지·앞) | deco-bunny(토끼 귀·뒤) | deco-bear(곰 귀·뒤)
//    | deco-angel-wing(천사 날개·뒤) | deco-devil-wing(악마 날개·뒤) | deco-devil-horn(악마 뿔·앞)
//    | deco-kitty-ribbon(고양이 리본·앞) | deco-party-hat(고깔모자·앞) | deco-cherry-cream(체리 콕·앞) → 하나만
//  - face: deco-blush(양 볼 홍조) | deco-anger | deco-pixel-shades | deco-alien-shades | deco-bandage(오른 볼 반창고)
//    | deco-gum(풍선껌) | deco-bow-tie(나비넥타이·앞) | deco-chupa-chups(막대사탕·앞) | deco-korea(태극 배지·앞) → 하나만
//  - 안경(글라스류와 별도 슬롯. DB store_items.deco_slot='안경'): deco-circle-glasses(동그리 안경·앞)
//    → face 슬롯 아이템(선글라스 등)과 동시 장착 가능
// 귀(jaguar/wolf/bunny/bear)와 날개(angel-wing/devil-wing)는 아바타 "뒤" 레이어(back)에 그려,
// 프로필 사진에 가려진 채 옆으로 삐져나와 딱 맞게 보인다. 새싹·홍조·뿔·리본·고깔모자·체리 콕·
// 나비넥타이·막대사탕·동그리 안경은 "앞" 레이어(front).

export const DECO_HEAD = ['deco-sprout', 'deco-jaguar', 'deco-wolf', 'deco-angel-ring', 'deco-tomato', 'deco-bunny', 'deco-bear', 'deco-angel-wing', 'deco-devil-wing', 'deco-devil-horn', 'deco-kitty-ribbon', 'deco-party-hat', 'deco-cherry-cream', 'deco-red-hood']
export const DECO_FACE = ['deco-blush', 'deco-anger', 'deco-pixel-shades', 'deco-alien-shades', 'deco-bandage', 'deco-gum', 'deco-heart-shades', 'deco-bow-tie', 'deco-chupa-chups', 'deco-korea']
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
function BunnyEars({ tf, pickable }) {
  const ear = (
    <g className="avd-perk">
      <path fill="#F4CBD3" d="M42.01 -12.41 C39.66 -10.06 39 -4.9 40.46 -0.43 C41.26 2.03 40.72 1.86 46.07 1.43 L49 1.2 L49 -1.12 C49 -3.84 48.37 -8.31 47.71 -10.23 C47.45 -10.97 46.88 -11.98 46.42 -12.46 C45.76 -13.18 45.39 -13.32 44.27 -13.32 C43.12 -13.32 42.78 -13.18 42.01 -12.41 Z" />
      <path fill="#FFE6EB" d="M43.47 -7.36 C42.23 -5.99 41.86 -3.5 42.44 -0.2 L42.78 1.66 L44.93 1.46 C46.1 1.38 47.13 1.26 47.16 1.2 C47.22 1.15 47.13 -0.52 47.02 -2.55 C46.82 -5.5 46.68 -6.36 46.22 -6.96 C45.5 -7.94 44.15 -8.14 43.47 -7.36 Z" />
    </g>
  )
  const t = tf || DECO_TF0
  return (
    <>
      <g transform={tfAt(SPLIT_ANCHOR['deco-bunny'].l, t.left)} {...sideProps(pickable, 'l')}>{ear}</g>
      <g transform={tfAt(SPLIT_ANCHOR['deco-bunny'].r, t.right)} {...sideProps(pickable, 'r')}><g transform="translate(100,0) scale(-1,1)">{ear}</g></g>
    </>
  )
}

// 곰돌이(머리 유형): 양옆에 붙은 둥근 곰 귀 한 쌍. 토깽이와 마찬가지로 뒤(back) 레이어.
// 고양이/늑대 귀와 같은 까딱임(avd-twitch) — 양쪽 다 안쪽(가운데)으로 동시에 기운다.
function BearEars({ tf, pickable }) {
  const ear = (
    <>
      <path fill="#654C36" d="M15.39 -0.4 C12.18 0.11 9.03 2.46 7.59 5.42 C5.47 9.74 6.1 14.67 9.31 19.05 C9.89 19.83 10.43 20.49 10.49 20.49 C10.57 20.49 11.03 20 11.55 19.4 C16.1 14.1 20.89 10.2 26.59 7.08 L28.62 5.99 L27.39 4.41 C24.61 0.86 19.66 -1.12 15.39 -0.4 Z" />
      <path fill="#87674B" d="M15.04 4.56 C11 6.42 9.17 11.66 11.17 15.64 C12.46 18.19 12.41 18.19 15.01 15.67 C17.79 12.98 21.06 10.37 23.47 8.91 C25.47 7.68 25.47 7.48 23.47 5.76 C21.17 3.81 17.71 3.3 15.04 4.56 Z" />
    </>
  )
  const t = tf || DECO_TF0
  return (
    <>
      <g transform={tfAt(SPLIT_ANCHOR['deco-bear'].l, t.left)} {...sideProps(pickable, 'l')}><g className="avd-twitch-l">{ear}</g></g>
      <g transform={tfAt(SPLIT_ANCHOR['deco-bear'].r, t.right)} {...sideProps(pickable, 'r')}><g className="avd-twitch-r"><g transform="translate(100,0) scale(-1,1)">{ear}</g></g></g>
    </>
  )
}

// 천사 날개 / 악마 날개(머리 유형): 프로필 사진 양옆, 얼굴 중간 높이에서 뒤(back) 레이어로
// 삐져나온다. 날개 안쪽(사진에 가려지는 쪽)이 몸통에 붙는 지점 — 오른쪽으로 살짝 치우친
// 지점을 기준으로 파닥이는 회전(avd-wing-flap)을 준다.
// 천사 날개는 실루엣(흰 깃털 뭉치) 위에 깃털 결을 나누는 연한 라인(소용돌이 깃 끝 포함)을
// 겹쳐 그려야 원본 디테일이 살아난다 — 실루엣만으로는 뭉툭한 덩어리로 보임. 실루엣 가장자리에
// 흰색이 삐져나오지 않도록 얇은 테두리(stroke)를 같은 path에 두르되, 새 색을 쓰지 않고 이미
// 있는 깃털 결 라인과 똑같은 회색(#e9ebf3)·얇은 굵기로 통일해 이질감이 없게 한다.
const ANGEL_WING_D = 'M-12.62 53.98 C-13.85 54.64 -14.43 57.22 -13.71 58.80 C-13.45 59.37 -13.54 59.66 -14.17 60.60 C-15.49 62.55 -14.57 64.18 -11.65 65.13 C-11.36 65.22 -11.16 65.56 -11.16 65.96 C-11.16 67.68 -9.01 68.85 -7.04 68.25 C-6.18 68.00 -6.06 68.02 -5.52 68.88 C-5.17 69.37 -4.43 70.03 -3.80 70.32 C-2.77 70.80 -2.62 70.83 -0.85 70.34 C1.04 69.86 2.51 68.91 3.57 67.48 C4.05 66.85 4.17 66.28 4.17 64.59 C4.17 62.72 4.08 62.35 3.31 61.26 C2.16 59.63 1.19 59.11 -2.31 58.25 C-3.94 57.85 -5.75 57.25 -6.38 56.96 C-7.95 56.13 -10.22 54.47 -10.42 53.98 C-10.62 53.44 -11.65 53.44 -12.62 53.98 Z'
const ANGEL_WING_LINES_D = 'M-12.12 53.95 C-13.67 54.61 -14.36 57.07 -13.50 58.67 C-13.15 59.30 -13.18 59.48 -13.78 60.36 C-14.15 60.94 -14.47 61.74 -14.47 62.20 C-14.47 63.23 -13.12 64.63 -11.92 64.86 C-11.29 65.01 -11.03 65.21 -11.03 65.61 C-11.03 67.44 -9.11 68.70 -7.16 68.16 C-6.16 67.90 -6.07 67.93 -4.87 69.19 L-3.61 70.51 L-1.78 70.36 C0.34 70.19 1.43 69.68 2.84 68.22 C4.73 66.21 4.90 63.52 3.27 61.25 C2.18 59.76 1.12 59.13 -1.26 58.53 C-6.07 57.30 -7.74 56.53 -10.03 54.35 C-11.06 53.40 -10.89 53.43 -12.12 53.95 M-9.34 55.81 C-7.05 57.47 -5.64 58.13 -2.72 58.79 C0.54 59.56 1.69 60.22 2.61 61.74 C4.15 64.38 4.04 66.15 2.23 67.90 C1.03 69.08 -0.80 69.85 -2.35 69.85 C-3.84 69.85 -5.30 68.30 -5.30 66.75 C-5.30 65.81 -5.13 65.47 -4.38 64.83 C-3.61 64.18 -3.27 64.09 -2.23 64.20 C-1.32 64.29 -1.00 64.23 -1.00 63.95 C-1.00 63.72 -1.32 63.49 -1.69 63.37 C-3.32 62.97 -5.82 64.63 -5.93 66.24 C-6.02 67.16 -6.76 67.56 -8.25 67.56 C-9.34 67.56 -9.68 67.36 -10.14 66.50 C-10.69 65.44 -10.52 65.01 -9.46 64.81 C-8.48 64.63 -7.94 64.23 -8.25 63.95 C-8.31 63.86 -8.97 63.95 -9.71 64.15 C-11.29 64.55 -12.29 64.32 -13.21 63.40 C-14.07 62.54 -14.07 61.80 -13.24 60.79 C-12.69 60.19 -12.46 60.08 -12.01 60.31 C-11.72 60.48 -10.97 60.68 -10.37 60.77 C-9.57 60.88 -9.31 60.82 -9.31 60.51 C-9.31 60.25 -9.63 60.11 -10.26 60.11 C-12.06 60.11 -13.52 58.30 -13.18 56.47 C-13.01 55.49 -12.15 54.38 -11.60 54.38 C-11.43 54.38 -10.43 55.01 -9.34 55.81 Z'
// preview: 상점/인벤토리 미리보기 썸네일 전용 플래그. 실제 아바타에 그려질 때(preview
// 미지정)는 원래 간격(양 날개 pivot이 0/100)을 그대로 쓰고, 미리보기에서만 두 날개를
// 중앙 쪽으로 WING_PREVIEW_DX 만큼 끌어당겨 좁은 크롭 박스 안에서 크게 보이게 한다.
// (경로 데이터 자체는 안 건드리므로 decoAnchor·DecoAdjuster 조정 기준점엔 영향 없음)
const WING_PREVIEW_DX = 40
function AngelWing({ preview, tf, pickable }) {
  const wing = (
    <g className="avd-wing-flap">
      <path d={ANGEL_WING_D} fill="#ffffff" stroke="#e9ebf3" strokeWidth="0.5" strokeLinejoin="round" />
      <path d={ANGEL_WING_LINES_D} fill="#e9ebf3" />
    </g>
  )
  const dx = preview ? WING_PREVIEW_DX : 0
  const t = tf || DECO_TF0
  return (
    <>
      <g transform={tfAt(SPLIT_ANCHOR['deco-angel-wing'].l, t.left)} {...sideProps(pickable, 'l')}>
        <g transform={`translate(${dx},0)`}>{wing}</g>
      </g>
      <g transform={tfAt(SPLIT_ANCHOR['deco-angel-wing'].r, t.right)} {...sideProps(pickable, 'r')}>
        <g transform={`translate(${100 - dx},0) scale(-1,1)`}>{wing}</g>
      </g>
    </>
  )
}

const DEVIL_WING_D = 'M-6.22 58.80 C-8.94 61.20 -11.89 64.47 -11.58 64.79 C-11.46 64.90 -10.83 64.84 -10.20 64.61 C-8.08 63.87 -6.65 64.18 -5.22 65.73 L-4.53 66.48 L-4.01 65.62 C-3.35 64.53 -2.35 64.30 -1.18 64.90 C-0.69 65.16 -0.23 65.33 -0.20 65.27 C-0.17 65.21 -0.03 64.81 0.14 64.33 C0.40 63.50 0.80 63.27 2.64 62.89 C3.38 62.75 3.44 62.64 3.35 61.66 L3.27 60.60 L1.40 60.43 C-1.20 60.17 -2.41 59.57 -3.35 58.19 C-3.78 57.54 -4.13 57.02 -4.16 57.02 C-4.18 57.02 -5.10 57.82 -6.22 58.80 Z'
function DevilWing({ preview, tf, pickable }) {
  const wing = (
    <g className="avd-wing-flap">
      <path d={DEVIL_WING_D} fill="#17171b" />
    </g>
  )
  const dx = preview ? WING_PREVIEW_DX : 0
  const t = tf || DECO_TF0
  return (
    <>
      <g transform={tfAt(SPLIT_ANCHOR['deco-devil-wing'].l, t.left)} {...sideProps(pickable, 'l')}>
        <g transform={`translate(${dx},0)`}>{wing}</g>
      </g>
      <g transform={tfAt(SPLIT_ANCHOR['deco-devil-wing'].r, t.right)} {...sideProps(pickable, 'r')}>
        <g transform={`translate(${100 - dx},0) scale(-1,1)`}>{wing}</g>
      </g>
    </>
  )
}

// 악마 뿔(머리 유형): 앞(front) 레이어 — 사진 위 머리카락 경계에 살짝 겹치며 위로 솟는다.
// 순수 벡터 path(PNG 아님) — 이등변 부채꼴: 뾰족한 끝에서 뻗은 두 변의 길이가 같은 직선이고,
// 밑변만 아래로 살짝 볼록한 호. 기존의 살짝 기운 각도는 그대로 유지, 변의 길이는 2배로 확대
// (기준점 17.91,8.74 를 고정하고 나머지 점을 그 점 기준 2배로 늘림). 이후 호의 양 끝점(밑변)이
// 아바타 원(중심 50,50 반지름 50) 안쪽에 들어오도록 전체를 아래로 4.5 만큼 이동.
const DEVIL_HORN_D = 'M17.91 13.24 C21.63 14.96 24.21 13.9 25.65 10.06 L18.53 3.78 Z'
function DevilHorn({ tf, pickable }) {
  const t = tf || DECO_TF0
  // 뿔 자체가 붉게 깜빡이는 펄스: (1) 뒤에 깔린 블러 글로우가 은은하게 opacity 로 깜빡이고,
  // (2) 검정 뿔 위에 같은 모양의 크리스프한 빨강을 겹쳐 opacity 로 함께 깜빡여 뿔 자체가
  // 색이 바뀌는 것처럼 보이게 한다 — 실제 fill 색상을 애니메이션하면 매 프레임 다시 칠해야
  // 하니, 대신 두 장을 겹쳐 opacity 크로스페이드로 흉내낸다(파일 상단 stroke-width 경고 참고).
  const horn = (
    <>
      <path className="avd-devil-horn-glow" d={DEVIL_HORN_D} fill="#e5484d" filter="url(#devilHornBlur)" />
      <path d={DEVIL_HORN_D} fill="#17171b" />
      <path className="avd-devil-horn-flash" d={DEVIL_HORN_D} fill="#e5484d" />
    </>
  )
  return (
    <>
      <defs>
        <filter id="devilHornBlur" x="-150%" y="-150%" width="400%" height="400%">
          <feGaussianBlur stdDeviation="1.1" />
        </filter>
      </defs>
      <g transform={tfAt(SPLIT_ANCHOR['deco-devil-horn'].l, t.left)} {...sideProps(pickable, 'l')}>{horn}</g>
      <g transform={tfAt(SPLIT_ANCHOR['deco-devil-horn'].r, t.right)} {...sideProps(pickable, 'r')}>
        <g transform="translate(100,0) scale(-1,1)">{horn}</g>
      </g>
    </>
  )
}

// 고양이 리본(머리 유형): 앞(front) 레이어, 오른쪽 위 머리 위에 얹힌 리본. 벡터로 그리면
// 디테일이 살지 않아 관리자가 준 PNG 원본을 그대로 SVG <image> 로 삽입 — 좌표계(0~100)는
// 기존 벡터 버전이 차지하던 자리를 그대로 재현해 다른 꾸미기와 배치가 어긋나지 않는다.
function KittyRibbon() {
  return <image href={kittyRibbonPng} x="61" y="-3" width="30" height="25.5" preserveAspectRatio="xMidYMid meet" />
}

// 나비넥타이(얼굴 유형): 앞(front) 레이어, 사진 아래쪽(턱·목 부근)에 걸린다.
const BOW_TIE_D = 'M39.27 97.77 C38.99 99.29 39.07 101.32 39.53 103.50 C40.28 107.08 40.45 107.17 44.69 105.88 C47.01 105.16 47.41 104.93 48.79 103.56 L50.28 101.98 L51.80 103.56 C53.14 104.93 53.54 105.16 55.86 105.88 C60.11 107.17 60.28 107.08 61.02 103.50 C61.48 101.32 61.57 99.29 61.28 97.77 L61.08 96.85 L58.04 96.97 C55.18 97.05 54.86 97.14 52.66 98.23 L50.28 99.37 L47.93 98.23 C45.69 97.14 45.38 97.05 42.51 96.97 L39.48 96.85 L39.27 97.77 Z'
function BowTie() {
  return <path d={BOW_TIE_D} fill="#17171b" />
}

// 고깔모자(머리 유형): 앞(front) 레이어, 머리 위에 얹힌 파티 고깔. 벡터로 그리면 줄무늬
// 사이 디테일이 살지 않아 관리자가 준 PNG 원본을 그대로 SVG <image> 로 삽입 — 좌표계(0~100)는
// 기존 벡터 버전이 차지하던 자리를 그대로 재현해 다른 꾸미기와 배치가 어긋나지 않는다.
function PartyHat() {
  return <image href={partyHatPng} x="40.5" y="-18" width="19" height="23.6" preserveAspectRatio="xMidYMid meet" />
}

// 츄파춥스(얼굴 유형): 앞(front) 레이어, 입가에 문 막대사탕 — 사탕 머리는 입에 가려지고
// 막대만 보인다. 균일한 굵기의 둥근 캡 선분이라 <line> 하나로 충분하다.
function ChupaChups() {
  return <line x1="55.82" y1="83.20" x2="76.68" y2="93.34" stroke="#faf9f5" strokeWidth="2.35" strokeLinecap="round" />
}

// 체리 콕(머리 유형): 앞(front) 레이어, 머리 위에 얹힌 휘핑크림 + 체리. 벡터로 그리면
// 디테일이 살지 않아 관리자가 준 PNG 원본을 그대로 SVG <image> 로 삽입.
function CherryCream() {
  return <image href={cherryCreamPng} x="34.7" y="-21.2" width="29.8" height="34.7" preserveAspectRatio="xMidYMid meet" />
}

function CatEars({ tf, pickable }) {
  const ear = (
    <>
      <path fill="#101010" d="M17.68 -5.79 C16.91 -4.58 15.85 -1.78 15.21 0.72 C14.5 3.64 12.64 14.18 12.41 16.7 L12.23 18.51 L14.21 16.48 C18.28 12.23 24.64 7.74 29.31 5.73 C30.37 5.3 31.23 4.84 31.23 4.73 C31.23 4.64 30.26 3.47 29.08 2.18 C25.85 -1.4 21.98 -4.79 19.86 -5.85 C18.34 -6.59 18.22 -6.59 17.68 -5.79 Z" />
      <path fill="#F4CBD3" d="M18.54 -1.66 C17.91 -0.63 16.56 5.47 16.05 9.6 C15.87 10.95 15.62 12.75 15.5 13.64 L15.3 15.21 L18.28 12.72 C19.91 11.38 22.52 9.48 24.04 8.57 L26.85 6.88 L25.7 5.16 C24.44 3.3 19.48 -1.86 18.97 -1.86 C18.8 -1.86 18.6 -1.78 18.54 -1.66 Z" />
    </>
  )
  const t = tf || DECO_TF0
  return (
    <>
      <g transform={tfAt(SPLIT_ANCHOR['deco-jaguar'].l, t.left)} {...sideProps(pickable, 'l')}><g className="avd-twitch-l">{ear}</g></g>
      <g transform={tfAt(SPLIT_ANCHOR['deco-jaguar'].r, t.right)} {...sideProps(pickable, 'r')}><g className="avd-twitch-r"><g transform="translate(100,0) scale(-1,1)">{ear}</g></g></g>
    </>
  )
}

function WolfEars({ tf, pickable }) {
  const ear = (
    <>
      <path fill="#BBB9B7" d="M17.28 -7.56 C15.44 -6.62 11.81 6.5 10.72 16.19 C10.17 21.23 10.14 21.09 11.38 19.6 C16.68 13.32 23.3 8.31 30.32 5.3 C32.81 4.24 33.18 4.01 32.95 3.58 C32.41 2.55 27.13 -2.72 25.13 -4.24 C22.87 -5.96 20.03 -7.51 18.74 -7.74 C18.28 -7.79 17.62 -7.74 17.28 -7.56 Z" />
      <path fill="#F9E3E5" d="M17.85 -4.79 C17.65 -4.67 17.31 -4.1 17.05 -3.52 C16.22 -1.52 14.07 7.48 13.35 12.03 C12.95 14.56 12.55 17.02 12.46 17.54 C12.32 18.4 12.38 18.37 14.24 16.42 C16.91 13.67 21.17 10.26 24.47 8.31 L27.22 6.65 L26.36 5.1 C23.07 -0.74 18.97 -5.47 17.85 -4.79 Z" />
    </>
  )
  const t = tf || DECO_TF0
  return (
    <>
      <g transform={tfAt(SPLIT_ANCHOR['deco-wolf'].l, t.left)} {...sideProps(pickable, 'l')}><g className="avd-twitch-l">{ear}</g></g>
      <g transform={tfAt(SPLIT_ANCHOR['deco-wolf'].r, t.right)} {...sideProps(pickable, 'r')}><g className="avd-twitch-r"><g transform="translate(100,0) scale(-1,1)">{ear}</g></g></g>
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

function Blush({ tf, pickable }) {
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
  const t = tf || DECO_TF0
  return (
    <g className="avd-blush">
      <defs>
        <radialGradient id="avdBlush" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f58aaf" stopOpacity="0.72" />
          <stop offset="55%" stopColor="#f58aaf" stopOpacity="0.42" />
          <stop offset="100%" stopColor="#f58aaf" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g transform={tfAt(SPLIT_ANCHOR['deco-blush'].l, t.left)} {...sideProps(pickable, 'l')}>{cheek(19, -8)}</g>
      <g transform={tfAt(SPLIT_ANCHOR['deco-blush'].r, t.right)} {...sideProps(pickable, 'r')}>{cheek(81, 8)}</g>
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

function Bandage() {
  return <image href={bandagePng} x="68.77" y="52.15" width="26.93" height="17.77" preserveAspectRatio="xMidYMid meet" />
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

// 왹져(외계인) 선글라스: 관리자가 준 PNG 원본을 그대로 SVG <image> 로 삽입. 좌표계(0~100)는
// 관리자가 준 적용 샘플(눈 위치, 크기)을 그대로 재현 — PREVIEW_VB 도 이 자리에 맞춰 함께 옮겼다
// (미리보기 크롭·decoAnchor 회전/확대 기준점 모두 이 새 위치 기준).
function AlienShades() {
  return <image href={alienShadesPng} x="20.8" y="23.6" width="58.2" height="31.9" preserveAspectRatio="xMidYMid meet" />
}

// 태극 배지(얼굴 유형): 앞(front) 레이어, 오른쪽 볼에 붙는 작은 원형 배지. 관리자가 준 PNG
// 원본을 그대로 SVG <image> 로 삽입 — 좌표계(0~100)는 관리자가 준 적용 샘플 위치를 그대로 재현.
function Korea() {
  return <image href={koreaPng} x="64.8" y="50" width="13.2" height="13" preserveAspectRatio="xMidYMid meet" />
}

// 작은 하트 path(로컬 원점 중심, -4~4 폭) — 후드 정수리 위로 뿅뿅 솟아오르는 장식용.
const HOOD_HEART_PATH = 'M0,4 C0,4 -4,1 -4,-1.5 C-4,-3.4 -2.4,-4.5 -1,-3.8 C-0.4,-3.5 0,-3 0,-3 C0,-3 0.4,-3.5 1,-3.8 C2.4,-4.5 4,-3.4 4,-1.5 C4,1 0,4 0,4 Z'
// 시작 자리(x,y)는 그 x 위치에서 후드 이미지가 실제로 덮고 있는(불투명한) 높이 안쪽으로
// 잡았다(후드 실루엣을 실측해 안전 마진을 둠) — 하트가 <image> 보다 먼저 그려지므로 이
// 자리에선 후드에 완전히 가려져 있다가, 위로 솟아 정수리(y=-10.6) 위를 넘어선 뒤에야
// 보이기 시작한다. 흰 배경 위에서 갑자기 나타나지 않고 "후드 뒤에서" 올라오는 이유.
// 프로필 사진 폭 전체(x 0~100)에 걸쳐 자리·크기·색·타이밍을 조금씩 달리 흩어 놓아 한
// 곳에 몰리지 않고, 한꺼번에 튀지도 않고 "간간이" 따로따로 둥실 떠오르는 것처럼 보이게 한다.
const HOOD_HEARTS = [
  { x: 12, y: 16, s: 0.72, d: 0, dur: 5.2, c: '#ff2d55' },
  { x: 27, y: 1, s: 0.58, d: 1.1, dur: 4.7, c: '#ff7a9c' },
  { x: 42, y: -4, s: 0.66, d: 2.2, dur: 5.6, c: '#ff4d6d' },
  { x: 58, y: -6, s: 0.78, d: 0.5, dur: 5, c: '#ffb3c6' },
  { x: 73, y: 2, s: 0.6, d: 3, dur: 4.4, c: '#e0245e' },
  { x: 88, y: 15, s: 0.68, d: 1.8, dur: 5.4, c: '#ff5d7a' },
]
// 빨간 모자(머리 유형·뒤 레이어): 관리자가 준 PNG 원본을 그대로 SVG <image> 로 삽입해
// 프로필 사진 뒤에서 후드처럼 감싼다(좌표계는 관리자가 준 적용 샘플을 그대로 재현). 정수리
// 위에서 작은 하트 여러 개가 각자 다른 박자로 솟아올랐다 사라지는 장식을 더했다 — 하트를
// <image> 보다 먼저 그려 후드보다 뒤(아래)에서 올라오는 것처럼 보이게 한다.
function RedHood() {
  return (
    <>
      {HOOD_HEARTS.map((h, i) => (
        <g key={i} transform={`translate(${h.x} ${h.y}) scale(${h.s})`}>
          <path className="avd-heart-pop" style={{ animationDelay: `${h.d}s`, animationDuration: `${h.dur}s` }}
            d={HOOD_HEART_PATH} fill={h.c} />
        </g>
      ))}
      <image href={redHoodPng} x="-9.74" y="-10.6" width="119.77" height="130.09" preserveAspectRatio="xMidYMid meet" />
    </>
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

// 동그리 안경(안경 유형): 동그란 알 두 개 + 가운데 브릿지. 알 안쪽은 채우지 않아(테만) 사진이
// 그대로 비친다 — 다른 선글라스류와 달리 얼굴(face) 슬롯이 아니라 별도의 "안경" 슬롯.
function CircleGlasses() {
  const LC = 30, RC = 70, CY = 46.5, R = 15
  return (
    <g fill="none" stroke="#17171b" strokeWidth="1.3">
      <circle cx={LC} cy={CY} r={R} />
      <circle cx={RC} cy={CY} r={R} />
      <path d={`M${LC + R} ${CY + 0.5} Q50 ${CY - 1.5} ${RC - R} ${CY + 0.5}`} strokeLinecap="round" />
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
        <linearGradient id="angelRingMetal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fffbe6" />
          <stop offset="45%" stopColor="#ffe17a" />
          <stop offset="100%" stopColor="#ffc93f" />
        </linearGradient>
        {/* 링 자체가 빛나 보이게: 가운데를 채우는 원이 아니라, 같은 타원 "테두리 선"을 굵고
            흐릿하게 겹쳐 그린다 — 광원이 링의 선을 따라가서 빈 가운데가 아니라 금속 링에서
            빛이 번지는 것처럼 보인다. */}
        <filter id="angelRingBlur" x="-80%" y="-200%" width="260%" height="500%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
      </defs>
      {/* 은은한 펄스: 블러 처리된 두 겹의 빛(글로우)만 opacity 로 깜빡이고, 크리스프한
          금속 링 자체는 고정 — opacity 는 합성 단계에서 처리돼 다시 칠하지 않는다(파일
          상단 stroke-width 관련 경고 참고). */}
      <g className="avd-angel-glow-pulse">
        <ellipse cx="50" cy="-7" rx="18" ry="6.4" fill="none" stroke="#ffe58a" strokeOpacity="0.8"
          strokeWidth="7" filter="url(#angelRingBlur)" />
        <ellipse cx="50" cy="-7" rx="18" ry="6.4" fill="none" stroke="#fff6d0" strokeOpacity="0.9"
          strokeWidth="3.2" filter="url(#angelRingBlur)" />
      </g>
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

// 하트 빔(테두리 유형·뒤 레이어): 프로필 사진 뒤에서 통통한 하트 테두리가 일정한 속도로
// 커지며 사진 바깥까지 퍼져나가다 자연스럽게 페이드아웃 — 참고 이미지처럼 바깥으로
// 갈수록 흐릿하고 옅어지는(가장 안쪽은 진하고 또렷, 바깥은 흐릿하고 옅은) 하트 링 3겹이
// 반복해서 퍼진다. 채운 하트끼리 겹쳐서 "테두리"를 흉내 내면 뾰족한 아래 꼭짓점과 둥근
// 위쪽 봉우리의 곡률이 달라 굵기가 고르지 않다(끝은 얇고 옆은 두꺼움) — 대신 채우기 없이
// 실제 stroke 로 하트 테두리 자체를 그려 어느 지점이든 폭이 똑같은 링이 되게 하고,
// vectorEffect="non-scaling-stroke" 로 커지는 동안에도 테두리 굵기가 그대로 유지된다.
// 프로필 사진과 정확히 같은 중심이 아니라 살짝 아래로 치우친 중심에서 자라나, 사진
// 위로는 살짝만 삐져나오고 아래로는 넉넉히 삐져나온다(참고 이미지의 배치와 동일).
const heartBeamPath = (cx, cy, a) =>
  `M${cx} ${cy - a * 0.58}`
  + ` C${cx - a * 0.15} ${cy - a * 1.08} ${cx - a * 1.15} ${cy - a * 0.98} ${cx - a * 1.02} ${cy - a * 0.15}`
  + ` C${cx - a * 0.98} ${cy + a * 0.5} ${cx - a * 0.45} ${cy + a * 0.55} ${cx} ${cy + a * 1.0}`
  + ` C${cx + a * 0.45} ${cy + a * 0.55} ${cx + a * 0.98} ${cy + a * 0.5} ${cx + a * 1.02} ${cy - a * 0.15}`
  + ` C${cx + a * 1.15} ${cy - a * 0.98} ${cx + a * 0.15} ${cy - a * 1.08} ${cx} ${cy - a * 0.58} Z`
const HEART_BEAM_CX = 50, HEART_BEAM_CY = 54, HEART_BEAM_A = 34
const HEART_BEAM_PATH_D = heartBeamPath(HEART_BEAM_CX, HEART_BEAM_CY, HEART_BEAM_A)
// 하트 테두리 굵기 = 프로필 사진 지름의 %. 하트는 항상 아바타 좌표계(viewBox "0 0 100 100",
// 즉 지름 100)에 그려지고, SVG 가 그 좌표계를 실제 렌더링 픽셀 크기에 맞춰 알아서 늘이거나
// 줄여주므로 "지름의 %"로 정의해 두면 24px 아바타든 220px 아바타든 별도 계산 없이 항상
// 정확히 같은 비율로 보인다.
//
// ⚠️ 단, 이게 성립하려면 획에 vector-effect="non-scaling-stroke" 를 걸면 안 된다 —
// 이걸 걸면 굵기가 viewBox 스케일을 무시하고 "화면 픽셀" 단위로 고정돼 버려서, 크기와
// 상관없이 항상 같은 두께로 그려진다(직접 측정: 24px 아바타 → 14px, 220px 아바타 → 16px.
// 즉 작은 아바타에서는 지름의 58%, 큰 아바타에서는 7%). 여기서 몇 %로 계산하든 그 값이
// 통째로 버려지기 때문에, 작은 아바타에서만 하트가 유독 굵고 사진 밖으로 훨씬 크게
// 삐져나오고 큰 아바타에서는 거의 안 보이던 문제의 진짜 원인이 바로 이것이었다.
// 이 굵기는 애니메이션하지 않고 고정이다 — stroke-width 는 "칠하기" 속성이라 애니메이션하면
// 매 프레임 레이어를 다시 칠하게 만들고, 그게 다른 꾸미기 아이템이 떨려 보이던 원인이었다
// (자세한 내용은 index.css 의 avd-heart-beam 키프레임 주석). 고정이라 커지는 동안 획도 같이
// 굵어지는데, 잘 보이는 구간의 한가운데(scale 약 1.2)에서 예전의 일정 굵기와 비슷해 보이도록
// 기준값을 그만큼 낮춰 잡았다.
const HEART_BEAM_STROKE_PCT = 0.098
// 흐림 반경 = "그 겹의 굵기"의 %. 흐림을 굵기와 별개의 고정 숫자로 관리하면 굵기 계산 방식을
// 바꿀 때마다 같이 어긋났었다 — 굵기에 곱하는 비율로 정의해 두면 무슨 화면에서든 항상 같은
// 상대적 부드러움을 유지한다. 옅은 겹은 더 크게, 진한 겹은 더 작게 흐려서 바깥은 부드럽고
// 안쪽은 또렷하게 보인다.
// 바깥→안쪽 순서로: 가장 흐릿하고 옅은 겹 → 진한 겹(2가지 색만 반복 — 가장 진하고 또렷한
// 겹은 뺐다). 한 주기(HEART_BEAM_DUR) 동안 균등한 간격으로 어긋난 시작 시점(d)을 줘 항상
// 크기가 다른 하트 2겹이 겹쳐서 자라는 것처럼 보이게 한다. d 를 음수(마이너스 딜레이)로
// 줘서, 페이지에 처음 들어와도 각 겹이 이미 주기 중간 어딘가에 가 있는 상태로 바로 시작한다
// — 그래야 "방금 시작한" 게 아니라 "원래부터 계속 반복되고 있었던" 것처럼 보인다(양수
// 딜레이면 맨 처음엔 딜레이가 지날 때까지 화면에 아무것도 안 보이다가 그제서야 첫 하트가
// 사진 뒤에서 자라나기 시작해 부자연스럽다).
const HEART_BEAM_FLAVORS = [
  { c: '#ffd9ea', blurPct: 0.24, op: 0.9 },
  { c: '#ffb0d6', blurPct: 0.1, op: 1 },
]
const HEART_BEAM_DUR = 2.8
// 색은 2가지만 반복하되, 하트 "개수"는 색 개수보다 많게(4개) 늘려 다음 하트가 더 빨리
// 뒤따라오게 한다(간격 = DUR/개수 — 색 수만큼만 만들면 간격이 너무 벌어짐). 각 겹의
// 자체 성장·페이드 속도(HEART_BEAM_DUR)는 그대로라 간격만 좁아지고 빠르기는 안 바뀐다.
const HEART_BEAM_PULSE_COUNT = 4
const HEART_BEAM_PULSES = Array.from({ length: HEART_BEAM_PULSE_COUNT }, (_, i) => ({
  ...HEART_BEAM_FLAVORS[i % HEART_BEAM_FLAVORS.length],
  flavorIdx: i % HEART_BEAM_FLAVORS.length,
  d: -((i + 0.5) * HEART_BEAM_DUR) / HEART_BEAM_PULSE_COUNT,
}))
// 굵기·흐림 모두 아바타 좌표계(지름 100)의 값으로만 정하고, 실제 화면 크기 변환은 SVG 의
// viewBox 스케일에 전적으로 맡긴다 — 그래서 이 컴포넌트는 아바타가 몇 px 인지 알 필요가
// 없고(size 같은 걸 받지 않는다), 화면마다 다른 보정도 필요 없다.
// 상점/인벤토리 미리보기(PREVIEW_VB)는 하트가 사진 바깥까지 자라는 걸 다 담으려고 아바타
// 좌표계보다 넓은 여백까지 보여주는 것뿐이고 아바타 자체의 지름(100)은 그대로라, 그 바깥
// 여백 폭을 굵기 계산에 반영하면 오히려 어긋난다(이전에 vbScale 로 나눠주던 보정을 뺀 이유).
// DecoAdjuster 의 "크기" 슬라이더(tf.s)도 <g transform="...scale(tf.s)..."> 로 적용되는데,
// non-scaling-stroke 를 뺐으므로 이 transform 이 획 굵기까지 정상적으로 같이 키워준다 —
// 예전처럼 tf.s 를 굵기에 직접 곱하면 두 번 적용돼서 오히려 과하게 굵어진다.
const HEART_BEAM_STROKE = 100 * HEART_BEAM_STROKE_PCT
// 흐림 필터가 실제로 다시 그려지는 영역. 전에는 objectBoundingBox 퍼센트로 "넉넉하게"
// x=-200% width=500% 를 줬는데(잘림만 안 나면 된다고 대충 잡은 값), 이러면 40px 아바타
// 기준 140x128px — 아바타의 3.5배, 사방 50px 씩 — 이 매 프레임 다시 그려진다. 그 영역이
// 옆 아바타까지 통째로 덮어서, 하트 빔을 낀 아바타 주변의 "가만히 있어야 할" 꾸미기
// 아이템들까지 매 프레임 다시 래스터라이즈되는 게 흔들려 보이던 원인.
//
// 그래서 퍼센트 대신 사용자 좌표(userSpaceOnUse)로 필요한 만큼만 정확히 잡는다. 필요한 여유는
//   (획 굵기 절반) + (가우시안 흐림이 실질적으로 번지는 거리 ≈ 3σ)
// 이다. 필터는 transform 이 적용되기 "전"의 좌표계에서 계산되고 굵기도 이제 고정이라,
// 커지는 배율과 무관하게 이 영역 하나면 충분하다. 상수를 바꾸면 식이 알아서 따라간다.
const HEART_BEAM_PAD =
  HEART_BEAM_STROKE / 2
  + 3 * HEART_BEAM_STROKE * Math.max(...HEART_BEAM_FLAVORS.map((f) => f.blurPct))
const HEART_BEAM_FILTER = {
  x: HEART_BEAM_CX - HEART_BEAM_A * 1.02 - HEART_BEAM_PAD,
  y: HEART_BEAM_CY - HEART_BEAM_A * 1.08 - HEART_BEAM_PAD,
  width: HEART_BEAM_A * 1.02 * 2 + HEART_BEAM_PAD * 2,
  height: HEART_BEAM_A * (1.08 + 1.0) + HEART_BEAM_PAD * 2,
}
function HeartBeam() {
  return (
    <g>
      <defs>
        {HEART_BEAM_FLAVORS.map((f, i) => (
          // 영역이 좁으면 흐림이 사각형 경계에서 뚝 잘려 보이므로(둥근 흐림이 아니라 네모난
          // 테두리가 비쳐 보이던 그 증상) HEART_BEAM_FILTER 로 필요한 만큼은 반드시 확보한다.
          <filter key={i} id={`heartBeamBlur${i}`} filterUnits="userSpaceOnUse"
            x={HEART_BEAM_FILTER.x} y={HEART_BEAM_FILTER.y}
            width={HEART_BEAM_FILTER.width} height={HEART_BEAM_FILTER.height}>
            <feGaussianBlur stdDeviation={HEART_BEAM_STROKE * f.blurPct} />
          </filter>
        ))}
      </defs>
      {HEART_BEAM_PULSES.map((p, i) => (
        // strokeWidth 는 고정 — CSS 키프레임은 transform/opacity 만 건드린다(칠하기 속성인
        // stroke-width 를 애니메이션하면 매 프레임 다시 칠하게 돼 다른 아이템이 떨려 보인다).
        <path key={i}
          className="avd-heart-beam-pulse"
          style={{ animationDelay: `${p.d}s`, animationDuration: `${HEART_BEAM_DUR}s` }}
          d={HEART_BEAM_PATH_D} fill="none" stroke={p.c} strokeOpacity={p.op} strokeWidth={HEART_BEAM_STROKE}
          strokeLinejoin="round" filter={`url(#heartBeamBlur${p.flavorIdx})`} />
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
  'deco-alien-shades': '19 22 62 36',
  'deco-bandage': '68 51 29 20',
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
  'deco-devil-horn': '16 1.5 68 15',
  'deco-kitty-ribbon': '60 -5 33 28',
  'deco-bow-tie': '37 95 26 13',
  'deco-party-hat': '38 -20 24 29',
  'deco-chupa-chups': '54 81 25 14',
  'deco-cherry-cream': '35 -21 30 36',
  'deco-circle-glasses': '13 29 74 34',
  'deco-korea': '61 46 20 20',
  'deco-red-hood': '-10 -11 120 131',
  'deco-heart-beam': '-40 -36 180 180',
}
// 미리보기 전용 뷰박스 오버라이드. PREVIEW_VB 를 직접 바꾸면 decoAnchor(실제 아바타
// 조정 기준점)까지 같이 틀어지므로, 천사/악마 날개처럼 "미리보기에서만" 좁혀 보이게 할
// 아이템은 여기에 별도로 정의해 DecoPreview 에서만 사용한다.
const PREVIEW_VB_OVERRIDE = {
  'deco-angel-wing': '21 50 57 24',
  'deco-devil-wing': '25 54 50 16',
}
// 아이템별 기준점(회전·확대의 중심) = 미리보기 뷰박스의 중앙 = 그 장식의 시각적 중심.
// 이 점을 기준으로 돌리고 키워야 "제자리에서" 조정되는 것처럼 느껴진다.
export function decoAnchor(id) {
  const vb = PREVIEW_VB[id]
  if (!vb) return [50, 50]
  const [x, y, w, h] = vb.split(' ').map(Number)
  return [x + w / 2, y + h / 2]
}
// 아이템이 아바타 원(0~100 뷰박스) 위아래로 얼마나 삐져나오는지(%). 빨간 모자처럼 위아래로
// 키가 큰 아이템을 DecoAdjuster 에 띄울 때, 그만큼 위/아래 여백을 더 확보해 셀렉트박스·
// 컨트롤 바를 가리지 않게 하는 데 쓴다.
export function decoOverflow(id) {
  const vb = PREVIEW_VB[id]
  if (!vb) return { top: 0, bottom: 0 }
  const [, y, , h] = vb.split(' ').map(Number)
  return { top: Math.max(0, -y), bottom: Math.max(0, y + h - 100) }
}

// 그룹 프로필 사진에 맞춘 조정값 → SVG transform.
// 기준점에서 회전·확대한 뒤 이동. (translate 를 먼저 쓰면 회전에 끌려 위치가 틀어진다)
export const DECO_TF0 = { s: 1, x: 0, y: 0, r: 0 }
// 임의의 기준점을 받는 버전(좌우 분리 조정에서 좌/우 각각 다른 기준점을 써야 해서 분리).
export function tfAt([ax, ay], tf) {
  if (!tf) return undefined
  const s = Number(tf.s) || 1, x = Number(tf.x) || 0, y = Number(tf.y) || 0, r = Number(tf.r) || 0
  if (s === 1 && x === 0 && y === 0 && r === 0) return undefined
  return `translate(${x} ${y}) translate(${ax} ${ay}) rotate(${r}) scale(${s}) translate(${-ax} ${-ay})`
}
export function decoTransform(id, tf) {
  return tfAt(decoAnchor(id), tf)
}
// 조정값이 있을 때만 그룹으로 감싼다(없으면 DOM 을 늘리지 않음)
const Tf = ({ id, tf, children }) => {
  const t = decoTransform(id, tf)
  return t ? <g transform={t}>{children}</g> : children
}

// 좌우로 나뉜 아이템(동물 귀·뿔·날개·홍조)의 좌/우 각각의 기준점. 값은 각 반쪽 도안(원본
// path, 미러 전) 좌표의 시각적 중심 — decoAnchor 와 마찬가지로 이 점을 중심으로 돌리고
// 키워야 "제자리에서" 조정되는 느낌이 난다. 우측 기준점은 좌측 기준점을 x=50 기준으로
// 미러한 값(100 - 좌측x)과 정확히 같다(실제 렌더도 translate(100,0) scale(-1,1) 로 미러).
const SPLIT_ANCHOR = {
  'deco-jaguar':     { l: [21.73, 6.06], r: [78.27, 6.06] },
  'deco-wolf':       { l: [21.68, 6.37], r: [78.32, 6.37] },
  'deco-bunny':      { l: [44.34, -5.82], r: [55.66, -5.82] },
  'deco-bear':       { l: [17.49, 9.97], r: [82.51, 9.97] },
  'deco-devil-horn': { l: [21.78, 9.37], r: [78.22, 9.37] },
  'deco-blush':      { l: [19, 64], r: [81, 64] },
  'deco-angel-wing': { l: [-5.19, 62.13], r: [105.19, 62.13] },
  'deco-devil-wing': { l: [-4.11, 61.75], r: [104.11, 61.75] },
}
export const SPLIT_IDS = new Set(Object.keys(SPLIT_ANCHOR))
export function splitAnchor(id, side) {
  return SPLIT_ANCHOR[id]?.[side] || decoAnchor(id)
}
// pickable(=DecoAdjuster 가 좌우 분리 모드일 때만 true)일 때만 좌/우 그룹에 data-deco-side 를
// 달고 클릭 가능하게(pointer-events) 만든다 — 다른 곳(대시보드 등 아바타가 그냥 표시만 되는
// 화면)에서는 계속 클릭 불가(.avatar-deco 의 pointer-events:none 이 그대로 상속됨).
const sideProps = (pickable, side) => (pickable ? { 'data-deco-side': side, style: { pointerEvents: 'auto' } } : undefined)

export function DecoPreview({ id }) {
  const vb = PREVIEW_VB_OVERRIDE[id] || PREVIEW_VB[id] || '0 0 100 100'
  return (
    <svg className="deco-preview" viewBox={vb} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {id === 'deco-sprout' && <Sprout />}
      {id === 'deco-tomato' && <Tomato />}
      {id === 'deco-bunny' && <BunnyEars />}
      {id === 'deco-bear' && <BearEars />}
      {id === 'deco-angel-wing' && <AngelWing preview />}
      {id === 'deco-devil-wing' && <DevilWing preview />}
      {id === 'deco-devil-horn' && <DevilHorn />}
      {id === 'deco-kitty-ribbon' && <KittyRibbon />}
      {id === 'deco-bow-tie' && <BowTie />}
      {id === 'deco-party-hat' && <PartyHat />}
      {id === 'deco-chupa-chups' && <ChupaChups />}
      {id === 'deco-cherry-cream' && <CherryCream />}
      {id === 'deco-jaguar' && <CatEars />}
      {id === 'deco-wolf' && <WolfEars />}
      {id === 'deco-blush' && <Blush />}
      {id === 'deco-anger' && <Anger />}
      {id === 'deco-pixel-shades' && <PixelShades />}
      {id === 'deco-alien-shades' && <AlienShades />}
      {id === 'deco-korea' && <Korea />}
      {id === 'deco-bandage' && <Bandage />}
      {id === 'deco-gum' && <BubbleGum />}
      {id === 'deco-heart-shades' && <HeartShades />}
      {id === 'deco-circle-glasses' && <CircleGlasses />}
      {id === 'deco-halo' && <Halo />}
      {id === 'deco-angel-ring' && <AngelRing />}
      {id === 'deco-bubble' && <Bubble />}
      {id === 'deco-red-hood' && <RedHood />}
      {id === 'deco-heart-beam' && <HeartBeam />}
    </svg>
  )
}

// 아이템 id → 장식 컴포넌트. (슬롯과 무관 — 렌더는 아이템별 아트로 결정)
const ART = {
  'deco-sprout': Sprout, 'deco-jaguar': CatEars, 'deco-wolf': WolfEars,
  'deco-blush': Blush, 'deco-anger': Anger, 'deco-pixel-shades': PixelShades,
  'deco-alien-shades': AlienShades, 'deco-bandage': Bandage, 'deco-gum': BubbleGum, 'deco-korea': Korea,
  'deco-heart-shades': HeartShades, 'deco-circle-glasses': CircleGlasses, 'deco-halo': Halo, 'deco-angel-ring': AngelRing,
  'deco-bubble': Bubble, 'deco-tomato': Tomato, 'deco-bunny': BunnyEars, 'deco-bear': BearEars,
  'deco-angel-wing': AngelWing, 'deco-devil-wing': DevilWing,
  'deco-devil-horn': DevilHorn, 'deco-kitty-ribbon': KittyRibbon, 'deco-bow-tie': BowTie,
  'deco-party-hat': PartyHat, 'deco-chupa-chups': ChupaChups, 'deco-cherry-cream': CherryCream,
  'deco-red-hood': RedHood, 'deco-heart-beam': HeartBeam,
}
// 테두리(원형 테두리) 유형: 아바타의 흰 테두리를 대체. 기본은 다른 꾸미기보다 뒤에 그려지되
// (후광), FRONTMOST_IDS 에 있으면(비눗방울) 예외적으로 항상 맨 앞에 그려진다.
export const BORDER_IDS = new Set(['deco-halo', 'deco-bubble', 'deco-red-hood', 'deco-heart-beam'])
export const hasBorderDeco = (deco) => decoItems(deco).some((d) => BORDER_IDS.has(d.id))
const FRONTMOST_IDS = new Set(['deco-bubble'])
// 뒤(back) 레이어로 그릴 아이템(귀 + 날개 + 후광 + 빨간 모자 + 하트 빔) — 나머지는 앞(front). 아트 종류로 결정.
const BACK_IDS = new Set(['deco-jaguar', 'deco-wolf', 'deco-halo', 'deco-bunny', 'deco-bear', 'deco-angel-wing', 'deco-devil-wing', 'deco-red-hood', 'deco-heart-beam'])

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
// pickable: DecoAdjuster 가 좌우 분리 모드일 때만 true 로 넘긴다 — 그때만 좌/우 그려진
// 영역을 직접 클릭해서 조정 대상 쪽을 고를 수 있다(다른 화면의 일반 아바타 표시는 그대로 클릭 불가).
export default function AvatarDeco({ items, layer = 'front', pickable = false, size }) {
  // 그리는 순서(뒤→앞) = 테두리(후광) → 일반 꾸미기 → FRONTMOST(비눗방울, 항상 맨 위)
  // FRONTMOST_IDS 를 먼저 확인해야 한다 — 비눗방울은 BORDER_IDS 에도 들어 있어서
  // (흰 테두리 대체용) 순서를 반대로 하면 항상 뒤로 가라앉아 버린다.
  const rank = (id) => (FRONTMOST_IDS.has(id) ? 2 : BORDER_IDS.has(id) ? 0 : 1)
  const show = decoItems(items)
    .filter((d) => ART[d.id] && (BACK_IDS.has(d.id) === (layer === 'back')))
    .sort((a, b) => rank(a.id) - rank(b.id))
  if (!show.length) return null
  const draw = (list, key) => (
    <svg key={key} className={`avatar-deco avatar-deco-${layer}`} viewBox="0 0 100 100" width="100%" height="100%"
      preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {list.map((d) => { const Art = ART[d.id]; return <Tf key={d.id} id={d.id} tf={d.tf}><Art tf={d.tf} pickable={pickable} size={size} /></Tf> })}
    </svg>
  )
  // 하트 빔만 따로 자기 <svg> 에 그린다. 하트 빔은 흐림 필터가 걸린 채로 매 프레임 커지고
  // 옅어지는데, 한 <svg> 안에 같이 들어 있으면 그 svg 전체가 매 프레임 다시 그려지면서
  // 가만히 있어야 할 다른 꾸미기 아이템(귀·모자 등)까지 함께 다시 래스터라이즈된다 —
  // 하트 빔을 낀 아바타에서만 다른 아이템들이 미세하게 떨려 보이던 증상. svg 를 나눠두면
  // 하트 빔이 다시 그려져도 나머지 아이템은 자기 그림 그대로 유지된다.
  // (하트 빔은 BORDER 라 rank 0 = 맨 뒤 → 먼저 그려야 순서가 그대로 유지된다.)
  const beam = show.filter((d) => d.id === 'deco-heart-beam')
  if (!beam.length) return draw(show, 'all')
  const rest = show.filter((d) => d.id !== 'deco-heart-beam')
  return <>{draw(beam, 'beam')}{rest.length > 0 && draw(rest, 'rest')}</>
}
