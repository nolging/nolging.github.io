import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import MusicPlayer from './MusicPlayer'

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

const PlayIcon = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>)
const PauseIcon = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>)
const CloseIcon = () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></svg>)
const ChevL = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>)
const ChevR = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>)

// 전역(앱 상단에 항상 마운트) 미니 플레이어. 페이지 이동/모달 닫기와 무관하게 재생 유지.
export default forwardRef(function MiniPlayer({ onState }, ref) {
  const [track, setTrack] = useState(null)   // { key, kind, id, url, label, title, sub }
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0)          // 현재 재생 위치(초)
  const [dur, setDur] = useState(0)          // 전체 길이(초)
  const [view, setView] = useState('bar')    // 'bar' | 'folded'(왼쪽 책갈피) | 'ipod'(전체 아이팟)
  const [foldTop, setFoldTop] = useState(null) // 책갈피 세로 위치(px)
  const tabDragRef = useRef(null)
  const ytRef = useRef(null)      // YT.Player 인스턴스
  const ytHostRef = useRef(null)  // 유튜브 플레이어가 들어갈 div
  const scRef = useRef(null)      // SC.Widget 인스턴스
  const scIframeRef = useRef(null)
  const trackRef = useRef(null)
  trackRef.current = track
  const playingRef = useRef(false)
  playingRef.current = playing

  useEffect(() => { onState?.({ current: track, playing, pos, dur }) }, [track, playing, pos, dur, onState])

  // 재생 위치 폴링(1b 아이팟·1g 미니바의 진행바 공유)
  useEffect(() => {
    if (!track || !playing) return
    const iv = setInterval(() => {
      const t = trackRef.current; if (!t) return
      if (t.kind === 'youtube') {
        const p = ytRef.current
        if (p?.getCurrentTime) { setPos(p.getCurrentTime() || 0); setDur(p.getDuration() || 0) }
      } else {
        const w = scRef.current
        if (w?.getPosition) { w.getPosition((ms) => setPos((ms || 0) / 1000)); w.getDuration((ms) => setDur((ms || 0) / 1000)) }
      }
    }, 500)
    return () => clearInterval(iv)
  }, [track, playing])

  // ---- 유튜브 ----
  function ytStateEvents(YT) {
    return {
      onStateChange: (e) => {
        if (e.data === YT.PlayerState.PLAYING) setPlaying(true)
        else if (e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.ENDED) setPlaying(false)
      },
    }
  }
  function ytPlay(id) {
    // 이미 생성(prewarm)된 플레이어면 '탭 제스처 안에서 동기 재생' → iOS 자동재생 차단 회피.
    // (탭 후 비동기로 플레이어를 만들면 제스처가 만료돼 소리가 안 남)
    if (ytRef.current && ytRef.current.loadVideoById) {
      ytRef.current.loadVideoById(id)
      ytRef.current.playVideo?.()
      return
    }
    // 폴백: 아직 없으면 API 로드 후 생성(최초 1회). onReady 에서 재생.
    loadYT().then((YT) => {
      if (ytRef.current && ytRef.current.loadVideoById) {
        ytRef.current.loadVideoById(id); ytRef.current.playVideo?.()
      } else {
        ytRef.current = new YT.Player(ytHostRef.current, {
          videoId: id,
          playerVars: { playsinline: 1, rel: 0 },
          events: { onReady: (e) => e.target.playVideo(), ...ytStateEvents(YT) },
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
  function ytRestart() { try { ytRef.current?.seekTo?.(0, true); ytRef.current?.playVideo?.() } catch { /* noop */ } }

  // ---- 사운드클라우드 ----
  // on.soundcloud.com / snd.sc 단축 링크 → oEmbed 로 표준 트랙 URL 해석.
  // (oEmbed 는 CORS 허용(Access-Control-Allow-Origin: *) 이라 fetch 로 바로 조회 가능. JSONP 미지원)
  // 정식 링크면 즉시 통과(탭 제스처 유지). 실패 시 원본 그대로 사용.
  function scResolve(url) {
    if (!/(on\.soundcloud\.com|snd\.sc)\//i.test(url)) return Promise.resolve(url)
    return fetch(`https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const m = data && data.html && data.html.match(/[?&]url=([^"&]+)/)
        if (m) { try { return decodeURIComponent(m[1]) } catch { return m[1] } }
        return url
      })
      .catch(() => url)
  }
  function scBindState(SC, w) {
    w.bind(SC.Widget.Events.PLAY, () => setPlaying(true))
    w.bind(SC.Widget.Events.PAUSE, () => setPlaying(false))
    w.bind(SC.Widget.Events.FINISH, () => setPlaying(false))
  }
  function scPlay(rawUrl) {
    const ifr = scIframeRef.current; if (!ifr) return
    const go = (SC, url) => {
      // 위젯이 이미 있으면 트랙만 교체+재생(재부착 없이 안정적)
      if (scRef.current) {
        scRef.current.load(url, {
          auto_play: true, visual: false, hide_related: true, show_comments: false, show_user: false, show_reposts: false,
          callback: () => { try { scRef.current.play() } catch { /* noop */ } },
        })
        return
      }
      // 최초: 플레이어 src 지정(제스처 안) 후 위젯 생성 + READY 에서 재생
      ifr.src = `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}`
        + '&auto_play=true&visual=false&hide_related=true&show_comments=false&show_user=false&show_reposts=false'
      scRef.current = SC.Widget(ifr)
      const w = scRef.current
      w.bind(SC.Widget.Events.READY, () => { try { w.play() } catch { /* noop */ } })
      scBindState(SC, w)
    }
    // 단축 링크는 표준 URL 로 해석 후 재생(정식 링크면 즉시). prewarm 으로 SC 가 이미 있으면
    // 제스처 활성 창 안에서 재생 시작(자동재생 허용).
    scResolve(rawUrl).then((url) => {
      if (window.SC && window.SC.Widget) go(window.SC, url)
      else loadSC().then((SC) => go(SC, url)).catch(() => {})
    })
  }
  function scToggle() { const w = scRef.current; if (!w) return; if (playingRef.current) w.pause(); else w.play() }
  function scStop() { try { scRef.current?.pause() } catch { /* noop */ } }
  function scRestart() { try { scRef.current?.seekTo?.(0); scRef.current?.play?.() } catch { /* noop */ } }

  function toggle() {
    const t = trackRef.current; if (!t) return
    if (t.kind === 'youtube') ytToggle(); else scToggle()
  }
  function restart() {
    const t = trackRef.current; if (!t) return
    if (t.kind === 'youtube') ytRestart(); else scRestart()
    setPos(0)
  }
  function close() {
    ytStop(); scStop(); setPlaying(false); setTrack(null); setPos(0); setDur(0); setView('bar')
  }

  // 왼쪽 책갈피(folded) — 왼쪽 가장자리에 붙은 채 위아래로만 드래그. 이동 없이 탭하면 다시 펼침.
  function fold() {
    if (foldTop == null) {
      const h = typeof window !== 'undefined' ? window.innerHeight : 600
      setFoldTop(Math.max(6, Math.round(h * 0.5) - 24))
    }
    setView('folded')
  }
  function tabDown(e) {
    const r = e.currentTarget.getBoundingClientRect()
    tabDragRef.current = { sy: e.clientY, top: r.top, h: r.height, moved: false }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  function tabMove(e) {
    const d = tabDragRef.current; if (!d) return
    const dy = e.clientY - d.sy
    if (Math.abs(dy) > 3) d.moved = true
    const top = Math.min(Math.max(6, d.top + dy), (window.innerHeight || 600) - d.h - 6)
    setFoldTop(top)
  }
  function tabUp() {
    const d = tabDragRef.current; tabDragRef.current = null
    if (d && !d.moved) setView('bar') // 탭 → 펼치기
  }

  useImperativeHandle(ref, () => ({
    play(t) {
      const cur = trackRef.current
      if (cur && cur.key === t.key) { toggle(); return }   // 같은 곡 → 토글
      ytStop(); scStop()                                    // 다른 곡 → 기존 정지
      setTrack(t); setPlaying(true); setPos(0); setDur(0); setView('bar')   // 낙관적 표시
      if (t.kind === 'youtube') ytPlay(t.id); else scPlay(t.url)
    },
    toggle,
    restart,
    // 음악 카드가 화면에 뜰 때 미리 호출 → 재생 버튼 탭 시 제스처 안에서 바로 소리가 나게.
    // 유튜브: idle 플레이어를 미리 만들어 두어, 탭 시 loadVideoById+playVideo 를 동기 실행.
    prewarm(kind) {
      if (kind === 'soundcloud') { loadSC().catch(() => {}); return }
      loadYT().then((YT) => {
        if (!ytRef.current && ytHostRef.current) {
          ytRef.current = new YT.Player(ytHostRef.current, {
            playerVars: { playsinline: 1, rel: 0 },
            events: ytStateEvents(YT),
          })
        }
      }).catch(() => {})
    },
    close,
  }), [])

  return (
    <>
      {/* 화면 밖 실제 플레이어 (항상 마운트 → 이동해도 재생 유지, 소리만) */}
      <div className="mini-hosts" aria-hidden="true">
        <div ref={ytHostRef} />
        <iframe ref={scIframeRef} title="soundcloud" width="300" height="80" allow="autoplay; encrypted-media" />
      </div>
      {/* 미니바: 왼쪽=진행 링을 두른 재생/일시정지, 가운데=제목/가수, 오른쪽=접기(<)·닫기(X).
          버튼 외 영역 탭 → 전체 아이팟 열기 */}
      {track && view === 'bar' && (() => {
        const pct = dur ? Math.max(0, Math.min(100, (pos / dur) * 100)) : 0
        return (
          <div className="mini-player" onClick={() => setView('ipod')} role="button" tabIndex={-1}>
            <div className="mini-ring" style={{ '--pct': pct + '%' }}>
              <button type="button" className="mini-play" onClick={(e) => { e.stopPropagation(); toggle() }} aria-label={playing ? '일시정지' : '재생'}>
                {playing ? <PauseIcon /> : <PlayIcon />}
              </button>
            </div>
            <div className="mini-meta">
              <div className="mini-title">{track.title || track.label}</div>
              <div className="mini-sub">{track.sub || track.label}</div>
            </div>
            <button type="button" className="mini-fold" onClick={(e) => { e.stopPropagation(); fold() }} aria-label="접기" title="접기"><ChevL /></button>
            <button type="button" className="mini-close" onClick={(e) => { e.stopPropagation(); close() }} aria-label="닫기" title="닫기"><CloseIcon /></button>
          </div>
        )
      })()}

      {/* 왼쪽 책갈피(folded): 화면 왼쪽 가장자리, 오른쪽 두 모서리만 둥근 정사각형. 드래그(세로)로 이동, 탭하면 펼침 */}
      {track && view === 'folded' && (
        <div className="mini-tab" style={foldTop != null ? { top: foldTop } : undefined}
          onPointerDown={tabDown} onPointerMove={tabMove} onPointerUp={tabUp} onPointerCancel={tabUp}
          role="button" tabIndex={-1} aria-label="미니 플레이어 펼치기" title="펼치기">
          <ChevR />
        </div>
      )}

      {/* 전체 아이팟(쪽지 없이 단독). 배경 탭하면 다시 미니바로 */}
      {track && view === 'ipod' && (
        <div className="mini-ipod-back" onClick={() => setView('bar')}>
          <div className="mini-ipod-wrap" onClick={(e) => e.stopPropagation()}>
            <MusicPlayer url={track.url} title={track.title}
              player={{ current: track, playing, pos, dur, toggle, restart, playTrack: () => toggle(), prewarm: () => {} }} />
          </div>
        </div>
      )}
    </>
  )
})
