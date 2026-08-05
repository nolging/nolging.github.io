import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { getMyGroupMember, getGroupMemberMap, summonToTouch, touchQuest } from '../lib/api'
import PeekCat from '../components/PeekCat'
import Avatar from '../components/Avatar'

// 두 손가락(입술)이 맞닿으면 진동+효과. 실시간은 Supabase Broadcast.
const PULSE_MS = 520        // 닿아 있는 동안 진동+이펙트 반복 간격
// Broadcast 는 유실될 수 있고 재접속 시 지난 메시지를 다시 주지 않는다.
// 그래서 (1) 누르고 있는 동안은 같은 자리라도 계속 알리고 (2) 소식이 끊긴 상대는
// 손을 뗀 것으로 간주해 지운다 → 한 번 놓친 이벤트가 영구 불일치로 남지 않는다.
const BEAT_MS = 400         // 누르고 있는 동안 위치 재전송 간격
const PEER_TTL = 1400       // 이 시간 동안 소식 없으면 손 뗀/나간 것으로 처리 (BEAT 의 3.5배)
const SWEEP_MS = 250        // 만료 검사 간격
// 접속 여부(presence)도 하트비트+TTL 로 이중화한다. 상대가 정상적으로 나가면 presence
// leave 가 바로 전파되지만, 백그라운드 전환·비정상 종료 등으로 leave 가 안 오는 경우가 있어
// (그때 상대가 계속 "접속 중" 으로 남는다) 주기적으로 내 존재를 갱신하고, 오래 갱신이 없는
// 상대는 나간 것으로 처리한다.
const PRES_BEAT_MS = 4000   // 내 presence 재갱신(하트비트) 간격
const PRES_TTL = 13000      // 이 시간 동안 갱신 없는 상대는 나간 것으로 (BEAT 의 3.25배)
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
  const [present, setPresent] = useState({})  // 나 외 접속자 uid -> { name, avatar, t }
  const [myMeta, setMyMeta] = useState({ name: profile?.login_id || '', avatar: null })
  const myMetaRef = useRef(myMeta); myMetaRef.current = myMeta
  const [excited, setExcited] = useState(false) // 닿는 중(고양이 눈 빠르게 깜빡)
  const [noVibe, setNoVibe] = useState(false) // 이 기기 진동 미지원
  const [partner, setPartner] = useState(null) // 부를 상대 {uid, name}
  const [callState, setCallState] = useState('idle') // idle | sending | done
  const [isMember, setIsMember] = useState(false) // 이 그룹의 멤버인지(확정 전엔 false → 관리자 미가입이 잠깐도 track 되지 않게). 부르기 X·조작 X 도 이 값으로.
  const isMemberRef = useRef(isMember); isMemberRef.current = isMember
  const meRef = useRef(me); meRef.current = me

  // 접속 중 멤버 = 나(멤버일 때만) + (TTL 내에 갱신된) 상대들. presence 로만 계산하지 않고 present 맵으로 계산.
  const members = [
    ...(isMember ? [{ uid, name: myMeta.name, avatar: myMeta.avatar }] : []),
    ...Object.entries(present).map(([k, v]) => ({ uid: k, name: v.name, avatar: v.avatar })),
  ]
  const peerCount = members.length
  // 전송용 내 신원(렌더마다 갱신) — sendFinger 를 매번 새로 만들지 않으려고 ref 로 둔다
  const idRef = useRef(null)
  idRef.current = { uid, name: profile?.login_id || '' }

  // 내 손가락 상태를 즉시 브로드캐스트. rAF 를 거치지 않으므로 화면이 가려진
  // 상태(백그라운드)에서도 확실히 나간다.
  const sendFinger = useCallback((p) => {
    const { uid: u, name } = idRef.current || {}
    if (!u) return
    chanRef.current?.send({
      type: 'broadcast', event: 'finger',
      payload: { uid: u, name, x: p.x, y: p.y, down: !!p.down },
    })
  }, [])

  // 누르고 있던 손가락을 "놓음" 으로 확정 + 통보 (rAF 대기 없이)
  const releaseNow = useCallback(() => {
    const p = pendRef.current
    if (!p?.down) return
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0 }
    pendRef.current = { x: p.x, y: p.y, down: false }
    setMe(null)
    sendFinger({ x: p.x, y: p.y, down: false })
  }, [sendFinger])

  // 접속 알림도 Presence API 대신 finger 와 같은 Broadcast 로 보낸다 — Presence sync 는
  // 간헐적으로(또는 이 프로젝트 환경에서 아예) 전파가 안 되는 경우가 있었는데, 같은 채널의
  // Broadcast(finger) 는 항상 정상 동작해 왔다. t 는 로컬 수신 시각을 쓴다(기기 시계 오차 방지).
  const sayHello = useCallback(() => {
    const { uid: u } = idRef.current || {}
    if (!u || !isMemberRef.current) return
    chanRef.current?.send({
      type: 'broadcast', event: 'hello',
      payload: { uid: u, name: myMetaRef.current.name, avatar: myMetaRef.current.avatar },
    })
  }, [])

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
  // WebSocket 은 모바일 네트워크 전환(와이파이↔셀룰러, 화면 잠금 등)으로 중간에 끊길 수
  // 있다. subscribe 콜백이 'SUBSCRIBED' 가 아닌 상태(TIMED_OUT/CHANNEL_ERROR/CLOSED)를
  // 무시하기만 하면, 한 번 끊긴 뒤로는 아무도 재연결을 시도하지 않아 새로고침 전까지
  // 서로의 hello/finger 가 전혀 오가지 않는 채로 남는다(상대가 계속 나간 것처럼 보이고
  // 손가락도 안 보이던 원인). 끊기면 짧은 지연 뒤 채널을 새로 만들어 다시 구독한다.
  useEffect(() => {
    if (!groupId || !uid) return
    let alive = true
    let retryTimer = null

    function connect() {
      const ch = supabase.channel(`touch:${groupId}`, {
        config: { broadcast: { self: false } },
      })
      chanRef.current = ch
      ch.on('broadcast', { event: 'finger' }, ({ payload: pl }) => {
        if (!pl?.uid || pl.uid === uid) return
        setPeers((prev) => {
          const next = { ...prev }
          // t = 마지막 소식 시각. 만료 검사(sweep)의 기준.
          if (pl.down) next[pl.uid] = { x: pl.x, y: pl.y, name: pl.name, t: Date.now() }
          else delete next[pl.uid]
          return next
        })
      })
      // 접속 여부는 Presence API 대신 Broadcast(hello/bye/ask) 로 판정한다. t 는 상대
      // 기기가 보낸 시각이 아니라 이 클라이언트가 수신한 로컬 시각을 쓴다 — 기기 간 시계가
      // 어긋나 있어도(시간대·자동시각 설정 차이 등) TTL 판정이 흔들리지 않는다.
      ch.on('broadcast', { event: 'hello' }, ({ payload: pl }) => {
        if (!pl?.uid || pl.uid === uid) return
        setPresent((prev) => ({ ...prev, [pl.uid]: { name: pl.name, avatar: pl.avatar, t: Date.now() } }))
      })
      ch.on('broadcast', { event: 'bye' }, ({ payload: pl }) => {
        if (!pl?.uid || pl.uid === uid) return
        setPresent((prev) => { if (!prev[pl.uid]) return prev; const next = { ...prev }; delete next[pl.uid]; return next })
        setPeers((prev) => { if (!prev[pl.uid]) return prev; const next = { ...prev }; delete next[pl.uid]; return next })
      })
      // 새로 들어온 사람이 ask 를 보내면, 이미 있던 사람들이 즉시 hello 로 응답 →
      // 하트비트(4초)를 기다리지 않고도 바로 서로를 인지한다.
      ch.on('broadcast', { event: 'ask' }, ({ payload: pl }) => {
        if (!pl?.uid || pl.uid === uid) return
        sayHello()
      })
      ch.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          let name = profile?.login_id || '', avatar = null, mem = false
          try {
            const m = await getMyGroupMember(groupId, uid)
            if (m) { name = m.display_nickname || profile?.login_id || ''; avatar = m.avatar_url || null; mem = true }
          } catch { /* noop */ }
          setMyMeta({ name, avatar }); myMetaRef.current = { name, avatar }
          // 이 그룹의 멤버가 아니면(관리자 미가입 미리보기) hello 를 보내지 않아 다른 멤버에게 보이지 않는다.
          setIsMember(mem); isMemberRef.current = mem
          if (mem) {
            sayHello()
            try { ch.send({ type: 'broadcast', event: 'ask', payload: { uid } }) } catch { /* noop */ }
          }
          // 재접속(SUBSCRIBED 재진입) 이면 상대는 내 마지막 상태를 모른다 → 다시 알린다
          if (pendRef.current?.down) sendFinger(pendRef.current)
          return
        }
        if (!alive) return
        if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR' || status === 'CLOSED') {
          try { supabase.removeChannel(ch) } catch { /* noop */ }
          if (chanRef.current === ch) chanRef.current = null
          if (retryTimer) clearTimeout(retryTimer)
          retryTimer = setTimeout(() => { if (alive) connect() }, 1000)
        }
      })
    }
    connect()

    return () => {
      alive = false
      if (retryTimer) clearTimeout(retryTimer)
      const ch = chanRef.current
      if (!ch) return
      // 나가면서 누르고 있었다면 "놓음" 을 먼저 알려, 상대 화면에 입술이 남지 않게
      if (pendRef.current?.down) { try { sendFinger({ ...pendRef.current, down: false }) } catch { /* noop */ } }
      if (isMemberRef.current) { try { ch.send({ type: 'broadcast', event: 'bye', payload: { uid } }) } catch { /* noop */ } }
      supabase.removeChannel(ch); chanRef.current = null
    }
  }, [groupId, uid, profile?.login_id, sendFinger, sayHello])

  // ---- 내 존재를 주기적으로 갱신(hello 하트비트) ----
  // 상대가 내 t 를 계속 새로 받아, 내가 갑자기 사라지면(백그라운드/종료) TTL 로 정리할 수 있다.
  useEffect(() => {
    const iv = setInterval(() => { sayHello() }, PRES_BEAT_MS)
    return () => clearInterval(iv)
  }, [sayHello])

  // ---- 갱신이 끊긴 상대는 나간 것으로 정리 ----
  // presence leave 가 전파되지 않는 경우(백그라운드 전환 등)에도 상대가 계속 접속 중으로
  // 남지 않게, t 가 오래된 상대를 주기적으로 제거한다.
  useEffect(() => {
    const iv = setInterval(() => {
      setPresent((prev) => {
        const now = Date.now()
        let drop = false
        const next = {}
        for (const [k, v] of Object.entries(prev)) {
          if (now - (v.t || 0) < PRES_TTL) next[k] = v
          else drop = true
        }
        return drop ? next : prev
      })
    }, SWEEP_MS)
    return () => clearInterval(iv)
  }, [])

  // ---- 누르고 있는 동안 같은 자리라도 계속 알림 ----
  // 이벤트 하나가 유실되거나 상대가 뒤늦게 들어와도 한 박자 안에 맞춰진다.
  useEffect(() => {
    const iv = setInterval(() => {
      const p = pendRef.current
      if (p?.down) sendFinger(p)
    }, BEAT_MS)
    return () => clearInterval(iv)
  }, [sendFinger])

  // ---- 소식이 끊긴 상대 정리 ----
  // "놓음" 메시지가 유실되거나 상대가 앱을 그냥 닫아도 입술이 남지 않게.
  useEffect(() => {
    const iv = setInterval(() => {
      setPeers((prev) => {
        const now = Date.now()
        let drop = false
        const next = {}
        for (const [k, v] of Object.entries(prev)) {
          if (now - (v.t || 0) < PEER_TTL) next[k] = v
          else drop = true
        }
        return drop ? next : prev   // 변화 없으면 같은 객체 → 불필요한 렌더 방지
      })
    }, SWEEP_MS)
    return () => clearInterval(iv)
  }, [])

  // ---- 화면을 벗어나면 누르고 있던 손가락을 놓은 것으로 + 나간 것으로 알림 ----
  // 백그라운드에서는 rAF 가 돌지 않아 pointerup 이 전달되지 않을 수 있다. pagehide 는
  // 완전 종료(작업 목록에서 밀어서 끄기 포함)를 앞두고 페이지가 사라지기 직전 마지막
  // 으로 확실히 실행되는 이벤트라, 여기서 bye 도 함께 보내 상대 화면에 "나간 것"이
  // 하트비트 TTL(13초)을 기다리지 않고 바로 반영되게 한다. 잠깐 다른 앱을 봤다
  // 돌아오는 정도로도 pagehide 가 뜰 수 있어 순간적으로 "나감"이 깜빡일 수 있지만,
  // 화면에 돌아오면 즉시 hello 를 다시 보내 금방 재등록되므로 실질적 영향은 적다.
  const sayByeNow = useCallback(() => {
    if (!isMemberRef.current) return
    try { chanRef.current?.send({ type: 'broadcast', event: 'bye', payload: { uid } }) } catch { /* noop */ }
  }, [uid])
  useEffect(() => {
    const onHide = () => { releaseNow(); sayByeNow() }
    const onVis = () => { if (document.hidden) onHide(); else sayHello() }
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('pagehide', onHide)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [releaseNow, sayHello, sayByeNow])

  // ---- 내 손가락 위치 전송(rAF 스로틀) ----
  function sendPending() {
    rafRef.current = 0
    const p = pendRef.current; if (!p) return
    setMe(p.down ? { x: p.x, y: p.y } : null)
    sendFinger(p)
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
    if (!isMemberRef.current) return   // 미가입(관리자 미리보기)은 관전만 — 입술 표시/전송 안 함
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const n = norm(e); scheduleSend({ ...n, down: true })
  }
  function onMove(e) {
    if (!pendRef.current?.down && !meRef.current) return
    const n = norm(e); scheduleSend({ ...n, down: true })
  }
  function onUp() {
    // 놓는 건 rAF 를 기다리지 않고 바로 보낸다. 놓자마자 페이지를 벗어나거나
    // 앱이 백그라운드로 가면 rAF 가 실행되지 않아 상대 화면에 입술이 남는다.
    if (pendRef.current?.down) { releaseNow(); return }
    const last = pendRef.current || { x: 0.5, y: 0.5 }
    pendRef.current = { x: last.x, y: last.y, down: false }
    setMe(null)
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
    touchQuest('r_kiss')  // 랜덤 퀘스트 '쪽 쪽 뽀갈' (손가락 맞닿음)
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
        {isMember && partner && !members.some((m) => m.uid === partner.uid) && (
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
