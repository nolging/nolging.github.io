import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const NAV_CACHE = 'nolging-nav'
const NAV_KEY = '__pending_nav__'
const NAV_CHANNEL = 'nolging-push-nav'

// 푸시 알림 클릭 → 서비스워커가 이동 목적지를 (1) postMessage 로, (2) BroadcastChannel 로
// 알리고 (3) Cache 에도 저장한다. iOS 홈화면 PWA 는 백그라운드에서 JS 가 얼어 메시지를
// 놓치거나, 재개 시 앱이 reload 되어 메시지가 사라지는 경우가 있어 '보이게 될 때마다' Cache
// 를 다시 읽는 안전장치를 둔다. 다만 이 안전장치는 visibilitychange/focus 처럼 상태가
// '바뀔 때'만 발동하므로, 앱이 이미 포그라운드에 계속 머물러 있던 채로 알림을 눌렀을 땐
// 발동하지 않는다 — 그 경우를 위해 postMessage 가 유실돼도 도착 가능성이 더 높은
// BroadcastChannel 을 이중 경로로 함께 듣는다(특정 WindowClient 참조에 기대지 않음).
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

    // BroadcastChannel(이중 경로): 앱이 계속 포그라운드였어도 확실히 받는다
    let bc = null
    try {
      bc = new BroadcastChannel(NAV_CHANNEL)
      bc.onmessage = (e) => onMessage(e)
    } catch { /* 미지원 브라우저 — postMessage/Cache 경로로만 동작 */ }

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
      bc?.close()
    }
  }, [navigate])
}
