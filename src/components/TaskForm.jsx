import { useState } from 'react'
import { WISH_CATEGORIES, categoryStyle, categoryEmoji, MEDIA_LOOKUP_CATS } from '../lib/constants'
import { searchMedia, getMediaDetail } from '../lib/api'
import MediaInfo from './MediaInfo'

const MEDIA_CATS = MEDIA_LOOKUP_CATS // 정보 가져오기 지원 유형
// 유형별 버튼 이모지 / 안내 문구
const MEDIA_UI = {
  OTT: { emoji: '🎬', hint: '쿠팡플레이는 OTT 정보에 포함되지 않아요.' },
  '영화': { emoji: '🎬', hint: '현재 극장 상영 중인 영화만 검색돼요.' },
  '독서': { emoji: '📚', hint: '국내 도서를 제목으로 검색해요.' },
  '게임': { emoji: '🎮', hint: '영문 제목이 더 정확히 검색돼요.' },
}

// 위시 작성/편집 공용 폼. onSubmit(values) 는 저장(생성/수정)을 처리하고
// 성공 시 페이지 이동을 담당한다. (실패 시 throw)
export default function TaskForm({ initial = {}, submitLabel, onSubmit }) {
  const [title, setTitle] = useState(initial.title || '')
  const [category, setCategory] = useState(initial.category || '')
  const [mediaInfo, setMediaInfo] = useState(initial.media_info || null)
  const [results, setResults] = useState(null) // null=미검색, []=결과목록
  const [lookupBusy, setLookupBusy] = useState(false)
  const [lookupErr, setLookupErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const mediaCat = MEDIA_CATS.includes(category)

  function pickCategory(c) {
    const next = category === c ? '' : c
    setCategory(next)
    if (!MEDIA_CATS.includes(next)) { setMediaInfo(null); setResults(null); setLookupErr('') }
  }

  async function doSearch() {
    if (!title.trim()) return
    setLookupBusy(true); setLookupErr(''); setResults(null)
    try {
      setResults(await searchMedia(title.trim(), category))
    } catch (err) { setLookupErr(err.message) } finally { setLookupBusy(false) }
  }
  async function pickResult(item) {
    setLookupBusy(true); setLookupErr('')
    try { setMediaInfo(await getMediaDetail(item.id, item.media, category)); setResults(null) }
    catch (err) { setLookupErr(err.message) } finally { setLookupBusy(false) }
  }

  // 검색 결과 부제(유형별)
  function resultSub(it) {
    if (category === '독서') return it.author || ''
    if (category === '게임') return it.year || ''
    return [it.year, it.media === 'tv' ? '시리즈' : '영화'].filter(Boolean).join(' · ')
  }

  async function submit(e) {
    e.preventDefault()
    if (!title.trim()) return
    setBusy(true); setError('')
    try {
      await onSubmit({
        title: title.trim(),
        description: '',
        category: category || null,
        media_info: mediaCat ? mediaInfo : null,
      })
    } catch (err) { setError(err.message); setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="form">
      <div className="chip-row">
        {WISH_CATEGORIES.map((c) => (
          <button type="button" key={c} className={`chip ${category === c ? 'active' : ''}`}
            style={category === c ? categoryStyle(c) : undefined}
            onClick={() => pickCategory(c)}>
            <span className="cat-chip-emoji" aria-hidden="true">{categoryEmoji(c)}</span>{c}</button>
        ))}
      </div>

      <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목" />

      {mediaCat && (
        <div className="media-lookup">
          {!mediaInfo && (
            <>
              <button type="button" className="btn btn-block" disabled={!title.trim() || lookupBusy} onClick={doSearch}>
                {lookupBusy ? '불러오는 중…' : `${MEDIA_UI[category]?.emoji ?? '🔎'} 정보 가져오기`}
              </button>
              <p className="muted sm" style={{ margin: '2px 2px 0' }}>
                {MEDIA_UI[category]?.hint}
              </p>
            </>
          )}
          {lookupErr && <p className="field-error">{lookupErr}</p>}

          {results && (
            <div className="media-results">
              {results.length === 0 ? (
                <p className="muted sm" style={{ padding: '4px 2px' }}>검색 결과가 없어요. 제목을 확인해 주세요.</p>
              ) : results.map((it) => (
                <button type="button" key={`${it.media}-${it.id}`} className="media-result" onClick={() => pickResult(it)}>
                  {it.poster
                    ? <img src={it.poster} alt="" className="media-poster" />
                    : <span className="media-poster media-poster-empty" aria-hidden="true">{MEDIA_UI[category]?.emoji ?? '🎬'}</span>}
                  <span className="media-result-info">
                    <span className="media-result-title">{it.title}</span>
                    <span className="muted sm">{resultSub(it)}</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {mediaInfo && <MediaInfo category={category} info={mediaInfo} onClear={() => setMediaInfo(null)} />}
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}
      <button className="btn btn-primary btn-block" disabled={busy}>{busy ? '저장 중…' : submitLabel}</button>
    </form>
  )
}
