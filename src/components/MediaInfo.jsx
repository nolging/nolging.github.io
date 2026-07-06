// 위시(영화/OTT)에서 가져온 TMDB 정보 표시. category 에 따라 항목이 달라진다.

// 특정 브랜드는 로고를 지정 이미지로 대체 (TMDB 로고가 마음에 안 들 때)
const LOGO_OVERRIDE = [
  { test: /wavve/i, src: '/ott/wavve.png' },
  { test: /watcha/i, src: '/ott/watcha.png' },
]
const badgeSrc = (name, logo) => LOGO_OVERRIDE.find((o) => o.test.test(name))?.src ?? logo

// OTT 제공처를 앱 아이콘(동그란 배지)로. logo 없으면 텍스트 칩으로 대체.
function ProviderBadges({ list, suffix }) {
  return (
    <span className="ott-badges">
      {list.map((p, i) => {
        const name = typeof p === 'string' ? p : p.name
        const src = badgeSrc(name, typeof p === 'object' ? p.logo : null)
        return src
          ? <img key={i} className="ott-badge" src={src} alt={name} title={name} />
          : <span key={i} className="ott-badge ott-badge-text" title={name}>{name}</span>
      })}
      {suffix && <span className="ott-suffix">{suffix}</span>}
    </span>
  )
}

export default function MediaInfo({ category, info, onClear }) {
  if (!info) return null
  const rows = [] // [label, node]

  if (category === 'OTT') {
    if (info.providers?.length) rows.push(['OTT', <ProviderBadges list={info.providers} />])
    else if (info.providers_buy?.length) rows.push(['OTT', <ProviderBadges list={info.providers_buy} suffix="(개별 구매)" />])
    else rows.push(['OTT', <span className="muted">정보 없음</span>])
    if (info.genres?.length) rows.push(['장르', info.genres.join(', ')])
    if (info.kind === 'tv') { if (info.episode_count) rows.push(['구성', `${info.episode_count} 부작`]) }
    else if (info.runtime) rows.push(['러닝타임', `${info.runtime} 분`])
  } else { // 영화: 개봉일 → 장르 → 러닝타임
    if (info.release_date) rows.push(['개봉일', info.release_date])
    if (info.genres?.length) rows.push(['장르', info.genres.join(', ')])
    if (info.runtime) rows.push(['러닝타임', `${info.runtime} 분`])
  }

  return (
    <div className="media-info">
      <div className="media-info-body">
        {info.poster
          ? <img src={info.poster} alt="" className="media-info-poster" />
          : <span className="media-info-poster media-poster-empty" aria-hidden="true">🎬</span>}
        <div className="media-info-main">
          <div className="media-info-head">
            {info.title && <span className="media-info-title">{info.title}</span>}
            {onClear && (
              <button type="button" className="media-info-clear" onClick={onClear} aria-label="정보 지우기">✕</button>
            )}
          </div>
          <dl className="media-info-rows">
            {rows.map(([k, v], i) => (
              <div className="media-info-row" key={i}>
                <dt>{k}</dt><dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  )
}
