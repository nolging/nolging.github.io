import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

// 유튜브 IFrame API 싱글턴 로더
let ytApiPromise = null
function loadYT() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT)
  if (ytApiPromise) return ytApiPromise
  ytApiPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => { prev && prev(); resolve(window.YT) }
    const s = document.createElement('script')
    s.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(s)
  })
  return ytApiPromise
}

// 사운드클라우드 Widget API 싱글턴 로더
let scApiPromise = null
function loadSC() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  if (window.SC && window.SC.Widget) return Promise.resolve(window.SC)
  if (scApiPromise) return scApiPromise
  scApiPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://w.soundcloud.com/player/api.js'
    s.onload = () => resolve(window.SC)
    s.onerror = reject
    document.head.appendChild(s)
  })
  return scApiPromise
}

const PlayIcon = () => (<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>)
const PauseIcon = () => (<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>)
const CloseIcon = () => (<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></svg>)

// 전역(앱 상단에 항상 마운트) 미니 플레이어. 페이지 이동/모달 닫기와 무관하게 재생 유지.
export default forwardRef(function MiniPlayer({ onState }, ref) {
  const [track, setTrack] = useState(null)   // { key, kind, id, url, label }
  const [playing, setPlaying] = useState(false)
  const ytRef = useRef(null)      // YT.Player 인스턴스
  const ytHostRef = useRef(null)  // 유튜브 플레이어가 들어갈 div
  const scRef = useRef(null)      // SC.Widget 인스턴스
  const scIframeRef = useRef(null)
  const trackRef = useRef(null)
  trackRef.current = track
  const playingRef = useRef(false)
  playingRef.current = playing

  useEffect(() => { onState?.({ current: track, playing }) }, [track, playing, onState])

  // ---- 유튜브 ----
  function ytPlay(id) {
    loadYT().then((YT) => {
      if (ytRef.current && ytRef.current.loadVideoById) {
        ytRef.current.loadVideoById(id)
        ytRef.current.playVideo?.()
      } else {
        ytRef.current = new YT.Player(ytHostRef.current, {
          videoId: id,
          playerVars: { playsinline: 1, rel: 0 },
          events: {
            onReady: (e) => e.target.playVideo(),
            onStateChange: (e) => {
              if (e.data === YT.PlayerState.PLAYING) setPlaying(true)
              else if (e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.ENDED) setPlaying(false)
            },
          },
        })
      }
    }).catch(() => {})
  }
  function ytToggle() {
    const p = ytRef.current
    if (!p) return
    if (playingRef.current) p.pauseVideo?.(); else p.playVideo?.()
  }
  function ytStop() { try { ytRef.current?.pauseVideo?.() } catch { /* noop */ } }

  // ---- 사운드클라우드 ----
  function scPlay(url) {
    const src = `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}`
      + '&auto_play=true&visual=false&hide_related=true&show_comments=false&show_user=false&show_reposts=false'
    if (scIframeRef.current) scIframeRef.current.src = src
    loadSC().then((SC) => {
      if (!scIframeRef.current) return
      scRef.current = SC.Widget(scIframeRef.current)
      const w = scRef.current
      w.bind(SC.Widget.Events.READY, () => {
        w.play()
        w.bind(SC.Widget.Events.PLAY, () => setPlaying(true))
        w.bind(SC.Widget.Events.PAUSE, () => setPlaying(false))
        w.bind(SC.Widget.Events.FINISH, () => setPlaying(false))
      })
    }).catch(() => {})
  }
  function scToggle() { const w = scRef.current; if (!w) return; if (playingRef.current) w.pause(); else w.play() }
  function scStop() { try { scRef.current?.pause() } catch { /* noop */ } }

  function toggle() {
    const t = trackRef.current; if (!t) return
    if (t.kind === 'youtube') ytToggle(); else scToggle()
  }
  function close() {
    ytStop(); scStop(); setPlaying(false); setTrack(null)
  }

  useImperativeHandle(ref, () => ({
    play(t) {
      const cur = trackRef.current
      if (cur && cur.key === t.key) { toggle(); return }   // 같은 곡 → 토글
      ytStop(); scStop()                                    // 다른 곡 → 기존 정지
      setTrack(t); setPlaying(true)                         // 낙관적 표시
      if (t.kind === 'youtube') ytPlay(t.id); else scPlay(t.url)
    },
    close,
  }), [])

  return (
    <>
      {/* 화면 밖 실제 플레이어 (항상 마운트 → 이동해도 재생 유지, 소리만) */}
      <div className="mini-hosts" aria-hidden="true">
        <div ref={ytHostRef} />
        <iframe ref={scIframeRef} title="soundcloud" width="100%" height="80" allow="autoplay" />
      </div>
      {track && (
        <div className="mini-player">
          <button type="button" className="mini-play" onClick={toggle} aria-label={playing ? '일시정지' : '재생'}>
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button type="button" className="mini-close" onClick={close} aria-label="닫기" title="닫기"><CloseIcon /></button>
        </div>
      )}
    </>
  )
})
