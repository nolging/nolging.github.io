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

// 인증 락은 기본값(navigator.locks) 사용 — 평상시 성능/재진입에 가장 안전.
// 장시간 백그라운드 후 락이 굳어 멈추는 경우는 AuthContext 의 '재개 워치독'이
// 감지해 새로고침으로 회복시킨다. (커스텀 락은 평시 로딩을 느리게 만들어 제거)
export const supabase = createClient(url || 'http://localhost', anonKey || 'public-anon-key', {
  global: { fetch: timeoutFetch },
})

// 닉네임 -> 내부 로그인 이메일
export function nicknameToEmail(nickname) {
  return `${String(nickname).trim().toLowerCase()}@${EMAIL_DOMAIN}`
}
