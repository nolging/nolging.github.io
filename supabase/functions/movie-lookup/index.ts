// Nolging · movie-lookup Edge Function
// 영화/드라마 제목으로 TMDB 검색 → OTT(구독) 제공처 / 장르 / 러닝타임 / 부작수 조회.
// 프론트에서 supabase.functions.invoke('movie-lookup', { body: {...} }) 로 호출.
//
// 필요한 시크릿(Function Secrets):
//   TMDB_API_KEY  (themoviedb.org > Settings > API > API Key(v3 auth))

const TMDB = 'https://api.themoviedb.org/3'
const KEY = Deno.env.get('TMDB_API_KEY') ?? ''
const IMG = 'https://image.tmdb.org/t/p/w92'

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

// 구독(flatrate)으로 볼 수 있는 한국 OTT 제공처만 (단품 구매/대여 제외)
async function providersKR(media: string, id: number): Promise<string[]> {
  try {
    const d = await tmdb(`/${media}/${id}/watch/providers`)
    const flat = d?.results?.KR?.flatrate ?? []
    return flat.map((p: { provider_name: string }) => p.provider_name)
  } catch { return [] }
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
            poster: m.poster_path ? IMG + m.poster_path : null,
          })),
        })
      }
      // multi: 영화 + 드라마/시리즈
      const d = await tmdb('/search/multi', { language: 'ko-KR', query: q, include_adult: 'false' })
      return json({
        results: (d.results ?? [])
          .filter((m: Record<string, unknown>) => m.media_type === 'movie' || m.media_type === 'tv')
          .slice(0, 8)
          .map((m: Record<string, unknown>) => ({
            id: m.id, media: m.media_type,
            title: m.media_type === 'tv' ? m.name : m.title,
            year: yearOf((m.media_type === 'tv' ? m.first_air_date : m.release_date) as string),
            poster: m.poster_path ? IMG + m.poster_path : null,
          })),
      })
    }

    if (action === 'detail') {
      const mid = Number(id)
      if (media === 'movie') {
        const [d, providers] = await Promise.all([tmdb(`/movie/${mid}`, { language: 'ko-KR' }), providersKR('movie', mid)])
        return json({
          kind: 'movie', title: d.title,
          genres: (d.genres ?? []).map((g: { name: string }) => g.name),
          runtime: d.runtime ?? null,
          release_date: d.release_date ?? null,
          providers,
        })
      }
      if (media === 'tv') {
        const [d, providers] = await Promise.all([tmdb(`/tv/${mid}`, { language: 'ko-KR' }), providersKR('tv', mid)])
        return json({
          kind: 'tv', title: d.name,
          genres: (d.genres ?? []).map((g: { name: string }) => g.name),
          episode_count: d.number_of_episodes ?? null,
          runtime: (d.episode_run_time && d.episode_run_time[0]) ?? null,
          release_date: d.first_air_date ?? null,
          providers,
        })
      }
      return json({ error: 'bad media' }, 400)
    }
    return json({ error: 'bad action' }, 400)
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500)
  }
})
