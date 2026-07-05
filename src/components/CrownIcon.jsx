// 소유자 표시용 왕관 아이콘 (currentColor 상속)
export default function CrownIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"
      aria-hidden="true" focusable="false">
      <path d="M4 18.2 2.7 7.4a.7.7 0 0 1 1.12-.64l4.2 3.06 3.35-5.1a.75.75 0 0 1 1.26 0l3.35 5.1 4.2-3.06a.7.7 0 0 1 1.12.64L20 18.2a1 1 0 0 1-.99.86H4.99A1 1 0 0 1 4 18.2Z" />
    </svg>
  )
}
