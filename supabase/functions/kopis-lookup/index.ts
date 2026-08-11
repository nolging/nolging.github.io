// Nolging · kopis-lookup Edge Function
// 공연(콘서트/뮤지컬/연극/무용 등) 제목으로 KOPIS(공연예술통합전산망) 검색 →
// 포스터 / 공연명 / 공연 기간(시작~종료) / 장소 / 예매 플랫폼 조회. (티켓 오픈일은 KOPIS 미제공)
// 시크릿: KOPIS_API_KEY (공공데이터포털 또는 kopis.or.kr 발급 서비스키)
// KOPIS 응답은 XML — 이 함수 안에서 정규식으로 필요한 필드만 가볍게 파싱한다.

const KOPIS = 'https://www.kopis.or.kr/openApi/restful/pblprfr'
const KEY = Deno.env.get('KOPIS_API_KEY') ?? ''

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

// XML에서 <tag>...</tag> (CDATA 포함) 내용을 뽑아낸다.
function field(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))\\s*</${tag}>`))
  return (m?.[1] ?? m?.[2] ?? '').trim()
}
// 블록 반복 태그(<db>...</db> 등)를 배열로 분리
function blocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g')
  return [...xml.matchAll(re)].map((m) => m[1])
}

const ymd = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
// KOPIS 날짜(YYYY.MM.DD)는 이미 표시용 포맷이라 그대로 사용
const dateOf = (s: string) => s || ''

async function kopisFetch(path: string, params: Record<string, string>) {
  const u = new URL(KOPIS + path)
  u.searchParams.set('service', KEY)
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
  const r = await fetch(u.toString())
  if (!r.ok) throw new Error(`KOPIS ${r.status}`)
  return r.text()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    if (!KEY) return json({ error: 'KOPIS_API_KEY 가 설정되지 않았습니다.' }, 500)
    const { action, query, id } = await req.json()

    if (action === 'search') {
      const q = String(query ?? '').trim()
      if (!q) return json({ results: [] })

      // KOPIS 목록 조회는 기간(stdate~eddate) 지정이 필수 → 최근 1년~향후 1년으로 검색
      const now = new Date()
      const from = new Date(now); from.setFullYear(from.getFullYear() - 1)
      const to = new Date(now); to.setFullYear(to.getFullYear() + 1)

      const xml = await kopisFetch('', {
        stdate: ymd(from), eddate: ymd(to), shprfnm: q, cpage: '1', rows: '10', newsql: 'Y',
      })
      const results = blocks(xml, 'db').slice(0, 8).map((b) => ({
        id: field(b, 'mt20id'), media: 'PF',
        title: field(b, 'prfnm'),
        poster: field(b, 'poster') || null,
        venue: field(b, 'fcltynm'),
        start_date: dateOf(field(b, 'prfpdfrom')),
        end_date: dateOf(field(b, 'prfpdto')),
      })).filter((r) => r.id && r.title)
      return json({ results })
    }

    if (action === 'detail') {
      const mid = String(id ?? '').trim()
      if (!mid) return json({ error: 'bad id' }, 400)
      const xml = await kopisFetch(`/${encodeURIComponent(mid)}`, {})
      const body = blocks(xml, 'db')[0]
      if (!body) return json({ error: '공연 정보를 찾을 수 없어요.' }, 404)

      // 예매 플랫폼(관련 링크) 목록 중 첫 번째를 대표 플랫폼으로 사용
      const relatesBlock = blocks(body, 'relates')[0] ?? ''
      const relate = blocks(relatesBlock, 'relate')[0] ?? ''
      const platform = field(relate, 'relatenm') || null

      return json({
        title: field(body, 'prfnm'),
        poster: field(body, 'poster') || null,
        venue: field(body, 'fcltynm'),
        start_date: dateOf(field(body, 'prfpdfrom')),
        end_date: dateOf(field(body, 'prfpdto')),
        platform,
      })
    }

    return json({ error: 'bad action' }, 400)
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500)
  }
})
