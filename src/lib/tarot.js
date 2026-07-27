// 타로 카페 — 메이저 아르카나 22장 + 궁합 계산.
// 궁합은 "두 장의 카드"만으로 정해지는 순수 함수라, 두 기기에서 각각 계산해도
// 반드시 같은 값이 나온다(서버 없이 동기화되는 이유).

// el: 원소(불/흙/공기/물) — 전통적인 점성 대응. love: 연애 친화도 0~10.
// up/rev: 정방향 / 역방향 해석. 커플 앱이라 연애 쪽으로 결을 맞췄다.
export const MAJOR = [
  { r: '0', ko: '바보', en: 'The Fool', emoji: '🃏', el: 'air', love: 6,
    up: '겁내지 않고 첫걸음을 떼는 날. 재고 따지기보다 마음이 가는 대로 움직여도 좋아요.',
    rev: '설레는 마음이 앞서 준비가 덜 됐어요. 한 박자만 늦춰도 훨씬 편해집니다.' },
  { r: 'I', ko: '마법사', en: 'The Magician', emoji: '✨', el: 'air', love: 7,
    up: '마음먹은 걸 이룰 재료가 이미 손에 있어요. 먼저 말을 꺼내는 쪽이 흐름을 잡습니다.',
    rev: '말과 마음이 조금 어긋나요. 꾸미지 않은 한 문장이 제일 잘 통합니다.' },
  { r: 'II', ko: '여사제', en: 'The High Priestess', emoji: '🌙', el: 'water', love: 5,
    up: '말보다 눈치로 아는 날. 조용히 곁에 있어 주는 것만으로 충분해요.',
    rev: '혼자 삼키고 있는 말이 있죠. 감춘 만큼 오해도 같이 자랍니다.' },
  { r: 'III', ko: '여황제', en: 'The Empress', emoji: '🌷', el: 'earth', love: 9,
    up: '넉넉하게 품어 주는 시기. 챙겨 주는 마음이 그대로 되돌아옵니다.',
    rev: '아끼는 마음이 지나쳐 참견이 될 수 있어요. 조금은 내버려 두세요.' },
  { r: 'IV', ko: '황제', en: 'The Emperor', emoji: '👑', el: 'fire', love: 6,
    up: '기준을 세우면 편해지는 날. 약속을 정해 두면 다툴 일이 줄어요.',
    rev: '내 방식만 옳다고 밀어붙이는 중. 한 발 물러서면 상대가 다가옵니다.' },
  { r: 'V', ko: '교황', en: 'The Hierophant', emoji: '🕊️', el: 'earth', love: 7,
    up: '둘만의 규칙이 단단해지는 시기. 오래 가는 관계는 이런 데서 만들어져요.',
    rev: '늘 하던 대로가 답답해졌어요. 익숙한 코스를 한 번 벗어나 보세요.' },
  { r: 'VI', ko: '연인', en: 'The Lovers', emoji: '💞', el: 'air', love: 10,
    up: '서로를 고르는 날. 망설이던 마음에 확신이 서고, 함께 있는 게 답이 됩니다.',
    rev: '둘 중 하나는 결정을 미루고 있어요. 미룬 만큼 마음이 식습니다.' },
  { r: 'VII', ko: '전차', en: 'The Chariot', emoji: '🏇', el: 'water', love: 6,
    up: '같은 방향으로 힘껏 나아가는 날. 미뤄 둔 계획을 오늘 밀어붙여도 좋아요.',
    rev: '각자 다른 데를 보고 달리는 중. 속도를 맞추는 게 먼저입니다.' },
  { r: 'VIII', ko: '힘', en: 'Strength', emoji: '🦁', el: 'fire', love: 8,
    up: '부드럽게 이기는 날. 큰 소리 대신 다정함이 상대를 움직입니다.',
    rev: '참다 참다 터질 것 같아요. 작게 자주 말하는 편이 낫습니다.' },
  { r: 'IX', ko: '은둔자', en: 'The Hermit', emoji: '🕯️', el: 'earth', love: 3,
    up: '혼자 정리할 시간이 필요해요. 거리를 두는 게 멀어지는 건 아닙니다.',
    rev: '너무 오래 혼자 있었어요. 먼저 연락하는 쪽이 훨씬 가벼워집니다.' },
  { r: 'X', ko: '운명의 수레바퀴', en: 'Wheel of Fortune', emoji: '🎡', el: 'fire', love: 7,
    up: '흐름이 바뀌는 날. 뜻밖의 연락이나 우연이 관계를 한 칸 옮겨 놓습니다.',
    rev: '같은 자리를 도는 느낌. 반복되는 패턴 하나만 바꿔 보세요.' },
  { r: 'XI', ko: '정의', en: 'Justice', emoji: '⚖️', el: 'air', love: 6,
    up: '공평하게 나누면 풀리는 날. 미뤄 둔 이야기를 담담하게 꺼내 보세요.',
    rev: '한쪽만 애쓰고 있어요. 기울어진 걸 알아채는 게 시작입니다.' },
  { r: 'XII', ko: '매달린 사람', en: 'The Hanged Man', emoji: '🙃', el: 'water', love: 4,
    up: '멈춰서 다르게 보는 날. 서둘러 답을 내지 않아도 괜찮아요.',
    rev: '괜한 고집으로 시간을 쓰고 있어요. 놓아 주면 바로 편해집니다.' },
  { r: 'XIII', ko: '죽음', en: 'Death', emoji: '🦋', el: 'water', love: 4,
    up: '끝나는 게 아니라 바뀌는 거예요. 낡은 방식 하나를 오늘 정리해 보세요.',
    rev: '끝난 걸 붙잡고 있어요. 미련은 미련일 뿐, 새 계절이 기다립니다.' },
  { r: 'XIV', ko: '절제', en: 'Temperance', emoji: '🍶', el: 'fire', love: 8,
    up: '적당한 온도가 오래 갑니다. 서로의 속도를 섞어 딱 좋은 지점을 찾는 날.',
    rev: '한쪽으로 쏠렸어요. 너무 뜨겁거나 너무 미지근합니다.' },
  { r: 'XV', ko: '악마', en: 'The Devil', emoji: '😈', el: 'earth', love: 4,
    up: '끊기 어려운 끌림. 달콤하지만 어디까지인지 선은 정해 두세요.',
    rev: '묶여 있던 데서 벗어나는 중. 놓는 순간 숨이 트입니다.' },
  { r: 'XVI', ko: '탑', en: 'The Tower', emoji: '🗼', el: 'fire', love: 2,
    up: '갑작스러운 흔들림. 무너지는 건 대체로 무너져야 했던 것들입니다.',
    rev: '터질 뻔한 걸 겨우 넘겼어요. 미룬 문제는 아직 그대로 있습니다.' },
  { r: 'XVII', ko: '별', en: 'The Star', emoji: '⭐', el: 'air', love: 9,
    up: '조용히 희망이 차오르는 날. 바라던 말이 오늘 들려올 수 있어요.',
    rev: '기대가 커서 실망도 커졌어요. 눈높이를 조금 낮추면 다시 반짝입니다.' },
  { r: 'XVIII', ko: '달', en: 'The Moon', emoji: '🌕', el: 'water', love: 4,
    up: '안개 속을 걷는 날. 확실하지 않은 건 확실해질 때까지 판단을 아껴요.',
    rev: '오해가 걷히는 중. 물어보면 별일 아니었다는 걸 알게 됩니다.' },
  { r: 'XIX', ko: '태양', en: 'The Sun', emoji: '☀️', el: 'fire', love: 10,
    up: '숨길 것 없이 환한 날. 웃는 얼굴 하나로 다 해결되는 시기입니다.',
    rev: '억지로 밝은 척하고 있어요. 안 괜찮으면 안 괜찮다고 해도 됩니다.' },
  { r: 'XX', ko: '심판', en: 'Judgement', emoji: '📯', el: 'fire', love: 6,
    up: '결론을 낼 때가 됐어요. 지나온 걸 돌아보면 답이 이미 나와 있습니다.',
    rev: '스스로를 너무 몰아세우고 있어요. 판결은 조금 미뤄도 괜찮습니다.' },
  { r: 'XXI', ko: '세계', en: 'The World', emoji: '🌍', el: 'earth', love: 9,
    up: '한 바퀴를 잘 돌았어요. 함께한 시간이 제자리를 찾는 날입니다.',
    rev: '마지막 한 걸음이 남았어요. 거의 다 왔으니 마무리만 하면 됩니다.' },
]

export const EL_KO = { fire: '불', earth: '흙', air: '공기', water: '물' }

// 오늘 날짜 키(로컬 기준 YYYY-MM-DD). "오늘의 카드" 하루 고정에 쓴다.
export function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const SPREADS = {
  one: { key: 'one', need: 1, label: '오늘의 카드', slots: ['오늘'] },
  three: { key: 'three', need: 3, label: '세 장', slots: ['지나온 것', '지금', '다가올 것'] },
}

// 암호학적 난수로 섞기(Fisher–Yates). 정/역방향도 함께 정한다.
function rand(n) {
  const c = globalThis.crypto
  if (c?.getRandomValues) {
    const a = new Uint32Array(1)
    // 2^32 를 n 으로 나눈 나머지 구간을 버려 치우침을 없앤다
    const limit = Math.floor(4294967296 / n) * n
    let v
    do { c.getRandomValues(a); v = a[0] } while (v >= limit)
    return v % n
  }
  return Math.floor(Math.random() * n)
}
export function shuffleDeck() {
  const d = MAJOR.map((_, i) => ({ i, rev: rand(2) === 1 }))
  for (let k = d.length - 1; k > 0; k--) { const j = rand(k + 1);[d[k], d[j]] = [d[j], d[k]] }
  return d
}

// ---- 궁합 ----
// 원소 궁합: 같으면 최고, 불↔공기 / 물↔흙 은 상생, 불↔물 / 공기↔흙 은 상극.
const SYNERGY = new Set(['fire|air', 'air|fire', 'water|earth', 'earth|water'])
const CLASH = new Set(['fire|water', 'water|fire', 'air|earth', 'earth|air'])
export function elBonus(a, b) {
  if (a === b) return 10
  const k = `${a}|${b}`
  if (SYNERGY.has(k)) return 7
  if (CLASH.has(k)) return -4
  return 2
}

export const TIERS = [
  { min: 90, name: '운명', line: '이건 우연이 아니에요. 카드가 둘을 같은 쪽으로 밀고 있어요.' },
  { min: 75, name: '찰떡', line: '결이 잘 맞아요. 말 안 해도 통하는 게 많은 시기입니다.' },
  { min: 60, name: '순항', line: '무리 없이 흘러가요. 지금처럼만 해도 충분합니다.' },
  { min: 40, name: '노력', line: '조금 엇나가 있어요. 서로 한 걸음씩만 옮기면 금방 맞습니다.' },
  { min: 0, name: '시련', line: '오늘은 서로 예민해요. 무리해서 결론 내지 말고 쉬어 가세요.' },
]
export const tierOf = (score) => TIERS.find((t) => score >= t.min)

// 카드 한 장을 정수로 (정/역까지 포함) → 두 사람 순서와 무관한 대칭 해시에 쓴다
const key = (c) => c.i * 2 + (c.rev ? 1 : 0)
// 설명 문구도 순서에 좌우되면 두 기기에 다른 글이 뜬다 → 원소를 고정 순서로 정렬
const EL_ORDER = ['fire', 'earth', 'air', 'water']
const elPair = (a, b) => (EL_ORDER.indexOf(a) <= EL_ORDER.indexOf(b) ? [a, b] : [b, a])

// 두 장으로 궁합 산출. 인자 순서를 바꿔도 점수·등급·문구가 모두 같다(양쪽 기기 동일).
export function compat(a, b) {
  if (!a || !b) return null
  const A = MAJOR[a.i], B = MAJOR[b.i]
  const bonus = elBonus(A.el, B.el)
  let s = (A.love + B.love) * 4          // 0~80
  s += bonus                             // -4~+10
  if (a.rev) s -= 7
  if (b.rev) s -= 7
  const [lo, hi] = [key(a), key(b)].sort((x, y) => x - y)
  // 결정적 지터(난수 아님). ±2 를 넘기면 역방향 감점(-7)을 삼켜 버려 순서가 뒤집힌다.
  s += ((lo * 73 + hi * 151) % 5) - 2
  const score = Math.max(8, Math.min(99, Math.round(s)))
  const [e1, e2] = elPair(A.el, B.el)
  const note = A.el === B.el
    ? `둘 다 ${EL_KO[A.el]}의 기운이라 닮은 데가 많아요.`
    : bonus === 7 ? `${EL_KO[e1]}과 ${EL_KO[e2]}은 서로를 키워 주는 짝이에요.`
      : bonus === -4 ? `${EL_KO[e1]}과 ${EL_KO[e2]}은 부딪히기 쉬워요. 그만큼 자극도 되죠.`
        : `${EL_KO[e1]}과 ${EL_KO[e2]}, 서로 다른 결이 심심하지 않게 해 줘요.`
  return { score, tier: tierOf(score), note }
}
