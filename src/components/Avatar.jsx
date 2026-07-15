import AvatarDeco from './AvatarDeco'

// 정방형 이미지를 원형으로 표시. 사진이 없으면 이니셜.
// deco: { head, face } — 아바타 꾸미기 아이템(선택). 크기에 비례해 머리 위/얼굴에 겹쳐 그림.
export default function Avatar({ src, name = '?', size = 34, deco }) {
  const initial = (name || '?').trim()[0]?.toUpperCase() || '?'
  const hasDeco = deco && (deco.head || deco.face)
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {src ? <img src={src} alt={name} /> : initial}
      {hasDeco && <AvatarDeco head={deco.head} face={deco.face} />}
    </span>
  )
}
