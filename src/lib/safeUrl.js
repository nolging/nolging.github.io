// 외부 링크 href 안전화: http(s) 만 허용. javascript:/data:/vbscript: 등은 차단(undefined).
// media_info/media_url 은 클라이언트가 임의 저장 가능하므로, 링크로 열기 전 스킴을 검증한다.
export function safeUrl(u) {
  if (typeof u !== 'string') return undefined
  const t = u.trim()
  return /^https?:\/\//i.test(t) ? t : undefined
}
