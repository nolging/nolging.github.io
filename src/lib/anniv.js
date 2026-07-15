// 커플 기념일 판정 유틸.
export function parseYMD(s) {
  const [y, mo, d] = String(s || '').split('-').map(Number)
  if (!y || !mo || !d) return null
  return new Date(y, mo - 1, d)
}

// 오늘이 커플 "기념일"인가 판정.
//  - 100일 단위 기념일(100·200·300…일), 또는
//  - 매년 돌아오는 기념일(시작일과 월/일 일치, 시작일 당일 포함)
export function isAnnivToday(dateStr) {
  const start = parseYMD(dateStr)
  if (!start) return false
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (today < start) return false
  const days = Math.floor((today - start) / 86400000) + 1
  if (days >= 100 && days % 100 === 0) return true
  if (today.getMonth() === start.getMonth() && today.getDate() === start.getDate()) return true
  return false
}
