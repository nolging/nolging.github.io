import { gamePlatformLabels } from '../lib/constants'

// 브랜드 로고 오버라이드(TMDB 로고 대신 지정 이미지)
const LOGO_OVERRIDE = [
  { test: /wavve/i, src: '/ott/wavve.png' },
  { test: /watcha/i, src: '/ott/watcha.png' },
  { test: /netflix/i, src: '/ott/netflix.jpg' },
  { test: /tving/i, src: '/ott/tving.png' },
  { test: /disney/i, src: '/ott/disney.png' },
  { test: /coupang/i, src: '/ott/coupang.png' },
]
const badgeSrc = (name, logo) => LOGO_OVERRIDE.find((o) => o.test.test(name))?.src ?? logo

function ProviderPill({ p }) {
  const name = typeof p === 'string' ? p : p.name
  const src = badgeSrc(name, typeof p === 'object' ? p.logo : null)
  return (
    <span className="mc-provider">
      {src && <img src={src} alt="" />}
      {name}
    </span>
  )
}

// 위시 작품 정보 카드 (시안). category 에 따라 항목이 달라짐. onClear 있으면 우상단 X.
export default function MediaCard({ category, info, onClear }) {
  if (!info) return null
  const posterEmoji = category === '독서' ? '📚' : category === '게임' ? '🎮' : '🎬'

  // 상단 제공처 pill (OTT 만)
  let providers = null
  if (category === 'OTT') {
    const list = info.providers?.length ? info.providers : info.providers_buy
    if (list?.length) providers = list
  }

  // 라벨-값 행
  const rows = []
  if (category === 'OTT') {
    if (info.genres?.length) rows.push(['장르', info.genres.join(', ')])
    if (info.kind === 'tv') { if (info.episode_count) rows.push(['구성', `${info.episode_count}부작`]) }
    else if (info.runtime) rows.push(['러닝타임', `${info.runtime}분`])
  } else if (category === '영화') {
    if (info.release_date) rows.push(['개봉일', info.release_date])
    if (info.genres?.length) rows.push(['장르', info.genres.join(', ')])
    if (info.runtime) rows.push(['러닝타임', `${info.runtime}분`])
  } else if (category === '독서') {
    if (info.author) rows.push(['저자', info.author])
    if (info.genres?.length) rows.push(['장르', info.genres.join(', ')])
    if (info.page_count) rows.push(['페이지', `${info.page_count}쪽`])
  } else if (category === '게임') {
    const plats = gamePlatformLabels(info.platforms)
    if (plats.length) rows.push(['플랫폼', plats.join(', ')])
    if (info.genres?.length) rows.push(['장르', info.genres.join(', ')])
    rows.push(['출시일', info.release_date || '-'])
  }

  return (
    <div className="mc">
      {info.poster
        ? <img src={info.poster} alt="" className="mc-poster" />
        : <span className="mc-poster mc-poster-empty" aria-hidden="true">{posterEmoji}</span>}
      <div className="mc-main">
        <div className="mc-title">{info.title}</div>
        {providers && <span className="mc-providers">{providers.map((p, i) => <ProviderPill key={i} p={p} />)}</span>}
        {rows.length > 0 && (
          <div className="mc-rows">
            {rows.map(([k, v], i) => (
              <span key={i}><span className="mc-k">{k}</span> {v}</span>
            ))}
          </div>
        )}
      </div>
      {onClear && (
        <button type="button" className="mc-clear" onClick={onClear} aria-label="제거" title="제거">
          <svg width="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      )}
    </div>
  )
}
