// 정방형 이미지를 원형으로 표시. 사진이 없으면 이니셜.
export default function Avatar({ src, name = '?', size = 34 }) {
  const initial = (name || '?').trim()[0]?.toUpperCase() || '?'
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {src ? <img src={src} alt={name} /> : initial}
    </span>
  )
}
