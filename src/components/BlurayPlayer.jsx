// 블루레이: 전역 영상 플레이어 (페이지 이동/쪽지 닫아도 재생 유지 + 인앱 PIP).
// - full 모드: 미니멀 시네마(다크) 전체 화면 오버레이 (시안 1d). 화면 클릭 → 재생/일시정지.
//   상단 우측 최소화(→PIP)·닫기 버튼, 하단 재생/일시정지·스크럽바·시간.
// - pip  모드: 우하단 플로팅 카드 (시안 1e). 확대(→full)·닫기 버튼, 가운데 재생/일시정지, 하단 진행바.
// 유튜브 iframe 은 한 번만 생성해 재부모화하지 않고 CSS 로만 full↔pip 위치/크기를 바꾼다(리로드 방지).
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { loadYT, parseVideoUrl } from '../lib/youtube'

const PlayGlyph = ({ s = 22 }) => (<svg width={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>)
const PauseGlyph = ({ s = 18 }) => (<svg width={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>)
const ExpandGlyph = () => (<svg width="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>)
const MinGlyph = () => (<svg width="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 3H3v6M21 15v6h-6M3 3l7 7M21 21l-7-7" /></svg>)
const CloseGlyph = () => (<svg width="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>)

function fmt(t) {
  if (!isFinite(t) || t < 0) t = 0
  t = Math.floor(t)
  const m = Math.floor(t / 60), s = t % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default forwardRef(function BlurayPlayer(_props, ref) {
  const [mode, setMode] = useState(null)   // null | 'full' | 'pip'
  const [playing, setPlaying] = useState(false)
  const [prog, setProg] = useState({ pos: 0, dur: 0 })
  const ytRef = useRef(null)
  const hostRef = useRef(null)
  const curIdRef = useRef(null)
  const playingRef = useRef(false); playingRef.current = playing

  // 진행 상태 폴링 (재생 중일 때만)
  useEffect(() => {
    if (!mode || !playing) return
    const iv = setInterval(() => {
      const p = ytRef.current
      if (!p || !p.getCurrentTime) return
      setProg({ pos: p.getCurrentTime() || 0, dur: p.getDuration() || 0 })
    }, 500)
    return () => clearInterval(iv)
  }, [mode, playing])

  function ensurePlayer(id) {
    if (ytRef.current?.loadVideoById) {
      if (curIdRef.current !== id) ytRef.current.loadVideoById(id)
      ytRef.current.playVideo?.()
      curIdRef.current = id
      return
    }
    curIdRef.current = id
    loadYT().then((YT) => {
      if (!hostRef.current) return
      if (ytRef.current?.loadVideoById) { ytRef.current.loadVideoById(id); ytRef.current.playVideo?.(); return }
      ytRef.current = new YT.Player(hostRef.current, {
        videoId: id,
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1, controls: 0, fs: 0, iv_load_policy: 3 },
        events: {
          onReady: (e) => { e.target.playVideo(); setProg({ pos: 0, dur: e.target.getDuration?.() || 0 }) },
          onStateChange: (e) => {
            if (e.data === YT.PlayerState.PLAYING) setPlaying(true)
            else if (e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.ENDED) setPlaying(false)
          },
        },
      })
    }).catch(() => {})
  }

  function toggle() {
    const p = ytRef.current; if (!p) return
    if (playingRef.current) p.pauseVideo?.(); else p.playVideo?.()
  }
  function close() {
    try { ytRef.current?.stopVideo?.() } catch { /* noop */ }
    setPlaying(false); setMode(null)
  }
  function seek(e) {
    const p = ytRef.current, dur = prog.dur
    if (!p || !dur) return
    const rect = e.currentTarget.getBoundingClientRect()
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    p.seekTo?.(frac * dur, true)
    setProg((s) => ({ ...s, pos: frac * dur }))
  }

  useImperativeHandle(ref, () => ({
    open(url) {
      const parsed = parseVideoUrl(url)
      if (!parsed) return
      setMode('full')
      setPlaying(true)
      ensurePlayer(parsed.id)
    },
  }), [])

  useEffect(() => () => { try { ytRef.current?.destroy?.() } catch { /* noop */ } }, [])

  const w = prog.dur ? `${Math.min(100, (prog.pos / prog.dur) * 100)}%` : '0%'

  return createPortal(
    <div className={`bluray-stage bluray-${mode || 'off'}`}>
      <div className="bluray-shell">
        <div className="bluray-box" onClick={toggle} role="button" tabIndex={-1}>
          <div ref={hostRef} className="bluray-yt" />
          <div className="bluray-vig" />
          {mode && !playing && (
            <span className="bluray-playbig" aria-hidden="true"><PlayGlyph s={mode === 'pip' ? 17 : 22} /></span>
          )}
          {mode === 'pip' && (
            <div className="bluray-pip-top">
              <button type="button" className="bluray-rnd" onClick={(e) => { e.stopPropagation(); setMode('full') }} aria-label="확대" title="확대"><ExpandGlyph /></button>
              <button type="button" className="bluray-rnd" onClick={(e) => { e.stopPropagation(); close() }} aria-label="닫기" title="닫기"><CloseGlyph /></button>
            </div>
          )}
          {mode === 'pip' && <div className="bluray-pip-bar"><div className="bluray-pip-fill" style={{ width: w }} /></div>}
        </div>

        {mode === 'full' && (
          <div className="bluray-ctrl">
            <button type="button" className="bluray-pp" onClick={toggle} aria-label={playing ? '일시정지' : '재생'}>
              {playing ? <PauseGlyph /> : <PlayGlyph s={18} />}
            </button>
            <div className="bluray-bar" onClick={seek}>
              <div className="bluray-fill" style={{ width: w }} />
              <span className="bluray-knob" style={{ left: w }} />
            </div>
            <span className="bluray-time">{fmt(prog.pos)} / {fmt(prog.dur)}</span>
          </div>
        )}
      </div>

      {mode === 'full' && (
        <div className="bluray-top">
          <button type="button" className="bluray-rnd bluray-rnd-lg" onClick={() => setMode('pip')} aria-label="작게 보기" title="작게 보기"><MinGlyph /></button>
          <button type="button" className="bluray-rnd bluray-rnd-lg" onClick={close} aria-label="닫기" title="닫기"><CloseGlyph /></button>
        </div>
      )}
    </div>,
    document.body,
  )
})
