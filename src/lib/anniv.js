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

// 시작일 기준, 임의의 날짜가 "며칠째"인지(시작일 = 1일차)
function dayCountOf(dateObj, start) {
  const d0 = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate())
  return Math.floor((d0 - start) / 86400000) + 1
}

// 다음 N주년(달력상 매년 같은 월/일) 의 { years, dayCount } — 현재 며칠째(days)보다 뒤인 첫 번째
function nextYearly(start, days) {
  for (let y = 1; y <= 200; y++) {
    const d = new Date(start.getFullYear() + y, start.getMonth(), start.getDate())
    const dc = dayCountOf(d, start)
    if (dc > days) return { years: y, dayCount: dc }
  }
  return null
}
// 가장 최근에 지난 N주년의 day-count(없으면 0) — 진행률 바의 "이전 마일스톤" 기준용
function prevYearly(start, days) {
  let best = 0
  for (let y = 1; y <= 200; y++) {
    const d = new Date(start.getFullYear() + y, start.getMonth(), start.getDate())
    const dc = dayCountOf(d, start)
    if (dc > days) break
    best = dc
  }
  return best
}

// 커스텀 지정(kind: 'days'|'years', value) 의 day-count
export function customAnnivDayCount(startStr, kind, value) {
  const start = parseYMD(startStr)
  if (!start || !kind || !value) return null
  if (kind === 'days') return value
  if (kind === 'years') {
    const d = new Date(start.getFullYear() + value, start.getMonth(), start.getDate())
    return dayCountOf(d, start)
  }
  return null
}

// 자동 "다음 기념일" — 다음 100일 단위 vs 다음 N주년 중 더 가까운 쪽
export function nextAutoAnniv(startStr, days) {
  const start = parseYMD(startStr)
  if (!start || days == null) return null
  const nextHundred = (Math.floor(days / 100) + 1) * 100
  const prevHundred = nextHundred - 100
  const yearly = nextYearly(start, days)
  const prevDayCount = Math.max(prevHundred, prevYearly(start, days))
  if (!yearly || nextHundred <= yearly.dayCount) {
    return { kind: 'days', value: nextHundred, dayCount: nextHundred, prevDayCount }
  }
  return { kind: 'years', value: yearly.years, dayCount: yearly.dayCount, prevDayCount }
}

// 실제로 표시할 "다음 기념일" — 그룹이 커스텀 지정을 해 뒀고 아직 지나지 않았으면 커스텀,
// 아니면(지정 없음 또는 이미 지났으면) 자동 계산으로.
export function resolveNextAnniv(startStr, days, customKind, customValue) {
  if (days == null) return null
  if (customKind && customValue) {
    const dc = customAnnivDayCount(startStr, customKind, customValue)
    if (dc != null && dc >= days) {
      return { kind: customKind, value: customValue, dayCount: dc, prevDayCount: 0, isCustom: true }
    }
  }
  const auto = nextAutoAnniv(startStr, days)
  return auto ? { ...auto, isCustom: false } : null
}
