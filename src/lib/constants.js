// 그룹 유형/테마 라벨 및 규칙

export const GROUP_TYPES = [
  { value: 'nolging', label: '놀깅' },
  { value: 'ilhaging', label: '일하깅' },
]

export const THEMES_BY_TYPE = {
  nolging: [
    { value: 'solo', label: '혼자' },
    { value: 'friend', label: '친구' },
    { value: 'couple', label: '연인' },
  ],
  ilhaging: [
    { value: 'solo', label: '혼자' },
    { value: 'together', label: '같이' },
  ],
}

export function typeLabel(t) {
  return GROUP_TYPES.find((x) => x.value === t)?.label ?? t
}

export function themeLabel(type, theme) {
  return (THEMES_BY_TYPE[type] ?? []).find((x) => x.value === theme)?.label ?? theme
}

// 유형이 바뀌면 테마가 유효하지 않을 수 있으니 기본값으로 보정
export function normalizeTheme(type, theme) {
  const list = THEMES_BY_TYPE[type] ?? []
  return list.some((x) => x.value === theme) ? theme : list[0]?.value ?? 'solo'
}

// 그룹 유형별 태스크 용어 (명칭/진행단계/수락)
const TASK_TERMS = {
  nolging: {
    noun: '위시리스트',
    status: { open: '위시리스트', accepted: '약속', done: '추억' },
    accept: '놀기 신청',
  },
  ilhaging: {
    noun: '태스크',
    status: { open: 'TO DO', accepted: 'DOING', done: 'DONE' },
    accept: '일정 추가',
  },
}

// 유형이 없거나 알 수 없으면 일하깅(일반 태스크) 용어로 폴백
export function taskTerms(groupType) {
  return TASK_TERMS[groupType] ?? TASK_TERMS.ilhaging
}

// 진행 단계 순서 ("전체" 제외)
export const TASK_STATUSES = ['open', 'accepted', 'done']

// 위시리스트(놀깅) 유형
export const WISH_CATEGORIES = ['OTT', '독서', '영화', '게임', '운동', '기타']
