// 츄르 단위 표시용 발바닥 아이콘. 색은 currentColor 를 따라가고 크기는 클래스로 정한다.
// 상점 가격(.st-paw), 상단바 잔액(.coin-pill-paw) 등에서 같은 모양을 쓴다.
export default function PawIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="7" cy="7" r="2.4" /><circle cx="12" cy="5.4" r="2.4" /><circle cx="17" cy="7" r="2.4" />
      <path d="M12 10c3.4 0 6 2.4 6 5.2 0 2-1.7 3.3-3.4 2.7-1-.4-1.7-.6-2.6-.6s-1.6.2-2.6.6C7.7 18.5 6 17.2 6 15.2 6 12.4 8.6 10 12 10Z" />
    </svg>
  )
}
