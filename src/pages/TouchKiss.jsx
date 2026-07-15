import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { getMyGroupMember, getGroupMemberMap, summonToTouch } from '../lib/api'
import PeekCat from '../components/PeekCat'
import Avatar from '../components/Avatar'

// 두 손가락(입술)이 맞닿으면 진동+효과. 실시간은 Supabase Broadcast.
const PULSE_MS = 520        // 닿아 있는 동안 진동+이펙트 반복 간격
// "하트 뿅뿅" 테마 하트 색 — 맞닿을 때 뿅뿅 솟는 하트
const HEART_COLORS = ['#ff6b95', '#ff92b0', '#ff5c86', '#ff7ea3', '#ffa6c0']
const RISERS = [
  { dx: -24, d: 0, s: 15 }, { dx: 18, d: 0.05, s: 21 }, { dx: -6, d: 0.12, s: 17 },
  { dx: 30, d: 0.18, s: 13 }, { dx: -32, d: 0.24, s: 16 }, { dx: 8, d: 0.3, s: 23 },
]

export default function TouchKiss() {
  const { groupId } = useParams()
  const { profile } = useAuth()
  const uid = profile?.id

  const areaRef = useRef(null)
  const chanRef = useRef(null)
  const rafRef = useRef(0)
  const pendRef = useRef(null)     // 전송 대기 내 위치
  const collidingRef = useRef(false)
  const pulseRef = useRef(0)
  const midRef = useRef({ x: 0.5, y: 0.5 }) // 현재 맞닿은 지점(지속 이펙트용)

  const [me, setMe] = useState(null)          // {x,y} 정규화 or null
  const [peers, setPeers] = useState({})      // uid -> {x,y,name}
  const [bursts, setBursts] = useState([])    // 충돌 이펙트
  const [peerCount, setPeerCount] = useState(1)
  const [members, setMembers] = useState([])  // 접속 중 멤버 [{uid,name,avatar}]
  const [excited, setExcited] = useState(false) // 닿는 중(고양이 눈 빠르게 깜빡)
  const [noVibe, setNoVibe] = useState(false) // 이 기기 진동 미지원
  const [partner, setPartner] = useState(null) // 부를 상대 {uid, name}
  const [callState, setCallState] = useState('idle') // idle | sending | done
  const meRef = useRef(me); meRef.current = me

  // 그룹의 상대 멤버(부르기 대상) 확정
  useEffect(() => {
    if (!groupId || !uid) return
    let on = true
    getGroupMemberMap(groupId).then((map) => {
      if (!on) return
      const other = Object.entries(map).find(([id]) => id !== uid)
      if (other) setPartner({ uid: other[0], name: other[1].name })
    }).catch(() => {})
    return () => { on = false }
  }, [groupId, uid])

  async function summon() {
    if (!partner || callState === 'sending') return
    if (!window.confirm(`${partner.name} 님을 부를까요?`)) return
    setCallState('sending')
    try {
      await summonToTouch(groupId, partner.uid)
      setCallState('done')
      setTimeout(() => setCallState('idle'), 2500)
    } catch (e) {
      setCallState('idle')
      alert(e.message || '부르기에 실패했어요.')
    }
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
      const list = Object.values(st).map((arr) => arr[0]).filter(Boolean)
      setPeerCount(Math.max(1, list.length))
      setMembers(list.map((m) => ({ uid: m.uid, name: m.name, avatar: m.avatar })))
      setPeers((prev) => {
        const next = {}
        for (const k of Object.keys(prev)) if (st[k]) next[k] = prev[k]
        return next
      })
    })
    ch.subscribe(async (status) => {
      if (status !== 'SUBSCRIBED') return
      let meta = { uid, name: profile?.login_id || '', avatar: null }
      try {
        const m = await getMyGroupMember(groupId, uid)
        if (m) meta = { uid, name: m.display_nickname || profile?.login_id || '', avatar: m.avatar_url || null }
      } catch { /* noop */ }
      try { await ch.track(meta) } catch { /* noop */ }
    })
    return () => { supabase.removeChannel(ch); chanRef.current = null }
  }, [groupId, uid, profile?.login_id])

  // ---- 내 손가락 위치 전송(rAF 스로틀) ----
  function sendPending() {
    rafRef.current = 0
    const p = pendRef.current; if (!p) return
    setMe(p.down ? { x: p.x, y: p.y } : null)
    chanRef.current?.send({ type: 'broadcast', event: 'finger', payload: { uid, name: profile?.login_id || '', x: p.x, y: p.y, down: p.down } })
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
  function buzz(ms) {
    try {
      const ok = navigator.vibrate?.(ms)
      if (ok === false || typeof navigator.vibrate !== 'function') setNoVibe(true)
    } catch { setNoVibe(true) }
  }
  const spawnBurst = useCallback((x, y) => {
    const id = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`
    setBursts((b) => [...b, { id, x, y }])
    setTimeout(() => setBursts((b) => b.filter((v) => v.id !== id)), 2200)
  }, [])
  const endContact = useCallback(() => {
    collidingRef.current = false
    setExcited(false)
    if (pulseRef.current) { clearInterval(pulseRef.current); pulseRef.current = 0 }
  }, [])
  const startContact = useCallback((mx, my) => {
    collidingRef.current = true
    setExcited(true)
    buzz(200)
    spawnBurst(mx, my)
    // 계속 맞대고 있으면 진동+그라데이션+하트를 반복
    if (!pulseRef.current) pulseRef.current = setInterval(() => {
      buzz(80); spawnBurst(midRef.current.x, midRef.current.y)
    }, PULSE_MS)
  }, [spawnBurst])

  useEffect(() => {
    const area = areaRef.current
    if (!me || !area) { endContact(); return }
    const r = area.getBoundingClientRect()
    // 입술이 시각적으로 겹치면 닿은 것으로: 화면 짧은 변의 16%(최소 58px)
    const HIT = Math.max(58, Math.min(r.width, r.height) * 0.16)
    let hit = null
    for (const p of Object.values(peers)) {
      const dx = (me.x - p.x) * r.width, dy = (me.y - p.y) * r.height
      if (Math.hypot(dx, dy) <= HIT) { hit = { x: (me.x + p.x) / 2, y: (me.y + p.y) / 2 }; break }
    }
    if (hit) midRef.current = hit
    if (hit && !collidingRef.current) startContact(hit.x, hit.y)
    else if (!hit && collidingRef.current) endContact()
  }, [me, peers, startContact, endContact])

  useEffect(() => () => { endContact() }, [endContact])

  const anyPeerDown = Object.keys(peers).length > 0

  return (
    <div className="page tk-page">
      <div className="tk-greet">
        {partner && !members.some((m) => m.uid === partner.uid) && (
          <button type="button" className="tk-call" onClick={summon} disabled={callState === 'sending'}>
            {callState === 'done' ? '불렀어요!' : '부르기'}
          </button>
        )}
        <div className="tk-bubble">{peerCount > 1 ? '입술을 맞대 보세요 //' : '지금은 혼자 있어요'}</div>
        <PeekCat className={`tk-cat ${excited ? 'tk-cat-excited' : ''}`} sparkle="heart" width={72} />
      </div>

      <div className="tk-area" ref={areaRef}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        {members.length > 0 && (
          <div className="tk-members">
            {members.slice(0, 4).map((m) => (
              <Avatar key={m.uid} src={m.avatar} name={m.name} size={30} />
            ))}
          </div>
        )}
        {!me && !anyPeerDown && (
          <div className="tk-empty">
            <div className="tk-empty-t">우리 심심한데 뽀뽀나 할까</div>
          </div>
        )}
        {Object.entries(peers).map(([id, p]) => (
          <span key={id} className="tk-lips peer pulse" style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }} aria-hidden="true">💋</span>
        ))}
        {me && <span className="tk-lips tk-me pulse" style={{ left: `${me.x * 100}%`, top: `${me.y * 100}%` }} aria-hidden="true">💋</span>}
        {bursts.map((b) => (
          <span key={b.id} className="tk-burst" style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%` }} aria-hidden="true">
            <span className="tk-spread" />
            {RISERS.map((r, i) => (
              <span key={i} className="tk-riser"
                style={{ color: HEART_COLORS[i % HEART_COLORS.length], fontSize: r.s, '--dx': `${r.dx}px`, animationDelay: `${r.d}s` }}>♥</span>
            ))}
          </span>
        ))}
        {noVibe && <div className="tk-novibe">이 기기는 웹 진동을 지원하지 않아 화면 효과로 표시돼요</div>}
      </div>
    </div>
  )
}
