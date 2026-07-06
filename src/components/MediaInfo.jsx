// 위시(영화/OTT)에서 가져온 TMDB 정보 표시. category 에 따라 항목이 달라진다.
export default function MediaInfo({ category, info, onClear }) {
  if (!info) return null
  const rows = []

  if (category === 'OTT') {
    // 구독으로 볼 수 있으면 그것, 없으면 개별 구매처 + (개별 구매)
    if (info.providers?.length) {
      rows.push(['볼 수 있는 곳', info.providers.join(', ')])
    } else if (info.providers_buy?.length) {
      rows.push(['볼 수 있는 곳', `${info.providers_buy.join(', ')} (개별 구매)`])
    }
    if (info.genres?.length) rows.push(['장르', info.genres.join(', ')])
    if (info.kind === 'tv') { if (info.episode_count) rows.push(['구성', `${info.episode_count}부작`]) }
    else if (info.runtime) rows.push(['러닝타임', `${info.runtime}분`])
  } else { // 영화
    if (info.genres?.length) rows.push(['장르', info.genres.join(', ')])
    if (info.release_date) rows.push(['개봉일', info.release_date])
    if (info.runtime) rows.push(['러닝타임', `${info.runtime}분`])
  }
  if (info.kind === 'movie' && info.in_theaters) rows.push(['상영', '현재 상영 중 🎬'])

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
            {rows.map(([k, v]) => (
              <div className="media-info-row" key={k}>
                <dt>{k}</dt><dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  )
}
