/* Nolging 서비스 워커 — 웹 푸시 수신 & 알림 클릭 처리 */

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// ---- 포그라운드 감지(하트비트) ----
// silent 푸시(오류 리포트 채팅 등)를 '지금 보고 있으면 표시 생략'하려면 포그라운드 여부가
// 필요한데, WindowClient.focused 는 iOS 홈화면 PWA 에서 신뢰할 수 없었다(항상 focused=false
// 로 보고되는 사례). visibilityState 도 마찬가지로 백그라운드에서 'visible' 로 남는 iOS 버그가
// 있어 못 쓴다. 그래서 브라우저가 보고하는 상태 대신, 앱이 직접(src/lib/focusHeartbeat.js)
// 자신의 포커스 상태를 postMessage 로 주기적으로 알려주고, 이를 Cache 에 저장해 둔다.
// SW 는 이벤트 사이에 종료·재시작될 수 있어 일반 변수가 아닌 Cache API 로 유지한다.
const FOCUS_CACHE = 'nolging-focus'
const FOCUS_KEY = '__focus_state__'
const FOCUS_FRESH_MS = 20000 // 이보다 오래된 하트비트는 무시(죽은 탭 등으로 간주 → 알림 표시)

async function setFocusState(active) {
  try {
    const c = await caches.open(FOCUS_CACHE)
    await c.put(FOCUS_KEY, new Response(JSON.stringify({ active: !!active, ts: Date.now() })))
  } catch { /* noop */ }
}
async function getFocusState() {
  try {
    const c = await caches.open(FOCUS_CACHE)
    const res = await c.match(FOCUS_KEY)
    return res ? await res.json() : null
  } catch { return null }
}
self.addEventListener('message', (event) => {
  const d = event.data
  if (d && d.type === 'focus-state') event.waitUntil(setFocusState(d.active))
})

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} }
  catch { data = { title: event.data && event.data.text() } }

  const title = data.title || '알림'
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/' },
    tag: data.tag,           // 있으면 같은 태그 알림을 갱신
  }
  event.waitUntil((async () => {
    // silent = 오류 리포트 채팅 등 '푸시 전용' 알림. 지금 앱을 보고 있으면(포그라운드)
    // 실시간으로 이미 확인하므로 표시하지 않는다. 하트비트(신뢰) OR 브라우저 focused
    // 보고(일부 브라우저에서 동작) 중 하나라도 참이면 포그라운드로 판단.
    if (data.silent) {
      const [cs, focus] = await Promise.all([
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }),
        getFocusState(),
      ])
      const clientFocused = cs.some((c) => c.focused)
      const heartbeatFocused = !!focus?.active && (Date.now() - focus.ts) < FOCUS_FRESH_MS
      if (clientFocused || heartbeatFocused) return
    }
    await self.registration.showNotification(title, options)
  })())
})

// 알림 클릭 시 이동 목적지를 Cache 에 저장 → 앱이 재개될 때(visible) 소비한다.
// iOS 홈화면 PWA 는 백그라운드에서 JS 가 얼어 postMessage 가 유실되거나
// WindowClient.navigate() 가 무시되는 경우가 많아, 앱을 열어도 원래 페이지에 남는다.
// 그래서 '저장 후 재개 시 소비' 방식으로 확실하게 이동시킨다. (src/lib/pushNav.js)
const NAV_CACHE = 'nolging-nav'
const NAV_KEY = '__pending_nav__'
async function savePendingNav(url) {
  try {
    const c = await caches.open(NAV_CACHE)
    await c.put(NAV_KEY, new Response(url, { headers: { 'content-type': 'text/plain' } }))
  } catch { /* noop */ }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil((async () => {
    // 재개 시 앱이 읽어 이동할 목적지 저장(메시지가 유실돼도 이걸로 이동)
    await savePendingNav(url)
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const win = wins.find((w) => 'focus' in w) || wins[0]
    if (win) {
      // 먼저 포커스(사용자 제스처 컨텍스트를 잃기 전에)
      if ('focus' in win) { try { await win.focus() } catch { /* noop */ } }
      // 살아있는 앱엔 즉시 알림(빠른 경로). 얼어 있으면 위 pending 을 재개 시 소비.
      try { win.postMessage({ type: 'navigate', url }) } catch { /* noop */ }
      return
    }
    // 열린 창이 없으면(콜드 스타트) 해당 경로로 새 창 — pending 은 같은 경로라 재소비돼도 무해
    if (self.clients.openWindow) await self.clients.openWindow(url)
  })())
})
