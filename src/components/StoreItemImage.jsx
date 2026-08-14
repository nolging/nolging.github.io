import { useEffect, useState } from 'react'
import { itemImgId, svgDataUri } from '../lib/storeMeta'
import { catalogSvg, useStoreCatalog } from '../lib/storeCatalog'
import ThemeHearts from './ThemeHearts'
import ThemeBubbles from './ThemeBubbles'
import ThemeFireworks from './ThemeFireworks'
import { DecoPreview } from './AvatarDeco'

// 아이템 이미지: 업로드 SVG(svg prop 또는 카탈로그) 우선 → public/store/{id}.svg → 이모지 폴백.
// - 카세트('cassette')는 플랫폼에 따라 airpods/buds 아이콘으로 자동 매핑.
// - '하트 뿅뿅' 테마(theme-heart)는 정적 이미지 대신 실제 테마 효과(하트 솟아오름)를 보여줌.
export default function StoreItemImage({ id, emoji, className, svg }) {
  const [failed, setFailed] = useState(false)
  useStoreCatalog()   // 업로드 이미지 카탈로그 갱신 시 리렌더
  const imgId = itemImgId(id)
  const effSvg = svg || catalogSvg(id)
  const uploaded = effSvg ? svgDataUri(effSvg) : null
  useEffect(() => { setFailed(false) }, [imgId, uploaded])

  if (id === 'theme-heart') {
    return (
      <span className={`${className} store-hearts`} aria-hidden="true">
        <ThemeHearts durScale={0.7} />
      </span>
    )
  }
  if (id === 'theme-bubble') {
    return (
      <span className={`${className} store-bubbles`} aria-hidden="true">
        {/* 실제 적용(카드)와 같은 속도로 두둥실 떠오르게(0.6은 너무 빨라 '왈칵' 쏟아져 보였음) */}
        <ThemeBubbles durScale={1} />
      </span>
    )
  }
  if (id === 'theme-firework') {
    return (
      <span className={`${className} store-fw`} aria-hidden="true">
        <ThemeFireworks />
      </span>
    )
  }
  if (id === 'theme-waterpark') {
    return <span className={`${className} store-wp`} aria-hidden="true" />
  }

  // 프로필 꾸미기: 아바타 원 없이 꾸미기 아이템만 크게 미리보기
  if (String(id).startsWith('deco-')) {
    return (
      <span className={`${className} store-deco`} aria-hidden="true">
        <DecoPreview id={id} />
      </span>
    )
  }

  // 일부 아이템은 이미지를 조금 더 크게(커플/우정 링, 에어팟/버즈)
  const lg = ['couple-ring', 'friend-ring', 'airpods', 'buds'].includes(imgId)
  return (
    <span className={className} aria-hidden="true">
      {failed
        ? emoji
        : <img className={`store-img${lg ? ' store-img-lg' : ''}`} src={uploaded || `/store/${imgId}.svg`} alt="" onError={() => setFailed(true)} />}
    </span>
  )
}
