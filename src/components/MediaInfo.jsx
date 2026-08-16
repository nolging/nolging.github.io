// 위시(OTT/영화/독서/게임)에서 가져온 정보 표시. category 에 따라 항목이 달라진다.
import { useEffect, useRef, useState } from 'react'
import { gamePlatformLabels } from '../lib/constants'

// 삼선 메뉴에서 켜고 끌 수 있는 OTT 목록(요청 순서). 쿠팡플레이는 검색 제공처에
// 거의 안 나와서 항상 수동 토글 대상이고, 나머지는 API 로 이미 들어와 있으면
// (수동으로 켠 게 아니라면) 메뉴에서 제외한다 — manual 플래그로 구분.
const OTT_TOGGLES = [
  { name: '넷플릭스', logo: '/ott/netflix.jpg', test: /netflix/i },
  { name: '티빙', logo: '/ott/tving.png', test: /tving/i },
  { name: '웨이브', logo: '/ott/wavve.png', test: /wavve/i },
  { name: '디즈니플러스', logo: '/ott/disney.png', test: /disney/i },
  { name: '왓챠', logo: '/ott/watcha.png', test: /watcha/i },
  { name: '쿠팡플레이', logo: '/ott/coupang.png', test: /coupang|쿠팡/i, alwaysManual: true },
]
// 직접 추가한 항목은 name 이 한글 표시명(def.name)이라 영문 브랜드 정규식(def.test)에
// 안 걸린다 — def.test 는 API 가 주는 영문 이름만 잡아내므로, 자기 자신이 추가한
// 항목을 다시 찾으려면 def.name 과의 완전 일치도 함께 봐야 한다(안 그러면 항상
// "없음"으로 판정돼 토글이 꺼지지 않고 클릭할 때마다 계속 추가됨).
const matchProvider = (list, def) => list.find((p) => {
  const name = typeof p === 'string' ? p : p?.name || ''
  return def.test.test(name) || name === def.name
})

// 특정 브랜드는 로고를 지정 이미지로 대체 (TMDB 로고가 마음에 안 들 때)
const LOGO_OVERRIDE = [
  { test: /wavve/i, src: '/ott/wavve.png' },
  { test: /watcha/i, src: '/ott/watcha.png' },
  { test: /netflix/i, src: '/ott/netflix.jpg' },
  { test: /tving/i, src: '/ott/tving.png' },
  { test: /disney/i, src: '/ott/disney.png' },
  { test: /coupang/i, src: '/ott/coupang.png' },
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

function MenuDotsIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  )
}

// 우측 상단 삼선 드롭다운: OTT 별로 수동 표시 여부를 토글로 켜고 끈다. API 로 이미
// 들어온(수동 아닌) 제공처는 목록에서 제외 — 이미 뱃지로 보이고 있어 중복 노출 불필요.
function OttToggleMenu({ providers, onSetProviders }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const rows = OTT_TOGGLES.filter((def) => {
    const m = matchProvider(providers, def)
    return !m || def.alwaysManual || m.manual
  })
  if (!rows.length) return null

  const toggle = (def) => {
    const m = matchProvider(providers, def)
    const on = def.alwaysManual ? !!m : !!m?.manual
    const next = on ? providers.filter((p) => p !== m) : [...providers, { name: def.name, logo: def.logo, manual: true }]
    onSetProviders(next)
  }

  return (
    <div className="mi-cp" ref={ref}>
      <button type="button" className="mi-cp-btn" onClick={() => setOpen((v) => !v)}
        aria-label="OTT 표시 설정" aria-expanded={open}>
        <MenuDotsIcon />
      </button>
      {open && (
        <div className="mi-cp-menu" role="menu">
          {rows.map((def) => {
            const m = matchProvider(providers, def)
            const on = def.alwaysManual ? !!m : !!m?.manual
            return (
              <div className="mi-cp-item" key={def.name}>
                <span className="mi-cp-label">
                  <img className="mi-cp-logo" src={def.logo} alt="" />
                  {def.name}
                </span>
                <button type="button" className={`me-switch ${on ? 'on' : ''}`}
                  role="switch" aria-checked={on} aria-label={def.name} onClick={() => toggle(def)}>
                  <span className="me-knob" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function MediaInfo({ category, info, onClear, onSetProviders }) {
  if (!info) return null
  const rows = [] // [label, node]

  // 장르는 길면 한 줄 말줄임(...) 처리 → 세 번째 값으로 클래스 전달
  const genreRow = (g) => ['장르', g.join(', '), 'mi-clip']

  if (category === 'OTT') {
    if (info.providers?.length) rows.push(['제공처', <ProviderBadges list={info.providers} />])
    else if (info.providers_buy?.length) rows.push(['제공처', <ProviderBadges list={info.providers_buy} suffix="(개별 구매)" />])
    else rows.push(['제공처', <span className="muted">정보 없음</span>])
    if (info.genres?.length) rows.push(genreRow(info.genres))
    if (info.kind === 'tv') { if (info.episode_count) rows.push(['구성', `${info.episode_count} 부작`]) }
    else if (info.runtime) rows.push(['러닝타임', `${info.runtime} 분`])
  } else if (category === '영화') { // 개봉일 → 장르 → 러닝타임
    if (info.release_date) rows.push(['개봉일', info.release_date])
    if (info.genres?.length) rows.push(genreRow(info.genres))
    if (info.runtime) rows.push(['러닝타임', `${info.runtime} 분`])
  } else if (category === '독서') {
    if (info.author) rows.push(['저자', info.author])
    if (info.genres?.length) rows.push(genreRow(info.genres))
    if (info.page_count) rows.push(['페이지', `${info.page_count} 쪽`])
  } else if (category === '게임') {
    const plats = gamePlatformLabels(info.platforms) // 닌텐도·맥·윈도우·플스만, 지정 순서
    if (plats.length) rows.push(['플랫폼', plats.join(', ')])
    if (info.genres?.length) rows.push(genreRow(info.genres))
    rows.push(['출시일', info.release_date || '-']) // 출시일 없으면 하이픈
  } else if (category === '공연') {
    if (info.platform) rows.push(['플랫폼', info.platform])
    if (info.start_date || info.end_date) rows.push(['공연일', [info.start_date, info.end_date].filter(Boolean).join('~')])
    if (info.venue) rows.push(['장소', info.venue])
  }

  const posterEmoji = category === '독서' ? '📚' : category === '게임' ? '🎮' : category === '공연' ? '🎭' : '🎬'

  return (
    <div className="media-info">
      {category === 'OTT' && onSetProviders && (
        <OttToggleMenu providers={info.providers || []} onSetProviders={onSetProviders} />
      )}
      <div className="media-info-body">
        {info.poster
          ? <img src={info.poster} alt="" className="media-info-poster" />
          : <span className="media-info-poster media-poster-empty" aria-hidden="true">{posterEmoji}</span>}
        <div className="media-info-main">
          <div className="media-info-head">
            {info.title && <span className="media-info-title">{info.title}</span>}
            {onClear && (
              <button type="button" className="media-info-clear" onClick={onClear} aria-label="정보 지우기">✕</button>
            )}
          </div>
          <dl className="media-info-rows">
            {rows.map(([k, v, cls], i) => (
              <div className="media-info-row" key={i}>
                <dt>{k}</dt><dd className={cls || undefined}>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  )
}
