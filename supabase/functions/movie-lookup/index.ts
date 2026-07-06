// Nolging · movie-lookup Edge Function
// 영화/드라마 제목으로 TMDB 검색 → OTT(구독/개별구매) 제공처 / 장르 / 러닝타임 /
// 부작수 / 포스터 / 현재 상영 여부 조회.
// 시크릿: TMDB_API_KEY (themoviedb.org v3 API Key)

const TMDB = 'https://api.themoviedb.org/3'
const KEY = Deno.env.get('TMDB_API_KEY') ?? ''
const IMG_SM = 'https://image.tmdb.org/t/p/w92'
const IMG_MD = 'https://image.tmdb.org/t/p/w185'

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
const names = (arr?: { provider_name: string }[]) => (arr ?? []).map((p) => p.provider_name)

// 한국(KR) 시청 제공처: flatrate(구독), buy/rent(개별 구매·대여)
async function providersKR(media: string, id: number): Promise<{ sub: string[]; buy: string[] }> {
  try {
    const d = await tmdb(`/${media}/${id}/watch/providers`)
    const kr = d?.results?.KR
    return { sub: names(kr?.flatrate), buy: [...new Set([...names(kr?.buy), ...names(kr?.rent)])] }
  } catch { return { sub: [], buy: [] } }
}

// 현재 KR 극장 상영 중 영화 id 집합 (모듈 스코프 1시간 캐시)
let npCache: { ids: Set<number>; at: number } | null = null
async function nowPlayingKR(): Promise<Set<number>> {
  const now = Date.now()
  if (npCache && now - npCache.at < 3600_000) return npCache.ids
  const ids = new Set<number>()
  try {
    const pages = await Promise.all(
      [1, 2, 3, 4, 5].map((p) =>
        tmdb('/movie/now_playing', { language: 'ko-KR', region: 'KR', page: String(p) }).catch(() => null)),
    )
    for (const d of pages) for (const m of d?.results ?? []) ids.add(m.id)
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
        const d = await tmdb('/search/movie', { language: 'ko-KR', query: q, include_adult: 'false', region: 'KR' })
        return json({
          results: (d.results ?? []).slice(0, 8).map((m: Record<string, unknown>) => ({
            id: m.id, media: 'movie', title: m.title, year: yearOf(m.release_date as string),
            poster: m.poster_path ? IMG_SM + m.poster_path : null,
          })),
        })
      }

      // multi(OTT 유형): 영화+시리즈, KR 에서 볼 수 없는(구독·개별구매 모두 없음) 결과는 제외
      const d = await tmdb('/search/multi', { language: 'ko-KR', query: q, include_adult: 'false' })
      const cands = (d.results ?? [])
        .filter((m: Record<string, unknown>) => m.media_type === 'movie' || m.media_type === 'tv')
        .slice(0, 12)
      const checked = await Promise.all(cands.map(async (m: Record<string, unknown>) => {
        const prov = await providersKR(m.media_type as string, m.id as number)
        return { m, ok: prov.sub.length > 0 || prov.buy.length > 0 }
      }))
      return json({
        results: checked.filter((x) => x.ok).slice(0, 8).map(({ m }) => ({
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
          genres: (d.genres ?? []).map((g: { name: string }) => g.name),
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
          genres: (d.genres ?? []).map((g: { name: string }) => g.name),
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
