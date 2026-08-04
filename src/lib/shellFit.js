// 앱 셸(.app-shell)을 키보드가 올라온 만큼만 축소한다.
//
// 축소 조건은 두 가지를 모두 만족할 때뿐이다.
//   1) 입력 요소에 포커스가 있다(= 실제로 타이핑 중이라 키보드가 떠 있다)
//   2) 가시 영역이 전체 높이보다 충분히(KB_THRESHOLD) 작다
// 그 외에는 인라인 height/top 을 '비워' CSS(height:100%)로 되돌린다.
//
// iOS 홈화면 앱은 백그라운드에서 복귀한 직후 뷰포트 크기(visualViewport.height /
// innerHeight)를 실제보다 작게 보고할 때가 있다. 크기만 보고 판단하면 이때를
// '키보드 올라옴' 으로 착각해 절반짜리 높이를 픽셀로 고정하고, 이후 resize 가
// 오지 않아 화면이 절반만 그려진 상태로 남는다(하단 탭도 kb-open 으로 숨겨짐).
// 그래서 ① 포커스 조건을 함께 보고, ② 복귀 시엔 축소 상태를 먼저 원상복구하고,
// ③ 복귀 직후에는 사용자가 다시 입력을 탭할 때까지 축소하지 않는다.
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

// 셸 요소에 위 규칙을 붙인다. 반환값을 호출하면 해제(+ 원상복구).
export function attachShellFit(getEl) {
  const vv = window.visualViewport
  if (!vv) return () => {}
  let justResumed = false
  const timers = []

  const reset = () => {
    const el = getEl()
    if (el) { el.style.height = ''; el.style.top = ''; el.classList.remove('kb-open') }
    document.documentElement.style.setProperty('--kb-inset', '0px')
  }
  const apply = () => {
    const el = getEl()
    if (!el) return
    // 기준 전체 높이는 innerHeight/clientHeight 중 큰 값(키보드에 따라 한쪽이 줄 수 있음)
    const m = shellMetrics({
      vvHeight: vv.height, vvOffsetTop: vv.offsetTop,
      innerHeight: window.innerHeight, clientHeight: document.documentElement.clientHeight,
      editing: !justResumed && isEditing(document.activeElement),
    })
    el.style.height = m.height   // 키보드 없으면 '' → CSS(height:100%) 복귀
    el.style.top = m.top
    // 키보드가 올라오면 하단 탭은 원래 위치(키보드 뒤)에 두는 대신 숨겨,
    // 키보드 위로 따라 올라오지 않게 한다.
    el.classList.toggle('kb-open', m.kbOpen)
    // body 로 포탈된 바텀시트(.sheet)가 키보드 뒤로 가려지지 않게 하단 인셋 노출
    document.documentElement.style.setProperty('--kb-inset', `${m.kbInset}px`)
  }
  // 복귀 직후엔 측정값이 아직 갱신되지 않을 수 있어 몇 번 더 재측정
  const remeasure = () => {
    apply()
    timers.push(setTimeout(apply, 60), setTimeout(apply, 250), setTimeout(apply, 600))
  }
  // focusout 전용: textarea 에서 블러되며 곧바로 버튼을 탭하는 흐름(예: 댓글 "등록")에서
  // apply() 가 동기적으로 셸 높이를 되돌리면, 같은 제스처의 touchend→click 이 도착하기
  // 전에 버튼이 화면상 다른 위치로 밀려나 클릭이 빈 자리를 때리는 문제가 있었다(첫 탭은
  // 키보드만 내려가고, 레이아웃이 안정된 뒤 두 번째 탭에서야 실제로 눌림). 이번 제스처의
  // click 디스패치가 끝난 다음 매크로태스크로 미뤄 레이아웃 변경이 클릭을 가로채지 않게 한다.
  const remeasureAfterClick = () => {
    const t = setTimeout(remeasure, 0)
    timers.push(t)
  }
  // 복귀: 원인이 무엇이든 남아 있던 축소 상태를 먼저 원상복구한 뒤 다시 계산
  const onResume = () => { justResumed = true; reset(); remeasure() }
  // 사용자가 다시 입력을 탭한 순간부터 정상적으로 키보드 대응
  const onFocusIn = () => { justResumed = false; remeasure() }

  vv.addEventListener('resize', apply)
  vv.addEventListener('scroll', apply)
  document.addEventListener('focusin', onFocusIn)
  document.addEventListener('focusout', remeasureAfterClick)
  document.addEventListener('visibilitychange', onResume)
  window.addEventListener('pageshow', onResume)
  window.addEventListener('orientationchange', remeasure)
  apply()

  return () => {
    vv.removeEventListener('resize', apply)
    vv.removeEventListener('scroll', apply)
    document.removeEventListener('focusin', onFocusIn)
    document.removeEventListener('focusout', remeasureAfterClick)
    document.removeEventListener('visibilitychange', onResume)
    window.removeEventListener('pageshow', onResume)
    window.removeEventListener('orientationchange', remeasure)
    timers.forEach(clearTimeout)
    reset()
    document.documentElement.style.removeProperty('--kb-inset')
  }
}
