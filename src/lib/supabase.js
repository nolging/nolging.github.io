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

export const supabase = createClient(url || 'http://localhost', anonKey || 'public-anon-key')

// 닉네임 -> 내부 로그인 이메일
export function nicknameToEmail(nickname) {
  return `${String(nickname).trim().toLowerCase()}@${EMAIL_DOMAIN}`
}
