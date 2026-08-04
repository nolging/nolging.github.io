import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

const NAV_CACHE = 'nolging-nav'
const NAV_KEY = '__pending_nav__'
const NAV_CHANNEL = 'nolging-push-nav'

// 푸시 알림 클릭 → 서비스워커가 이동 목적지를 (1) postMessage 로, (2) BroadcastChannel 로
// 알리고 (3) Cache 에도 저장한다. 메시지 전달(postMessage/BroadcastChannel)은 iOS 홈화면
// PWA 에서 잘 유실된다(백그라운드에서 JS 가 얼거나, standalone 모드에서 SW↔페이지 메시징
// 자체가 불안정한 사례가 있음) — 그래서 메시지가 실제로 오는지에 기대지 않고, 앱이 떠 있는
// 동안 Cache 를 주기적으로 직접 확인(폴링)해 pending 목적지가 있으면 이동한다. 이게 유일한
// '확실한' 경로이고, 메시지 리스너들은 그보다 빠르게 반응하기 위한 보조 수단일 뿐이다.
const POLL_MS = 2000

// ---- 임시 디버그 오버레이 ----
// 안드로이드는 USB 원격 디버깅 없이는 콘솔을 볼 수 없어, 되튕김 버그의 정확한 발생
// 지점을 기기 화면에서 바로 읽을 수 있게 임시로 남긴다. 원인 확정되면 제거 예정.
let dbgEl = null
export function navDebugLog(msg) {
  try {
    if (!dbgEl) {
      dbgEl = document.createElement('div')
      dbgEl.style.cssText = 'position:fixed;left:4px;bottom:4px;z-index:999999;max-width:96vw;' +
        'max-height:40vh;overflow:auto;background:rgba(0,0,0,.82);color:#7CFC7C;font:10px/1.4 monospace;' +
        'padding:6px 8px;border-radius:6px;white-space:pre-wrap;pointer-events:auto'
      dbgEl.addEventListener('click', () => { dbgEl.remove(); dbgEl = null })
      document.body.appendChild(dbgEl)
    }
    const t = new Date().toISOString().slice(11, 23)
    dbgEl.textContent += `[${t}] ${msg}\n`
  } catch { /* noop */ }
}

export function usePushNavigation() {
  const navigate = useNavigate()
  // react-router-dom v6 는 useNavigate() 가 반환하는 함수를 URL(pathname)이 바뀔 때마다
  // 새로 만든다(내부적으로 locationPathname 이 의존성에 들어감). 아래 effect 의 의존성
  // 배열에 navigate 를 직접 넣으면 "페이지 이동할 때마다" cleanup 후 재실행되어 — SW
  // 메시지 리스너/Cache 폴링이 매 이동마다 다시 시작되고, initialPath 도 그때그때 "지금
  // 있는 페이지"로 재설정돼 버린다. 그 결과 SW 가 뒤늦게(또는 중복으로) Cache 에 남긴
  // 예전 목적지가, 한참 뒤 전혀 다른 페이지에 있을 때 새로 시작된 폴링에 걸려 엉뚱하게
  // 재생되는 문제가 실제로 관측됐다(안드로이드에서 뒤로가기 되튕김). ref 로 최신 navigate
  // 만 참조하고 effect 자체는 앱 전체 수명 동안 딱 한 번만 설정되도록 고정한다.
  const navigateRef = useRef(navigate)
  useEffect(() => { navigateRef.current = navigate }, [navigate])
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
      if (to && to !== cur) { navDebugLog(`go: NAVIGATE to=${to} (cur=${cur})`); navigateRef.current(to, { state: { from: 'push' } }) }
      else navDebugLog(`go: no-op to=${to} cur=${cur}`)
    }
    // 콜드스타트 진입 URL(= SW 가 openWindow 로 연 목적지). notificationclick 이 한 제스처에
    // 중복 발화하면(일부 안드로이드/Chrome 에서 실제로 관측되는 케이스) 두 번째 호출은 이미
    // 열려 있는 창을 찾아 postMessage/BroadcastChannel(즉시 경로) 로도, Cache(폴링 경로) 로도
    // 같은 콜드스타트 목적지를 다시 흘려보낸다 — 이미 사용자가 다른 페이지로 이동한 뒤라도
    // 처음 그 목적지로 도로 이동시켜 버리는 문제가 있었다(예: 뒤로가기를 연달아 눌러 다른
    // 페이지로 이동했는데 갑자기 원래 콜드스타트 페이지로 되돌아감). 어느 경로로 읽혔든
    // 목적지가 '이 세션이 애초에 열렸던 그 페이지 자신'과 같으면 항상 잔여 신호로 간주해
    // 조용히 버린다(이동하지 않음) — 그 URL로의 진짜 새 알림이 온 경우도 이미 그 페이지에
    // 있다는 뜻이라 어차피 이동할 필요가 없으므로 안전하다.
    const initialPath = window.location.pathname + window.location.search + window.location.hash
    navDebugLog(`mount: initialPath=${initialPath}`)
    const consumeUrl = (raw, src) => {
      const to = toPath(raw)
      if (to === initialPath) { navDebugLog(`consumeUrl[${src}]: SUPPRESSED raw=${raw} to=${to}`); return }
      navDebugLog(`consumeUrl[${src}]: pass raw=${raw} to=${to}`)
      go(raw)
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
      navDebugLog('consumePending: start')
      const delays = [0, 150, 400, 900, 1600]
      let found = false
      for (const d of delays) {
        if (cancelled) break
        if (d) await new Promise((r) => setTimeout(r, d))
        const url = await readPending()
        if (url) { found = true; consumeUrl(url, `cascade@${d}ms`); break }
      }
      if (!found) navDebugLog('consumePending: nothing found in cascade')
      polling = false
    }
    // 살아있는 앱: SW 메시지 즉시 처리(빠른 경로)
    const onMessage = (e) => {
      const d = e.data
      if (!d || d.type !== 'navigate' || typeof d.url !== 'string') return
      navDebugLog(`onMessage: got url=${d.url}`)
      try { e.ports?.[0]?.postMessage({ ok: true }) } catch { /* noop */ }
      clearPending()
      consumeUrl(d.url, 'message')
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
    // iOS 는 알림 탭으로 앱이 화면에 다시 보여도(visibilitychange/focus 발생 여부와
    // 무관하게) JS 타이머·이벤트 루프가 곧바로 재개되지 않고, 화면을 실제로 한 번
    // 터치해야 완전히 깨어나는 경우가 있다 — 그 경우 setInterval 폴링도 같이 멈춰
    // 있어 못 잡는다. 첫 터치를 보조 깨우기 신호로 추가.
    document.addEventListener('touchstart', onVisible, { passive: true })
    consumePending() // 최초 로드(콜드 오픈/재개 후 reload 포함)
    // 앱이 계속 포그라운드였어도(상태 전환 이벤트가 안 옴) 확실히 잡히도록 가볍게 주기 확인
    // (consumePending 의 재시도 캐스케이드는 여기선 불필요 — 매번 한 번만 읽는다)
    const poll = setInterval(() => { if (!cancelled) readPending().then((url) => { if (url) consumeUrl(url, 'poll') }) }, POLL_MS)

    return () => {
      cancelled = true
      navigator.serviceWorker.removeEventListener('message', onMessage)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', onVisible)
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('touchstart', onVisible)
      bc?.close()
      clearInterval(poll)
    }
  }, [])
}
