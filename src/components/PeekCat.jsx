// 빼꼼 고양이 (눈 깜빡임). 마이페이지 츄르 카드 / 커플 그룹 카드 등에서 재사용.
// sparkle='heart' 면 눈 반짝임을 작은 하트로.
export default function PeekCat({ className = '', width = 96, sparkle = 'dot' }) {
  const spark = (x, y) => sparkle === 'heart'
    ? <path d="M12 21s-7-4.35-9.5-8.5C1 9 3 5.5 6.5 5.5c2 0 4 1.6 5.5 3 1.5-1.4 3.5-3 5.5-3C21 5.5 23 9 21.5 12.5 19 16.65 12 21 12 21z"
        fill="#fff" transform={`translate(${x - 2.4} ${y - 2.6}) scale(.2)`} />
    : <circle cx={x} cy={y} r="1.3" fill="#fff" />
  return (
    <svg className={className} width={width} viewBox="0 0 64 34" aria-hidden="true">
      <path d="M8 27 L11.3 10 Q11.5 5.5 16 7.8 L30 17 Z" fill="#191722" />
      <path d="M56 27 L52.7 10 Q52.5 5.5 48 7.8 L34 17 Z" fill="#191722" />
      <path d="M6 34 A26 22 0 0 1 58 34 Z" fill="#191722" />
      <g className="login-cat-eye" style={{ transformOrigin: '23px 26px' }}>
        <circle cx="23" cy="26" r="6.5" fill="#ffd43b" /><circle cx="23.6" cy="26.6" r="4.6" fill="#191722" />{spark(20.6, 23.8)}
      </g>
      <g className="login-cat-eye" style={{ transformOrigin: '41px 26px' }}>
        <circle cx="41" cy="26" r="6.5" fill="#ffd43b" /><circle cx="41.6" cy="26.6" r="4.6" fill="#191722" />{spark(38.6, 23.8)}
      </g>
    </svg>
  )
}
