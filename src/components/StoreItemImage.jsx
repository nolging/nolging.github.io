import { useEffect, useState } from 'react'
import { itemImgId } from '../lib/storeMeta'
import ThemeHearts from './ThemeHearts'
import AvatarDeco, { decoSlot } from './AvatarDeco'

// 아이템 이미지: public/store/{id}.svg 를 우선 사용하고, 없으면 이모지로 폴백.
// - 카세트('cassette')는 플랫폼에 따라 airpods/buds 아이콘으로 자동 매핑.
// - '하트 뿅뿅' 테마(theme-heart)는 정적 이미지 대신 실제 테마 효과(하트 솟아오름)를 보여줌.
export default function StoreItemImage({ id, emoji, className }) {
  const [failed, setFailed] = useState(false)
  const imgId = itemImgId(id)
  useEffect(() => { setFailed(false) }, [imgId])

  if (id === 'theme-heart') {
    return (
      <span className={`${className} store-hearts`} aria-hidden="true">
        <ThemeHearts durScale={1.5} />
      </span>
    )
  }

  // 아바타 꾸미기: 빈 아바타 원 위/뒤에 실제 데코를 얹어 미리보기
  if (String(id).startsWith('deco-')) {
    const slot = decoSlot(id)
    const head = slot === 'head' ? id : undefined
    const face = slot === 'face' ? id : undefined
    return (
      <span className={`${className} store-deco`} aria-hidden="true">
        <span className="store-deco-av">
          <AvatarDeco head={head} face={face} layer="back" />
          <span className="store-deco-circle" />
          <AvatarDeco head={head} face={face} layer="front" />
        </span>
      </span>
    )
  }

  // 일부 아이템은 이미지를 조금 더 크게(커플/우정 링, 에어팟/버즈)
  const lg = ['couple-ring', 'friend-ring', 'airpods', 'buds'].includes(imgId)
  return (
    <span className={className} aria-hidden="true">
      {failed
        ? emoji
        : <img className={`store-img${lg ? ' store-img-lg' : ''}`} src={`/store/${imgId}.svg`} alt="" onError={() => setFailed(true)} />}
    </span>
  )
}
