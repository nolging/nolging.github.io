// Nolging · book-lookup Edge Function (카카오 책 검색 API)
// 도서 제목 검색 → 표지 / 저자 / 출판사
// 2026-10-30 알라딘 OpenAPI 서비스 종료로 카카오 책 검색 API(v3)로 전환.
// 카카오는 페이지수·장르(카테고리) 필드를 제공하지 않는다 — 프런트(MediaInfo.jsx)에서
// 그 두 자리를 출판사 + 교보문고 검색 링크로 대체했다.
// 시크릿: KAKAO_REST_API_KEY (카카오 디벨로퍼스 REST API 키)

const BASE = 'https://dapi.kakao.com/v3/search/book'
const KEY = Deno.env.get('KAKAO_REST_API_KEY') ?? ''

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

async function kakaoBookSearch(params: Record<string, string>) {
  const u = new URL(BASE)
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
  const r = await fetch(u.toString(), { headers: { Authorization: `KakaoAK ${KEY}` } })
  if (!r.ok) throw new Error(`Kakao ${r.status}`)
  return r.json()
}

const yearOf = (d?: string) => (d ? String(d).slice(0, 4) : '')
const authorsOf = (a?: unknown) => (Array.isArray(a) ? a.join(', ') : '')

// "8983920775 9788983920777"(isbn10 isbn13 공백 구분) → 13자리 우선, 없으면 첫 토큰.
function isbn13Of(isbn?: string): string {
  if (!isbn) return ''
  const parts = String(isbn).split(' ').filter(Boolean)
  return parts.find((p) => p.length === 13) || parts[0] || ''
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    if (!KEY) return json({ error: 'KAKAO_REST_API_KEY 가 설정되지 않았습니다.' }, 500)
    const { action, query, id } = await req.json()

    if (action === 'search') {
      const q = String(query ?? '').trim()
      if (!q) return json({ results: [] })
      const d = await kakaoBookSearch({ query: q, target: 'title', size: '8' })
      return json({
        results: (d.documents ?? [])
          .map((b: Record<string, unknown>) => ({
            id: isbn13Of(b.isbn as string),
            media: 'book',
            title: b.title as string,
            author: authorsOf(b.authors),
            year: yearOf(b.datetime as string),
            poster: (b.thumbnail as string) || null,
          }))
          .filter((x: { id?: string }) => x.id),
      })
    }

    if (action === 'detail') {
      const isbn = String(id ?? '')
      const d = await kakaoBookSearch({ query: isbn, target: 'isbn', size: '1' })
      const b = (d.documents ?? [])[0]
      if (!b) return json({ error: '책 정보를 찾을 수 없어요.' }, 404)
      return json({
        kind: 'book',
        title: b.title,
        poster: b.thumbnail || null,
        author: authorsOf(b.authors),
        publisher: b.publisher || '',
        isbn: isbn13Of(b.isbn as string) || isbn,
      })
    }
    return json({ error: 'bad action' }, 400)
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500)
  }
})
