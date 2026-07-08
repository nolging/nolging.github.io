import { useEffect, useState } from 'react'

// 아이템 이미지: public/store/{id}.svg 를 우선 사용하고, 없으면 이모지로 폴백.
export default function StoreItemImage({ id, emoji, className }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [id])
  return (
    <span className={className} aria-hidden="true">
      {failed
        ? emoji
        : <img className="store-img" src={`/store/${id}.svg`} alt="" onError={() => setFailed(true)} />}
    </span>
  )
}
