// 길냥이 후원(donation) 아이템 이미지: 마이 페이지 츄르 보유 현황의 빼꼼 고양이(MyProfile.CoinCat)와
// 동일한 얼굴 위에 후원용 깡통을 얹은 버전.
export default function DonationCat() {
  return (
    <svg className="donation-cat" viewBox="0 -20 64 34" aria-hidden="true">
      <path d="M8 27 L11.3 10 Q11.5 5.5 16 7.8 L30 17 Z" fill="#191722" />
      <path d="M56 27 L52.7 10 Q52.5 5.5 48 7.8 L34 17 Z" fill="#191722" />
      <path d="M6 34 A26 22 0 0 1 58 34 Z" fill="#191722" />
      <g className="login-cat-eye" style={{ transformOrigin: '23px 26px' }}>
        <circle cx="23" cy="26" r="6.5" fill="#ffd43b" /><circle cx="23.6" cy="26.6" r="4.6" fill="#191722" /><circle cx="20.6" cy="23.8" r="1.3" fill="#fff" />
      </g>
      <g className="login-cat-eye" style={{ transformOrigin: '41px 26px' }}>
        <circle cx="41" cy="26" r="6.5" fill="#ffd43b" /><circle cx="41.6" cy="26.6" r="4.6" fill="#191722" /><circle cx="38.6" cy="23.8" r="1.3" fill="#fff" />
      </g>
      {/* 머리 위 후원용 깡통 */}
      <g transform="translate(32 -2)">
        <ellipse cx="0" cy="-12" rx="3" ry="1.5" fill="none" stroke="#9298a6" strokeWidth="1.3" />
        <ellipse cx="0" cy="-11" rx="10" ry="3.2" fill="#b7bbc6" />
        <rect x="-10" y="-11" width="20" height="20" fill="#e2e5ec" />
        <path d="M-10 -11 A10 3.2 0 0 0 10 -11 L10 9 A10 3.2 0 0 1 -10 9 Z" fill="#e2e5ec" />
        <rect x="-10" y="-3" width="20" height="9" fill="#ff8fab" />
        <rect x="-6.5" y="-9" width="3.4" height="18" rx="1.7" fill="#fff" opacity=".55" />
        <ellipse cx="0" cy="9" rx="10" ry="3.2" fill="#9298a6" />
      </g>
    </svg>
  )
}
