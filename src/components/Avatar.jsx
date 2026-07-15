import AvatarDeco from './AvatarDeco'

// 정방형 이미지를 원형으로 표시. 사진이 없으면 이니셜.
// deco: { head, face } — 아바타 꾸미기 아이템(선택). 귀는 아바타 뒤(back), 새싹·홍조는 앞(front).
// 얼굴(사진/이니셜)은 .avatar-face(불투명 원)로 감싸, 뒤 레이어(귀)의 아랫부분이 자연스럽게 가려진다.
export default function Avatar({ src, name = '?', size = 34, deco }) {
  const initial = (name || '?').trim()[0]?.toUpperCase() || '?'
  const hasDeco = deco && (deco.head || deco.face)
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {hasDeco && <AvatarDeco head={deco.head} face={deco.face} layer="back" />}
      <span className="avatar-face">{src ? <img src={src} alt={name} /> : initial}</span>
      {hasDeco && <AvatarDeco head={deco.head} face={deco.face} layer="front" />}
    </span>
  )
}
