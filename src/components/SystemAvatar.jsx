// SYSTEM(오류 리포트) 발신자 아바타 — 놀깅 파비콘에서 발바닥을 빼고 고양이만 원형으로.
export default function SystemAvatar({ size = 34 }) {
  return (
    <span className="avatar avatar-system" style={{ width: size, height: size }} aria-label="SYSTEM">
      <svg viewBox="0 0 64 64" width={size} height={size} role="img" aria-hidden="true">
        <defs>
          <linearGradient id="sysAvaBg" x1="0" y1="0" x2="0.5" y2="1">
            <stop offset="0" stopColor="#8b7cf4" />
            <stop offset="1" stopColor="#6250e0" />
          </linearGradient>
          <clipPath id="sysAvaClip"><circle cx="32" cy="32" r="32" /></clipPath>
        </defs>
        <g clipPath="url(#sysAvaClip)">
          <rect width="64" height="64" fill="url(#sysAvaBg)" />
          <g transform="translate(0 12)" fill="#191722">
            <path d="M8 27 L11.3 10 Q11.5 5.5 16 7.8 L30 17 Z" />
            <path d="M56 27 L52.7 10 Q52.5 5.5 48 7.8 L34 17 Z" />
            <path d="M6 34 A26 22 0 0 1 58 34 Z" />
            <circle cx="23" cy="26" r="6.5" fill="#ffd43b" /><circle cx="23.2" cy="26.6" r="5" fill="#191722" /><circle cx="20.6" cy="23.8" r="2.5" fill="#fff" />
            <circle cx="41" cy="26" r="6.5" fill="#ffd43b" /><circle cx="41.2" cy="26.6" r="5" fill="#191722" /><circle cx="38.6" cy="23.8" r="2.5" fill="#fff" />
          </g>
        </g>
      </svg>
    </span>
  )
}
