import waterparkBallPng from '../assets/theme/waterpark-ball.png'
import waterparkFlower1Png from '../assets/theme/wp-flower-1.png'
import waterparkFlower2Png from '../assets/theme/wp-flower-2.png'
import waterparkFlower3Png from '../assets/theme/wp-flower-3.png'
import waterparkFlower4Png from '../assets/theme/wp-flower-4.png'
import waterparkLeafPng from '../assets/theme/wp-leaf.png'
import waterparkLeafShadowPng from '../assets/theme/wp-leaf-shadow.png'
import waterparkLeafTrPng from '../assets/theme/wp-leaf-tr.png'
import waterparkLeafTrShadowPng from '../assets/theme/wp-leaf-tr-shadow.png'
import waterparkLeafMidPng from '../assets/theme/wp-leaf-mid.png'
import waterparkLeafMidShadowPng from '../assets/theme/wp-leaf-mid-shadow.png'

// 워터파크 테마: 이미지 없이 CSS + SVG 필터로 직접 그린 격자 타일 배경.
// 배경색(#A2DFF6) 위에 선(#E9FCF8) 격자를 그리고, 물결 변위 필터의 baseFrequency 를
// SMIL 애니메이션으로 천천히 흔들어 선이 수영장 물 때문에 살짝 일렁이는 것처럼 보이게 한다.
// 비치볼·꽃은 샘플 이미지 속 위치 그대로 떠 있고, 물살에 밀리듯 작은 타원 경로를 등속으로
// 맴돈다(제자리로 돌아오는 루프라 멀리 안 감). transform 의 %는 각 요소 자기 박스 기준이라
// 이미지 크기가 다르면 같은 % 라도 실제 이동 거리가 달라지므로, 크기 그룹별로 화면상 이동
// 거리가 똑같아지도록 보정한 keyframes(wp-float-drift-*)를 쓴다(cls 로 구분). 대신
// animation-delay/direction 으로 위상만 어긋나게 줘서 서로 다른 지점에서 따로 떠다니는 것처럼 보이게 한다.
// cardOnly*/previewOnly*: 각각 그룹 카드(정사각형 타일) / 상점 미리보기에서만 적용하는
// 보정 — 그룹 상세(전체 화면)는 그대로 둔다. cardHide: 카드에서는 아예 안 보여준다
// (가장 위에 있던 꽃1, 오른쪽에 있던 꽃3).
const FLOATS = [
  { src: waterparkBallPng, cls: 'wp-float-ball', left: 69.5, top: 87.9, width: 20.9, delay: '0s', cardOnlyTopPx: -10 },
  { src: waterparkFlower1Png, cls: 'wp-float-fl1', left: 57.96, top: 13.38, width: 13.21, delay: '-4.4s', cardHide: true, previewOnlyTopPx: 8 },
  { src: waterparkFlower2Png, cls: 'wp-float-fl2', left: 10.95, top: 45.73, width: 14.45, delay: '-8.8s', reverse: true, cardOnlyTopPx: -20 },
  { src: waterparkFlower3Png, cls: 'wp-float-fl34', left: 87.92, top: 55.02, width: 13.32, delay: '-13.2s', cardHide: true },
  { src: waterparkFlower4Png, cls: 'wp-float-fl34', left: 48.31, top: 76.08, width: 13.32, delay: '-17.6s', reverse: true, cardOnlyTopPx: -20 },
]

// 야자잎(풀 + 그림자, 캔버스 밖으로 살짝 걸침) — 줄기 밑동 쪽을 고정하고 바람에 살랑거리듯
// 아주 미세하게 회전한다. 그림자는 풀과 각도만 다를 뿐 같은 keyframes 를 딜레이 없이 그대로
// 써서 정확히 같은 타이밍으로 함께 흔들리게 한다. origin 은 밑동(고정되는 쪽) 위치.
// 좌측 하단 잎: 아랫부분(밑동) 고정, 윗부분이 흔들림 → origin 이 아래쪽(y=100%).
const LEAF = { left: 1.69, top: 79.54, width: 37.47, origin: '38% 100%', cardOnlyTopPx: -35, cardOnlyLeftPx: -10 }
const LEAF_SHADOW = { left: 7.79, top: 87.04, width: 39.28, origin: '32% 100%', cardOnlyTopPx: -35, cardOnlyLeftPx: -10 }
// 우측 상단 잎: 윗부분(밑동) 고정, 아랫부분이 흔들림 → origin 이 위쪽(y=0%). bbox 가
// 캔버스 위/오른쪽 두 변에 동시에 딱 붙어 있어서, origin 을 그 교점(두 변이 만나는 정확한
// 모서리, 100% 0%)에 둬야 어느 방향으로 돌려도 overflow:hidden 에 잘리지 않는다. left 는
// 주어진 이미지 그대로 모서리에 딱 붙인다(안쪽으로 당기면 정지 상태부터 빈 공백이 상시
// 노출돼서 안 됨). top 은 10px 위로 올려뒀다 — 잎이 촘촘한 잎맥 형태라 위쪽 10px 안에서도
// 계속 잎으로 덮여 있어서, 그만큼 위가 가려진 채로 시작했다가 흔들리며 그 가려졌던 부분이
// 자연스럽게 드러난다(빈 배경이 아니라 잎 자체가 나타나는 것). topOffsetPx 로 표현.
const LEAF_TR = { left: 64.67, top: 0, width: 35.33, origin: '100% 0%', topOffsetPx: -10, cardOnlyTopPx: -30 }
const LEAF_TR_SHADOW = { left: 73.81, top: 1.2, width: 26.19, origin: '100% 0%', topOffsetPx: -10, cardOnlyTopPx: -30 }
// 상단 중앙 잎: 화면 왼쪽/오른쪽 어느 변에도 닿지 않고 위쪽 변에만 걸쳐 있어서(코너가 아닌
// 한 변만 걸치는 형태), 좌측 하단 잎과 같은 방식으로 안전하게 다룰 수 있다 — 이미지 자체
// 오른쪽 위 잎끝(줄기처럼 보이는 지점)을 origin 으로 두고 아주 미세하게 좌우로 흔든다.
// 이 이미지는 흔들릴 때를 대비해 화면 밖(위쪽)으로 가려질 부분까지 그려서 받은 것이라,
// left/top 을 이미지 자체의 bbox 로 바로 쓰면 안 되고, 원본 샘플 이미지와 픽셀 단위로
// 대조(윤곽 겹침 최적화)해서 찾은 실제 위치를 써야 한다 — top 이 약 -2.3%만큼 위로
// 더 올라간다(샘플에서 보이는 부분은 이 이미지의 아래쪽 일부일 뿐).
const LEAF_MID = { left: 41.65, top: -2.29, width: 30.36, origin: '95% 3%', cardOnlyTopPx: -30, previewOnlyTopPx: -8 }
const LEAF_MID_SHADOW = { left: 44.36, top: -2.29, width: 29.57, origin: '94% 3%', cardOnlyTopPx: -30, previewOnlyTopPx: -8 }

// wpRippleSm: 상점/인벤토리 미리보기(아주 작은 정사각형)용 — scale 을 줄여서 같은 절대
// 픽셀 변위가 작은 화면에서 과하게 출렁여 보이지 않게 한다(격자 크기 축소와 같은 이유).
const RippleDefs = () => (
  <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
    <filter id="wpRipple" x="-12%" y="-12%" width="124%" height="124%">
      <feTurbulence type="fractalNoise" baseFrequency="0.011 0.02" numOctaves="2" seed="7" result="n">
        <animate attributeName="baseFrequency" values="0.011 0.02;0.0125 0.022;0.011 0.02" dur="10s" repeatCount="indefinite" />
      </feTurbulence>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="5" xChannelSelector="R" yChannelSelector="G" />
    </filter>
    <filter id="wpRippleSm" x="-12%" y="-12%" width="124%" height="124%">
      <feTurbulence type="fractalNoise" baseFrequency="0.011 0.02" numOctaves="2" seed="7" result="n">
        <animate attributeName="baseFrequency" values="0.011 0.02;0.0125 0.022;0.011 0.02" dur="10s" repeatCount="indefinite" />
      </feTurbulence>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="1.5" xChannelSelector="R" yChannelSelector="G" />
    </filter>
  </svg>
)

// leaf/float 의 top 값을 계산: 기본 topOffsetPx(항상 적용) + {variant}OnlyTopPx(해당
// variant 에서만 추가 적용, 예: cardOnlyTopPx, previewOnlyTopPx). detail 은 둘 다 없음.
function leafTop(item, variant) {
  const px = (item.topOffsetPx || 0) + (item[`${variant}OnlyTopPx`] || 0)
  return px ? `calc(${item.top}% + ${px}px)` : `${item.top}%`
}
// left 값도 같은 방식({variant}OnlyLeftPx 만큼 추가 이동).
function leafLeft(item, variant) {
  const px = item[`${variant}OnlyLeftPx`] || 0
  return px ? `calc(${item.left}% + ${px}px)` : `${item.left}%`
}

// 쌓임 순서(모든 variant 공통): 잎 그림자(맨 뒤) < 공/꽃 < 잎(맨 앞).
const SHADOW_Z = 0
const FLOAT_Z = 1
const LEAF_Z = 2

export default function ThemeWaterpark({ className = '', variant = 'detail' }) {
  const floats = variant === 'card' ? FLOATS.filter((f) => !f.cardHide) : FLOATS
  return (
    <div className={`theme-wp${className ? ` ${className}` : ''}`} aria-hidden="true">
      <RippleDefs />
      <div className="wp-tiles" />
      <img className="wp-leaf-sway" src={waterparkLeafShadowPng} alt=""
        style={{ left: leafLeft(LEAF_SHADOW, variant), top: leafTop(LEAF_SHADOW, variant), width: `${LEAF_SHADOW.width}%`, transformOrigin: LEAF_SHADOW.origin, zIndex: SHADOW_Z }} />
      <img className="wp-leaf-sway" src={waterparkLeafPng} alt=""
        style={{ left: leafLeft(LEAF, variant), top: leafTop(LEAF, variant), width: `${LEAF.width}%`, transformOrigin: LEAF.origin, zIndex: LEAF_Z }} />
      <img className="wp-leaf-sway" src={waterparkLeafMidShadowPng} alt=""
        style={{ left: leafLeft(LEAF_MID_SHADOW, variant), top: leafTop(LEAF_MID_SHADOW, variant), width: `${LEAF_MID_SHADOW.width}%`, transformOrigin: LEAF_MID_SHADOW.origin, zIndex: SHADOW_Z }} />
      <img className="wp-leaf-sway" src={waterparkLeafMidPng} alt=""
        style={{ left: leafLeft(LEAF_MID, variant), top: leafTop(LEAF_MID, variant), width: `${LEAF_MID.width}%`, transformOrigin: LEAF_MID.origin, zIndex: LEAF_Z }} />
      <img className="wp-leaf-sway-tr" src={waterparkLeafTrShadowPng} alt=""
        style={{ left: leafLeft(LEAF_TR_SHADOW, variant), top: leafTop(LEAF_TR_SHADOW, variant), width: `${LEAF_TR_SHADOW.width}%`, transformOrigin: LEAF_TR_SHADOW.origin, zIndex: SHADOW_Z }} />
      <img className="wp-leaf-sway-tr" src={waterparkLeafTrPng} alt=""
        style={{ left: leafLeft(LEAF_TR, variant), top: leafTop(LEAF_TR, variant), width: `${LEAF_TR.width}%`, transformOrigin: LEAF_TR.origin, zIndex: LEAF_Z }} />
      {floats.map((f, i) => (
        <img key={i} className={`wp-float ${f.cls}`} src={f.src} alt=""
          style={{
            left: leafLeft(f, variant), top: leafTop(f, variant), width: `${f.width}%`, zIndex: FLOAT_Z,
            animationDelay: f.delay, animationDirection: f.reverse ? 'reverse' : 'normal',
          }} />
      ))}
    </div>
  )
}
