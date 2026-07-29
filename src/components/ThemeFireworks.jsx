import Fireworks from './Fireworks'
import NightSky from './NightSky'

// 폭죽 팡팡 테마 오버레이.
//  page=true  → 그룹 상세: 밤하늘 별(뒤 레이어) + 실제 캔버스 폭죽(전체화면, 커플 기념일과 동일)
//  page=false → 대시보드 카드: 카드 안에 담기는 별 + 작은 CSS 반짝임(가벼움)
export default function ThemeFireworks({ page = false }) {
  if (page) {
    return (
      <>
        <div className="theme-fw-stars" aria-hidden="true"><NightSky /></div>
        <Fireworks className="fw-over" />
      </>
    )
  }
  return (
    <div className="theme-fw-card" aria-hidden="true">
      <NightSky />
      <span className="theme-fw-spark s1" />
      <span className="theme-fw-spark s2" />
    </div>
  )
}
