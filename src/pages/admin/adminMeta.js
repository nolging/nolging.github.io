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

// 그룹별 사용량 제어: 차단 가능한 기능(우심뽀까/낙서장) — key 는 GroupDetail 의 goCouple(path) 값과 동일
export const GROUP_FEATURES = [
  { key: 'touch', label: '우심뽀까', desc: '커플 그룹 전용 터치 기능' },
  { key: 'draw', label: '낙서장', desc: '함께 그리는 캔버스' },
]
// 그룹별 사용량 제어: 차단 가능한 미니 게임
export const GROUP_GAMES = [
  { key: 'catchmind', label: '캐치 마인드' },
  { key: 'davinci', label: '다빈치 코드' },
  { key: 'puzzle', label: '퍼즐' },
  { key: 'rps', label: '가위바위보' },
  { key: 'omok', label: '오목' },
]
// 기능을 Off 했을 때 카드 설명에 표시되는 문구
export const BLOCKED_DESC = '사용량 제어로 차단'
