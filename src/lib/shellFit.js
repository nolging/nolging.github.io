// 앱 셸(.app-shell)을 키보드가 올라온 만큼만 축소하기 위한 계산 (부수효과 없음)
//
// 두 가지를 모두 만족할 때만 축소한다.
//   1) 입력 요소에 포커스가 있다(= 실제로 타이핑 중이라 키보드가 떠 있다)
//   2) 가시 영역이 전체 높이보다 충분히(KB_THRESHOLD) 작다
// 그 외에는 인라인 height/top 을 '비워' CSS(height:100%)로 되돌린다.
//
// iOS 홈화면 앱은 백그라운드에서 복귀한 직후 visualViewport.height / innerHeight 를
// 실제보다 작게 보고할 때가 있다. 크기만 보고 판단하면 이때를 '키보드 올라옴' 으로
// 착각해 절반짜리 높이를 픽셀로 고정하고, 이후 resize 가 오지 않아 화면이 절반만
// 그려진 상태로 남는다. 포커스 조건을 함께 보면 이 경우를 걸러낼 수 있다.
export const KB_THRESHOLD = 120

// 텍스트 입력 중인지 — 키보드가 떠 있을 수 있는 상태
export function isEditing(el) {
  if (!el) return false
  const tag = el.tagName
  if (tag === 'TEXTAREA') return true
  if (tag === 'INPUT') return !['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range', 'color'].includes((el.type || '').toLowerCase())
  return !!el.isContentEditable
}

export function shellMetrics({ vvHeight, vvOffsetTop = 0, innerHeight, clientHeight = 0, editing = false }) {
  const full = Math.max(innerHeight || 0, clientHeight || 0)
  const kbOpen = !!editing && full - vvHeight > KB_THRESHOLD
  return {
    kbOpen,
    height: kbOpen ? `${vvHeight}px` : '',
    top: kbOpen ? `${vvOffsetTop}px` : '',
    kbInset: kbOpen ? Math.max(0, (innerHeight || 0) - vvHeight - vvOffsetTop) : 0,
  }
}
