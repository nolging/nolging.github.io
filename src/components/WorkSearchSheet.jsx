import { useEffect, useState } from 'react'
import BottomSheet from './BottomSheet'
import { searchMedia, getMediaDetail } from '../lib/api'
import { workNoun, catMeta, catChipStyle, catChipEmoji } from '../lib/constants'

function resultSub(it, category) {
  if (category === '독서') return it.author || ''
  if (category === '게임') return it.year || ''
  return [it.year, it.media === 'tv' ? '시리즈' : '영화'].filter(Boolean).join(' · ')
}

// 유형별 검색 주의 문구
const SEARCH_WARN = {
  OTT: '제공처에 쿠팡플레이는 누락될 수 있어요',
  영화: '현재 상영 중인 영화만 검색돼요',
  게임: '영문으로 검색해야 정확해요',
  독서: '한글 제목으로 검색해 주세요',
}

// 작품/도서/게임 검색 바텀시트 (시안 11c). 선택 후 상세를 가져와 onPick(info).
export default function WorkSearchSheet({ open, onClose, category, cats, initialQuery = '', onPick }) {
  const meta = catMeta(cats, category)
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState(null) // null=미검색
  const [selected, setSelected] = useState(null)
  const [busy, setBusy] = useState(false)     // 검색 중
  const [picking, setPicking] = useState(false) // 상세 가져오는 중
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) { setQuery(initialQuery); setResults(null); setSelected(null); setError(''); setBusy(false); setPicking(false) }
  }, [open, initialQuery])

  const noun = workNoun(category)

  async function doSearch() {
    if (!query.trim() || busy) return
    setBusy(true); setError(''); setResults(null); setSelected(null)
    try { setResults(await searchMedia(query.trim(), category)) }
    catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  async function confirm() {
    if (!selected || picking) return
    setPicking(true); setError('')
    try {
      const info = await getMediaDetail(selected.id, selected.media, category)
      onPick(info)
      onClose()
    } catch (err) { setError(err.message); setPicking(false) }
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="ws">
        <div className="ws-head">
          <div className="ws-title">{noun} 검색</div>
          <span className="ws-cat" style={catChipStyle(meta)}><span aria-hidden="true">{catChipEmoji(meta)}</span>{category}</span>
        </div>

        {SEARCH_WARN[category] && (
          <p className="ws-warn">
            <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><line x1="12" y1="8" x2="12" y2="13" /><line x1="12" y1="16.5" x2="12" y2="16.6" /></svg>
            {SEARCH_WARN[category]}
          </p>
        )}

        <div className="ws-search">
          <svg width="17" viewBox="0 0 24 24" fill="none" stroke="#47444f" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); doSearch() } }}
            placeholder={`${noun} 제목을 검색하세요`} autoFocus />
        </div>
        <button type="button" className="ws-fetch" onClick={doSearch} disabled={!query.trim() || busy}>
          <svg width="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36" /><polyline points="21 3 21 9 15 9" /></svg>
          {busy ? '불러오는 중…' : '정보 가져오기'}
        </button>

        {error && <p className="field-error ws-err">{error}</p>}

        {results && (
          <>
            <div className="ws-count"><span>검색 결과</span><span className="ws-count-n">{results.length}</span></div>
            <div className="ws-list" onTouchStart={(e) => e.stopPropagation()} onTouchMove={(e) => e.stopPropagation()}>
              {results.length === 0 ? (
                <p className="ws-empty">검색 결과가 없어요. 제목을 확인해 주세요.</p>
              ) : results.map((it) => {
                const sel = selected && selected.id === it.id && selected.media === it.media
                return (
                  <button type="button" key={`${it.media}-${it.id}`}
                    className={`ws-item ${sel ? 'sel' : ''}`} onClick={() => setSelected(it)}>
                    {it.poster
                      ? <img src={it.poster} alt="" className="ws-item-poster" />
                      : <span className="ws-item-poster ws-item-poster-empty" aria-hidden="true">{catChipEmoji(meta)}</span>}
                    <span className="ws-item-info">
                      <span className="ws-item-title">{it.title}</span>
                      {resultSub(it, category) && <span className="ws-item-sub">{resultSub(it, category)}</span>}
                    </span>
                    <span className={`ws-radio ${sel ? 'on' : ''}`} aria-hidden="true">
                      {sel && <svg width="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                    </span>
                  </button>
                )
              })}
            </div>
          </>
        )}

        <button type="button" className="ws-pick" onClick={confirm} disabled={!selected || picking}>
          {picking ? '불러오는 중…' : `이 ${noun} 선택`}
        </button>
      </div>
    </BottomSheet>
  )
}
