import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const NAV_CACHE = 'nolging-nav'
const NAV_KEY = '__pending_nav__'

// 푸시 알림 클릭 → 서비스워커가 이동 목적지를 (1) postMessage 로 알리고 (2) Cache 에 저장한다.
// iOS 홈화면 PWA 는 백그라운드에서 JS 가 얼어 postMessage 를 놓치거나, 재개 시 앱이
// reload 되어 메시지가 사라지는 경우가 있다. 그래서 앱이 '보이게 될 때마다' Cache 에
// 저장된 목적지를 읽어 이동한다(있으면 소비·삭제). 살아있을 땐 메시지로 즉시 이동.
export function usePushNavigation() {
  const navigate = useNavigate()
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    const toPath = (raw) => {
      try {
        const u = new URL(raw, window.location.origin)
        if (u.origin === window.location.origin) return u.pathname + u.search + u.hash
      } catch { /* 상대 경로 그대로 */ }
      return raw
    }
    const go = (raw) => {
      const to = toPath(raw)
      const cur = window.location.pathname + window.location.search + window.location.hash
      if (to && to !== cur) navigate(to, { state: { from: 'push' } })
    }
    const clearPending = async () => {
      try { const c = await caches.open(NAV_CACHE); await c.delete(NAV_KEY) } catch { /* noop */ }
    }
    // 재개 시: Cache 에 저장된 목적지 소비(메시지를 놓쳤어도 이걸로 확실히 이동)
    const consumePending = async () => {
      try {
        if (!('caches' in window)) return
        const c = await caches.open(NAV_CACHE)
        const res = await c.match(NAV_KEY)
        if (!res) return
        const url = (await res.text()).trim()
        await c.delete(NAV_KEY)
        if (url) go(url)
      } catch { /* noop */ }
    }
    // 살아있는 앱: SW 메시지 즉시 처리(빠른 경로)
    const onMessage = (e) => {
      const d = e.data
      if (!d || d.type !== 'navigate' || typeof d.url !== 'string') return
      try { e.ports?.[0]?.postMessage({ ok: true }) } catch { /* noop */ }
      clearPending()
      go(d.url)
    }
    const onVisible = () => { if (document.visibilityState === 'visible') consumePending() }

    navigator.serviceWorker.addEventListener('message', onMessage)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', onVisible)
    window.addEventListener('focus', onVisible)
    consumePending() // 최초 로드(콜드 오픈/재개 후 reload 포함)

    return () => {
      navigator.serviceWorker.removeEventListener('message', onMessage)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [navigate])
}
