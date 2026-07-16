// 회원 등급 표기 (마이 페이지 · 회원 정보 페이지 공통)
// vvip = 커플 링(장착), vip = 우정 링(장착), normal = 일반
export const GRADE_LABEL = { vvip: 'VVIP', vip: 'VIP', normal: '일반' }

export const GRADE_SUB = {
  vvip: '커플 링 보유 · 최고 등급',
  vip: '우정 링 보유 · 우대 등급',
  normal: '링을 모으면 등급이 올라가요',
}

export const GRADE_LONG = {
  vvip: 'VVIP (커플 링)',
  vip: 'VIP (우정 링)',
  normal: '일반',
}

// 등급 카드 아바타 이모지 / 배경
export const GRADE_AVATAR = {
  vvip: { emoji: '💍', bg: '#fdf1d6' },
  vip: { emoji: '💞', bg: '#e5f8f1' },
  normal: { emoji: '🐾', bg: '#f0eff4' },
}
