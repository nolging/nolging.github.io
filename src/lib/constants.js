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

// 그룹 대표 이모지 배경색 팔레트 (파스텔)
export const GROUP_EMOJI_BGS = [
  '#FFD8A8', '#FFC9C9', '#FCC2D7', '#EEBEFA', '#D0BFFF',
  '#BAC8FF', '#A5D8FF', '#96F2D7', '#B2F2BB', '#FFEC99',
]
export const DEFAULT_GROUP_BG = '#E9ECEF'

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

// 위시 카테고리(기본값) — 그룹이 커스터마이즈하지 않았을 때 사용.
// 각 유형: { name, emoji, bg(배지 배경), fg(배지 글자) }
export const DEFAULT_WISH_CATEGORIES = [
  { name: 'OTT',  emoji: '📺', bg: '#eeebfe', fg: '#7363e8' }, // 보라
  { name: '영화', emoji: '🎬', bg: '#e6eefd', fg: '#5578d0' }, // 블루
  { name: '게임', emoji: '🎮', bg: '#fde8ee', fg: '#cf5e88' }, // 핑크
  { name: '독서', emoji: '📚', bg: '#fdeee6', fg: '#d98a4e' }, // 오렌지
  { name: '운동', emoji: '🏃', bg: '#e8f4ec', fg: '#4a9d6a' }, // 그린
  { name: '기타', emoji: '✨', bg: '#eef0f2', fg: '#8b8798' }, // 그레이
]
// 이름 목록(기본) — 편집 전/폴백용
export const WISH_CATEGORIES = DEFAULT_WISH_CATEGORIES.map((c) => c.name)

// 화폐: 시스템 네이밍은 coin, UI 표기는 "츄르". 표기는 항상 이 헬퍼로 통일.
export const COIN_UNIT = '츄르'
export function formatCoin(amount) {
  const n = Number(amount) || 0
  return `${n.toLocaleString('ko-KR')} ${COIN_UNIT}`
}

// OTT 제공처 영문명(TMDB) → 한글 표기. 없으면 원문 유지.
const OTT_NAME_KO = {
  'Netflix': '넷플릭스',
  'Wavve': '웨이브', 'wavve': '웨이브',
  'Watcha': '왓챠', 'watcha': '왓챠',
  'Disney Plus': '디즈니플러스', 'Disney+': '디즈니플러스',
  'Tving': '티빙', 'TVING': '티빙',
  'Coupang Play': '쿠팡플레이',
  'Amazon Prime Video': '프라임비디오',
  'Apple TV': '애플TV+', 'Apple TV Plus': '애플TV+', 'Apple TV+': '애플TV+',
  'Laftel': '라프텔', 'laftel': '라프텔',
}
export function ottNameKo(name) {
  if (!name) return ''
  const n = String(name).trim()
  return OTT_NAME_KO[n] ?? n
}

// 정보 자동 조회를 지원하는 위시 유형
export const MEDIA_LOOKUP_CATS = ['OTT', '영화', '독서', '게임']

// 회원이 구독 여부를 관리하는 OTT 목록 (프로필 · 멤버 카드 배지)
export const SUBSCRIBABLE_OTTS = [
  { key: 'netflix', label: '넷플릭스', logo: '/ott/netflix.jpg' },
  { key: 'tving', label: '티빙', logo: '/ott/tving.png' },
  { key: 'wavve', label: '웨이브', logo: '/ott/wavve.png' },
  { key: 'disney', label: '디즈니플러스', logo: '/ott/disney.png' },
  { key: 'watcha', label: '왓챠', logo: '/ott/watcha.png' },
  { key: 'coupang', label: '쿠팡플레이', logo: '/ott/coupang.png' },
]
export const OTT_BY_KEY = Object.fromEntries(SUBSCRIBABLE_OTTS.map((o) => [o.key, o]))

// 게임 플랫폼: 지정한 순서로 표기(그 외 Xbox/리눅스/모바일 등은 표기하지 않음)
const PLATFORM_ORDER = [
  { key: 'Nintendo', label: '닌텐도' },
  { key: 'Mac', label: '맥' },
  { key: 'PC', label: '윈도우' },
  { key: 'PlayStation', label: '플스' },
]
export function gamePlatformLabels(list) {
  const set = new Set(list || [])
  return PLATFORM_ORDER.filter((p) => set.has(p.key)).map((p) => p.label)
}

// 위시 카드에 표시할 미디어 요약. 숫자와 단위 사이는 띄어 표기 (예: 8 부작, 90 분).
// OTT: (러닝타임 | OTT) / (N 부작 | OTT), 영화: 러닝타임 | 개봉일 개봉,
// 독서: 페이지수 | 저자, 게임: 플랫폼 | 장르
export function mediaCardLine(category, mi) {
  if (!mi) return ''
  const parts = []
  if (category === 'OTT') {
    if (mi.kind === 'tv') { if (mi.episode_count) parts.push(`${mi.episode_count} 부작`) }
    else if (mi.runtime) parts.push(`${mi.runtime} 분`)
    const list = (mi.providers?.length ? mi.providers : mi.providers_buy) || []
    const names = list.map((p) => ottNameKo(typeof p === 'string' ? p : p?.name)).filter(Boolean)
    if (names.length) parts.push(names.join(' '))
  } else if (category === '영화') {
    if (mi.runtime) parts.push(`${mi.runtime} 분`)
    if (mi.release_date) parts.push(`${mi.release_date} 개봉`)
  } else if (category === '독서') {
    if (mi.author) parts.push(mi.author)
    if (mi.page_count) parts.push(`${mi.page_count} 쪽`)
  } else if (category === '게임') {
    const plats = gamePlatformLabels(mi.platforms)
    if (plats.length) parts.push(plats.join(' '))
  } else return ''
  return parts.join(' | ')
}

// 유형 편집기에서 고를 수 있는 배지색 프리셋 (배경/글자 쌍)
export const CATEGORY_COLOR_PRESETS = [
  { bg: '#eeebfe', fg: '#7363e8' }, // 보라
  { bg: '#e6eefd', fg: '#5578d0' }, // 블루
  { bg: '#e6f6f8', fg: '#3d97a8' }, // 청록
  { bg: '#e8f4ec', fg: '#4a9d6a' }, // 그린
  { bg: '#fff4d6', fg: '#c99a24' }, // 옐로
  { bg: '#fdeee6', fg: '#d98a4e' }, // 오렌지
  { bg: '#fbe9e7', fg: '#c65b4e' }, // 레드
  { bg: '#fde8ee', fg: '#cf5e88' }, // 핑크
  { bg: '#eef0f2', fg: '#8b8798' }, // 그레이
]
// 삭제된/알 수 없는 유형의 중립 표시(회색)
const NEUTRAL_META = { emoji: '🏷️', bg: '#eef0f2', fg: '#8b8798' }

// group.wish_categories → 정규화된 유형 목록. 커스텀이 없으면 기본 6종.
export function resolveCategories(group) {
  const l = group?.wish_categories
  if (Array.isArray(l)) {
    const clean = l.filter((c) => c && typeof c.name === 'string' && c.name.trim())
    if (clean.length) return clean
  }
  return DEFAULT_WISH_CATEGORIES
}
// 유형 이름 목록(그룹 기준)
export function categoryNames(group) {
  return resolveCategories(group).map((c) => c.name)
}
// 유형명 → 표시 메타. 첫 인자는 유형 목록(배열) 또는 group 객체 모두 허용.
// 목록에 없는(삭제된) 이름은 중립(회색)으로 표시.
export function catMeta(catsOrGroup, name) {
  const list = Array.isArray(catsOrGroup) ? catsOrGroup : resolveCategories(catsOrGroup)
  return list.find((c) => c.name === name) || { name, ...NEUTRAL_META }
}
export function catChipStyle(meta) {
  return { background: meta.bg, color: meta.fg, borderColor: meta.bg }
}
export function catChipEmoji(meta) {
  return meta.emoji || NEUTRAL_META.emoji
}
// (하위호환) 이름만으로 기본값 기준 스타일/이모지 — group 을 못 넘기는 소수 지점용
export function categoryEmoji(cat) {
  return catChipEmoji(catMeta(DEFAULT_WISH_CATEGORIES, cat))
}
export function categoryStyle(cat) {
  return catChipStyle(catMeta(DEFAULT_WISH_CATEGORIES, cat))
}
// 유형별 "작품" 명칭: OTT/영화=작품, 독서=도서, 게임=게임
export function workNoun(cat) {
  return cat === '독서' ? '도서' : cat === '게임' ? '게임' : '작품'
}
// 유형별 검색 안내(자동 채워지는 항목)
export function workSearchHint(cat) {
  if (cat === '영화') return '포스터·개봉일·장르·러닝타임이 자동으로 채워져요'
  if (cat === '독서') return '표지·저자·장르·페이지 수가 자동으로 채워져요'
  if (cat === '게임') return '커버·플랫폼·장르·출시일이 자동으로 채워져요'
  return '포스터·제공처·장르·러닝타임이 자동으로 채워져요' // OTT
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
// "N 월 N 일 *요일 HH24:MI" (예: "7 월 8 일 화요일 14:30"). timeSet=false 면 시간 생략.
export function formatWhen(iso, timeSet = true) {
  try {
    const d = new Date(iso)
    const p = (n) => String(n).padStart(2, '0')
    let s = `${d.getMonth() + 1} 월 ${d.getDate()} 일 ${WEEKDAYS[d.getDay()]}요일`
    if (timeSet) s += ` ${p(d.getHours())}:${p(d.getMinutes())}`
    return s
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
