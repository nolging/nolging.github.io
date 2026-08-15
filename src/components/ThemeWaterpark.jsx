import waterparkBallPng from '../assets/theme/waterpark-ball.png'
import waterparkFlower1Png from '../assets/theme/wp-flower-1.png'
import waterparkFlower2Png from '../assets/theme/wp-flower-2.png'
import waterparkFlower3Png from '../assets/theme/wp-flower-3.png'
import waterparkFlower4Png from '../assets/theme/wp-flower-4.png'
import waterparkLeafPng from '../assets/theme/wp-leaf.png'
import waterparkLeafShadowPng from '../assets/theme/wp-leaf-shadow.png'
import waterparkLeafTrPng from '../assets/theme/wp-leaf-tr.png'
import waterparkLeafTrShadowPng from '../assets/theme/wp-leaf-tr-shadow.png'

// 워터파크 테마: 이미지 없이 CSS + SVG 필터로 직접 그린 격자 타일 배경.
// 배경색(#A2DFF6) 위에 선(#E9FCF8) 격자를 그리고, 물결 변위 필터의 baseFrequency 를
// SMIL 애니메이션으로 천천히 흔들어 선이 수영장 물 때문에 살짝 일렁이는 것처럼 보이게 한다.
// 비치볼·꽃은 샘플 이미지 속 위치 그대로 떠 있고, 물살에 밀리듯 작은 타원 경로를 등속으로
// 맴돈다(제자리로 돌아오는 루프라 멀리 안 감). transform 의 %는 각 요소 자기 박스 기준이라
// 이미지 크기가 다르면 같은 % 라도 실제 이동 거리가 달라지므로, 크기 그룹별로 화면상 이동
// 거리가 똑같아지도록 보정한 keyframes(wp-float-drift-*)를 쓴다(cls 로 구분). 대신
// animation-delay/direction 으로 위상만 어긋나게 줘서 서로 다른 지점에서 따로 떠다니는 것처럼 보이게 한다.
const FLOATS = [
  { src: waterparkBallPng, cls: 'wp-float-ball', left: 69.5, top: 87.9, width: 20.9, delay: '0s' },
  { src: waterparkFlower1Png, cls: 'wp-float-fl1', left: 57.96, top: 13.38, width: 13.21, delay: '-4.4s' },
  { src: waterparkFlower2Png, cls: 'wp-float-fl2', left: 10.95, top: 45.73, width: 14.45, delay: '-8.8s', reverse: true },
  { src: waterparkFlower3Png, cls: 'wp-float-fl34', left: 87.92, top: 55.02, width: 13.32, delay: '-13.2s' },
  { src: waterparkFlower4Png, cls: 'wp-float-fl34', left: 48.31, top: 76.08, width: 13.32, delay: '-17.6s', reverse: true },
]

// 야자잎(풀 + 그림자, 캔버스 밖으로 살짝 걸침) — 줄기 밑동 쪽을 고정하고 바람에 살랑거리듯
// 아주 미세하게 회전한다. 그림자는 풀과 각도만 다를 뿐 같은 keyframes 를 딜레이 없이 그대로
// 써서 정확히 같은 타이밍으로 함께 흔들리게 한다. origin 은 밑동(고정되는 쪽) 위치.
// 좌측 하단 잎: 아랫부분(밑동) 고정, 윗부분이 흔들림 → origin 이 아래쪽(y=100%).
const LEAF = { left: 1.69, top: 79.54, width: 37.47, origin: '38% 100%' }
const LEAF_SHADOW = { left: 7.79, top: 87.04, width: 39.28, origin: '32% 100%' }
// 우측 상단 잎: 윗부분(밑동) 고정, 아랫부분이 흔들림 → origin 이 위쪽(y=0%). bbox 가
// 캔버스 위/오른쪽 두 변에 동시에 딱 붙어 있어서, origin 을 그 교점(두 변이 만나는 정확한
// 모서리, 100% 0%)에 둬야 어느 방향으로 돌려도 overflow:hidden 에 잘리지 않는다. left 를
// 안쪽으로 당겨서 여유를 두면 정지 상태부터 오른쪽 모서리에서 늘 떨어져 보여서(빈 공백이
// 상시 노출) 안 됨 — 주어진 이미지 그대로 모서리에 딱 붙이고, 흔들리는 동안 아주 미세하게
// 실제로 넘어가는 몇 px 는(overflow:hidden 이 잘라내는) 감수한다.
// topOffsetPx: 실험용 — 이 px 만큼 위로 더 올려서 확인해보는 중(계산상 개선 효과 없음을
// 이미 확인했지만 직접 눈으로 보고 싶다고 하셔서 임시로 반영).
const LEAF_TR = { left: 64.67, top: 0, width: 35.33, origin: '100% 0%', topOffsetPx: -10 }
const LEAF_TR_SHADOW = { left: 73.81, top: 1.2, width: 26.19, origin: '100% 0%', topOffsetPx: -10 }

const RippleDefs = () => (
  <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
    <filter id="wpRipple" x="-12%" y="-12%" width="124%" height="124%">
      <feTurbulence type="fractalNoise" baseFrequency="0.011 0.02" numOctaves="2" seed="7" result="n">
        <animate attributeName="baseFrequency" values="0.011 0.02;0.0125 0.022;0.011 0.02" dur="10s" repeatCount="indefinite" />
      </feTurbulence>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="5" xChannelSelector="R" yChannelSelector="G" />
    </filter>
  </svg>
)

export default function ThemeWaterpark({ className = '' }) {
  return (
    <div className={`theme-wp${className ? ` ${className}` : ''}`} aria-hidden="true">
      <RippleDefs />
      <div className="wp-tiles" />
      <img className="wp-leaf-sway" src={waterparkLeafShadowPng} alt=""
        style={{ left: `${LEAF_SHADOW.left}%`, top: `${LEAF_SHADOW.top}%`, width: `${LEAF_SHADOW.width}%`, transformOrigin: LEAF_SHADOW.origin }} />
      <img className="wp-leaf-sway" src={waterparkLeafPng} alt=""
        style={{ left: `${LEAF.left}%`, top: `${LEAF.top}%`, width: `${LEAF.width}%`, transformOrigin: LEAF.origin }} />
      <img className="wp-leaf-sway-tr" src={waterparkLeafTrShadowPng} alt=""
        style={{ left: `${LEAF_TR_SHADOW.left}%`, top: `calc(${LEAF_TR_SHADOW.top}% + ${LEAF_TR_SHADOW.topOffsetPx}px)`, width: `${LEAF_TR_SHADOW.width}%`, transformOrigin: LEAF_TR_SHADOW.origin }} />
      <img className="wp-leaf-sway-tr" src={waterparkLeafTrPng} alt=""
        style={{ left: `${LEAF_TR.left}%`, top: `calc(${LEAF_TR.top}% + ${LEAF_TR.topOffsetPx}px)`, width: `${LEAF_TR.width}%`, transformOrigin: LEAF_TR.origin }} />
      {FLOATS.map((f, i) => (
        <img key={i} className={`wp-float ${f.cls}`} src={f.src} alt=""
          style={{
            left: `${f.left}%`, top: `${f.top}%`, width: `${f.width}%`,
            animationDelay: f.delay, animationDirection: f.reverse ? 'reverse' : 'normal',
          }} />
      ))}
    </div>
  )
}
