import AvatarDeco, { decoItems, hasBorderDeco } from './AvatarDeco'

// 정방형 이미지를 원형으로 표시. 사진이 없으면 이니셜.
// deco: [{ id, tf }] — 장착된 아바타 꾸미기 목록(여러 유형 동시). 귀는 뒤(back), 나머지는 앞(front).
// 얼굴(사진/이니셜)은 .avatar-face(불투명 원)로 감싸, 뒤 레이어(귀)의 아랫부분이 자연스럽게 가려진다.
// 테두리 유형(후광 등)이 있으면 avatar-border-deco → 그룹 카드의 흰 테두리(box-shadow)를 끈다.
export default function Avatar({ src, name = '?', size = 34, deco }) {
  const initial = (name || '?').trim()[0]?.toUpperCase() || '?'
  const items = decoItems(deco)
  const hasDeco = items.length > 0
  return (
    <span className={`avatar${hasBorderDeco(items) ? ' avatar-border-deco' : ''}`} style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {hasDeco && <AvatarDeco items={items} layer="back" />}
      <span className="avatar-face">{src ? <img src={src} alt={name} /> : initial}</span>
      {hasDeco && <AvatarDeco items={items} layer="front" />}
    </span>
  )
}
