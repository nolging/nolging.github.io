// Nolging · game-lookup Edge Function (RAWG API)
// 게임 제목 검색 → 대표 이미지 / 개발사 / 배급사 / 장르 / 플랫폼
// 시크릿: RAWG_API_KEY (rawg.io API Key)

const BASE = 'https://api.rawg.io/api'
const KEY = Deno.env.get('RAWG_API_KEY') ?? ''

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

async function rawg(path: string, params: Record<string, string> = {}) {
  const u = new URL(BASE + path)
  u.searchParams.set('key', KEY)
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
  const r = await fetch(u.toString())
  if (!r.ok) throw new Error(`RAWG ${r.status}`)
  return r.json()
}

const yearOf = (d?: string) => (d ? String(d).slice(0, 4) : '')

// RAWG 장르(영문) → 한글. 없으면 원문 유지.
const GENRE_KO: Record<string, string> = {
  Action: '액션', Indie: '인디', Adventure: '어드벤처', RPG: '롤플레잉', Strategy: '전략',
  Shooter: '슈팅', Casual: '캐주얼', Simulation: '시뮬레이션', Puzzle: '퍼즐', Arcade: '아케이드',
  Platformer: '플랫포머', Racing: '레이싱', 'Massively Multiplayer': 'MMO', Sports: '스포츠',
  Fighting: '격투', Family: '가족', 'Board Games': '보드게임', Educational: '교육', Card: '카드',
}
const koGenre = (n: string) => GENRE_KO[n] ?? n

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    if (!KEY) return json({ error: 'RAWG_API_KEY 가 설정되지 않았습니다.' }, 500)
    const { action, query, id } = await req.json()

    if (action === 'search') {
      const q = String(query ?? '').trim()
      if (!q) return json({ results: [] })
      const d = await rawg('/games', { search: q, page_size: '8' })
      return json({
        results: (d.results ?? []).map((g: Record<string, unknown>) => ({
          id: g.id, media: 'game', title: g.name,
          year: yearOf(g.released as string),
          poster: (g.background_image as string) || null,
        })),
      })
    }

    if (action === 'detail') {
      const g = await rawg(`/games/${Number(id)}`)
      return json({
        kind: 'game',
        title: g.name,
        poster: g.background_image || null,
        developers: (g.developers ?? []).map((x: { name: string }) => x.name),
        publishers: (g.publishers ?? []).map((x: { name: string }) => x.name),
        genres: (g.genres ?? []).map((x: { name: string }) => koGenre(x.name)),
        platforms: (g.parent_platforms ?? []).map((x: { platform: { name: string } }) => x.platform.name),
      })
    }
    return json({ error: 'bad action' }, 400)
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500)
  }
})
