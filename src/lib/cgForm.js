// 그룹 만들기/수정 폼 공용 상수·헬퍼 (시안)
export const CG_BGS = ['transparent', '#eeebfe', '#e8f4ec', '#fdeee6', '#e6eefd', '#fde8ee', '#fbf1d3']
export const DEFAULT_CG_BG = '#eeebfe'

// 입력에서 마지막 이모지(그래핌) 하나만 취함 → 새로 입력하면 자연스럽게 교체
export function lastGrapheme(str) {
  const s = (str || '').trim()
  if (!s) return ''
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    let out = ''
    for (const { segment } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)) out = segment
    return out
  }
  const arr = Array.from(s)
  return arr[arr.length - 1] || ''
}
