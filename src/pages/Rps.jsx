import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { getGroupMemberMap, settleRps, getMyCoinBalance } from '../lib/api'

const uuid = () => (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.round(Math.random() * 1e9)}`)
const PICK_SEC = 3
const HANDS = [
  { key: 'scissors', emoji: '✌️', label: '가위' },
  { key: 'rock', emoji: '✊', label: '바위' },
  { key: 'paper', emoji: '🖐️', label: '보' },
]
const EMO = { scissors: '✌️', rock: '✊', paper: '🖐️' }
const beats = { rock: 'scissors', scissors: 'paper', paper: 'rock' }
// 1 = a승 / -1 = b승 / 0 = 무
function judge(a, b) { if (a === b) return 0; if (!a) return b ? -1 : 0; if (!b) return 1; return beats[a] === b ? 1 : -1 }
const winLine = (w) => ({ rock: '바위가 가위를 이겼다! ✊', paper: '보가 바위를 이겼다! 🖐️', scissors: '가위가 보를 이겼다! ✌️' }[w] || '')

const BackIcon = () => <svg width="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 6 9 12 15 18" /></svg>
const CloseIcon = () => <svg width="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
const SendIcon = () => <svg width="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>
const PersonIcon = () => <svg width="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
function Av({ name, avatar, size = 44 }) {
  return avatar
    ? <img className="om-av-img" src={avatar} alt="" style={{ width: size, height: size }} />
    : <span className="om-av-ini" style={{ width: size, height: size }}>{(name || '?').slice(0, 1)}</span>
}

const WAGER_PRESETS = ['진 사람이 설거지하기', '이긴 사람 소원 들어주기']

export default function Rps() {
  const { groupId } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const uid = profile?.id

  const chanRef = useRef(null)
  const rootRef = useRef(null)
  const chatEndRef = useRef(null)
  const seenPeers = useRef(new Set())
  const picksRef = useRef({})       // { round: { uid: choice } }
  const revealedRef = useRef(-1)
  const applyRef = useRef(null)

  const [peers, setPeers] = useState({})
  const peersRef = useRef(peers); peersRef.current = peers
  const [members, setMembers] = useState({})
  const membersRef = useRef(members); membersRef.current = members
  const myName = useRef(profile?.login_id || '')
  const myAvatar = useRef(profile?.avatar_url || null)
  const [myBal, setMyBal] = useState(0)
  const myBalRef = useRef(0)

  const [lob, setLob] = useState({ seats: [null, null], bet: 5, betType: 'chur', wager: '', rounds: 'best3' })
  const lobRef = useRef(lob); lobRef.current = lob
  const [g, setGraw] = useState({ phase: 'lobby', players: [], round: 1, wins: {}, result: null, gameId: null, bet: 5, betType: 'chur', wager: '', rounds: 'best3', endsAt: 0, settle: null })
  const gRef = useRef(g)
  const setG = useCallback((up) => setGraw((p) => { const n = typeof up === 'function' ? up(p) : up; gRef.current = n; return n }), [])
  const [chat, setChat] = useState([])
  const [draft, setDraft] = useState('')
  const [now, setNow] = useState(Date.now())
  const [myPick, setMyPick] = useState(null)

  const emit = useCallback((type, payload) => { chanRef.current?.send({ type: 'broadcast', event: type, payload }) }, [])
  const broadcastLobby = useCallback((n) => emit('lobby', n), [emit])
  const pushChat = useCallback((m) => setChat((c) => [...c.slice(-80), m]), [])
  const memberName = useCallback((u) => membersRef.current[u]?.name || peersRef.current[u]?.name || (u === uid ? myName.current : '?'), [uid])
  const memberAvatar = useCallback((u) => membersRef.current[u]?.avatar ?? (u === uid ? myAvatar.current : peersRef.current[u]?.avatar) ?? null, [uid])

  const presentUids = [...new Set([uid, ...Object.keys(peers)])]
  const isSmall = Math.max(Object.keys(members).length, presentUids.length) <= 2

  // 참여 인원 중 최소 보유 츄르 기준 베팅 상한(5단위 내림, 최대 20)
  const capFromBals = () => { const bals = [myBalRef.current, ...Object.values(peersRef.current).map((p) => p.bal)].filter((b) => typeof b === 'number'); return bals.length ? Math.max(0, Math.min(20, Math.floor(Math.min(...bals) / 5) * 5)) : 20 }
  const betCap = (() => { const bals = [myBal, ...Object.values(peers).map((p) => p.bal)].filter((b) => typeof b === 'number'); return bals.length ? Math.max(0, Math.min(20, Math.floor(Math.min(...bals) / 5) * 5)) : 20 })()

  // 현재 판 참가자 2명
  const playerUids = isSmall ? presentUids.slice(0, 2) : lob.seats.filter(Boolean)

  const maybeSettle = useCallback((winner, loser, bet, gameId) => {
    if (!winner || winner !== uid || !gameId) return
    if (!bet) { const r = { ok: true, bet: 0 }; emit('settle', r); applyRef.current('settle', r); return }
    settleRps(groupId, gameId, winner, loser, bet).then((r) => { emit('settle', r); applyRef.current('settle', r) }).catch(() => {})
  }, [uid, groupId, emit])

  // 판정: 현재 round 의 두 pick 으로 결과 산출(양쪽 클라 결정론적)
  const reveal = useCallback(() => {
    const st = gRef.current
    if (st.phase !== 'play' || revealedRef.current === st.round) return
    const [a, b] = st.players.map((p) => p.uid)
    const pk = picksRef.current[st.round] || {}
    const pa = pk[a] || null, pb = pk[b] || null
    revealedRef.current = st.round
    const j = judge(pa, pb)
    const wins = { ...st.wins }
    let roundWinner = null
    if (j === 1) { roundWinner = a; wins[a] = (wins[a] || 0) + 1 }
    else if (j === -1) { roundWinner = b; wins[b] = (wins[b] || 0) + 1 }
    const need = st.rounds === 'best3' ? 2 : 1
    const decidedUid = Object.keys(wins).find((u) => wins[u] >= need)
    const done = st.rounds === 'single' ? j !== 0 : !!decidedUid
    setG((s) => ({ ...s, phase: 'result', wins, result: { pa, pb, roundWinner, draw: j === 0 }, done }))
    if (done && roundWinner) {
      const loser = st.players.find((p) => p.uid !== roundWinner)?.uid
      if (st.betType === 'chur') maybeSettle(roundWinner, loser, st.bet, st.gameId)
    }
  }, [setG, maybeSettle])

  const apply = useCallback((type, pl) => {
    if (type === 'lobby') setLob({ seats: pl.seats || [null, null], bet: pl.bet ?? 5, betType: pl.betType || 'chur', wager: pl.wager || '', rounds: pl.rounds || 'best3' })
    else if (type === 'lobby_req') { if (gRef.current.phase === 'lobby') broadcastLobby(lobRef.current) }
    else if (type === 'chat') pushChat(pl)
    else if (type === 'start') {
      picksRef.current = {}; revealedRef.current = -1; setMyPick(null)
      setG({ phase: 'play', players: pl.players, round: 1, wins: {}, result: null, gameId: pl.gameId, bet: pl.bet, betType: pl.betType, wager: pl.wager, rounds: pl.rounds, endsAt: Date.now() + PICK_SEC * 1000, settle: null })
    } else if (type === 'pick') {
      const r = picksRef.current[pl.round] || (picksRef.current[pl.round] = {})
      r[pl.uid] = pl.choice
      const st = gRef.current
      if (st.phase === 'play' && st.round === pl.round) {
        const [a, b] = st.players.map((p) => p.uid)
        if (r[a] && r[b]) reveal()
      }
    } else if (type === 'next') {
      const st = gRef.current
      if (st.phase !== 'result' || st.done || pl.round !== st.round + 1) return
      setMyPick(null)
      setG((s) => ({ ...s, phase: 'play', round: pl.round, result: null, endsAt: Date.now() + PICK_SEC * 1000 }))
    } else if (type === 'settle') {
      setG((s) => ({ ...s, settle: pl }))
    } else if (type === 'reset') {
      setMyPick(null); picksRef.current = {}; revealedRef.current = -1
      setG((s) => ({ ...s, phase: 'lobby', players: [], round: 1, wins: {}, result: null, gameId: null }))
    }
  }, [setG, broadcastLobby, pushChat, reveal])
  applyRef.current = apply

  useEffect(() => {
    if (!groupId || !uid) return
    const ch = supabase.channel(`rps:${groupId}`, { config: { broadcast: { self: false }, presence: { key: uid } } })
    chanRef.current = ch
    const retrack = () => { if (ch.state === 'joined') ch.track({ uid, name: myName.current, avatar: myAvatar.current, bal: myBalRef.current }).catch(() => {}) }
    getGroupMemberMap(groupId).then((mm) => {
      setMembers(mm); if (mm[uid]) { myName.current = mm[uid].name; myAvatar.current = mm[uid].avatar } retrack()
      if (!seenPeers.current.has(uid)) { seenPeers.current.add(uid); if (gRef.current.phase === 'lobby') setChat((c) => [...c.slice(-80), { id: uuid(), sys: true, text: `${myName.current} 님 등장! 🐾` }]) }
    }).catch(() => {})
    getMyCoinBalance().then((b) => { myBalRef.current = b; setMyBal(b); retrack() }).catch(() => {})
    ;['lobby', 'lobby_req', 'chat', 'start', 'pick', 'next', 'settle', 'reset'].forEach((ev) => ch.on('broadcast', { event: ev }, ({ payload }) => applyRef.current(ev, payload)))
    ch.on('presence', { event: 'join' }, ({ key }) => {
      if (key === uid || seenPeers.current.has(key)) return
      seenPeers.current.add(key)
      if (gRef.current.phase === 'lobby') setChat((c) => [...c.slice(-80), { id: uuid(), sys: true, text: `${membersRef.current[key]?.name || '누군가'} 님 등장! 🐾` }])
    })
    ch.on('presence', { event: 'sync' }, () => { const st = ch.presenceState(), map = {}; for (const k of Object.keys(st)) { if (k === uid) continue; const p = st[k][0] || {}; map[k] = { name: p.name || '?', avatar: p.avatar || null, bal: p.bal } } setPeers(map) })
    ch.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
      if (key === uid) return
      seenPeers.current.delete(key)
      if (gRef.current.phase !== 'lobby') return
      const nm = membersRef.current[key]?.name || peersRef.current[key]?.name || leftPresences?.[0]?.name || '누군가'
      setChat((c) => [...c.slice(-80), { id: uuid(), sys: true, text: `${nm} 님 퇴장 👋` }])
      setLob((l) => (l.seats.includes(key) ? { ...l, seats: l.seats.map((s) => (s === key ? null : s)) } : l))
    })
    ch.subscribe(async (s) => { if (s === 'SUBSCRIBED') { retrack(); setTimeout(() => emit('lobby_req', {}), 200) } })
    return () => { supabase.removeChannel(ch); chanRef.current = null }
  }, [groupId, uid, emit])

  useEffect(() => { const vv = window.visualViewport; if (!vv) return; const fit = () => { const el = rootRef.current; if (!el) return; el.style.height = vv.height + 'px'; el.style.top = (vv.offsetTop || 0) + 'px' }; fit(); vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); return () => { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit) } }, [])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ block: 'end' }) }, [chat])
  useEffect(() => { if (g.phase !== 'play') return; const t = setInterval(() => setNow(Date.now()), 100); return () => clearInterval(t) }, [g.phase, g.round])
  // 마감 시간 지나면 판정(양쪽 각자)
  useEffect(() => { if (g.phase === 'play' && g.endsAt && now >= g.endsAt) reveal() }, [g.phase, g.endsAt, now, reveal])
  // 참여 인원 보유 츄르가 바뀌어 상한이 내려가면 베팅도 자동으로 낮춘다
  useEffect(() => { if (gRef.current.phase === 'lobby' && (lobRef.current.bet || 0) > betCap) changeBet(0) }, [betCap])

  // ---- 조작 ----
  const changeBet = (d) => setLob((l) => { const bet = Math.max(0, Math.min(capFromBals(), (l.bet || 0) + d)); const n = { ...l, bet }; broadcastLobby(n); return n })
  function claimSeat(i) {
    setLob((l) => {
      const seats = [...l.seats]
      const mineAt = seats.indexOf(uid)
      if (seats[i] === uid) seats[i] = null
      else if (!seats[i]) { if (mineAt >= 0) seats[mineAt] = null; seats[i] = uid }
      else return l
      const n = { ...l, seats }; broadcastLobby(n); return n
    })
  }
  const setLobField = (patch) => setLob((l) => { const n = { ...l, ...patch }; broadcastLobby(n); return n })
  function sendChat(e) { e?.preventDefault?.(); const text = draft.trim(); if (!text) return; const m = { id: uuid(), uid, text }; emit('chat', m); pushChat(m); setDraft('') }
  function startGame() {
    const pu = isSmall ? presentUids.slice(0, 2) : lobRef.current.seats.filter(Boolean)
    if (pu.length < 2) { alert('두 명이 있어야 시작할 수 있어요.'); return }
    if (lobRef.current.betType === 'custom' && !lobRef.current.wager.trim()) { alert('내기 내용을 입력해 주세요.'); return }
    const players = pu.map((u) => ({ uid: u, name: memberName(u), avatar: memberAvatar(u) }))
    const l = lobRef.current
    const payload = { players, gameId: uuid(), bet: l.bet, betType: l.betType, wager: l.wager.trim(), rounds: l.rounds }
    emit('start', payload); apply('start', payload)
  }
  function pick(choice) {
    if (g.phase !== 'play' || myPick || now >= g.endsAt) return
    setMyPick(choice)
    const r = picksRef.current[g.round] || (picksRef.current[g.round] = {})
    r[uid] = choice
    emit('pick', { uid, choice, round: g.round })
    const [a, b] = g.players.map((p) => p.uid)
    if (r[a] && r[b]) reveal()
  }
  function nextRound() { const nr = g.round + 1; emit('next', { round: nr }); apply('next', { round: nr }) }
  function backToLobby() { emit('reset', {}); apply('reset', {}) }

  const remain = Math.max(0, Math.ceil((g.endsAt - now) / 1000))
  const iAmPlayer = g.players.some((p) => p.uid === uid)

  const chatBox = (
    <div className="om-chat">
      <div className="om-chat-scroll">
        {chat.map((m) => m.sys
          ? <div key={m.id} className="om-chat-sys">{m.text}</div>
          : m.uid === uid
            ? <div key={m.id} className="om-chat-row om-me"><span className="om-bubble om-me">{m.text}</span></div>
            : <div key={m.id} className="om-chat-row"><Av name={memberName(m.uid)} avatar={memberAvatar(m.uid)} size={26} /><div className="om-chat-msg"><span className="om-chat-nm">{memberName(m.uid)}</span><span className="om-bubble">{m.text}</span></div></div>)}
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

  // ===== 대기실 (14n) =====
  if (g.phase === 'lobby') {
    const canStart = playerUids.length === 2 && (lob.betType !== 'custom' || lob.wager.trim())
    return (
      <div className="om-root rps-lobby" ref={rootRef}>
        <div className="om-head">
          <button type="button" className="om-icon-btn" aria-label="뒤로" onClick={() => navigate(-1)}><BackIcon /></button>
          <div className="om-title">가위바위보</div><span className="om-pill">대기실</span>
          {!isSmall && <span className="cm-count">👥 {presentUids.length}</span>}
        </div>
        {chatBox}
        {isSmall ? (
          <div className="cm-cards">
            {presentUids.slice(0, 2).map((u) => (
              <div key={u} className="cm-card rdy"><Av name={memberName(u)} avatar={memberAvatar(u)} size={44} />
                <div className="cm-card-info"><div className="cm-card-nm">{memberName(u)}{u === uid && <span className="om-badge-me">나</span>}</div>
                  <div className="cm-card-st on">✓ 준비 완료</div></div></div>
            ))}
          </div>
        ) : (
          <div className="om-seats"><div className="om-seats-row">
            {[0, 1].map((i) => {
              const su = lob.seats[i]; const mine = su === uid
              return (
                <div key={i} className={`om-seat ${su ? 'taken' : 'empty'} ${mine ? 'mine' : ''}`} role="button" tabIndex={0} onClick={() => (!su || mine) && claimSeat(i)}>
                  {su ? <><Av name={memberName(su)} avatar={memberAvatar(su)} size={52} /><div className="om-seat-name">{memberName(su)}{mine && <span className="om-badge-me">나</span>}</div></>
                    : <><span className="om-seat-empty"><PersonIcon /></span><div className="om-seat-wait">{mine ? '나가기' : '탭해서 참여'}</div></>}
                </div>
              )
            })}
          </div><div className="om-seats-hint">빈 자리를 <b>탭</b>해서 참여하세요 · 먼저 앉은 두 명이 대결해요</div></div>
        )}

        <div className="rps-sec-t">무엇을 걸까요?</div>
        <div className="rps-seg">
          <button type="button" className={lob.betType === 'chur' ? 'on' : ''} onClick={() => setLobField({ betType: 'chur' })}>🐾 츄르 걸기</button>
          <button type="button" className={lob.betType === 'custom' ? 'on' : ''} onClick={() => setLobField({ betType: 'custom' })}>✍️ 직접 작성</button>
        </div>
        {lob.betType === 'chur' ? (
          <div className="om-bet">
            <div className="om-bet-l"><div className="om-bet-t">츄르 베팅</div><div className="om-bet-s">이긴 사람이 전부 가져가요 🐾 · 최대 {betCap}개</div></div>
            <button type="button" className="om-bet-btn" onClick={() => changeBet(-5)}>−</button>
            <span className="om-bet-val">{lob.bet}</span>
            <button type="button" className="om-bet-btn" onClick={() => changeBet(5)} disabled={lob.bet >= betCap}>+</button>
          </div>
        ) : (
          <div className="rps-wager">
            <div className="rps-wager-t">우리만의 내기</div>
            <input className="rps-wager-in" value={lob.wager} maxLength={30} onChange={(e) => setLobField({ wager: e.target.value })} placeholder="어떤 내기를 걸까요?" />
            <div className="rps-wager-chips">{WAGER_PRESETS.map((w) => <button key={w} type="button" className="rps-chip" onClick={() => setLobField({ wager: w })}>{w}</button>)}</div>
          </div>
        )}

        <div className="rps-sec-t">몇 판 할까요?</div>
        <div className="rps-seg">
          <button type="button" className={lob.rounds === 'single' ? 'on' : ''} onClick={() => setLobField({ rounds: 'single' })}>단판 승부</button>
          <button type="button" className={lob.rounds === 'best3' ? 'on' : ''} onClick={() => setLobField({ rounds: 'best3' })}>삼세판 (먼저 2승)</button>
        </div>

        <div className="rps-start-wrap">
          <button type="button" className={`rps-start ${canStart ? 'on' : ''}`} disabled={!canStart} onClick={startGame}>시작하기 — 가위바위보!</button>
          <div className="rps-start-hint">누르면 둘 다 <b>3초</b> 안에 내야 해요 ⏱</div>
        </div>
      </div>
    )
  }

  // 게임/결과 공통 상단(플레이어)
  const [pa, pb] = g.players
  const wagerLabel = g.betType === 'chur' ? `🐾 츄르 ${g.bet}개` : `✍️ ${g.wager || '우리만의 내기'}`
  const roundsLabel = g.rounds === 'best3' ? '삼세판' : '단판'

  // ===== 선택 화면 (14o) =====
  if (g.phase === 'play') {
    const oppPicked = g.players.some((p) => p.uid !== uid && (picksRef.current[g.round] || {})[p.uid])
    const ring = Math.max(0, Math.min(1, (g.endsAt - now) / (PICK_SEC * 1000)))
    const R = 46, C = 2 * Math.PI * R
    return (
      <div className="om-root rps-play" ref={rootRef}>
        <div className="rps-status">
          <span className={`rps-pill ${myPick ? 'done' : ''}`}><Av name={memberName(uid)} avatar={memberAvatar(uid)} size={22} />{myPick ? '선택 완료!' : '선택 중…'}</span>
          {iAmPlayer && pa && pb && (() => { const opp = g.players.find((p) => p.uid !== uid); return (
            <span className={`rps-pill ${oppPicked ? 'done' : ''}`}><Av name={opp?.name} avatar={opp?.avatar} size={22} />{oppPicked ? '선택 완료!' : '선택 중…'}</span>) })()}
        </div>
        <div className="rps-timer-ring">
          <svg viewBox="0 0 110 110" width="130" height="130">
            <circle cx="55" cy="55" r={R} fill="none" stroke="#e7e3f7" strokeWidth="8" />
            <circle cx="55" cy="55" r={R} fill="none" stroke="#7363e8" strokeWidth="8" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C * (1 - ring)} transform="rotate(-90 55 55)" />
          </svg>
          <span className="rps-timer-n">{remain}</span>
        </div>
        <div className="rps-call">안 내면 진 거! 가위바위보!</div>
        <div className="rps-hands">
          {HANDS.map((h) => (
            <button key={h.key} type="button" className={`rps-hand ${myPick === h.key ? 'on' : ''}`} disabled={!!myPick || !iAmPlayer} onClick={() => pick(h.key)}>
              {myPick === h.key && <span className="rps-hand-badge">낸다!</span>}
              <span className="rps-hand-emo">{h.emoji}</span>
            </button>
          ))}
        </div>
        {!iAmPlayer && <div className="rps-spectate">관전 중 — 다음 판은 대기실에서 참여할 수 있어요</div>}
        <div className="rps-wager-pill">{roundsLabel} · {wagerLabel}</div>
      </div>
    )
  }

  // ===== 결과 (14p) =====
  const res = g.result || {}
  const aWon = res.roundWinner === pa?.uid
  const bWon = res.roundWinner === pb?.uid
  const iWon = res.roundWinner === uid
  const meWin = g.wins[uid] || 0
  const oppUid = g.players.find((p) => p.uid !== uid)?.uid
  const oppWin = g.wins[oppUid] || 0
  return (
    <div className="om-root rps-result" ref={rootRef}>
      <div className="rps-res-scoreline">
        {roundsLabel}{g.rounds === 'best3' && <> <b>{g.wins[pa?.uid] || 0} : {g.wins[pb?.uid] || 0}</b> 먼저 2승!</>}
      </div>
      <div className="rps-res-hands">
        <div className={`rps-res-h ${aWon ? 'win' : res.draw ? '' : 'lose'}`}>
          <div className="rps-res-emo">{EMO[res.pa] || '❔'}</div>
          {!res.draw && <span className={`rps-res-badge ${aWon ? 'w' : 'l'}`}>{aWon ? '승' : '패'}</span>}
          <div className="rps-res-nm"><Av name={pa?.name} avatar={pa?.avatar} size={20} />{pa?.name}{pa?.uid === uid && <span className="om-badge-me">나</span>}</div>
        </div>
        <span className="rps-res-vs">VS</span>
        <div className={`rps-res-h ${bWon ? 'win' : res.draw ? '' : 'lose'}`}>
          <div className="rps-res-emo">{EMO[res.pb] || '❔'}</div>
          {!res.draw && <span className={`rps-res-badge ${bWon ? 'w' : 'l'}`}>{bWon ? '승' : '패'}</span>}
          <div className="rps-res-nm"><Av name={pb?.name} avatar={pb?.avatar} size={20} />{pb?.name}{pb?.uid === uid && <span className="om-badge-me">나</span>}</div>
        </div>
      </div>
      <div className="rps-res-title">{res.draw ? '비겼어요! 🤝' : winLine(res.roundWinner === pa?.uid ? res.pa : res.pb)}</div>
      <div className="rps-res-sub">
        {res.draw ? '다시 한 번 내볼까요?'
          : g.done ? (iWon ? '최종 승리! 🎉' : `${g.players.find((p) => p.uid === res.roundWinner)?.name} 님 최종 승리`)
            : (iWon ? '승리 — 한 판만 더 이기면 끝!' : '아쉽네요 — 다음 판에 뒤집어요!')}
      </div>

      <div className="rps-res-wager">
        <div className="rps-res-wager-l"><span>{g.betType === 'chur' ? '🐾 걸린 츄르' : '✍️ 걸린 내기'}</span>
          <b>{g.betType === 'chur' ? `${g.bet}개 — 이긴 사람이 전부` : (g.wager || '우리만의 내기')}</b></div>
        <span className="rps-res-record">{meWin}승 {g.round - meWin - oppWin >= 0 ? (g.round - meWin - oppWin) : 0}무 {oppWin}패</span>
      </div>
      {g.done && g.betType === 'chur' && g.bet > 0 && (
        <div className="rps-res-coin">{!g.settle ? '정산 중…' : g.settle.bet > 0 ? (iWon ? `🐾 츄르 ${g.settle.bet}개 획득!` : `🐾 츄르 ${g.settle.bet}개 잃음`) : ''}</div>
      )}

      <div className="rps-res-btns">
        {res.draw
          ? <button type="button" className="rps-start on" onClick={nextRound}>다시 내기 — 가위바위보!</button>
          : g.done
            ? <button type="button" className="rps-start on" onClick={backToLobby}>대기실로 돌아가기</button>
            : <button type="button" className="rps-start on" onClick={nextRound}>다음 판 — 가위바위보!</button>}
        {!res.draw && !g.done && <button type="button" className="rps-quit" onClick={backToLobby}>그만하기</button>}
      </div>
      <button type="button" className="om-icon-btn rps-close" aria-label="나가기" onClick={() => navigate(-1)}><CloseIcon /></button>
    </div>
  )
}
