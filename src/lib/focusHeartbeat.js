import { useEffect } from 'react'

// 서비스워커에 '지금 앱을 보고 있는지'를 주기적으로 알려준다(오류 리포트 채팅 등
// silent 푸시 억제 판단용). WindowClient.focused/visibilityState 는 iOS 홈화면 PWA 에서
// 신뢰할 수 없어(백그라운드에서도 focused=false 가 안 되거나 visible 로 남는 사례),
// 브라우저가 보고하는 상태 대신 앱이 직접 상태를 postMessage 로 알려주는 방식으로 대체한다.
const PING_MS = 5000

export function useForegroundHeartbeat() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    const send = (active) => {
      navigator.serviceWorker.controller?.postMessage({ type: 'focus-state', active })
    }
    const ping = () => send(document.visibilityState === 'visible' && document.hasFocus())
    const onHide = () => send(false)

    ping()
    navigator.serviceWorker.ready.then(ping).catch(() => {}) // 최초 로드 시 컨트롤러 늦게 잡히는 경우 대비
    const iv = setInterval(ping, PING_MS)
    document.addEventListener('visibilitychange', ping)
    window.addEventListener('focus', ping)
    window.addEventListener('blur', ping)
    window.addEventListener('pageshow', ping)
    window.addEventListener('pagehide', onHide)

    return () => {
      clearInterval(iv)
      document.removeEventListener('visibilitychange', ping)
      window.removeEventListener('focus', ping)
      window.removeEventListener('blur', ping)
      window.removeEventListener('pageshow', ping)
      window.removeEventListener('pagehide', onHide)
    }
  }, [])
}
