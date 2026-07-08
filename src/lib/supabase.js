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

// 인증 락: 기본값(navigator.locks)은 탭이 몇 시간 백그라운드/프리즈된 뒤 재개할 때
// 락이 응답하지 않아 토큰 갱신·쿼리가 무한 대기(로딩 멈춤)하는 문제가 있다.
// navigator.locks 대신 탭 내부 직렬화 락을 써서 데드락 없이 갱신을 순차 처리한다.
// (단일 탭 PWA 라 탭 내 직렬화로 충분)
let lockChain = Promise.resolve()
function memoryLock(_name, _acquireTimeout, fn) {
  const run = lockChain.then(fn, fn)
  lockChain = run.then(() => undefined, () => undefined)
  return run
}

export const supabase = createClient(url || 'http://localhost', anonKey || 'public-anon-key', {
  auth: { lock: memoryLock },
  global: { fetch: timeoutFetch },
})

// 닉네임 -> 내부 로그인 이메일
export function nicknameToEmail(nickname) {
  return `${String(nickname).trim().toLowerCase()}@${EMAIL_DOMAIN}`
}
