import { useEffect, useState } from 'react'
import { itemImgId } from '../lib/storeMeta'

// 아이템 이미지: public/store/{id}.svg 를 우선 사용하고, 없으면 이모지로 폴백.
// 카세트('cassette')는 플랫폼에 따라 airpods/buds 아이콘으로 자동 매핑.
export default function StoreItemImage({ id, emoji, className }) {
  const [failed, setFailed] = useState(false)
  const imgId = itemImgId(id)
  useEffect(() => { setFailed(false) }, [imgId])
  return (
    <span className={className} aria-hidden="true">
      {failed
        ? emoji
        : <img className="store-img" src={`/store/${imgId}.svg`} alt="" onError={() => setFailed(true)} />}
    </span>
  )
}
