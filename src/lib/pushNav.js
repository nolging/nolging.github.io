import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

// 푸시 알림 클릭 → 서비스워커가 { type:'navigate', url } 을 보내면 SPA 라우터로 이동한다.
// WindowClient.navigate() 는 iOS 홈화면 앱에서 동작하지 않는 경우가 있어(알림을 눌러도
// 원래 페이지에 머묾), 서비스워커가 postMessage 로 경로를 넘기고 앱이 직접 이동한다.
// 처리했으면 응답 포트로 알려 줘서 워커가 navigate() 로 중복 이동하지 않게 한다.
export function usePushNavigation() {
  const navigate = useNavigate()
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMessage = (e) => {
      const d = e.data
      if (!d || d.type !== 'navigate' || typeof d.url !== 'string') return
      try { e.ports?.[0]?.postMessage({ ok: true }) } catch { /* noop */ }
      // 절대 URL 로 와도 같은 오리진이면 경로만 사용
      let to = d.url
      try {
        const u = new URL(d.url, window.location.origin)
        if (u.origin === window.location.origin) to = u.pathname + u.search + u.hash
      } catch { /* 상대 경로 그대로 사용 */ }
      navigate(to, { state: { from: 'push' } })
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [navigate])
}
