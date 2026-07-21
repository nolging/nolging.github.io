// 멤버 상세 진입: PC(≥641px)에서는 모달로, 그 외에는 페이지 이동으로.
export const MEMBER_EVENT = 'nolging:member'
// 그룹 상세 가운데 영역에 설정/내 정보 임베드를 열어달라는 요청(그룹 상세가 마운트돼 있으면 처리).
export const SETTINGS_EVENT = 'nolging:open-settings'

export function openMember(navigate, groupId, userId) {
  if (!groupId || !userId) return
  const desktop = typeof window !== 'undefined' && window.matchMedia?.('(min-width: 641px)')?.matches
  if (desktop) window.dispatchEvent(new CustomEvent(MEMBER_EVENT, { detail: { groupId, userId } }))
  else navigate(`/groups/${groupId}/members/${userId}`)
}
