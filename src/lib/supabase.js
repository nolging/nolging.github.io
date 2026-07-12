import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const EMAIL_DOMAIN = import.meta.env.VITE_EMAIL_DOMAIN || 'nolging.app'

if (!url || !anonKey) {
  // 개발 중 설정 누락을 빠르게 알리기 위한 콘솔 경고
  console.warn(
    '[Nolging] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 가 설정되지 않았습니다. .env.local 을 확인하세요.'
  )
}

// 장시간 백그라운드 후 재개 시 첫 요청이 무한 대기(연결 stale)하는 문제 대응:
// 모든 요청에 타임아웃을 걸고, 읽기(GET/HEAD)는 타임아웃 시 1회 자동 재시도해
// 새 연결로 회복시킨다. (쓰기/업로드는 재시도하지 않음 — 중복 방지)
function timeoutFetch(input, init = {}, attempt = 0) {
  const method = (init.method || 'GET').toUpperCase()
  const isRead = method === 'GET' || method === 'HEAD'
  const limit = isRead ? 10000 : 30000
  const ctrl = new AbortController()
  let timedOut = false
  const t = setTimeout(() => { timedOut = true; ctrl.abort() }, limit)
  if (init.signal) {
    if (init.signal.aborted) ctrl.abort()
    else init.signal.addEventListener('abort', () => ctrl.abort(), { once: true })
  }
  return fetch(input, { ...init, signal: ctrl.signal })
    .catch((err) => {
      if (timedOut && isRead && attempt < 1) return timeoutFetch(input, init, attempt + 1)
      throw err
    })
    .finally(() => clearTimeout(t))
}

// 인증 락 타임아웃:
// supabase-js 는 모든 요청 직전에 인증 락(navigator.locks)을 잡아 토큰을 읽/갱신한다.
// 장시간 백그라운드/절전 후 재개 시 이 락이 굳으면, 요청이 fetch 에 도달하기도 전에
// 무한 대기해 (timeoutFetch 로도 못 잡음) "상단바만 뜨고 콘텐츠 로딩만 계속 도는" 상태가 된다.
// 락을 일정 시간(최대 5초) 안에 못 잡으면 락 없이라도 진행해 무한 대기를 원천 차단한다.
// 정상 상황(락이 비어 있음)에선 즉시 획득되므로 평시 성능 저하는 없다.
async function authLockWithTimeout(name, acquireTimeout, fn) {
  if (typeof navigator === 'undefined' || !navigator.locks || !navigator.locks.request) {
    return fn() // Web Locks 미지원 환경 → 그냥 실행
  }
  const MAX = 5000
  const wait = acquireTimeout > 0 ? Math.min(acquireTimeout, MAX) : MAX
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), wait)
  try {
    return await navigator.locks.request(name, { signal: ctrl.signal }, async () => {
      clearTimeout(timer)
      return await fn()
    })
  } catch (e) {
    clearTimeout(timer)
    // 타임아웃(AbortError)이면 락 고착으로 보고 락 없이 진행(최선). 그 외 오류는 전파.
    if (e && e.name === 'AbortError') return fn()
    throw e
  }
}

export const supabase = createClient(url || 'http://localhost', anonKey || 'public-anon-key', {
  auth: { lock: authLockWithTimeout },
  global: { fetch: timeoutFetch },
})

// 닉네임 -> 내부 로그인 이메일
export function nicknameToEmail(nickname) {
  return `${String(nickname).trim().toLowerCase()}@${EMAIL_DOMAIN}`
}
