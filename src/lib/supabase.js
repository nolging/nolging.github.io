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
  if (init.signal) {
    if (init.signal.aborted) ctrl.abort()
    else init.signal.addEventListener('abort', () => ctrl.abort(), { once: true })
  }
  // 중요: iOS PWA(WebKit)는 프리즈→재개 시 중단된 fetch 를 abort() 해도 promise 를
  // reject 하지 않고 그대로 매달아 둔다(dangling). 그러면 요청이 영영 settle 되지 않아
  // 페이지 로딩이 무한히 돈다. → abort 에만 의존하지 않고, '거부하는 타임아웃 promise'
  // 와 race 시켜 밑단 fetch 가 끝나지 않아도 반환 promise 는 반드시 settle 되게 한다.
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      try { ctrl.abort() } catch { /* noop */ }
      reject(new DOMException('Request timeout', 'AbortError'))
    }, limit)
  })
  return Promise.race([fetch(input, { ...init, signal: ctrl.signal }), timeout])
    .catch((err) => {
      // 호출자가 직접 취소한 경우는 재시도하지 않음
      if (init.signal && init.signal.aborted) throw err
      // 읽기(GET/HEAD)는 타임아웃/네트워크 실패 시 1회 자동 재시도(새 연결로 회복)
      if (isRead && attempt < 1) return timeoutFetch(input, init, attempt + 1)
      throw err
    })
    .finally(() => clearTimeout(timer))
}

// 인증 락 옵션은 주지 않는다(기본 lockless 경로).
// auth-js v2 는 커스텀 lock 을 주면 모든 인증 작업(getSession/refresh 등)을 그 락으로
// 직렬화하는데, 작업 하나가 settle 되지 않으면 이후 모든 토큰 조회가 큐에 막혀
// "이용 중 페이지 이동 시 무한 로딩" 이 된다. (navigator.locks 든 processLock 이든 동일)
// 기본값(this.lock=null)은 락 없이 동작하며, 동시 refresh 는 클라이언트가 내부적으로
// dedup 하므로 단일 창 PWA 에 안전하다. 무한 대기 방어는 timeoutFetch(race)가 담당.
export const supabase = createClient(url || 'http://localhost', anonKey || 'public-anon-key', {
  global: { fetch: timeoutFetch },
})

// 닉네임 -> 내부 로그인 이메일
export function nicknameToEmail(nickname) {
  return `${String(nickname).trim().toLowerCase()}@${EMAIL_DOMAIN}`
}
