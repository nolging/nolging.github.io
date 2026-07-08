import { supabase } from './supabase'

// VAPID 공개키(applicationServerKey). 공개용이라 소스에 두어도 안전.
// (개인키는 Supabase Edge Function 시크릿 VAPID_PRIVATE_KEY 로만 보관)
export const VAPID_PUBLIC_KEY =
  'BCqO4oTSk5narhy5Xbi2lHZ6vhs2RalNmqyqb33mACFxGY_X-s5ovkHk76JTZK9eQrAFweJLxgvrJLYpCBjxqM8'

export function pushSupported() {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

// iOS 는 홈 화면에 추가(standalone)해야 웹 푸시가 동작
export function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  )
}
export function isIOS() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

// 서비스 워커 등록 (앱 로드시 1회)
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null
  try { return await navigator.serviceWorker.register('/sw.js') }
  catch { return null }
}

export async function currentSubscription() {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

// 현재 알림 상태: 'unsupported' | 'need-standalone' | 'denied' | 'default' | 'subscribed'
export async function pushStatus() {
  if (!pushSupported()) {
    if (isIOS() && !isStandalone()) return 'need-standalone'
    return 'unsupported'
  }
  if (Notification.permission === 'denied') return 'denied'
  const sub = await currentSubscription()
  if (sub && Notification.permission === 'granted') return 'subscribed'
  return 'default'
}

// 푸시 켜기: 권한 요청 → 구독 → 서버에 저장
export async function enablePush(userId) {
  if (!pushSupported()) {
    if (isIOS() && !isStandalone()) throw new Error('아이폰은 홈 화면에 추가한 뒤 알림을 켤 수 있어요.')
    throw new Error('이 기기/브라우저는 푸시 알림을 지원하지 않습니다.')
  }
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('알림 권한이 허용되지 않았습니다.')

  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
  }
  const json = sub.toJSON()
  // 이 기기를 현재 로그인 사용자 소유로 (재)등록 — 다른 계정에 묶여 있었어도 이전.
  const { error } = await supabase.rpc('attach_push_subscription', {
    p_endpoint: sub.endpoint,
    p_p256dh: json.keys.p256dh,
    p_auth: json.keys.auth,
  })
  if (error) {
    // attach RPC 미배포 시(구버전 DB) 예전 방식으로 폴백
    if (error.code === 'PGRST202' || /attach_push_subscription/.test(error.message || '')) {
      const { error: upErr } = await supabase.from('push_subscriptions').upsert(
        { user_id: userId, endpoint: sub.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth },
        { onConflict: 'endpoint' },
      )
      if (upErr) throw upErr
      return true
    }
    throw error
  }
  return true
}

// 로그인/계정 전환 시 호출: 이미 이 브라우저에 푸시 구독이 있으면 현재 사용자 소유로 재바인딩.
// 권한 요청/신규 구독은 하지 않는다(조용히 동기화). userId 인자는 로그 용도(실 소유자는 auth.uid()).
export async function syncPushToCurrentUser() {
  try {
    if (!pushSupported() || Notification.permission !== 'granted') return
    const sub = await currentSubscription()
    if (!sub) return
    const json = sub.toJSON()
    await supabase.rpc('attach_push_subscription', {
      p_endpoint: sub.endpoint,
      p_p256dh: json.keys.p256dh,
      p_auth: json.keys.auth,
    })
  } catch { /* 조용히 무시 — 알림 동기화 실패가 앱을 막지 않도록 */ }
}

// 로그아웃 시 호출: 이 기기의 서버 구독만 제거(브라우저 구독은 유지 → 재로그인 시 즉시 재바인딩).
export async function detachPushFromServer() {
  try {
    if (!pushSupported()) return
    const sub = await currentSubscription()
    if (!sub) return
    await supabase.rpc('detach_push_subscription', { p_endpoint: sub.endpoint })
  } catch { /* 조용히 무시 */ }
}

// 푸시 끄기: 서버 구독 삭제 + 브라우저 구독 해제
export async function disablePush() {
  if (!pushSupported()) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  await supabase.rpc('detach_push_subscription', { p_endpoint: sub.endpoint })
  await sub.unsubscribe()
}
