// 생년월일 유틸. DB 는 date 컬럼이라 "생년 없이 생일(월/일)만" 은 센티넬 연도로 저장한다.
//  · 센티넬 연도 0004 는 (proleptic) 윤년이라 2월 29일까지 저장 가능하고, 실제 생년과 겹치지 않는다.
//  · 저장 형식은 언제나 'YYYY-MM-DD'. 연도가 0004 이면 "생일만" 으로 해석해 표시에서 연도를 숨긴다.
export const SENTINEL_YEAR = '0004'

export function isYearless(s) {
  return typeof s === 'string' && s.startsWith(`${SENTINEL_YEAR}-`)
}

// 'YYYY-MM-DD' → { year, month, day } (월/일은 2자리 문자열, 없으면 ''). 센티넬 연도는 year='' 로.
export function parseBirth(s) {
  if (!s || typeof s !== 'string') return { year: '', month: '', day: '' }
  const [y = '', mo = '', d = ''] = s.slice(0, 10).split('-')
  return { year: y === SENTINEL_YEAR ? '' : y, month: mo, day: d }
}

// { year, month, day } → 'YYYY-MM-DD'(연도 없으면 센티넬) / 월·일 미완성이면 ''
export function composeBirth({ year, month, day }) {
  if (!month || !day) return ''
  const mm = String(month).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  const yy = year ? String(year).padStart(4, '0') : SENTINEL_YEAR
  return `${yy}-${mm}-${dd}`
}

const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
// 해당 연/월의 마지막 일. 연도 미지정(생일만)이면 윤년 기준(2월 29일 허용).
export function daysInMonth(year, month) {
  const m = Number(month)
  if (!m) return 31
  if (m === 2) return (year ? isLeap(Number(year)) : true) ? 29 : 28
  return [4, 6, 9, 11].includes(m) ? 30 : 31
}

// 표시용: "2000.3.5" / 생일만 "3.5" (멤버 카드 등 점 구분)
export function formatBirthDot(s) {
  const { year, month, day } = parseBirth(s)
  if (!month || !day) return null
  const md = `${Number(month)}.${Number(day)}`
  return year ? `${year}.${md}` : md
}

// 표시용: "2000년 3월 5일" / 생일만 "3월 5일"
export function formatBirthKo(s) {
  const { year, month, day } = parseBirth(s)
  if (!month || !day) return ''
  const md = `${Number(month)}월 ${Number(day)}일`
  return year ? `${year}년 ${md}` : md
}
