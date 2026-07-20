// 쪽지 쓰기 진입: PC(≥641px)에서는 브라우저 팝업 창으로, 그 외에는 인앱 페이지로 연다.
// prefill: 인앱에서 location.state 로 넘기던 값과 동일한 객체(예: { reply: {...} }). 없으면 새 쪽지.
export function openCompose(navigate, prefill) {
  const desktop = typeof window !== 'undefined' && window.matchMedia?.('(min-width: 641px)')?.matches
  if (desktop && typeof window.open === 'function') {
    try {
      if (prefill) localStorage.setItem('nc-prefill', JSON.stringify(prefill))
      else localStorage.removeItem('nc-prefill')
    } catch { /* localStorage 불가 시 무시 */ }

    const w0 = 460, h0 = 820
    const left = Math.round((window.screenX || 0) + Math.max(0, ((window.outerWidth || w0) - w0) / 2))
    const top = Math.round((window.screenY || 0) + Math.max(0, ((window.outerHeight || h0) - h0) / 2))
    const url = `${window.location.origin}${import.meta.env.BASE_URL}notes/compose?popup=1`
    const feat = `popup=yes,width=${w0},height=${h0},left=${left},top=${top}`
    const win = window.open(url, 'nolging-note', feat)
    if (win) { try { win.focus() } catch { /* noop */ } return }
    // 팝업이 차단되면 인앱 페이지로 폴백
    try { localStorage.removeItem('nc-prefill') } catch { /* noop */ }
  }
  navigate('/notes/new', { state: prefill })
}

// 팝업(쪽지 쓰기)에서 전송 완료를 알리는 채널. 여는 쪽(쪽지함)이 구독해 목록을 갱신한다.
export const NOTE_CHANNEL = 'nolging-notes'
