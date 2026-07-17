// 블루레이: 전역 영상 플레이어. 쪽지 안(슬롯)에서 인라인으로 재생하고,
// 작게(PIP) 띄우면 앱 위를 떠다니며 쪽지를 닫아도 재생이 유지된다.
// - inline: 쪽지 안 슬롯 위에 딱 맞게 겹쳐 재생(창을 새로 열지 않음). 화면 탭 → 재생/일시정지.
// - pip   : 우하단 플로팅(시안 1e). 확대→인라인(슬롯 있으면)/전체화면, 닫기.
// - full  : 슬롯이 없을 때(쪽지를 닫은 상태)의 확대 보기.
// 유튜브 iframe 은 한 번만 생성해 재부모화하지 않고 위치/크기만 바꾼다(리로드 방지).
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { loadYT, parseVideoUrl } from '../lib/youtube'

const PlayGlyph = ({ s = 22 }) => (<svg width={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>)
const PauseGlyph = ({ s = 18 }) => (<svg width={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>)
const ExpandGlyph = () => (<svg width="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>)
const MinGlyph = () => (<svg width="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 3H3v6M21 15v6h-6M3 3l7 7M21 21l-7-7" /></svg>)
const CloseGlyph = () => (<svg width="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>)

// 쪽지 안에 놓는 인라인 슬롯(플레이어가 이 위에 겹쳐 렌더). 언마운트 시 반납.
export function BluraySlot({ url, player }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    player?.mount?.(url, el)
    return () => player?.release?.(el)
  }, [url]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="bluray-slot" ref={ref}>
      <div className="bluray-slot-vid"><span className="bluray-slot-hint"><PlayGlyph s={16} /> 블루레이</span></div>
      <div className="bluray-slot-bar" />
    </div>
  )
}

export default forwardRef(function BlurayPlayer(_props, ref) {
  const [mode, setMode] = useState(null)   // null | 'inline' | 'pip' | 'full'
  const [playing, setPlaying] = useState(false)
  const [prog, setProg] = useState({ pos: 0, dur: 0 })
  const [rect, setRect] = useState(null)   // inline: 슬롯 위치/크기
  const [pipPos, setPipPos] = useState(null) // pip: 사용자가 드래그로 옮긴 위치({left,top}px)
  const ytRef = useRef(null)
  const hostRef = useRef(null)
  const slotRef = useRef(null)             // 현재 인라인 슬롯 엘리먼트
  const curIdRef = useRef(null)
  const rectRef = useRef(null)
  const rafRef = useRef(0)
  const dragRef = useRef(null)             // pip 드래그 상태
  const playingRef = useRef(false); playingRef.current = playing

  // 진행 상태 폴링
  useEffect(() => {
    if (!mode || !playing) return
    const iv = setInterval(() => {
      const p = ytRef.current
      if (p?.getCurrentTime) setProg({ pos: p.getCurrentTime() || 0, dur: p.getDuration() || 0 })
    }, 500)
    return () => clearInterval(iv)
  }, [mode, playing])

  // inline: 매 프레임 슬롯 위치를 따라감(스크롤/레이아웃 변화 추적)
  useEffect(() => {
    if (mode !== 'inline') return
    const tick = () => {
      const el = slotRef.current
      if (el) {
        const r = el.getBoundingClientRect()
        const prev = rectRef.current
        if (!prev || Math.abs(prev.top - r.top) > 0.5 || Math.abs(prev.left - r.left) > 0.5
          || Math.abs(prev.width - r.width) > 0.5 || Math.abs(prev.height - r.height) > 0.5) {
          rectRef.current = { top: r.top, left: r.left, width: r.width, height: r.height }
          setRect(rectRef.current)
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [mode])

  function ensurePlayer(id, autoplay) {
    if (ytRef.current?.loadVideoById) {
      if (curIdRef.current !== id) ytRef.current.loadVideoById(id)
      if (autoplay) ytRef.current.playVideo?.()
      curIdRef.current = id
      return
    }
    curIdRef.current = id
    loadYT().then((YT) => {
      if (!hostRef.current) return
      if (ytRef.current?.loadVideoById) { ytRef.current.loadVideoById(id); if (autoplay) ytRef.current.playVideo?.(); return }
      ytRef.current = new YT.Player(hostRef.current, {
        videoId: id,
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1, controls: 0, fs: 0, iv_load_policy: 3, cc_load_policy: 0, disablekb: 1, showinfo: 0 },
        events: {
          // 자막(cc)은 재생이 시작돼 로드된 뒤 unload 해야 확실히 꺼진다 → onApiChange/onReady.
          onApiChange: (e) => { try { e.target.unloadModule('captions'); e.target.unloadModule('cc') } catch { /* noop */ } },
          onReady: (e) => { try { e.target.unloadModule('captions'); e.target.unloadModule('cc') } catch { /* noop */ } if (autoplay) e.target.playVideo(); setProg({ pos: 0, dur: e.target.getDuration?.() || 0 }) },
          onStateChange: (e) => {
            if (e.data === YT.PlayerState.PLAYING) { setPlaying(true); try { e.target.unloadModule('captions'); e.target.unloadModule('cc') } catch { /* noop */ } }
            else if (e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.ENDED) setPlaying(false)
          },
        },
      })
    }).catch(() => {})
  }

  function doToggle() {
    const p = ytRef.current; if (!p) return
    if (playingRef.current) p.pauseVideo?.(); else p.playVideo?.()
  }
  function onBoxClick() {
    if (mode === 'pip') return // pip 은 pointerup 에서 탭/드래그를 구분해 처리
    doToggle()
  }
  function close() {
    try { ytRef.current?.stopVideo?.() } catch { /* noop */ }
    slotRef.current = null; rectRef.current = null
    setPlaying(false); setRect(null); setPipPos(null); setMode(null)
  }

  // pip 드래그 이동(고정 위치가 버튼을 가리는 문제 회피). 유튜브 iframe 위에는 .bluray-catch 가
  // 덮여 있어 pointerdown 이 우리 DOM(→ stage)까지 전달된다.
  function pipDown(e) {
    if (mode !== 'pip' || e.target.closest('button')) return
    const r = e.currentTarget.getBoundingClientRect()
    dragRef.current = { sx: e.clientX, sy: e.clientY, left: r.left, top: r.top, w: r.width, h: r.height, moved: false }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  function pipMove(e) {
    const d = dragRef.current; if (!d) return
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) d.moved = true
    const left = Math.min(Math.max(6, d.left + dx), window.innerWidth - d.w - 6)
    const top = Math.min(Math.max(6, d.top + dy), window.innerHeight - d.h - 6)
    setPipPos({ left, top })
  }
  function pipUp() {
    const d = dragRef.current; dragRef.current = null
    if (d && !d.moved) doToggle() // 이동 없이 탭 → 재생/일시정지
  }
  function seek(e) {
    e.stopPropagation()
    const p = ytRef.current, dur = prog.dur
    if (!p || !dur) return
    const r = e.currentTarget.getBoundingClientRect()
    const frac = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    p.seekTo?.(frac * dur, true)
    setProg((s) => ({ ...s, pos: frac * dur }))
  }

  useImperativeHandle(ref, () => ({
    // 쪽지가 열리면 슬롯 위에 인라인으로 표시(자동재생 X — 재생 버튼 탭 시 그 자리에서 재생)
    mount(url, el) {
      const parsed = parseVideoUrl(url); if (!parsed) return
      slotRef.current = el; rectRef.current = null; setRect(null)
      setMode('inline')
      ensurePlayer(parsed.id, false)
    },
    // 쪽지가 닫히면: 재생 중이면 PIP 로 유지, 아니면 종료
    release(el) {
      if (slotRef.current !== el) return
      slotRef.current = null; rectRef.current = null; setRect(null); setPipPos(null)
      if (playingRef.current) setMode('pip'); else close()
    },
    // 슬롯(쪽지)이 PIP 상태일 때 다시 크게: 슬롯 있으면 인라인, 없으면 전체화면
    expand() { setPipPos(null); setMode(slotRef.current ? 'inline' : 'full') },
  }), [])

  useEffect(() => () => { try { ytRef.current?.destroy?.() } catch { /* noop */ } }, [])

  const w = prog.dur ? `${Math.min(100, (prog.pos / prog.dur) * 100)}%` : '0%'
  const inlineHidden = mode === 'inline' && !rect
  const stageStyle = mode === 'inline' && rect
    ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
    : mode === 'pip' && pipPos
      ? { left: pipPos.left, top: pipPos.top, right: 'auto', bottom: 'auto' }
      : undefined

  return createPortal(
    <div className={`bluray-stage bluray-${mode || 'off'} ${inlineHidden ? 'bluray-hide' : ''}`} style={stageStyle}
      onPointerDown={pipDown} onPointerMove={pipMove} onPointerUp={pipUp} onPointerCancel={pipUp}>
      <div className="bluray-shell">
        <div className="bluray-box" onClick={onBoxClick} role="button" tabIndex={-1}>
          <div ref={hostRef} className="bluray-yt" />
          {/* 정지/일시정지 중엔 유튜브 제목·로고·재생버튼을 가리는 커버 */}
          {mode && !playing && <div className="bluray-cover" />}
          <div className="bluray-vig" />
          {/* 항상 유튜브 위를 덮어 탭이 iframe 에 닿지 않게(재생 중 YT 자체 컨트롤 노출·PIP 드래그 방해 방지) */}
          <div className="bluray-catch" />
          {mode && !playing && <span className="bluray-playbig"><PlayGlyph s={mode === 'pip' ? 17 : 22} /></span>}
          {mode === 'pip' && (
            <>
              <div className="bluray-pip-top">
                <button type="button" className="bluray-rnd" onClick={(e) => { e.stopPropagation(); setMode(slotRef.current ? 'inline' : 'full') }} aria-label="확대" title="확대"><ExpandGlyph /></button>
                <button type="button" className="bluray-rnd" onClick={(e) => { e.stopPropagation(); close() }} aria-label="닫기" title="닫기"><CloseGlyph /></button>
              </div>
              <div className="bluray-prog bluray-prog-pip"><div className="bluray-prog-fill" style={{ width: w }} /></div>
            </>
          )}
        </div>

        {(mode === 'full' || mode === 'inline') && (
          <div className="bluray-ctrl">
            <button type="button" className="bluray-pp" onClick={doToggle} aria-label={playing ? '일시정지' : '재생'}>{playing ? <PauseGlyph s={18} /> : <PlayGlyph s={18} />}</button>
            <div className="bluray-bar" onClick={seek}><div className="bluray-fill" style={{ width: w }} /><span className="bluray-knob" style={{ left: w }} /></div>
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

function fmt(t) {
  if (!isFinite(t) || t < 0) t = 0
  t = Math.floor(t)
  const m = Math.floor(t / 60), s = t % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
