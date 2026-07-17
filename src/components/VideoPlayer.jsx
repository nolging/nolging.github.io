// 비디오 테이프: 레트로 브라운관(CRT) TV 로 유튜브 영상 재생.
// - 처음엔 화면이 꺼져(까맣) 있고, 우측 하단 전원 버튼을 눌러야 켜지고 재생 시작.
// - 켜진 뒤 화면을 누르면 일시정지/재생. 전원 버튼을 다시 누르면 꺼짐(까맣게 + 정지).
// - 화면엔 스캔라인/지직거림 오버레이. (PIP 미지원 — 쪽지를 닫으면 언마운트되어 영상도 꺼짐)
import { useEffect, useRef, useState } from 'react'
import { safeUrl } from '../lib/safeUrl'
import { loadYT, parseVideoUrl } from '../lib/youtube'

export { parseVideoUrl }

const PowerGlyph = () => (
  <svg width="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="12" y1="3.5" x2="12" y2="12" /><path d="M7.4 6.6a7 7 0 1 0 9.2 0" />
  </svg>
)
const PlayGlyph = () => (<svg width="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>)

export default function VideoPlayer({ url }) {
  const parsed = parseVideoUrl(url)
  const [on, setOn] = useState(false)
  const [playing, setPlaying] = useState(false)
  const ytRef = useRef(null)
  const hostRef = useRef(null)
  const playingRef = useRef(false); playingRef.current = playing

  // 플레이어를 미리 생성해 둔다(대기). → 전원 버튼 탭 '제스처 안에서' 바로 재생 가능
  //   (모바일 자동재생 차단 회피). 자막(cc) 끔, 컨트롤/타이틀/추천 최소화.
  useEffect(() => {
    if (!parsed || parsed.kind !== 'youtube') return
    let cancelled = false
    loadYT().then((YT) => {
      if (cancelled || !hostRef.current || ytRef.current) return
      ytRef.current = new YT.Player(hostRef.current, {
        videoId: parsed.id,
        playerVars: {
          playsinline: 1, rel: 0, modestbranding: 1, controls: 0, fs: 0,
          iv_load_policy: 3, cc_load_policy: 0, disablekb: 1, showinfo: 0,
        },
        events: {
          // 자막(cc) 모듈은 재생이 시작돼 로드된 뒤 unload 해야 확실히 꺼진다 → onApiChange.
          onApiChange: (e) => { try { e.target.unloadModule('captions'); e.target.unloadModule('cc') } catch { /* noop */ } },
          onReady: (e) => { try { e.target.unloadModule('captions'); e.target.unloadModule('cc') } catch { /* noop */ } },
          onStateChange: (e) => {
            if (e.data === YT.PlayerState.PLAYING) {
              setPlaying(true)
              try { e.target.unloadModule('captions'); e.target.unloadModule('cc') } catch { /* noop */ }
            } else if (e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.ENDED) setPlaying(false)
          },
        },
      })
    }).catch(() => {})
    return () => { cancelled = true }
  }, [parsed?.id])

  useEffect(() => () => { try { ytRef.current?.destroy?.() } catch { /* noop */ } }, [])

  // 전원 ON → 즉시 재생(제스처 안에서), OFF → 정지 + 까맣게
  function powerToggle(e) {
    e.stopPropagation()
    setOn((o) => {
      const next = !o
      const p = ytRef.current
      if (next) { try { p?.playVideo?.() } catch { /* noop */ } }
      else { try { p?.pauseVideo?.() } catch { /* noop */ } setPlaying(false) }
      return next
    })
  }
  function screenClick() {
    if (!on) return
    const p = ytRef.current; if (!p) return
    if (playingRef.current) p.pauseVideo?.(); else p.playVideo?.()
  }

  if (!parsed) {
    const safe = safeUrl(url)
    return safe
      ? <a className="music-fallback" href={safe} target="_blank" rel="noreferrer noopener">🔗 링크 열기</a>
      : <span className="music-fallback">🔗 열 수 없는 링크</span>
  }

  return (
    <div className="crt">
      <div className="crt-antenna"><span /><span /></div>
      <div className="crt-body">
        <div className="crt-screen-frame">
          <div className={`crt-screen ${on ? 'on' : 'off'}`} onClick={screenClick} role="button" tabIndex={0}>
            <div ref={hostRef} className="crt-yt" />
            {on && <>
              <div className="crt-scan" />
              <div className="crt-sweep" />
              <div className="crt-vig" />
              {!playing && <span className="crt-play"><PlayGlyph /></span>}
            </>}
            {!on && <div className="crt-dark" />}
          </div>
        </div>
        <div className="crt-panel">
          <div className="crt-brand">NOLGING</div>
          <div className="crt-ch"><span className="crt-led" style={{ background: on ? '#5fd08a' : '#c34a4a' }} />CH 01</div>
          <span className="crt-knob crt-knob-lg"><i /></span>
          <span className="crt-knob"><i /></span>
          <button type="button" className="crt-power" onClick={powerToggle} aria-label="전원" title="전원"><PowerGlyph /></button>
        </div>
      </div>
      <div className="crt-feet"><span /><span /></div>
    </div>
  )
}
