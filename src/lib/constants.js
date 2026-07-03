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

export const TASK_STATUS_LABEL = { open: '열림', accepted: '진행 중', done: '완료' }
