// 카세트(음악) — 실제 재생은 전역 미니 플레이어(MiniPlayer)가 담당.
// 여기서는 "이 곡을 전역 플레이어로 재생" 트리거 + 현재 재생상태 반영만 한다.
import { useEffect } from 'react'
import { safeUrl } from '../lib/safeUrl'

export function parseMusicUrl(url) {
  if (!url) return null
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/|live\/))([\w-]{11})/)
  if (yt) return { kind: 'youtube', id: yt[1] }
  if (/soundcloud\.com\//.test(url)) return { kind: 'soundcloud', url }
  return null
}

const PlayIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>)
const PauseIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>)

export default function MusicPlayer({ url, player }) {
  const parsed = parseMusicUrl(url)
  // 음악 카드가 뜨면 플레이어를 미리 준비(prewarm) → 탭 시 제스처 안에서 바로 재생(iOS 무음 방지)
  useEffect(() => {
    if (parsed && player?.prewarm) player.prewarm(parsed.kind)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])
  if (!parsed) {
    const safe = safeUrl(url)
    return safe
      ? <a className="music-fallback" href={safe} target="_blank" rel="noreferrer noopener">🔗 링크 열기</a>
      : <span className="music-fallback">🔗 열 수 없는 링크</span>
  }
  const key = parsed.kind === 'youtube' ? `yt:${parsed.id}` : `sc:${parsed.url}`
  const label = parsed.kind === 'youtube' ? '유튜브 음악' : '사운드클라우드'
  const isCurrent = player?.current?.key === key
  const playing = !!(isCurrent && player?.playing)

  function tap() {
    player?.playTrack?.({ key, kind: parsed.kind, id: parsed.id, url: parsed.url, label })
  }

  return (
    <div className="music-player">
      <button type="button" className={`music-play ${playing ? 'on' : ''}`} onClick={tap}
        aria-label={playing ? '일시정지' : '재생'}>
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <div className="music-meta">
        <span className="music-label">{label}</span>
        <span className="music-sub">{playing ? '재생 중…' : '탭해서 듣기'}</span>
      </div>
    </div>
  )
}
