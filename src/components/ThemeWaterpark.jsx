// 워터파크 테마: 이미지 없이 CSS + SVG 필터로 직접 그린 격자 타일 배경.
// 배경색(#A2DFF6) 위에 선(#E9FCF8) 격자를 그리고, 물결 변위 필터의 baseFrequency 를
// SMIL 애니메이션으로 천천히 흔들어 선이 수영장 물 때문에 살짝 일렁이는 것처럼 보이게 한다.

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
    </div>
  )
}
