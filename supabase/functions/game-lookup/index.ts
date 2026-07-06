// Nolging · game-lookup Edge Function (IGDB via Twitch)
// 게임 제목 검색 → 커버 이미지 / 개발사 / 배급사 / 장르 / 플랫폼
// 시크릿: TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET (dev.twitch.tv 에서 발급)

const CLIENT_ID = Deno.env.get('TWITCH_CLIENT_ID') ?? ''
const CLIENT_SECRET = Deno.env.get('TWITCH_CLIENT_SECRET') ?? ''
const IMG = 'https://images.igdb.com/igdb/image/upload/t_cover_big/'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

// Twitch OAuth 토큰 (client_credentials) — 모듈 스코프 캐시
let tok: { value: string; exp: number } | null = null
async function token(): Promise<string> {
  const now = Date.now()
  if (tok && now < tok.exp) return tok.value
  const u = new URL('https://id.twitch.tv/oauth2/token')
  u.searchParams.set('client_id', CLIENT_ID)
  u.searchParams.set('client_secret', CLIENT_SECRET)
  u.searchParams.set('grant_type', 'client_credentials')
  const r = await fetch(u.toString(), { method: 'POST' })
  if (!r.ok) throw new Error(`Twitch auth ${r.status}`)
  const d = await r.json()
  tok = { value: d.access_token, exp: now + ((d.expires_in ?? 3600) - 60) * 1000 }
  return tok.value
}

async function igdb(endpoint: string, body: string) {
  const t = await token()
  const r = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
    method: 'POST',
    headers: { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${t}`, 'Content-Type': 'text/plain' },
    body,
  })
  if (!r.ok) throw new Error(`IGDB ${r.status}`)
  return r.json()
}

const yearOf = (ts?: number) => (ts ? String(new Date(ts * 1000).getUTCFullYear()) : '')

// IGDB 장르(영문) → 한글. 없으면 원문 유지.
const GENRE_KO: Record<string, string> = {
  'Role-playing (RPG)': '롤플레잉', 'Shooter': '슈팅', 'Adventure': '어드벤처', 'Platform': '플랫포머',
  'Puzzle': '퍼즐', 'Racing': '레이싱', 'Sport': '스포츠', 'Fighting': '격투', 'Strategy': '전략',
  'Real Time Strategy (RTS)': '실시간 전략', 'Turn-based strategy (TBS)': '턴제 전략', 'Simulator': '시뮬레이션',
  'Indie': '인디', 'Arcade': '아케이드', "Hack and slash/Beat 'em up": '핵앤슬래시', 'Card & Board Game': '카드/보드',
  'Music': '음악', 'Tactical': '택티컬', 'Point-and-click': '포인트앤클릭', 'Visual Novel': '비주얼노벨',
  'MOBA': 'MOBA', 'Quiz/Trivia': '퀴즈', 'Pinball': '핀볼',
}
const koGenre = (n: string) => GENRE_KO[n] ?? n

// 플랫폼명 → 대표 패밀리로 묶고 중복 제거 (예: PlayStation 4/5 → PlayStation)
function platFamily(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('playstation')) return 'PlayStation'
  if (n.includes('xbox')) return 'Xbox'
  if (/(nintendo|switch|wii|game boy|nes|3ds|nds)/.test(n)) return 'Nintendo'
  if (n.includes('windows') || n === 'pc' || n.startsWith('pc ')) return 'PC'
  if (n.includes('mac')) return 'Mac'
  if (n.includes('linux')) return 'Linux'
  if (/(ios|iphone|ipad)/.test(n)) return 'iOS'
  if (n.includes('android')) return 'Android'
  return name
}
const platforms = (arr?: { name: string }[]) => [...new Set((arr ?? []).map((p) => platFamily(p.name)))]

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    if (!CLIENT_ID || !CLIENT_SECRET) return json({ error: 'TWITCH_CLIENT_ID/SECRET 가 설정되지 않았습니다.' }, 500)
    const { action, query, id } = await req.json()

    if (action === 'search') {
      const q = String(query ?? '').trim().replace(/"/g, '')
      if (!q) return json({ results: [] })
      const rows = await igdb('games', `search "${q}"; fields name, first_release_date, cover.image_id; limit 8;`)
      return json({
        results: (rows ?? []).map((g: Record<string, unknown>) => ({
          id: g.id, media: 'game', title: g.name,
          year: yearOf(g.first_release_date as number),
          poster: (g.cover as { image_id?: string })?.image_id ? IMG + (g.cover as { image_id: string }).image_id + '.jpg' : null,
        })),
      })
    }

    if (action === 'detail') {
      const rows = await igdb('games',
        `fields name, cover.image_id, platforms.name, genres.name, involved_companies.company.name, involved_companies.developer, involved_companies.publisher; where id = ${Number(id)}; limit 1;`)
      const g = rows?.[0]
      if (!g) return json({ error: '게임 정보를 찾을 수 없어요.' }, 404)
      const ic = (g.involved_companies ?? []) as { company?: { name: string }; developer?: boolean; publisher?: boolean }[]
      return json({
        kind: 'game',
        title: g.name,
        poster: g.cover?.image_id ? IMG + g.cover.image_id + '.jpg' : null,
        developers: [...new Set(ic.filter((c) => c.developer).map((c) => c.company?.name).filter(Boolean))],
        publishers: [...new Set(ic.filter((c) => c.publisher).map((c) => c.company?.name).filter(Boolean))],
        genres: (g.genres ?? []).map((x: { name: string }) => koGenre(x.name)),
        platforms: platforms(g.platforms),
      })
    }
    return json({ error: 'bad action' }, 400)
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500)
  }
})
