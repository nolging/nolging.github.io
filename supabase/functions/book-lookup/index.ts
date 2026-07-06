// Nolging · book-lookup Edge Function (알라딘 Open API)
// 도서 제목 검색 → 표지 / 저자 / 출판사 / 장르 / 페이지수
// 시크릿: ALADIN_TTB_KEY (알라딘 TTBKey)

const BASE = 'https://www.aladin.co.kr/ttb/api'
const KEY = Deno.env.get('ALADIN_TTB_KEY') ?? ''

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

async function aladin(path: string, params: Record<string, string>) {
  const u = new URL(BASE + path)
  u.searchParams.set('ttbkey', KEY)
  u.searchParams.set('output', 'js')
  u.searchParams.set('Version', '20131101')
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
  const r = await fetch(u.toString())
  if (!r.ok) throw new Error(`Aladin ${r.status}`)
  // output=js 는 JSON 이지만 문자열 안에 제어문자(개행 등)가 섞여 파싱이 깨질 수 있어 공백으로 치환
  const text = (await r.text()).replace(/[\u0000-\u001F]/g, ' ')
  return JSON.parse(text)
}

const yearOf = (d?: string) => (d ? String(d).slice(0, 4) : '')

// "국내도서>소설/시/희곡>한국소설" → 대표 장르 1개 (앞의 국내/외국도서 제외)
function genreOf(categoryName?: string): string[] {
  if (!categoryName) return []
  const parts = String(categoryName).split('>').map((s) => s.trim()).filter(Boolean)
  const rest = parts.filter((p) => p !== '국내도서' && p !== '외국도서' && p !== 'eBook')
  return rest.length ? [rest[0]] : []
}

// "홍길동 (지은이), 김철수 (옮긴이)" → 지은이만, 역할 표기 제거
function cleanAuthor(a?: string): string {
  if (!a) return ''
  const seg = String(a).split(',').map((s) => s.trim())
  const writers = seg.filter((s) => !/(옮긴이|그림|엮은이|감수)/.test(s))
  const use = writers.length ? writers : seg
  return use.map((s) => s.replace(/\s*\(.*?\)\s*/g, '').trim()).filter(Boolean).join(', ')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    if (!KEY) return json({ error: 'ALADIN_TTB_KEY 가 설정되지 않았습니다.' }, 500)
    const { action, query, id } = await req.json()

    if (action === 'search') {
      const q = String(query ?? '').trim()
      if (!q) return json({ results: [] })
      const d = await aladin('/ItemSearch.aspx', {
        Query: q, QueryType: 'Title', SearchTarget: 'Book', MaxResults: '8', start: '1', Cover: 'MidBig',
      })
      return json({
        results: (d.item ?? [])
          .map((b: Record<string, unknown>) => ({
            id: (b.isbn13 as string) || (b.isbn as string),
            media: 'book',
            title: b.title as string,
            author: cleanAuthor(b.author as string),
            year: yearOf(b.pubDate as string),
            poster: (b.cover as string) || null,
          }))
          .filter((x: { id?: string }) => x.id),
      })
    }

    if (action === 'detail') {
      const isbn = String(id ?? '')
      const d = await aladin('/ItemLookUp.aspx', {
        ItemId: isbn, ItemIdType: isbn.length === 13 ? 'ISBN13' : 'ISBN', Cover: 'MidBig', OptResult: 'packing',
      })
      const b = (d.item ?? [])[0]
      if (!b) return json({ error: '책 정보를 찾을 수 없어요.' }, 404)
      return json({
        kind: 'book',
        title: b.title,
        poster: b.cover || null,
        author: cleanAuthor(b.author),
        publisher: b.publisher || '',
        genres: genreOf(b.categoryName),
        page_count: b.subInfo?.itemPage ?? null,
      })
    }
    return json({ error: 'bad action' }, 400)
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500)
  }
})
