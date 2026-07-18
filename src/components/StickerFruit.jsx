// 칭찬 스티커 과일(포도알/사과) 렌더 + 색 설정 — 스티커판/인벤토리에서 공용.
export const FRUIT = {
  grape: {
    label: '포도판',
    colors: {
      grape: 'radial-gradient(circle at 34% 28%, #b6a1f5 0%, #7358d6 52%, #4e35aa 100%)',
      shine: 'radial-gradient(circle at 34% 28%, #d8ef9c 0%, #9ccb56 52%, #74a638 100%)',
    },
    options: [{ key: 'grape', label: '포도' }, { key: 'shine', label: '샤인머스캣' }],
    def: 'grape',
  },
  apple: {
    label: '사과나무',
    colors: {
      red: 'radial-gradient(circle at 35% 26%, #ff9585 0%, #ef4d4d 55%, #bf2f39 100%)',
      aori: 'radial-gradient(circle at 35% 26%, #c6e880 0%, #7cc23f 55%, #4c9a2c 100%)',
    },
    options: [{ key: 'red', label: '빨간 사과' }, { key: 'aori', label: '아오리 사과' }],
    def: 'red',
  },
}
export function fruitBg(variant, color) {
  const f = FRUIT[variant]; if (!f) return FRUIT.grape.colors.grape
  return f.colors[color] || f.colors[f.def]
}

export function Grape({ bg }) {
  return (
    <div style={{ width: '100%', height: '100%', borderRadius: '50%', position: 'relative', boxShadow: 'inset -4px -5px 8px rgba(0,0,0,.26),inset 4px 4px 7px rgba(255,255,255,.42),0 3px 7px rgba(0,0,0,.16)', background: bg }}>
      <span style={{ position: 'absolute', top: '16%', left: '19%', width: '30%', height: '23%', borderRadius: '50%', background: 'rgba(255,255,255,.6)', filter: 'blur(1.5px)' }} />
    </div>
  )
}
export function Apple({ bg }) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <span style={{ position: 'absolute', top: '-4%', left: '55%', width: '36%', height: '20%', background: '#5aa64a', borderRadius: '0 65% 0 65%', transform: 'rotate(-20deg)', transformOrigin: 'left bottom', zIndex: 1 }} />
      <svg viewBox="0 0 14 30" style={{ position: 'absolute', top: '-11%', left: '45%', width: '11%', height: '28%', overflow: 'visible' }}><path d="M10 29 Q5 16 7 2" fill="none" stroke="#7d4f28" strokeWidth="5.5" strokeLinecap="round" /></svg>
      <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: '90%', borderRadius: '46% 46% 50% 50%', boxShadow: 'inset -4px -5px 8px rgba(0,0,0,.26),inset 3px 3px 6px rgba(255,255,255,.4),0 3px 7px rgba(0,0,0,.17)', background: bg }}>
        <span style={{ position: 'absolute', top: '15%', left: '19%', width: '26%', height: '19%', borderRadius: '50%', background: 'rgba(255,255,255,.62)', filter: 'blur(1.5px)' }} />
      </div>
    </div>
  )
}
export function Sticker({ variant, bg }) { return variant === 'apple' ? <Apple bg={bg} /> : <Grape bg={bg} /> }
