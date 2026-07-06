// Nolging · movie-lookup Edge Function
// 영화/드라마 제목으로 TMDB 검색 → OTT(구독/개별구매) 제공처 / 장르 / 러닝타임 /
// 부작수 / 포스터 / 현재 상영 여부 조회.
// 시크릿: TMDB_API_KEY (themoviedb.org v3 API Key)

const TMDB = 'https://api.themoviedb.org/3'
const KEY = Deno.env.get('TMDB_API_KEY') ?? ''
const IMG_SM = 'https://image.tmdb.org/t/p/w92'
const IMG_MD = 'https://image.tmdb.org/t/p/w185'
const IMG_LOGO = 'https://image.tmdb.org/t/p/w92'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}
async function tmdb(path: string, params: Record<string, string> = {}) {
  const u = new URL(TMDB + path)
  u.searchParams.set('api_key', KEY)
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
  const r = await fetch(u.toString())
  if (!r.ok) throw new Error(`TMDB ${r.status}`)
  return r.json()
}
const yearOf = (d?: string) => (d ? String(d).slice(0, 4) : '')
type Prov = { provider_name: string; logo_path?: string }
type Provider = { name: string; logo: string | null }
const provs = (arr?: Prov[]): Provider[] =>
  (arr ?? []).map((p) => ({ name: p.provider_name, logo: p.logo_path ? IMG_LOGO + p.logo_path : null }))

// 광고형/채널 변형을 대표 브랜드로 합쳐 중복 제거 (예: "Netflix Standard with Ads" → "Netflix")
const isVariant = (n: string) => /(with ads|amazon channel|apple tv channel)/i.test(n)
const baseName = (n: string) => n
  .replace(/\s+(standard|basic|premium)?\s*with ads$/i, '')
  .replace(/\s+(amazon|apple tv)\s+channel$/i, '')
  .trim()
function dedupeProviders(list: Provider[]): Provider[] {
  const sorted = [...list].sort((a, b) => (isVariant(a.name) ? 1 : 0) - (isVariant(b.name) ? 1 : 0))
  const seen = new Map<string, Provider>()
  for (const p of sorted) {
    const key = baseName(p.name).toLowerCase()
    if (!seen.has(key)) seen.set(key, { ...p, name: baseName(p.name) })
  }
  return [...seen.values()]
}

// 한국(KR) 시청 제공처: flatrate(구독), buy/rent(개별 구매·대여) — 각각 {name, logo}, 중복 제거
async function providersKR(media: string, id: number): Promise<{ sub: Provider[]; buy: Provider[] }> {
  try {
    const d = await tmdb(`/${media}/${id}/watch/providers`)
    const kr = d?.results?.KR
    return {
      sub: dedupeProviders(provs(kr?.flatrate)),
      buy: dedupeProviders([...provs(kr?.buy), ...provs(kr?.rent)]),
    }
  } catch { return { sub: [], buy: [] } }
}

// TMDB 가 영어로 주는 (주로 TV) 장르 → 한글
const GENRE_KO: Record<string, string> = {
  'Action & Adventure': '액션 & 어드벤처', 'Sci-Fi & Fantasy': 'SF & 판타지',
  'War & Politics': '전쟁 & 정치', 'Kids': '키즈', 'News': '뉴스',
  'Reality': '리얼리티', 'Soap': '연속극', 'Talk': '토크', 'Western': '서부극',
}
const koGenres = (arr?: { name: string }[]) => (arr ?? []).map((g) => GENRE_KO[g.name] ?? g.name)

// 현재 KR 극장 상영 중 영화 id 집합 (모듈 스코프 1시간 캐시)
let npCache: { ids: Set<number>; at: number } | null = null
async function nowPlayingKR(): Promise<Set<number>> {
  const now = Date.now()
  if (npCache && now - npCache.at < 3600_000) return npCache.ids
  const ids = new Set<number>()
  try {
    const first = await tmdb('/movie/now_playing', { language: 'ko-KR', region: 'KR', page: '1' })
    for (const m of first.results ?? []) ids.add(m.id)
    const total = Math.min(first.total_pages ?? 1, 12)
    const rest = await Promise.all(
      Array.from({ length: Math.max(0, total - 1) }, (_, i) =>
        tmdb('/movie/now_playing', { language: 'ko-KR', region: 'KR', page: String(i + 2) }).catch(() => null)))
    for (const d of rest) for (const m of d?.results ?? []) ids.add(m.id)
  } catch { /* ignore */ }
  npCache = { ids, at: now }
  return ids
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    if (!KEY) return json({ error: 'TMDB_API_KEY 가 설정되지 않았습니다.' }, 500)
    const { action, query, kind, id, media } = await req.json()

    if (action === 'search') {
      const q = String(query ?? '').trim()
      if (!q) return json({ results: [] })

      if (kind === 'movie') {
        // 영화 유형: 현재 KR 극장 상영 중인 영화만
        const [d, np] = await Promise.all([
          tmdb('/search/movie', { language: 'ko-KR', query: q, include_adult: 'false', region: 'KR' }),
          nowPlayingKR(),
        ])
        return json({
          results: (d.results ?? [])
            .filter((m: Record<string, unknown>) => np.has(m.id as number))
            .slice(0, 8)
            .map((m: Record<string, unknown>) => ({
              id: m.id, media: 'movie', title: m.title, year: yearOf(m.release_date as string),
              poster: m.poster_path ? IMG_SM + m.poster_path : null,
            })),
        })
      }

      // multi(OTT 유형): 영화+시리즈. 현재 상영 중인 영화만 제외(그건 영화 유형에서 다룸).
      // 제공처가 없어도(쿠팡플레이 등 데이터 누락) 포함 — 제공처는 상세 조회 때 확인.
      const [d, np] = await Promise.all([
        tmdb('/search/multi', { language: 'ko-KR', query: q, include_adult: 'false' }),
        nowPlayingKR(),
      ])
      return json({
        results: (d.results ?? [])
          .filter((m: Record<string, unknown>) =>
            (m.media_type === 'movie' || m.media_type === 'tv') &&
            !(m.media_type === 'movie' && np.has(m.id as number)))
          .slice(0, 8)
          .map((m: Record<string, unknown>) => ({
            id: m.id, media: m.media_type,
            title: m.media_type === 'tv' ? m.name : m.title,
            year: yearOf((m.media_type === 'tv' ? m.first_air_date : m.release_date) as string),
            poster: m.poster_path ? IMG_SM + m.poster_path : null,
          })),
      })
    }

    if (action === 'detail') {
      const mid = Number(id)
      if (media === 'movie') {
        const [d, prov, np] = await Promise.all([
          tmdb(`/movie/${mid}`, { language: 'ko-KR' }), providersKR('movie', mid), nowPlayingKR(),
        ])
        return json({
          kind: 'movie', title: d.title,
          poster: d.poster_path ? IMG_MD + d.poster_path : null,
          genres: koGenres(d.genres),
          runtime: d.runtime ?? null, release_date: d.release_date ?? null,
          providers: prov.sub, providers_buy: prov.buy,
          in_theaters: np.has(mid),
        })
      }
      if (media === 'tv') {
        const [d, prov] = await Promise.all([tmdb(`/tv/${mid}`, { language: 'ko-KR' }), providersKR('tv', mid)])
        return json({
          kind: 'tv', title: d.name,
          poster: d.poster_path ? IMG_MD + d.poster_path : null,
          genres: koGenres(d.genres),
          episode_count: d.number_of_episodes ?? null,
          runtime: (d.episode_run_time && d.episode_run_time[0]) ?? null,
          release_date: d.first_air_date ?? null,
          providers: prov.sub, providers_buy: prov.buy,
        })
      }
      return json({ error: 'bad media' }, 400)
    }
    return json({ error: 'bad action' }, 400)
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500)
  }
})
