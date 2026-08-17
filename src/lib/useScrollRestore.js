import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

// 관리자 목록 페이지에서 상세로 들어갔다 뒤로 나오면(라우트가 달라 목록 컴포넌트가
// 통째로 재마운트됨) 원래 보던 스크롤 위치가 사라지는 문제 — 실제 스크롤 컨테이너인
// .content 는 Layout 이 계속 들고 있으므로, 경로별 스크롤 위치를 모듈 변수에 저장해두고
// 같은 경로로 돌아오면 복원한다.
const positions = new Map()

// ready=false 인 동안(목록 로딩 중)은 복원을 미뤄서, 목록이 다 그려진 뒤 실제 위치로 맞춘다.
export default function useScrollRestore(ready = true) {
  const { pathname } = useLocation()
  const restoredRef = useRef(false)

  useEffect(() => {
    const el = document.querySelector('.content')
    if (!el) return
    if (ready && !restoredRef.current) {
      // 저장된 위치가 없으면(=상단바 메뉴 등으로 처음 들어온 목록) 이전 페이지 스크롤이
      // 남아있지 않게 맨 위로 — 있으면(뒤로가기로 돌아옴) 그 위치로 복원.
      el.scrollTop = positions.get(pathname) || 0
      restoredRef.current = true
    }
    const onScroll = () => { positions.set(pathname, el.scrollTop) }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [pathname, ready])
}

// 목록에서 상세/추가 화면으로 들어왔을 때 항상 맨 위에서 시작하게 한다.
// .content 는 Layout 이 계속 들고 있는 공유 스크롤 컨테이너라, 직전 목록의 스크롤 위치가
// 그대로 남아있는 채로 새 페이지가 열려버리기 때문 — 페인트 전에(useLayoutEffect) 초기화.
export function useScrollToTop() {
  useLayoutEffect(() => {
    const el = document.querySelector('.content')
    if (el) el.scrollTop = 0
  }, [])
}
