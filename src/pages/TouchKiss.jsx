import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

// 두 손가락(입술)이 맞닿으면 진동+효과. 실시간은 Supabase Broadcast.
const HIT_PX = 46           // 입술 중심 거리 이하이면 "닿음"
const PULSE_MS = 420        // 닿아 있는 동안 반복 진동 간격

export default function TouchKiss() {
  const { groupId } = useParams()
  const { profile } = useAuth()
  const uid = profile?.id

  const areaRef = useRef(null)
  const chanRef = useRef(null)
  const rafRef = useRef(0)
  const pendRef = useRef(null)     // 전송 대기 내 위치
  const audioRef = useRef(null)
  const collidingRef = useRef(false)
  const pulseRef = useRef(0)

  const [me, setMe] = useState(null)          // {x,y} 정규화 or null
  const [peers, setPeers] = useState({})      // uid -> {x,y,name}
  const [bursts, setBursts] = useState([])    // 충돌 이펙트
  const [peerCount, setPeerCount] = useState(1)
  const meRef = useRef(me); meRef.current = me
  const peersRef = useRef(peers); peersRef.current = peers

  // ---- 사운드(웹오디오, iOS 폴백) ----
  function ensureAudio() {
    if (!audioRef.current) {
      const AC = window.AudioContext || window.webkitAudioContext
      if (AC) audioRef.current = new AC()
    }
    audioRef.current?.resume?.()
  }
  function playPop() {
    const ac = audioRef.current; if (!ac) return
    const t = ac.currentTime
    const o = ac.createOscillator(); const g = ac.createGain()
    o.type = 'sine'; o.frequency.setValueAtTime(660, t); o.frequency.exponentialRampToValueAtTime(320, t + 0.12)
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
    o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 0.2)
  }

  // ---- 실시간 채널 ----
  useEffect(() => {
    if (!groupId || !uid) return
    const ch = supabase.channel(`touch:${groupId}`, {
      config: { broadcast: { self: false }, presence: { key: uid } },
    })
    chanRef.current = ch
    ch.on('broadcast', { event: 'finger' }, ({ payload: pl }) => {
      setPeers((prev) => {
        const next = { ...prev }
        if (pl.down) next[pl.uid] = { x: pl.x, y: pl.y, name: pl.name }
        else delete next[pl.uid]
        return next
      })
    })
    ch.on('presence', { event: 'sync' }, () => {
      const st = ch.presenceState()
      setPeerCount(Math.max(1, Object.keys(st).length))
      setPeers((prev) => {
        const next = {}
        for (const k of Object.keys(prev)) if (st[k]) next[k] = prev[k]
        return next
      })
    })
    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') { try { await ch.track({ uid, name: profile?.nickname || '' }) } catch { /* noop */ } }
    })
    return () => { supabase.removeChannel(ch); chanRef.current = null }
  }, [groupId, uid, profile?.nickname])

  // ---- 내 손가락 위치 전송(rAF 스로틀) ----
  function sendPending() {
    rafRef.current = 0
    const p = pendRef.current; if (!p) return
    setMe(p.down ? { x: p.x, y: p.y } : null)
    chanRef.current?.send({ type: 'broadcast', event: 'finger', payload: { uid, name: profile?.nickname || '', x: p.x, y: p.y, down: p.down } })
  }
  function scheduleSend(p) {
    pendRef.current = p
    if (!rafRef.current) rafRef.current = requestAnimationFrame(sendPending)
  }
  function norm(e) {
    const r = areaRef.current.getBoundingClientRect()
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }
  }
  function onDown(e) {
    e.currentTarget.setPointerCapture?.(e.pointerId)
    ensureAudio()
    const n = norm(e); scheduleSend({ ...n, down: true })
  }
  function onMove(e) {
    if (!pendRef.current?.down && !meRef.current) return
    const n = norm(e); scheduleSend({ ...n, down: true })
  }
  function onUp() {
    const last = pendRef.current || { x: 0.5, y: 0.5 }
    scheduleSend({ x: last.x, y: last.y, down: false })
  }

  // ---- 충돌 판정 + 진동/이펙트 ----
  const endContact = useCallback(() => {
    collidingRef.current = false
    if (pulseRef.current) { clearInterval(pulseRef.current); pulseRef.current = 0 }
  }, [])
  const startContact = useCallback((mx, my) => {
    collidingRef.current = true
    try { navigator.vibrate?.([40, 30, 90]) } catch { /* noop */ }
    playPop()
    const id = crypto.randomUUID?.() || String(Math.random())
    setBursts((b) => [...b, { id, x: mx, y: my }])
    setTimeout(() => setBursts((b) => b.filter((x) => x.id !== id)), 900)
    if (!pulseRef.current) pulseRef.current = setInterval(() => { try { navigator.vibrate?.(28) } catch { /* noop */ } }, PULSE_MS)
  }, [])

  useEffect(() => {
    const area = areaRef.current
    if (!me || !area) { endContact(); return }
    const r = area.getBoundingClientRect()
    let hit = null
    for (const p of Object.values(peers)) {
      const dx = (me.x - p.x) * r.width, dy = (me.y - p.y) * r.height
      if (Math.hypot(dx, dy) <= HIT_PX) { hit = { x: (me.x + p.x) / 2, y: (me.y + p.y) / 2 }; break }
    }
    if (hit && !collidingRef.current) startContact(hit.x, hit.y)
    else if (!hit && collidingRef.current) endContact()
  }, [me, peers, startContact, endContact])

  useEffect(() => () => { endContact() }, [endContact])

  const anyPeerDown = Object.keys(peers).length > 0

  return (
    <div className="page tk-page">
      <div className="tk-hint">
        <span className="draw-dot" aria-hidden="true" style={{ background: '#e5679a', boxShadow: '0 0 0 3px #fde8ef' }} />
        {peerCount > 1 ? '같은 곳을 만지면 입술이 닿아요' : '상대가 들어오면 함께 만질 수 있어요'}
      </div>

      <div className="tk-area" ref={areaRef}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        {!me && !anyPeerDown && (
          <div className="tk-empty">
            <div className="tk-empty-lips" aria-hidden="true">💋</div>
            <div className="tk-empty-t">화면을 만져 보세요</div>
          </div>
        )}
        {Object.entries(peers).map(([id, p]) => (
          <span key={id} className="tk-lips peer pulse" style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }} aria-hidden="true">💋</span>
        ))}
        {me && <span className="tk-lips me pulse" style={{ left: `${me.x * 100}%`, top: `${me.y * 100}%` }} aria-hidden="true">💋</span>}
        {bursts.map((b) => (
          <span key={b.id} className="tk-burst" style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%` }} aria-hidden="true">
            <span className="tk-ring" />
            {['💗', '💕', '💖', '💘'].map((h, i) => (
              <span key={i} className="tk-heart" style={{ '--a': `${i * 90 + 20}deg` }}>{h}</span>
            ))}
          </span>
        ))}
      </div>
    </div>
  )
}
