// 댓글 @멘션 유틸. 그룹 표시 닉네임(display_nickname) 기준으로만 동작.
// (로그인 아이디는 노출/사용하지 않는다.)
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
const BOUNDARY = /[\w가-힣]/ // 이 문자로 이어지면 닉네임 경계가 아님

// 본문에서 @{닉네임} 으로 호출된 멤버 user_id 목록. (긴 닉네임 우선, 앞뒤 경계 확인)
export function resolveMentions(text, members) {
  const ids = new Set()
  const sorted = [...members].filter((m) => m.display_nickname)
    .sort((a, b) => b.display_nickname.length - a.display_nickname.length)
  for (const m of sorted) {
    const re = new RegExp(`(^|[^\\w가-힣])@${escapeRe(m.display_nickname)}(?=$|[^\\w가-힣])`)
    if (re.test(text)) ids.add(m.user_id)
  }
  return [...ids]
}

// 렌더용: 본문을 [{text}] 또는 [{mention, userId}] 조각들로 분할.
export function splitMentions(text, members) {
  const withNick = [...members].filter((m) => m.display_nickname)
    .sort((a, b) => b.display_nickname.length - a.display_nickname.length)
  if (!text || !withNick.length) return [{ text: text || '' }]
  const nameToId = {}
  for (const m of withNick) if (!(m.display_nickname in nameToId)) nameToId[m.display_nickname] = m.user_id
  const re = new RegExp(`@(?:${withNick.map((m) => escapeRe(m.display_nickname)).join('|')})(?=$|[^\\w가-힣])`, 'g')
  const parts = []
  let last = 0, mt
  while ((mt = re.exec(text))) {
    const prev = mt.index > 0 ? text[mt.index - 1] : ''
    if (prev && BOUNDARY.test(prev)) continue // 앞 글자가 이어지면 멘션 아님
    if (mt.index > last) parts.push({ text: text.slice(last, mt.index) })
    parts.push({ mention: mt[0], userId: nameToId[mt[0].slice(1)] })
    last = mt.index + mt[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last) })
  return parts.length ? parts : [{ text }]
}
