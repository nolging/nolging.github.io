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
    let cancelled = false
    let polling = false

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
    // Cache 에 저장된 목적지를 읽어(있으면 소비) 반환
    const readPending = async () => {
      try {
        if (!('caches' in window)) return null
        const c = await caches.open(NAV_CACHE)
        const res = await c.match(NAV_KEY)
        if (!res) return null
        const url = (await res.text()).trim()
        await c.delete(NAV_KEY)
        return url || null
      } catch { return null }
    }
    // 재개 시: 저장된 목적지 소비. SW 의 캐시 기록과 앱의 포그라운드 이벤트 사이에 미세한
    // 레이스가 있어(특히 iOS PWA) 한 번만 읽으면 놓칠 수 있으므로, 짧은 창 동안 몇 번 재시도한다.
    // 찾는 즉시 이동하고 종료. (없으면 조용히 끝 — 불필요한 이동 없음)
    const consumePending = async () => {
      if (polling) return
      polling = true
      const delays = [0, 150, 400, 900, 1600]
      for (const d of delays) {
        if (cancelled) break
        if (d) await new Promise((r) => setTimeout(r, d))
        const url = await readPending()
        if (url) { go(url); break }
      }
      polling = false
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
      cancelled = true
      navigator.serviceWorker.removeEventListener('message', onMessage)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [navigate])
}
