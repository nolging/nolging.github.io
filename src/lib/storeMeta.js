// 상점/인벤토리 공용: 아이템 카테고리 분류 + 썸네일 배경색(시안 파스텔)

export const CAT = { special: '스페셜', feature: '기능 강화', avatar: '프로필 꾸미기', theme: '테마', etc: '기타' }
export const CAT_ORDER = ['special', 'feature', 'avatar', 'theme', 'etc']

export function catOf(id) {
  if (id === 'couple-ring' || id === 'friend-ring' || id === 'wish') return 'special'
  if (String(id).startsWith('deco-')) return 'avatar'
  if (String(id).startsWith('theme-')) return 'theme'
  if (id === 'nyangpito') return 'etc'
  return 'feature'
}

// id 별 썸네일 배경(파스텔). 없으면 기본값(프리미엄=어두운 톤).
const IMG_BG = {
  'couple-ring': '#fde8ee', 'friend-ring': '#e6eefd', 'wish': '#fff0d6', 'link': '#fde8ee',
  'nyangpito': '#eaf4ec', 'cassette': '#fbf1d3', 'video': '#fde8ee', 'bluray': '#e6eefd',
  'eraser': '#e8f4ec', 'telescope': '#eeebfe', 'ledboard': '#332c52', 'waterbomb': '#e3f1fb',
  'deco-sprout': '#eaf6ee', 'deco-jaguar': '#ecebf0', 'deco-wolf': '#eceef3', 'deco-blush': '#fdeef2',
  'deco-anger': '#fdecec',
  // 하트 뿅뿅 테마: 실제 적용 시 배경(연분홍 그라데이션)과 동일하게 → 위에 하트가 솟아오름
  'theme-heart': 'linear-gradient(180deg, #fffbfd 0%, #fff4f8 55%, #ffedf3 100%)',
}
export const imgBgOf = (id, premium) => IMG_BG[id] || (premium ? '#2f2a49' : '#f3f2f7')

// iOS 여부(아이패드 포함). 카세트 아이템의 이름/아이콘을 플랫폼별로 다르게 노출하기 위함.
export const IS_IOS = typeof navigator !== 'undefined' && (
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
)

// 카세트 테이프: iOS → "콩나물 한 가닥"(에어팟 아이콘), 그 외 → "콩 한 쪽"(버즈 아이콘).
// 기능(음악 링크)은 동일. id 는 'cassette' 그대로 유지하고 표시만 바꾼다.
export function itemImgId(id) {
  if (id === 'cassette') return IS_IOS ? 'airpods' : 'buds'
  if (id === 'waterbomb') return 'water-bomb' // 파일명(water-bomb.svg) ↔ 아이템 id(waterbomb)
  return id
}
// 카세트(이어폰) 아이템의 뷰어 플랫폼별 표시명. iOS=콩나물 한 가닥, 그 외=콩 한 쪽.
export const CASSETTE_NAME = IS_IOS ? '콩나물 한 가닥' : '콩 한 쪽'
export function itemName(id, fallback) {
  if (id === 'cassette') return CASSETTE_NAME
  return fallback
}
// 자유 텍스트(츄르 내역 사유, 선물 쪽지 본문 등)에 들어 있는 저장명("카세트 테이프")을
// 뷰어 플랫폼 표시명으로 치환. 이름은 항상 보는 사람 기준으로 노출된다.
export function resolveItemText(text) {
  return text == null ? text : String(text).replace(/카세트 테이프/g, CASSETTE_NAME)
}
