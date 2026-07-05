// 위시 용어 & 그룹 테마 (모든 그룹 공통 — "놀 때" 컨셉)

// 그룹 테마: 기본/사랑/우정. 현재는 사용자가 바꿀 수 없고 생성 시 '기본' 고정.
export const GROUP_THEMES = [
  { value: 'default', label: '기본' },
  { value: 'couple', label: '사랑' },
  { value: 'friend', label: '우정' },
]
export const DEFAULT_THEME = 'default'
export function themeLabel(theme) {
  return GROUP_THEMES.find((t) => t.value === theme)?.label ?? '기본'
}

// 위시 용어. 진행 상태: 위시(to do) → 약속(doing) → 추억(done)
const TERMS = {
  noun: '위시',
  status: { open: '위시', accepted: '약속', done: '추억' },
  accept: '놀기 신청',
}
export function taskTerms() {
  return TERMS
}

// 진행 단계 순서 ("전체" 제외)
export const TASK_STATUSES = ['open', 'accepted', 'done']

// 위시 카테고리
export const WISH_CATEGORIES = ['OTT', '독서', '영화', '게임', '운동', '기타']

// 카테고리별 파스텔 색 (배경/글자) — 칩으로 유형을 한눈에 구분
export const CATEGORY_COLORS = {
  OTT:  { bg: '#ECE6FB', fg: '#6C4BD6' }, // 라벤더
  독서: { bg: '#FBE7D6', fg: '#B96A2E' }, // 살구
  영화: { bg: '#DCEAFE', fg: '#2F6FCF' }, // 하늘
  게임: { bg: '#DAF1E2', fg: '#2E9E63' }, // 민트
  운동: { bg: '#FFE0E6', fg: '#D2506E' }, // 코랄핑크
  기타: { bg: '#E9EBF1', fg: '#6B7280' }, // 뉴트럴
}
export function categoryStyle(cat) {
  const c = CATEGORY_COLORS[cat] || CATEGORY_COLORS['기타']
  return { background: c.bg, color: c.fg, borderColor: c.bg }
}

// 약속 반복 옵션 (아이폰 미리 알림 참고). value=저장 키, label=표시
export const REPEAT_OPTIONS = [
  { value: 'none', label: '안 함' },
  { value: 'hourly', label: '매시간' },
  { value: 'daily', label: '매일' },
  { value: 'weekday', label: '평일' },
  { value: 'weekend', label: '주말' },
  { value: 'weekly', label: '매주' },
  { value: 'biweekly', label: '격주' },
  { value: 'monthly', label: '매월' },
  { value: 'quarterly', label: '3개월마다' },
  { value: 'semiannually', label: '6개월마다' },
  { value: 'yearly', label: '매년' },
  { value: 'custom', label: '사용자화' },
]

// 사용자화 반복: 빈도 단위
export const CUSTOM_FREQ = [
  { value: 'daily', label: '일' },
  { value: 'weekly', label: '주' },
  { value: 'monthly', label: '개월' },
  { value: 'yearly', label: '년' },
]
export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

// 마감 예정 미리 알림 (약속 시간 기준 얼마 전). value=분(문자열), ''=없음
export const REMIND_OPTIONS = [
  { value: '', label: '없음' },
  { value: '0', label: '정시' },
  { value: '5', label: '5분 전' },
  { value: '10', label: '10분 전' },
  { value: '30', label: '30분 전' },
  { value: '60', label: '1시간 전' },
  { value: '1440', label: '1일 전' },
  { value: '10080', label: '1주 전' },
]
export function remindLabel(min) {
  if (min === null || min === undefined || min === '') return '없음'
  return REMIND_OPTIONS.find((o) => o.value === String(min))?.label ?? `${min}분 전`
}

// 약속 시각 표시 (시간 미설정이면 날짜만)
export function formatWhen(iso, timeSet = true) {
  try {
    const opts = timeSet
      ? { month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }
      : { month: 'long', day: 'numeric', weekday: 'short' }
    return new Date(iso).toLocaleString('ko-KR', opts)
  } catch { return '' }
}

// 반복 주기 요약 (ex. "매주 수요일 18:00")
export function repeatCycleText(rule, iso) {
  if (!rule || rule === 'none') return ''
  const base = repeatLabel(rule)
  let hm = '', wd = ''
  if (iso) {
    const d = new Date(iso)
    hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    wd = `${WEEKDAYS[d.getDay()]}요일`
  }
  // 매주/격주 프리셋은 라벨에 요일이 없으므로 약속 요일을 덧붙임
  if (rule === 'weekly' || rule === 'biweekly') return [base, wd, hm].filter(Boolean).join(' ')
  return [base, hm].filter(Boolean).join(' ')
}

// 반복 규칙 → 표시 문자열 (프리셋 키 또는 사용자화 JSON)
export function repeatLabel(rule) {
  if (!rule || rule === 'none') return '안 함'
  if (typeof rule === 'string' && rule[0] === '{') {
    try {
      const c = JSON.parse(rule)
      const every = { daily: '매일', weekly: '매주', monthly: '매월', yearly: '매년' }[c.freq] || ''
      const unit = { daily: '일', weekly: '주', monthly: '개월', yearly: '년' }[c.freq] || ''
      const base = c.interval > 1 ? `${c.interval}${unit}마다` : every
      if (c.freq === 'weekly' && c.weekdays?.length) {
        return `${base} ${c.weekdays.map((d) => WEEKDAYS[d]).join('·')}`
      }
      return base
    } catch { return '사용자화' }
  }
  return REPEAT_OPTIONS.find((o) => o.value === rule)?.label ?? '안 함'
}
