// 관리자 화면 공용 상수/매핑

export const STATUS = {
  active: { label: '활성', cls: 'badge-done' },
  pending: { label: '승인 대기', cls: 'badge-open' },
  disabled: { label: '비활성', cls: 'badge' },
}

export const QUEST_GRADES = [
  { key: 'all', label: '전체(모든 회원)' },
  { key: 'premium', label: '프리미엄(커플·우정)' },
  { key: 'vvip', label: 'VVIP(커플)' },
  { key: 'vip', label: 'VIP(우정)' },
]
export const QUEST_GRADE_LABEL = Object.fromEntries(QUEST_GRADES.map((g) => [g.key, g.label]))
// 목록 카드의 대상 배지용 짧은 표기(select 안내문과 별개)
export const QUEST_GRADE_SHORT = { all: '전체', premium: '프리미엄', vvip: '커플', vip: '우정' }
export const EMPTY_QUEST = { id: '', title: '', body: '', emoji: '', emoji_bg: '', reward: '', grade: 'all', active: true, reward_reason: '' }

// 상점 아이템 노출 위치 ↔ premium/tier 매핑
export const ITEM_KINDS = [
  { key: 'general', label: '일반 상점' },
  { key: 'prem', label: '프리미엄(공통)' },
  { key: 'couple', label: '프리미엄·커플 전용' },
  { key: 'friend', label: '프리미엄·우정 전용' },
]
export const kindToFlags = (kind) => kind === 'prem' ? { premium: true, tier: '' }
  : kind === 'couple' ? { premium: true, tier: 'couple' }
  : kind === 'friend' ? { premium: true, tier: 'friend' }
  : { premium: false, tier: '' }
export const flagsToKind = (premium, tier) => !premium ? 'general' : tier === 'couple' ? 'couple' : tier === 'friend' ? 'friend' : 'prem'
export const kindLabel = (premium, tier) => ITEM_KINDS.find((k) => k.key === flagsToKind(premium, tier))?.label || '일반 상점'
// 목록 카드의 판매 대상 배지용 짧은 표기(select 안내문과 별개)
export const ITEM_KIND_SHORT = { prem: '프리미엄', couple: '커플', friend: '우정' }
// 상점 카테고리(섹션) — 관리자가 직접 지정. '' = 자동(ID 규칙)
export const CATEGORY_OPTIONS = [
  { value: '', label: '자동 (ID 규칙)' },
  { value: 'special', label: '스페셜' },
  { value: 'feature', label: '기능 강화' },
  { value: 'avatar', label: '프로필 꾸미기' },
  { value: 'theme', label: '테마' },
  { value: 'etc', label: '기타' },
]
// adminOnly 기본값 true: 새 아이템은 "판매" 토글을 켜기 전까지 관리자에게만 보임(테스트 후 노출)
export const EMPTY_ITEM = { id: '', name: '', price: '', emoji: '', description: '', sortOrder: '', kind: 'general', giftOnly: false, isActive: true, adminOnly: true, imageSvg: '', imageBg: '', category: '', decoSlot: '' }

// 그룹별 사용량 제어: 차단 가능한 기능 — key 는 GroupDetail 의 goCouple(path) 값과 동일.
// emoji/emojiBg 는 데이트/놀이터 페이지(GroupMembers.jsx PlayCard)와 동일하게 맞춤.
// 커플 그룹은 "멍냥꽁냥", 우정 그룹은 "커뮤니티" 구역에 각각 다른 기능 목록이 표시된다.
export const COUPLE_FEATURES = [
  { key: 'touch', label: '우심뽀까', emoji: '💘', emojiBg: '#fde8ee', desc: '커플 그룹 전용 터치 기능' },
  { key: 'draw', label: '낙서장', emoji: '✏️', emojiBg: '#fbf1d3', desc: '함께 그리는 캔버스' },
]
export const FRIEND_FEATURES = [
  { key: 'draw', label: '낙서장', emoji: '✏️', emojiBg: '#fbf1d3', desc: '함께 그리는 캔버스' },
]
// 그룹별 사용량 제어: 차단 가능한 미니 게임
export const GROUP_GAMES = [
  { key: 'catchmind', label: '캐치 마인드', emoji: '🎨', emojiBg: '#e6eefd' },
  { key: 'davinci', label: '다빈치 코드', emoji: '🃏', emojiBg: '#fbf1d3' },
  { key: 'puzzle', label: '퍼즐', emoji: '🧩', emojiBg: '#e8f4ec' },
  { key: 'rps', label: '가위바위보', emoji: '✌️', emojiBg: '#fde8ee' },
  { key: 'omok', label: '오목', emoji: '⚫', emojiBg: '#f3f2f7' },
]
// 기능을 Off 했을 때 카드 설명에 표시되는 문구
export const BLOCKED_DESC = '사용량 제어로 차단'
