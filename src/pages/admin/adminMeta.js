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
export const EMPTY_QUEST = { id: '', title: '', body: '', emoji: '', emoji_bg: '', reward: '', grade: 'all', active: true }

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
// 상점 카테고리(섹션) — 관리자가 직접 지정. '' = 자동(ID 규칙)
export const CATEGORY_OPTIONS = [
  { value: '', label: '자동 (ID 규칙)' },
  { value: 'special', label: '스페셜' },
  { value: 'feature', label: '기능 강화' },
  { value: 'avatar', label: '프로필 꾸미기' },
  { value: 'theme', label: '테마' },
  { value: 'etc', label: '기타' },
]
export const EMPTY_ITEM = { id: '', name: '', price: '', emoji: '', description: '', sortOrder: '', kind: 'general', giftOnly: false, isActive: true, adminOnly: false, imageSvg: '', imageBg: '', category: '', decoSlot: '' }
