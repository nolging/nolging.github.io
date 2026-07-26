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

// 열려 있는 앱에게 "이 경로로 이동해" 라고 알리고, 앱이 처리했는지 응답을 기다린다.
// (WindowClient.navigate() 는 iOS 홈화면 앱에서 동작하지 않거나 거부되는 경우가 있어
//  알림을 눌러도 원래 페이지에 그대로 남는 문제가 있었다 → SPA 라우터로 이동시킨다.)
function askClientToNavigate(client, url) {
  return new Promise((resolve) => {
    let settled = false
    const finish = (ok) => { if (!settled) { settled = true; clearTimeout(timer); resolve(ok) } }
    const timer = setTimeout(() => finish(false), 600)
    try {
      const ch = new MessageChannel()
      ch.port1.onmessage = () => finish(true)
      client.postMessage({ type: 'navigate', url }, [ch.port2])
    } catch { finish(false) }
  })
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const win = wins.find((w) => 'focus' in w) || wins[0]
    if (win) {
      // 먼저 포커스(사용자 제스처 컨텍스트를 잃기 전에) → 그다음 라우팅
      if ('focus' in win) { try { await win.focus() } catch { /* noop */ } }
      const handled = await askClientToNavigate(win, url)
      if (handled) return
      // 앱이 응답하지 않으면(예: 구버전 화면) 표준 API 로 재시도
      if (win.navigate) { try { await win.navigate(url); return } catch { /* noop */ } }
    }
    if (self.clients.openWindow) await self.clients.openWindow(url)
  })())
})
