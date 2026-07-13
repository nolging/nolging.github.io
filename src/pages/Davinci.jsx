import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { davinci } from '../lib/api'

const uuid = () => (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.round(Math.random() * 1e9)}`)
const BackIcon = () => <svg width="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 6 9 12 15 18" /></svg>
const CloseIcon = () => <svg width="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
const SendIcon = () => <svg width="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>
const PersonIcon = () => <svg width="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
const PawMini = () => <svg className="dvt-paw" width="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="6" cy="10" r="1.9" /><circle cx="10" cy="6.6" r="1.9" /><circle cx="14" cy="6.6" r="1.9" /><circle cx="18" cy="10" r="1.9" /><path d="M12 11.2c2.9 0 4.9 2 4.9 4.3 0 1.7-1.4 2.8-2.9 2.3-.9-.3-1.4-.5-2-.5s-1.1.2-2 .5c-1.5.5-2.9-.6-2.9-2.3 0-2.3 2-4.3 4.9-4.3Z" /></svg>
function LobbyAvatar({ name, avatar, size = 52 }) {
  return avatar
    ? <img className="om-av-img" src={avatar} alt="" style={{ width: size, height: size }} />
    : <span className="om-av-ini" style={{ width: size, height: size }}>{(name || '?').slice(0, 1)}</span>
}

// 타일 표시: 색은 공개(뒷면도), 숫자만 숨김. 조커는 공개 시 "-".
// mine=true 면 내 타일 → 뒷면이라도 내 숫자는 항상 보이고, 상대에게 공개된 건 exposed 표시.
function Tile({ t, onClick, selected, mine }) {
  const known = t.up || mine
  const face = known ? (t.j ? '-' : t.n) : '?'
  const color = t.c === 'b' ? 'blk' : t.c === 'w' ? 'wht' : 'ph'
  const cls = `dv-tile ${color} ${known ? 'up' : 'down'} ${mine && t.up ? 'exposed' : ''} ${selected ? 'sel' : ''} ${onClick ? 'clk' : ''}`
  return <button type="button" className={cls} disabled={!onClick} onClick={onClick}>{face}</button>
}

function Av({ name, avatar }) {
  return <span className="dv-av">{avatar ? <img src={avatar} alt="" /> : <span>{(name || '?').slice(0, 1)}</span>}</span>
}

export default function Davinci() {
  const { groupId } = useParams()
  const { profile } = useAuth()
  const uid = profile?.id

  const navigate = useNavigate()
  const [v, setV] = useState(null)
  const vRef = useRef(v); vRef.current = v
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [sel, setSel] = useState(null)       // 추리 대상 상대 pos
  const [moveSel, setMoveSel] = useState(null) // 정렬 단계: 옮길 내 조커 index
  const [guessVal, setGuessVal] = useState(null) // 추측 값(0~11/joker)
  const [jokerSlot, setJokerSlot] = useState(null) // 조커 배치 자리
  const [toast, setToast] = useState('')
  const [chat, setChat] = useState([])
  const [draft, setDraft] = useState('')
  const [ruleOn, setRuleOn] = useState(false)
  const chanRef = useRef(null)
  const matchRef = useRef(null)
  const chatEndRef = useRef(null)
  const rootRef = useRef(null)
  const seenPeers = useRef(new Set())
  const stakeTimer = useRef(0)
  const pendingStake = useRef(null)
  const seatInflight = useRef(false)
  const serverSeatsRef = useRef(null)
  const aliveRef = useRef(true)
  const [peerBals, setPeerBals] = useState({})
  const peerBalsRef = useRef({}); peerBalsRef.current = peerBals

  const ping = useCallback(() => { chanRef.current?.send({ type: 'broadcast', event: 'sync', payload: {} }) }, [])
  const pushChat = useCallback((m) => setChat((c) => [...c.slice(-80), m]), [])
  const sendChat = useCallback((e) => {
    e?.preventDefault?.()
    const text = draft.trim(); if (!text) return
    // 이름/아바타는 수신 측이 v.players 에서 uid 로 조회(아이디 노출 방지) → payload 엔 uid 만
    const m = { id: uuid(), uid, text }
    chanRef.current?.send({ type: 'broadcast', event: 'chat', payload: m }); pushChat(m); setDraft('')
  }, [draft, uid, pushChat])

  const refresh = useCallback(async () => {
    const mid = matchRef.current; if (!mid) return
    try { const r = await davinci('view', { matchId: mid }); setV(r); serverSeatsRef.current = r.seats } catch { /* noop */ }
  }, [])

  const act = useCallback(async (action, payload = {}) => {
    const mid = matchRef.current; if (!mid && action !== 'open') return
    setBusy(true); setErr('')
    try {
      const r = await davinci(action, { matchId: mid, ...payload })
      setV(r); serverSeatsRef.current = r.seats; setSel(null); setMoveSel(null); setGuessVal(null); setJokerSlot(null)
      if (r.matchId) matchRef.current = r.matchId
      ping()
    } catch (e) { setErr(e.message || '오류') }
    finally { setBusy(false) }
  }, [ping])

  // 참여(로비) 인원 중 최소 보유 츄르 기준 베팅 상한(5단위 내림, 최대 20)
  const stakeCap = useCallback(() => {
    const bals = [vRef.current?.myBalance, ...Object.values(peerBalsRef.current)].filter((b) => typeof b === 'number')
    return bals.length ? Math.max(0, Math.min(20, Math.floor(Math.min(...bals) / 5) * 5)) : 20
  }, [])

  // 로비 상태 변경을 상대에게 즉시 브로드캐스트(델타) → 오목/캐치처럼 바로 반영.
  // 자리 변경은 { actor, seatIdx }(내 위치만), 판돈은 { stake } 로 보내 서로 덮어쓰지 않게.
  const broadcastLobby = useCallback((payload) => {
    chanRef.current?.send({ type: 'broadcast', event: 'lobby', payload })
  }, [])

  // 로비 판돈 등 일반 서버 반영(즉시 로컬 반영 후 백그라운드 동기화)
  const bgAct = useCallback((action, payload = {}) => {
    const mid = matchRef.current; if (!mid) return
    davinci(action, { matchId: mid, ...payload })
      .then((r) => { setV(r); serverSeatsRef.current = r.seats; ping() })
      .catch((e) => { setErr(e.message || '오류'); refresh() })
  }, [ping, refresh])

  // 자리 반영: 항상 1건만 in-flight 로 직렬화 → 빠른 연타에도 낙관적 잠금 충돌 방지.
  // 서버가 내 목표 자리와 다르면 한 번만 요청, 끝나면 다시 목표와 비교해 수렴.
  const syncSeatToServer = useCallback(() => {
    if (seatInflight.current || !aliveRef.current) return
    const mid = matchRef.current; if (!mid) return
    const desired = (vRef.current?.seats || []).indexOf(uid)
    const server = (serverSeatsRef.current || []).indexOf(uid)
    if (desired === server) return
    seatInflight.current = true
    const call = desired < 0 ? davinci('unseat', { matchId: mid }) : davinci('seat', { matchId: mid, idx: desired })
    call.then((r) => { serverSeatsRef.current = r.seats; ping() })
      .catch((e) => { setErr(e.message || '오류'); refresh() })
      .finally(() => { seatInflight.current = false; syncSeatToServer() })
  }, [uid, ping, refresh])

  const toggleSeat = useCallback((idx) => {
    const cur = vRef.current; if (!cur || cur.status !== 'lobby') return
    const seats = [...(cur.seats || [null, null])]
    if (seats[idx] === uid) seats[idx] = null
    else if (!seats[idx]) {
      if (!(cur.stakeOk?.[uid] ?? (cur.myBalance >= (cur.stake || 0)))) { setErr('보유 츄르가 판돈보다 적어요.'); return }
      const at = seats.indexOf(uid); if (at >= 0) seats[at] = null
      seats[idx] = uid
    } else return   // 남의 자리
    setV((prev) => ({ ...prev, seats })); setErr('')
    broadcastLobby({ actor: uid, seatIdx: seats.indexOf(uid) })   // 상대 화면 즉시 반영(내 자리만)
    syncSeatToServer()                  // 서버는 직렬화로 최종 상태만
  }, [uid, broadcastLobby, syncSeatToServer])

  const changeStakeOptim = useCallback((d) => {
    let ns = null
    setV((prev) => {
      const stake = Math.max(0, Math.min(stakeCap(), (prev.stake || 0) + d))
      pendingStake.current = stake; ns = stake
      return { ...prev, stake }
    })
    broadcastLobby({ stake: ns })   // 상대 즉시 반영
    clearTimeout(stakeTimer.current)
    stakeTimer.current = setTimeout(() => { if (pendingStake.current != null) bgAct('stake', { stake: pendingStake.current }) }, 280)
  }, [bgAct, stakeCap, broadcastLobby])

  // 시작: 내 자리 서버 반영을 먼저 확정한 뒤(상대 자리 반영 지연 흡수 위해) 재시도
  const startGame = useCallback(async () => {
    const mid = matchRef.current; if (!mid) return
    syncSeatToServer()
    for (let i = 0; i < 20 && seatInflight.current; i++) await new Promise((r) => setTimeout(r, 50))
    setBusy(true); setErr('')
    for (let i = 0; i < 3; i++) {
      try { const r = await davinci('start', { matchId: mid }); setV(r); serverSeatsRef.current = r.seats; setSel(null); setMoveSel(null); setGuessVal(null); setJokerSlot(null); ping(); setBusy(false); return }
      catch (e) { if (i === 2) { setErr(e.message || '오류'); setBusy(false); return } await new Promise((r) => setTimeout(r, 350)) }
    }
  }, [syncSeatToServer, ping])

  useEffect(() => {
    if (!groupId || !uid) return
    let alive = true; aliveRef.current = true
    davinci('open', { groupId }).then((r) => {
      if (!alive) return; setV(r); matchRef.current = r.matchId; serverSeatsRef.current = r.seats
      // 내 보유 츄르를 프레즌스로 공유(베팅 상한 계산용)
      chanRef.current?.track({ uid, bal: r.myBalance }).catch(() => {})
      if (!seenPeers.current.has(uid) && r.status === 'lobby') { seenPeers.current.add(uid); setChat((c) => [...c.slice(-80), { id: uuid(), sys: true, joinUid: uid }]) }
    }).catch((e) => { if (alive) setErr(e.message || '열기 실패') })
    const ch = supabase.channel(`davinci:${groupId}`, { config: { broadcast: { self: false }, presence: { key: uid } } })
    chanRef.current = ch
    ch.on('broadcast', { event: 'sync' }, () => refresh())
    ch.on('broadcast', { event: 'lobby' }, ({ payload }) => {
      // 상대의 자리/판돈 변경을 서버 왕복 없이 즉시 반영(대기실 상태는 비밀이 아님)
      if (vRef.current?.status !== 'lobby') return
      setV((prev) => {
        if (!prev) return prev
        let seats = prev.seats, stake = prev.stake
        if (payload.actor) {
          seats = (prev.seats || [null, null]).map((s) => (s === payload.actor ? null : s))
          if (payload.seatIdx != null && payload.seatIdx >= 0) { seats = [...seats]; seats[payload.seatIdx] = payload.actor }
        }
        if (payload.stake != null) stake = payload.stake
        return { ...prev, seats, stake }
      })
    })
    ch.on('broadcast', { event: 'chat' }, ({ payload }) => pushChat(payload))
    ch.on('broadcast', { event: 'rematch' }, ({ payload }) => {
      if (payload?.uid !== uid) { setToast(`${payload?.name || '상대'} 님이 한 판 더 하고 싶대요`); setTimeout(() => setToast(''), 4000) }
    })
    ch.on('presence', { event: 'join' }, ({ key }) => {
      if (key === uid || seenPeers.current.has(key)) return
      seenPeers.current.add(key)
      setChat((c) => [...c.slice(-80), { id: uuid(), sys: true, joinUid: key }])
    })
    ch.on('presence', { event: 'leave' }, ({ key }) => {
      if (key === uid) return
      seenPeers.current.delete(key)
      if (vRef.current?.status !== 'lobby') return
      setChat((c) => [...c.slice(-80), { id: uuid(), sys: true, leaveUid: key }])
      // 떠난 상대가 서버측 준비(자리)를 해제할 시간을 준 뒤 상태를 다시 불러온다
      setTimeout(() => refresh(), 300)
      setTimeout(() => refresh(), 1100)
    })
    ch.on('presence', { event: 'sync' }, () => { const st = ch.presenceState(), m = {}; for (const k of Object.keys(st)) { if (k === uid) continue; const bal = st[k][0]?.bal; if (typeof bal === 'number') m[k] = bal } setPeerBals(m) })
    ch.subscribe((s) => { if (s === 'SUBSCRIBED') ch.track({ uid, bal: vRef.current?.myBalance }).catch(() => {}) })
    return () => {
      alive = false; aliveRef.current = false
      // 대기실에서 게임 시작 전에 벗어나면 내 자리를 서버에서도 해제
      const cur = vRef.current
      if (cur && cur.status === 'lobby' && cur.seats?.includes(uid) && matchRef.current) davinci('unseat', { matchId: matchRef.current }).catch(() => {})
      supabase.removeChannel(ch); chanRef.current = null
    }
  }, [groupId, uid, refresh, pushChat])

  // 키보드 위에 입력창 유지 + 채팅 자동 스크롤
  useEffect(() => {
    const vv = window.visualViewport; if (!vv) return
    const fit = () => { const el = rootRef.current; if (!el) return; el.style.height = vv.height + 'px'; el.style.top = (vv.offsetTop || 0) + 'px' }
    fit(); vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit)
    return () => { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit) }
  }, [])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ block: 'end' }) }, [chat])
  // 참여 인원 보유 츄르가 바뀌어 상한이 내려가면 베팅도 자동으로 낮춘다
  useEffect(() => { const cur = vRef.current; if (cur?.status === 'lobby' && (cur.stake || 0) > stakeCap()) changeStakeOptim(0) }, [peerBals, stakeCap, changeStakeOptim])

  if (err && !v) return <div className="page dv-page"><div className="dv-msg">{err}</div></div>
  if (!v) return <div className="page dv-page"><div className="dv-msg">불러오는 중…</div></div>

  const me = v.players.find((p) => p.uid === v.meUid) || {}
  const opp = v.players.find((p) => p.uid === v.oppUid) || {}
  const myTurn = v.turn === v.meUid
  const canAfford = v.stakeOk?.[uid] ?? (v.myBalance >= (v.stake || 0))

  // 이름/아바타는 멤버 목록에서 uid 로 조회(아이디 노출 방지)
  const roster = (v.members && v.members.length ? v.members : v.players) || []
  const nameOf = (u) => roster.find((p) => p.uid === u)?.name || v.players.find((p) => p.uid === u)?.name || '멤버'
  const avatarOf = (u) => roster.find((p) => p.uid === u)?.avatar ?? v.players.find((p) => p.uid === u)?.avatar ?? null

  const chatBox = (
    <div className="om-chat">
      <div className="om-chat-scroll">
        {chat.map((m) => m.sys
          ? <div key={m.id} className="om-chat-sys">{m.leaveUid ? `${nameOf(m.leaveUid)} 님 퇴장 👋` : `${nameOf(m.joinUid)} 님 등장! 🐾`}</div>
          : m.uid === uid
            ? <div key={m.id} className="om-chat-row om-me"><span className="om-bubble om-me">{m.text}</span></div>
            : <div key={m.id} className="om-chat-row"><LobbyAvatar name={nameOf(m.uid)} avatar={avatarOf(m.uid)} size={26} /><div className="om-chat-msg"><span className="om-chat-nm">{nameOf(m.uid)}</span><span className="om-bubble">{m.text}</span></div></div>)}
        <div ref={chatEndRef} />
      </div>
      <form className="om-chat-input" onSubmit={sendChat}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="메시지 보내기" maxLength={100} enterKeyHint="send"
          onFocus={() => rootRef.current?.classList.add('om-kbd')}
          onBlur={() => setTimeout(() => rootRef.current?.classList.remove('om-kbd'), 150)} />
        <button type="submit" className="om-send" aria-label="전송" onMouseDown={(e) => e.preventDefault()}><SendIcon /></button>
      </form>
    </div>
  )

  // ---- 로비 (14e) ----
  if (v.status === 'lobby') {
    // 구버전 함수(좌석 미지원) 감지 → 재배포 안내
    if (!Array.isArray(v.seats)) {
      return (
        <div className="om-root om-lobby" ref={rootRef}>
          <div className="om-head">
            <button type="button" className="om-icon-btn" aria-label="뒤로" onClick={() => navigate(-1)}><BackIcon /></button>
            <div className="om-title">다빈치 코드</div><span className="om-pill">대기실</span>
          </div>
          <div className="dv-msg" style={{ margin: 'auto', textAlign: 'center', lineHeight: 1.6 }}>
            서버 업데이트를 적용하는 중이에요.<br />잠시 후 다시 들어와 주세요. 🐾
          </div>
        </div>
      )
    }
    const seats = v.seats
    const bothSeated = seats[0] && seats[1] && seats[0] !== seats[1]
    const memCount = (v.members || []).length
    const stakeCapVal = (() => { const bals = [v.myBalance, ...Object.values(peerBals)].filter((b) => typeof b === 'number'); return bals.length ? Math.max(0, Math.min(20, Math.floor(Math.min(...bals) / 5) * 5)) : 20 })()
    // 빈 자리는 누구나 탭해서 선점, 내 자리는 다시 탭해서 비우기
    const seat = (idx) => {
      const su = seats[idx]
      const mine = su === uid
      const afford = su ? v.stakeOk?.[su] : canAfford
      const clickable = mine || (!su && canAfford)
      return (
        <div className={`om-seat ${su ? 'taken dv-rdy' : 'empty'} ${mine ? 'mine' : ''}`}
          role="button" tabIndex={0}
          onClick={() => { if (clickable) toggleSeat(idx) }}>
          <div className="om-seat-top"><span className="dv-order">{idx === 0 ? '선공' : '후공'}</span></div>
          {su
            ? <><LobbyAvatar name={nameOf(su)} avatar={avatarOf(su)} /><div className="om-seat-name">{nameOf(su)}{mine && <span className="om-badge-me">나</span>}</div></>
            : <><span className="om-seat-empty"><PersonIcon /></span>
                <div className="om-seat-wait">{afford ? '탭해서 참여' : '보유 부족'}</div></>}
        </div>
      )
    }
    return (
      <div className="om-root om-lobby" ref={rootRef}>
        <div className="om-head">
          <button type="button" className="om-icon-btn" aria-label="뒤로" onClick={() => navigate(-1)}><BackIcon /></button>
          <div className="om-title">다빈치 코드</div><span className="om-pill">대기실</span>
          {memCount > 2 && <span className="cm-count">👥 {memCount}</span>}
          <button type="button" className="om-icon-btn om-help" aria-label="게임 룰" onClick={() => setRuleOn(true)}>?</button>
        </div>
        {chatBox}
        <div className="om-seats">
          <div className="om-seats-row">{seat(0)}{seat(1)}</div>
          <div className="om-seats-hint">빈 자리를 <b>탭</b>해서 참여하세요 · 선공이 먼저 추측해요{memCount > 2 ? ' · 먼저 앉은 두 명이 대결해요' : ''}</div>
        </div>
        <div className="om-bet">
          <div className="om-bet-l"><div className="om-bet-t">츄르 베팅</div><div className="om-bet-s">이긴 사람이 전부 가져가요 🐾 · 최대 {stakeCapVal}개</div></div>
          <button type="button" className="om-bet-btn" onClick={() => changeStakeOptim(-5)} aria-label="줄이기">−</button>
          <span className="om-bet-val">{v.stake}</span>
          <button type="button" className="om-bet-btn" onClick={() => changeStakeOptim(5)} disabled={v.stake >= stakeCapVal} aria-label="늘리기">+</button>
        </div>
        <div className="om-start-wrap">
          <button type="button" className={`om-start ${bothSeated ? 'on' : ''}`} disabled={!bothSeated || busy} onClick={startGame}>
            {bothSeated ? '게임 시작' : '두 자리가 다 차면 시작할 수 있어요'}
          </button>
        </div>
        {err && <div className="dv-err" style={{ position: 'absolute', bottom: 8, left: 20, right: 20 }}>{err}</div>}
        {ruleOn && <DvRuleModal onClose={() => setRuleOn(false)} />}
      </div>
    )
  }

  // ---- 관전 (자리를 못 잡은 3번째+ 멤버: 대국이 끝나면 대기실로 자동 복귀) ----
  if (v.spectator) {
    const [pa, pb] = v.players || []
    return (
      <div className="om-root om-lobby" ref={rootRef}>
        <div className="om-head">
          <button type="button" className="om-icon-btn" aria-label="뒤로" onClick={() => navigate(-1)}><BackIcon /></button>
          <div className="om-title">다빈치 코드</div><span className="om-pill">관전</span>
        </div>
        <div className="dv-spectate">
          <div className="dv-spectate-vs">
            <div className="dv-spectate-p"><LobbyAvatar name={pa?.name} avatar={pa?.avatar} size={56} /><span>{pa?.name || '?'}</span></div>
            <span className="dv-spectate-x">VS</span>
            <div className="dv-spectate-p"><LobbyAvatar name={pb?.name} avatar={pb?.avatar} size={56} /><span>{pb?.name || '?'}</span></div>
          </div>
          <div className="dv-spectate-tx">
            {v.status === 'ended' ? '대국이 끝났어요 · 곧 대기실로 돌아가요' : '지금 두 사람이 대국 중이에요'}<br />
            대국이 끝나면 대기실에서 참여할 수 있어요 🐾
          </div>
        </div>
        {chatBox}
      </div>
    )
  }

  // ---- 대국/종료 렌더 ----
  const placing = v.phase === 'place' && myTurn && v.myToPlace[0]
  const selfrevealing = v.phase === 'selfreveal' && myTurn
  const setupArrange = v.phase === 'setup' && !v.mySetupDone
  const lr = v.lastReveal
  const sortKey = (t) => (t.j ? 999 : t.n * 2 + (t.c === 'w' ? 1 : 0))

  // 내 손패(표시용): 뽑은 숫자 타일을 정렬 위치에 삽입 → "방금 뽑음"
  const drawnMine = v.drawn && !v.drawn.hidden ? v.drawn : null
  const myTiles = v.myHand.map((t, i) => ({ ...t, idx: i }))
  if (drawnMine && !drawnMine.j && (v.phase === 'guess' || v.phase === 'decide')) {
    let pos = myTiles.length
    for (let i = 0; i < myTiles.length; i++) { if (!myTiles[i].j && sortKey(myTiles[i]) > sortKey(drawnMine)) { pos = i; break } }
    myTiles.splice(pos, 0, { ...drawnMine, drawn: true, idx: -1 })
  }
  const oppUp = v.oppHand.filter((t) => t.up).length
  const myUp = v.myHand.filter((t) => t.up).length

  const oppTile = (t, i) => {
    if (t.placeholder) return <span key={i} className="dvt-wrap"><span className="dvt blk back"><PawMini /></span></span>
    const black = t.c === 'b'
    const selected = sel === i
    const green = lr && lr.ok && lr.uid === v.oppUid && lr.id === t.id && t.up
    const clickable = myTurn && v.phase === 'guess' && !t.up
    const badge = selected ? { c: 'sel', t: '선택' } : (t.new && !t.up) ? { c: 'new', t: '새로 추가' } : (t.new && t.up ? { c: 'new', t: '새로 추가' } : null)
    return (
      <span key={i} className="dvt-wrap">
        {badge && <span className={`dvt-badge ${badge.c}`}>{badge.t}</span>}
        <button type="button" className={`dvt ${black ? 'blk' : 'wht'} ${t.up ? '' : 'back'} ${selected ? 'sel' : ''} ${green ? 'ok lift' : ''} ${clickable ? 'clk' : ''}`}
          disabled={!clickable} onClick={clickable ? () => setSel(i) : undefined}>
          {t.up ? (t.j ? '-' : t.n) : (selected ? '?' : <PawMini />)}
        </button>
        {green && <span className="dvt-dot ok" />}
        {t.new && !green && <span className="dvt-dot new" />}
      </span>
    )
  }
  const myTile = (t, i) => {
    const black = t.c === 'b'
    const red = lr && !lr.ok && lr.uid === v.meUid && lr.id === t.id && t.up
    let onClick = null, sel2 = false
    if (setupArrange && t.j && !t.drawn) { onClick = () => setMoveSel(moveSel === t.idx ? null : t.idx); sel2 = moveSel === t.idx }
    else if (selfrevealing && !t.up && !t.drawn) onClick = () => act('selfreveal', { pos: t.idx })
    const badge = t.drawn ? { c: 'drawn', t: '방금 뽑음' } : null
    return (
      <span key={i} className="dvt-wrap">
        {badge && <span className={`dvt-badge ${badge.c}`}>{badge.t}</span>}
        <button type="button" className={`dvt ${black ? 'blk' : 'wht'} ${t.drawn ? 'drawn' : ''} ${sel2 ? 'sel' : ''} ${red ? 'bad lift' : ''} ${onClick ? 'clk' : ''}`}
          disabled={!onClick} onClick={onClick}>{t.j ? '-' : t.n}</button>
        {t.up && <span className={`dvt-dot ${red ? 'bad' : 'exposed'}`} />}
      </span>
    )
  }
  const divider = (slot) => {
    const active = jokerSlot === slot
    const onClick = placing ? () => setJokerSlot(slot) : () => act('arrange', { from: moveSel, to: slot })
    return <button key={`d${slot}`} type="button" className={`dvt-div ${active ? 'on' : 'blink'}`} onClick={onClick} aria-label="여기" />
  }
  function renderMyRow() {
    const showGaps = placing || (setupArrange && moveSel != null)
    const out = []
    for (let i = 0; i < myTiles.length; i++) { if (showGaps) out.push(divider(i)); out.push(myTile(myTiles[i], i)) }
    if (showGaps) out.push(divider(myTiles.length))
    return out
  }

  // 중앙 배너
  const jokerToPlace = placing ? v.myToPlace[0].tile : null
  let banner = null
  if (jokerToPlace) banner = { tile: { ...jokerToPlace, up: true }, title: '조커(-)를 뽑았어요', sub: '내 코드에 배치할 위치를 정해 주세요' }
  else if (drawnMine && (v.phase === 'guess' || v.phase === 'decide')) banner = { tile: { ...drawnMine, up: true }, title: '더미에서 뽑아서 배치했어요', sub: myTurn ? '상대방의 타일을 하나 선택해서 추측해 주세요' : `${opp.name} 님 차례예요` }
  else if (v.drawn?.hidden) banner = { hidden: true, title: `${opp.name} 님이 뽑는 중…`, sub: '' }
  else if (v.phase === 'setup') {
    const jk = v.myHand.find((t) => t.j)
    banner = v.mySetupDone
      ? { setup: true, title: '상대 준비를 기다리는 중…', sub: '' }
      : { tile: jk ? { ...jk, up: true } : null, title: '조커(-)를 어디에 둘까요', sub: '조커를 탭한 뒤 굵은 선을 골라 배치하고 완료를 눌러요' }
  }
  else if (v.phase === 'selfreveal' && myTurn) banner = { setup: true, title: '더미가 비었어요', sub: '공개할 내 타일을 고르세요' }

  function rematch() {
    chanRef.current?.send({ type: 'broadcast', event: 'rematch', payload: { uid, name: me.name } })
    act('reset')
  }

  const iWon = v.status === 'ended' && v.winner === v.meUid
  const tgt = sel != null ? v.oppHand[sel] : null
  const tgtBlack = tgt?.c === 'b'

  return (
    <div className="om-root dv-play" ref={rootRef}>
      <div className="om-head">
        <button type="button" className="om-icon-btn" aria-label="나가기" onClick={() => navigate(-1)}><CloseIcon /></button>
        <div className="om-title">다빈치 코드</div>
        {v.status !== 'ended' && <span className={`dv-turnpill ${myTurn ? 'on' : ''}`}>{myTurn ? <><span className="om-sub-dot" /> 내 차례</> : '상대 차례'}</span>}
      </div>

      <div className="dv-body">
        {/* 상대 코드 */}
        <div className="dvc-card">
          <div className="dvc-head"><LobbyAvatar name={opp.name} avatar={opp.avatar} size={30} /><b>{opp.name} 님의 코드</b>
            <span className="dvc-count">공개 {oppUp} · 비공개 {v.oppHand.length - oppUp}</span></div>
          <div className="dvc-row">{v.oppHand.map((t, i) => oppTile(t, i))}</div>
          {myTurn && v.phase === 'guess' && <div className="dvc-hint">{sel != null ? '선택한 타일의 숫자를 추측해서 제출하세요' : '상대 타일을 하나 선택해서 추측해 주세요'}</div>}
        </div>

        {/* 중앙 배너 */}
        {banner && (
          <div className="dvc-banner">
            {banner.tile ? <span className={`dvt ${banner.tile.c === 'b' ? 'blk' : 'wht'} lg`}>{banner.tile.j ? '-' : banner.tile.n}</span>
              : banner.hidden ? <span className="dvt blk back lg"><PawMini /></span> : <span className="dvc-banner-ic">🎴</span>}
            <div className="dvc-banner-tx"><b>{banner.title}</b>{banner.sub && <span>{banner.sub}</span>}</div>
          </div>
        )}

        {/* 내 코드 */}
        <div className="dvc-card">
          <div className="dvc-head"><LobbyAvatar name={me.name} avatar={me.avatar} size={30} /><b>내 코드</b>
            <span className="dvc-count">공개 {myUp} · 비공개 {v.myHand.length - myUp}</span></div>
          <div className={`dvc-row ${placing || (setupArrange && moveSel != null) ? 'gapped' : ''}`}>{renderMyRow()}</div>
        </div>

        {/* 하단 패널 */}
        {v.status !== 'ended' && (
          <div className="dv-panel">
            {v.phase === 'setup' && !v.mySetupDone && <button type="button" className="dv-cbtn on" disabled={busy} onClick={() => act('confirm')}>배치 완료</button>}
            {placing && <button type="button" className={`dv-cbtn ${jokerSlot != null ? 'on' : ''}`} disabled={jokerSlot == null || busy} onClick={() => act('place', { slot: jokerSlot })}>{jokerSlot != null ? '이 자리로 확정' : '자리를 고르면 확정할 수 있어요'}</button>}
            {myTurn && v.phase === 'decide' && <button type="button" className="dv-cbtn ghost" disabled={busy} onClick={() => act('decide', { cont: false })}>멈추고 턴 넘기기</button>}
            {myTurn && v.phase === 'guess' && sel != null && (
              <div className="dv-guess">
                <div className="dv-guess-q">선택한 {sel + 1}번째 타일은 무엇일까요?</div>
                <div className="dv-vals">
                  {Array.from({ length: 12 }).map((_, n) => (
                    <button key={n} type="button" className={`dv-val ${tgtBlack ? 'blk' : 'wht'} ${guessVal === String(n) ? 'on' : guessVal != null ? 'dim' : ''}`} onClick={() => setGuessVal(String(n))}>{n}</button>
                  ))}
                  <button type="button" className={`dv-val ${tgtBlack ? 'blk' : 'wht'} ${guessVal === 'joker' ? 'on' : guessVal != null ? 'dim' : ''}`} onClick={() => setGuessVal('joker')}>-</button>
                </div>
                <button type="button" className={`dv-cbtn ${tgtBlack ? 'blk' : 'wht'} ${guessVal != null ? 'on' : ''}`} disabled={guessVal == null || busy} onClick={() => act('guess', { pos: sel, val: guessVal })}>추측하기</button>
              </div>
            )}
          </div>
        )}
        {err && <div className="dv-err">{err}</div>}
      </div>

      {v.status === 'ended' && (
        <div className="om-sheet-wrap">
          {toast && <div className="om-toast">{toast}</div>}
          <div className="om-sheet">
            {iWon
              ? <><div className="om-sheet-emoji">🏆</div><div className="om-sheet-title">이겼다! 🎉</div>
                  <div className="om-sheet-sub">{v.settledAmount > 0 ? <>{opp.name} 님의 츄르 <b>{v.settledAmount}개</b>를 받았어요</> : '한 판 잘했어요!'}</div></>
              : <><div className="om-sheet-title big">LOSE!</div>
                  <div className="om-sheet-sub">{v.settledAmount > 0 ? <>츄르 <b className="lose">{v.settledAmount}개</b>를 {opp.name} 님께 보냈어요</> : '다음 판을 노려요!'}</div></>}
            <button type="button" className="om-again" disabled={busy} onClick={rematch}>선후공 바꿔서 한 판 더!</button>
            <button type="button" className="om-tolobby" disabled={busy} onClick={() => act('reset')}>대기실로 돌아가기</button>
          </div>
        </div>
      )}
      {toast && v.status !== 'ended' && <div className="om-toast dv-toast-float">{toast}</div>}
      {ruleOn && <DvRuleModal onClose={() => setRuleOn(false)} />}
    </div>
  )
}

function DvRuleModal({ onClose }) {
  const rules = [
    '숫자 타일을 오름차순으로 두고, 같은 숫자면 검정이 왼쪽',
    '상대 타일 하나를 골라 숫자를 추측해요',
    '맞히면 그 타일이 공개되고 계속 추측하거나 멈출 수 있어요',
    '틀리면 방금 뽑은 내 타일이 공개되고 턴이 넘어가요',
    '조커(-)는 어디든 놓을 수 있어요 · 상대 타일을 모두 공개시키면 승리! 🐾',
  ]
  return (
    <div className="om-modal-back" onClick={onClose}>
      <div className="om-modal" onClick={(e) => e.stopPropagation()}>
        <div className="om-modal-head"><div className="om-modal-title">다빈치 코드, 이렇게 해요</div>
          <button type="button" className="om-icon-btn sm" aria-label="닫기" onClick={onClose}><CloseIcon /></button></div>
        <div className="om-modal-rules">
          {rules.map((r, i) => <div key={i} className="om-rule"><span className="om-rule-n">{i + 1}</span>{r}</div>)}
        </div>
        <button type="button" className="om-modal-ok" onClick={onClose}>알겠어요</button>
      </div>
    </div>
  )
}
