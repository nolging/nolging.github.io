import { useEffect, useRef, useState } from 'react'

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

export function parseMusicUrl(url) {
  if (!url) return null
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/|live\/))([\w-]{11})/)
  if (yt) return { kind: 'youtube', id: yt[1] }
  if (/soundcloud\.com\//.test(url)) return { kind: 'soundcloud', url }
  return null
}

// 유튜브 오디오 모드: 영상 iframe 은 투명 처리(소리만), 썸네일을 앨범아트로 + 재생 버튼
function YouTubeAudio({ id }) {
  const hostRef = useRef(null)
  const playerRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    let dead = false
    loadYT().then((YT) => {
      if (dead || !hostRef.current) return
      playerRef.current = new YT.Player(hostRef.current, {
        videoId: id,
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
        events: {
          onReady: () => { if (!dead) setReady(true) },
          onStateChange: (e) => { if (!dead) setPlaying(e.data === YT.PlayerState.PLAYING) },
        },
      })
    }).catch(() => {})
    return () => { dead = true; try { playerRef.current?.destroy() } catch { /* noop */ } }
  }, [id])

  function toggle() {
    const p = playerRef.current
    if (!p) return
    if (playing) p.pauseVideo(); else p.playVideo()
  }

  return (
    <div className="music-player">
      <div className="music-thumb" style={{ backgroundImage: `url(https://i.ytimg.com/vi/${id}/hqdefault.jpg)` }} />
      <button type="button" className={`music-play ${playing ? 'on' : ''}`} onClick={toggle} disabled={!ready}
        aria-label={playing ? '일시정지' : '재생'}>
        {playing ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
        )}
      </button>
      <div className="music-meta">
        <span className="music-label">🎵 유튜브 음악</span>
        <span className="music-sub">{ready ? (playing ? '재생 중…' : '탭해서 듣기') : '불러오는 중…'}</span>
      </div>
      {/* 영상은 숨기고 소리만: DOM 에는 있어야 재생됨 → 화면 밖 배치 */}
      <div className="music-yt-host" aria-hidden="true"><div ref={hostRef} /></div>
    </div>
  )
}

function SoundCloudPlayer({ url }) {
  const src = `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}`
    + '&color=%237363e8&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&visual=false'
  return (
    <div className="music-sc">
      <iframe title="SoundCloud" width="100%" height="120" scrolling="no" frameBorder="no" allow="autoplay" src={src} />
    </div>
  )
}

export default function MusicPlayer({ url }) {
  const parsed = parseMusicUrl(url)
  if (!parsed) {
    return <a className="music-fallback" href={url} target="_blank" rel="noreferrer noopener">🔗 링크 열기</a>
  }
  if (parsed.kind === 'youtube') return <YouTubeAudio id={parsed.id} />
  return <SoundCloudPlayer url={parsed.url} />
}
