// 이어폰(음악 선물) — 쪽지에서 볼 때의 아이팟 감성 플레이어(시안 1b).
// 실제 재생은 전역 미니 플레이어(MiniPlayer)가 담당하고, 여기서는 트리거 + 상태(재생/진행) 반영만 한다.
import { useEffect } from 'react'
import { safeUrl } from '../lib/safeUrl'

export function parseMusicUrl(url) {
  if (!url) return null
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/|live\/))([\w-]{11})/)
  if (yt) return { kind: 'youtube', id: yt[1] }
  // soundcloud.com/… 정식 링크 + on.soundcloud.com·snd.sc 단축 공유 링크
  if (/soundcloud\.com\/|snd\.sc\//i.test(url)) return { kind: 'soundcloud', url }
  return null
}

const fmt = (t) => { if (!isFinite(t) || t < 0) t = 0; t = Math.floor(t); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0') }
// 높이는 cqw(212px 기준 px×0.4717) — 본체 폭에 비례 확대
const EQ = [{ h: 3.30, d: '0s' }, { h: 6.13, d: '-.2s' }, { h: 2.83, d: '-.35s' }, { h: 5.19, d: '-.12s' }]

const PlayGlyph = () => (<svg width="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>)
const PauseGlyph = () => (<svg width="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>)
const PrevGlyph = () => (<svg width="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11 6L2 12l9 6zM20 6l-9 6 9 6z" /></svg>)
const NextGlyph = () => (<svg width="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 6l9 6-9 6zM4 6l9 6-9 6z" /></svg>)

// title: "{닉네임} 님의 음악 선물"(익명이면 닉네임 자리에 '익명'). sub 은 링크 종류로 자동(Youtube / SoundCloud).
export default function MusicPlayer({ url, player, title = '음악 선물' }) {
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

  const sub = parsed.kind === 'youtube' ? 'Youtube' : 'SoundCloud'
  const key = parsed.kind === 'youtube' ? `yt:${parsed.id}` : `sc:${parsed.url}`
  const isCurrent = player?.current?.key === key
  const playing = !!(isCurrent && player?.playing)
  const pos = isCurrent ? (player?.pos || 0) : 0
  const dur = isCurrent ? (player?.dur || 0) : 0
  const pct = dur ? Math.max(0, Math.min(100, (pos / dur) * 100)) : 0

  const track = { key, kind: parsed.kind, id: parsed.id, url: parsed.url, label: sub, title, sub }
  const tap = () => { if (isCurrent) player?.toggle?.(); else player?.playTrack?.(track) }
  const restart = () => { if (isCurrent) player?.restart?.(); else player?.playTrack?.(track) }

  return (
    <div className="ipod">
      <div className="ipod-body">
        <div className="ipod-screen">
          <div className="ipod-screen-top"><span>1 of 1</span><span className="ipod-batt">▮▮▯</span></div>
          <div className="ipod-now">
            <div className="ipod-cover" aria-hidden="true">♫</div>
            <div className="ipod-info">
              <div className="ipod-title">{title}</div>
              <div className="ipod-sub">{sub}</div>
              <div className="ipod-eq" aria-hidden="true">
                {EQ.map((b, i) => (
                  <span key={i} style={{ height: b.h + 'cqw', animationDelay: b.d, animationPlayState: playing ? 'running' : 'paused' }} />
                ))}
              </div>
            </div>
          </div>
          <div className="ipod-prog">
            <div className="ipod-prog-bar"><div className="ipod-prog-fill" style={{ width: pct + '%' }} /></div>
            <div className="ipod-prog-time"><span>{fmt(pos)}</span><span>{fmt(dur)}</span></div>
          </div>
        </div>
        <div className="ipod-wheel">
          <span className="ipod-menu">MENU</span>
          <button type="button" className="ipod-pp" onClick={tap} aria-label={playing ? '일시정지' : '재생'} title="재생/일시정지"><PlayGlyph /><PauseGlyph /></button>
          <button type="button" className="ipod-prev" onClick={restart} aria-label="처음으로" title="처음으로"><PrevGlyph /></button>
          <button type="button" className="ipod-next" onClick={restart} aria-label="처음으로" title="처음으로"><NextGlyph /></button>
          <button type="button" className="ipod-center" onClick={tap} aria-label={playing ? '일시정지' : '재생'} />
        </div>
      </div>
    </div>
  )
}
