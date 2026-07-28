/* Nolging 서비스 워커 — 웹 푸시 수신 & 알림 클릭 처리 */

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

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
  event.waitUntil(self.registration.showNotification(title, options))
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
