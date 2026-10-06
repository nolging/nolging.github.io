import AvatarDeco, { decoItems, hasBorderDeco, effectClassOf } from './AvatarDeco'

// 정방형 이미지를 원형으로 표시. 사진이 없으면 이니셜.
// deco: [{ id, tf }] — 장착된 아바타 꾸미기 목록(여러 유형 동시). 귀는 뒤(back), 나머지는 앞(front).
// 얼굴(사진/이니셜)은 .avatar-face(불투명 원)로 감싸, 뒤 레이어(귀)의 아랫부분이 자연스럽게 가려진다.
// 테두리 유형(후광 등)이 있으면 avatar-border-deco → 그룹 카드의 흰 테두리(box-shadow)를 끈다.
// "효과" 유형(볼록렌즈 등)은 아바타 위에 아트를 겹치는 대신 사진 자체를 SVG 필터(렌즈
// 왜곡 변위 맵, index.html 의 전역 <filter id="avatarLensWarp">)로 직접 왜곡한다 —
// 진짜 광학 왜곡이라 사진 전체가 그대로 유지되면서 중심만 자연스럽게 볼록해 보인다
// (effectClassOf 가 고른 class 를 사진 <img> 자체에 바로 입힌다).
// deco 배열에 id:'__graffiti' 항목이 섞여 오면(푸린 마이크로 짝꿍이 그린 낙서) 일반 데코(SVG 아트)와
// 달리 사진 위에 얹는 투명 PNG 오버레이로 렌더한다 — getGroupDecoMap 이 데코와 낙서를 같은 맵에
// 합쳐서 주므로, 데코가 보이는 화면은 전부 별도 배선 없이 낙서도 같이 보인다.
export default function Avatar({ src, name = '?', size = 34, deco }) {
  const initial = (name || '?').trim()[0]?.toUpperCase() || '?'
  const items = decoItems(deco)
  const graffiti = items.find((d) => d.id === '__graffiti')?.url
  const decoOnly = graffiti ? items.filter((d) => d.id !== '__graffiti') : items
  const hasDeco = decoOnly.length > 0
  const fxClass = effectClassOf(decoOnly)
  return (
    <span className={`avatar${hasBorderDeco(decoOnly) ? ' avatar-border-deco' : ''}`} style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {hasDeco && <AvatarDeco items={decoOnly} layer="back" size={size} />}
      <span className="avatar-face">
        {src ? <img src={src} alt={name} className={fxClass || undefined} /> : initial}
        {graffiti && <img className="avatar-graffiti" src={graffiti} alt="" />}
      </span>
      {hasDeco && <AvatarDeco items={decoOnly} layer="front" size={size} />}
    </span>
  )
}
