import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { getGroupMemberMap, settleOmok, getOmokState, saveOmokState, getMyCoinBalance } from '../lib/api'

const N = 15
const GAP = 28, MARGIN = 22
const SIZE = MARGIN * 2 + GAP * (N - 1)
const STARS = [[3, 3], [3, 11], [11, 3], [11, 11], [7, 7]]
const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]]
const MAX_BET = 20, BET_STEP = 5
const emptyBoard = () => Array.from({ length: N }, () => Array(N).fill(0))
const newGameId = () => (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.round(Math.random() * 1e9)}`)

// 표준룰: 놓은 돌을 지나는 연속 라인이 정확히 5면 승리(6목 이상 무효)
function checkWin(board, r, c, color) {
  for (const [dr, dc] of DIRS) {
    const cells = [[r, c]]
    for (let s = 1; ; s++) { const nr = r + dr * s, nc = c + dc * s; if (nr < 0 || nr >= N || nc < 0 || nc >= N || board[nr][nc] !== color) break; cells.push([nr, nc]) }
    for (let s = 1; ; s++) { const nr = r - dr * s, nc = c - dc * s; if (nr < 0 || nr >= N || nc < 0 || nc >= N || board[nr][nc] !== color) break; cells.unshift([nr, nc]) }
    if (cells.length === 5) return cells
  }
  return null
}

const BackIcon = () => <svg width="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 6 9 12 15 18" /></svg>
const CloseIcon = () => <svg width="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
const SendIcon = () => <svg width="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>
const PersonIcon = () => <svg width="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>

function Avatar({ name, avatar, size = 40 }) {
  return avatar
    ? <img className="om-av-img" src={avatar} alt="" style={{ width: size, height: size }} />
    : <span className="om-av-ini" style={{ width: size, height: size }}>{(name || '?').slice(0, 1)}</span>
}

export default function Omok() {
  const { groupId } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const uid = profile?.id

  const chanRef = useRef(null)
  const rootRef = useRef(null)
  const chatEndRef = useRef(null)
  const boardRef = useRef(null)
  const applyRef = useRef(null)
  const seenPeers = useRef(new Set())

  const [peers, setPeers] = useState({})
  const peersRef = useRef(peers); peersRef.current = peers
  const [members, setMembers] = useState({})
  const membersRef = useRef(members); membersRef.current = members
  const myName = useRef(profile?.login_id || '')
  const myAvatar = useRef(profile?.avatar_url || null)
  const [myBal, setMyBal] = useState(0)
  const myBalRef = useRef(0)

  const [g, setGraw] = useState({
    phase: 'lobby', board: emptyBoard(), turn: 1, black: null, white: null, bet: 5,
    winner: null, line: null, reason: null, last: null, gameId: null, settle: null, rematch: [],
  })
  const gRef = useRef(g)
  const setG = useCallback((up) => setGraw((p) => { const n = typeof up === 'function' ? up(p) : up; gRef.current = n; return n }), [])

  const [chat, setChat] = useState([])
  const [draft, setDraft] = useState('')
  const [ruleOn, setRuleOn] = useState(false)
  const [toast, setToast] = useState('')

  const emit = useCallback((type, payload) => { chanRef.current?.send({ type: 'broadcast', event: type, payload }) }, [])
  const pushSys = useCallback((text) => setChat((c) => [...c.slice(-80), { id: newGameId(), sys: true, text }]), [])
  const pushMsg = useCallback((m) => setChat((c) => [...c.slice(-80), m]), [])

  const memberName = useCallback((u) => membersRef.current[u]?.name || peersRef.current[u]?.name || (u === uid ? myName.current : '?'), [uid])
  const memberAvatar = useCallback((u) => membersRef.current[u]?.avatar ?? (u === uid ? myAvatar.current : peersRef.current[u]?.avatar) ?? null, [uid])

  const myColor = g.black?.uid === uid ? 1 : g.white?.uid === uid ? 2 : 0
  const myTurn = g.phase === 'play' && g.turn === myColor

  // 참여 인원 중 최소 보유 츄르 기준으로 베팅 상한(5단위 내림, 최대 20)
  const capFromBals = useCallback(() => {
    const bals = [myBalRef.current, ...Object.values(peersRef.current).map((p) => p.bal)].filter((b) => typeof b === 'number')
    return bals.length ? Math.max(0, Math.min(MAX_BET, Math.floor(Math.min(...bals) / BET_STEP) * BET_STEP)) : MAX_BET
  }, [])
  const betCap = (() => { const bals = [myBal, ...Object.values(peers).map((p) => p.bal)].filter((b) => typeof b === 'number'); return bals.length ? Math.max(0, Math.min(MAX_BET, Math.floor(Math.min(...bals) / BET_STEP) * BET_STEP)) : MAX_BET })()

  const broadcastLobby = useCallback((n) => emit('lobby', { black: n.black, white: n.white, bet: n.bet }), [emit])

  // 승자 클라이언트만 정산 호출 → 브로드캐스트로 양쪽 반영
  const maybeSettle = useCallback((winner, loser, bet, gameId) => {
    if (!winner || !loser || winner.uid !== uid || !gameId) return
    if (!bet) { const res = { ok: true, bet: 0 }; emit('settle', res); applyRef.current('settle', res); return }
    settleOmok(groupId, gameId, winner.uid, loser.uid, bet)
      .then((res) => { emit('settle', res); applyRef.current('settle', res) })
      .catch(() => {})
  }, [uid, groupId, emit])

  const apply = useCallback((type, pl) => {
    if (type === 'chat') {
      pushMsg({ id: pl.id, uid: pl.uid, name: pl.name, avatar: pl.avatar, text: pl.text })
    } else if (type === 'lobby') {
      setG((st) => st.phase === 'lobby' ? { ...st, black: pl.black, white: pl.white, bet: pl.bet } : st)
    } else if (type === 'lobby_req') {
      const st = gRef.current
      if (st.phase === 'lobby') broadcastLobby(st)
    } else if (type === 'game_start') {
      setG((st) => st.phase === 'play' ? st : {
        ...st, phase: 'play', board: emptyBoard(), turn: 1,
        black: pl.black, white: pl.white, bet: pl.bet, gameId: pl.gameId,
        winner: null, line: null, reason: null, last: null, settle: null, rematch: [],
      })
    } else if (type === 'move') {
      const st = gRef.current
      if (st.phase !== 'play' || st.turn !== pl.color || st.board[pl.r][pl.c] !== 0) return
      const board = st.board.map((row) => row.slice()); board[pl.r][pl.c] = pl.color
      const line = checkWin(board, pl.r, pl.c, pl.color)
      const full = !line && board.every((row) => row.every((v) => v !== 0))
      if (line) {
        const winner = pl.color === 1 ? st.black : st.white
        const loser = pl.color === 1 ? st.white : st.black
        setG({ ...st, board, last: [pl.r, pl.c], phase: 'ended', winner, line, reason: 'five' })
        maybeSettle(winner, loser, st.bet, st.gameId)
      } else if (full) setG({ ...st, board, last: [pl.r, pl.c], phase: 'ended', winner: null, reason: 'draw' })
      else setG({ ...st, board, last: [pl.r, pl.c], turn: pl.color === 1 ? 2 : 1 })
    } else if (type === 'resign') {
      const st = gRef.current
      if (st.phase !== 'play') return
      const winner = st.black?.uid === pl.by ? st.white : st.black
      const loser = st.black?.uid === pl.by ? st.black : st.white
      setG({ ...st, phase: 'ended', winner, reason: 'resign' })
      maybeSettle(winner, loser, st.bet, st.gameId)
    } else if (type === 'settle') {
      setG((st) => ({ ...st, settle: pl }))
    } else if (type === 'rematch') {
      if (pl.uid !== uid) { setToast(`${pl.name} 님이 한 판 더 하고 싶대요`); setTimeout(() => setToast(''), 4000) }
      setG((st) => {
        const set = new Set(st.rematch || []); set.add(pl.uid)
        const n = { ...st, rematch: [...set] }
        const bothIn = n.black && n.white && set.has(n.black.uid) && set.has(n.white.uid)
        if (bothIn && st.phase === 'ended') {
          const newBlack = st.white, newWhite = st.black   // 색 교환
          if (uid === newBlack.uid) {                       // 새 흑(=이전 백)만 시작을 방송
            const spl = { black: newBlack, white: newWhite, bet: st.bet || 0, gameId: newGameId() }
            setTimeout(() => { emit('game_start', spl); applyRef.current('game_start', spl) }, 30)
          }
        }
        return n
      })
    } else if (type === 'reset') {
      setG((st) => ({ ...st, phase: 'lobby', board: emptyBoard(), turn: 1, winner: null, line: null, reason: null, last: null, gameId: null, settle: null, rematch: [] }))
    }
    if (['game_start', 'move', 'resign', 'settle', 'reset'].includes(type)) saveOmokState(groupId, gRef.current).catch(() => {})
  }, [setG, maybeSettle, broadcastLobby, pushMsg, emit, uid, groupId])
  applyRef.current = apply

  useEffect(() => {
    if (!groupId || !uid) return
    const ch = supabase.channel(`omok:${groupId}`, { config: { broadcast: { self: false }, presence: { key: uid } } })
    chanRef.current = ch
    const retrack = () => { if (ch.state === 'joined') ch.track({ uid, name: myName.current, avatar: myAvatar.current, bal: myBalRef.current }).catch(() => {}) }
    getGroupMemberMap(groupId).then((mm) => {
      setMembers(mm)
      if (mm[uid]) { myName.current = mm[uid].name; myAvatar.current = mm[uid].avatar }
      retrack()
      if (!seenPeers.current.has(uid)) { seenPeers.current.add(uid); if (gRef.current.phase === 'lobby') pushSys(`${myName.current} 님 등장! 🐾`) }
    }).catch(() => {})
    getMyCoinBalance().then((b) => { myBalRef.current = b; setMyBal(b); retrack() }).catch(() => {})
    getOmokState(groupId).then((s) => { if (s && (s.phase === 'play' || s.phase === 'ended')) setG(s) }).catch(() => {})
    ;['chat', 'lobby', 'lobby_req', 'game_start', 'move', 'resign', 'settle', 'rematch', 'reset']
      .forEach((ev) => ch.on('broadcast', { event: ev }, ({ payload }) => applyRef.current(ev, payload)))
    ch.on('presence', { event: 'join' }, ({ key, newPresences }) => {
      if (key === uid || seenPeers.current.has(key)) return
      seenPeers.current.add(key)
      const p = newPresences?.[0] || {}
      pushSys(`${membersRef.current[key]?.name || p.name || '누군가'} 님 등장! 🐾`)
    })
    ch.on('presence', { event: 'sync' }, () => {
      const st = ch.presenceState(), map = {}
      for (const k of Object.keys(st)) { if (k === uid) continue; const p = st[k][0] || {}; map[k] = { name: p.name || '?', avatar: p.avatar || null, bal: p.bal } }
      setPeers(map)
    })
    ch.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
      if (key === uid) return
      seenPeers.current.delete(key)
      if (gRef.current.phase !== 'lobby') return
      const nm = membersRef.current[key]?.name || peersRef.current[key]?.name || leftPresences?.[0]?.name || '누군가'
      pushSys(`${nm} 님 퇴장 👋`)
      setG((s) => {
        if (s.phase !== 'lobby') return s
        let n = s
        if (s.black?.uid === key) n = { ...n, black: null }
        if (s.white?.uid === key) n = { ...n, white: null }
        return n
      })
    })
    ch.subscribe(async (s) => { if (s === 'SUBSCRIBED') { retrack(); setTimeout(() => emit('lobby_req', {}), 200) } })
    return () => { supabase.removeChannel(ch); chanRef.current = null }
  }, [groupId, uid, setG, pushSys, emit])

  // 키보드가 올라와도 입력창이 보이게: 루트 높이를 실제 보이는 뷰포트에 맞춤
  useEffect(() => {
    const vv = window.visualViewport; if (!vv) return
    const fit = () => { const el = rootRef.current; if (!el) return; el.style.height = vv.height + 'px'; el.style.top = (vv.offsetTop || 0) + 'px' }
    fit(); vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit)
    return () => { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit) }
  }, [])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ block: 'end' }) }, [chat])
  // 참여 인원 보유 츄르가 바뀌어 상한이 내려가면 베팅도 자동으로 낮춘다
  useEffect(() => { if (gRef.current.phase === 'lobby' && (gRef.current.bet || 0) > betCap) changeBet(0) }, [betCap])

  function sendChat(e) {
    e?.preventDefault?.()
    const text = draft.trim(); if (!text) return
    const m = { id: newGameId(), uid, name: memberName(uid), avatar: memberAvatar(uid), text }
    emit('chat', m); pushMsg(m); setDraft('')
  }

  function claimSeat(stone) {
    setG((st) => {
      if (st.phase !== 'lobby') return st
      const key = stone === 1 ? 'black' : 'white', other = stone === 1 ? 'white' : 'black'
      const cur = st[key]
      let next
      if (cur?.uid === uid) next = { ...st, [key]: null }
      else if (!cur) { const me = { uid, name: memberName(uid), avatar: memberAvatar(uid) }; next = { ...st, [key]: me }; if (st[other]?.uid === uid) next[other] = null }
      else return st
      broadcastLobby(next); return next
    })
  }
  function changeBet(delta) {
    setG((st) => { if (st.phase !== 'lobby') return st; const bet = Math.max(0, Math.min(capFromBals(), (st.bet || 0) + delta)); const n = { ...st, bet }; broadcastLobby(n); return n })
  }
  function startGame() {
    const st = gRef.current
    if (st.phase !== 'lobby' || !st.black || !st.white || st.black.uid === st.white.uid) return
    const pl = { black: st.black, white: st.white, bet: st.bet || 0, gameId: newGameId() }
    emit('game_start', pl); apply('game_start', pl)
  }
  function placeAt(r, c) {
    if (!myTurn || g.board[r][c] !== 0) return
    const pl = { r, c, color: myColor, by: uid }; emit('move', pl); apply('move', pl)
  }
  function onBoardPointer(e) {
    if (!myTurn) return
    const rect = boardRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * SIZE
    const y = ((e.clientY - rect.top) / rect.height) * SIZE
    const c = Math.round((x - MARGIN) / GAP), r = Math.round((y - MARGIN) / GAP)
    if (r < 0 || r >= N || c < 0 || c >= N) return
    placeAt(r, c)
  }
  function rematch() {
    const pl = { uid, name: memberName(uid) }; emit('rematch', pl); apply('rematch', pl)
  }
  function backToLobby() { emit('reset', {}); apply('reset', {}) }

  // ---- 렌더 조각 ----
  const chatBox = (
    <div className="om-chat">
      <div className="om-chat-scroll">
        {chat.map((m) => m.sys
          ? <div key={m.id} className="om-chat-sys">{m.text}</div>
          : m.uid === uid
            ? <div key={m.id} className="om-chat-row om-me"><span className="om-bubble om-me">{m.text}</span></div>
            : <div key={m.id} className="om-chat-row"><Avatar name={m.name} avatar={m.avatar} size={26} /><div className="om-chat-msg"><span className="om-chat-nm">{m.name}</span><span className="om-bubble">{m.text}</span></div></div>)}
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

  const seatCard = (stone) => {
    const seat = stone === 1 ? g.black : g.white
    const label = stone === 1 ? '흑 · 선공' : '백 · 후공'
    const mine = seat?.uid === uid
    return (
      <div className={`om-seat ${seat ? 'taken' : 'empty'} ${mine ? 'mine' : ''}`}
        role="button" tabIndex={0} onClick={() => (!seat || mine) && claimSeat(stone)}>
        <div className="om-seat-top"><span className={`om-stone ${stone === 1 ? 'black' : 'white'}`} />{label}</div>
        {seat
          ? <><Avatar name={seat.name} avatar={seat.avatar} size={52} /><div className="om-seat-name">{seat.name}{mine && <span className="om-badge-me">나</span>}</div></>
          : <><span className="om-seat-empty"><PersonIcon /></span><div className="om-seat-wait">대기 중</div></>}
      </div>
    )
  }

  const bothSeated = g.black && g.white && g.black.uid !== g.white.uid

  const header = g.phase === 'lobby' ? (
    <div className="om-head">
      <button type="button" className="om-icon-btn" aria-label="뒤로" onClick={() => navigate(-1)}><BackIcon /></button>
      <div className="om-title">오목</div>
      <span className="om-pill">대기실</span>
      <button type="button" className="om-icon-btn om-help" aria-label="게임 룰" onClick={() => setRuleOn(true)}>?</button>
    </div>
  ) : (
    <div className="om-head">
      <button type="button" className="om-icon-btn" aria-label="나가기" onClick={() => navigate(-1)}><CloseIcon /></button>
      <div className="om-title">오목</div>
    </div>
  )

  // 게임/결과 화면의 플레이어 카드
  const playerCard = (stone) => {
    const seat = stone === 1 ? g.black : g.white
    const active = g.phase === 'play' && g.turn === stone
    let sub = '대기 중'
    if (g.phase === 'play') sub = active ? (seat?.uid === uid ? '내 차례' : '두는 중') : '대기 중'
    else if (g.phase === 'ended' && g.reason !== 'draw') sub = g.winner?.uid === seat?.uid ? '승리' : '패배'
    const won = g.phase === 'ended' && g.winner?.uid === seat?.uid
    return (
      <div className={`om-pcard ${active ? 'active' : ''} ${won ? 'won' : ''}`}>
        <div className="om-pcard-av"><Avatar name={seat?.name} avatar={seat?.avatar} size={54} /><span className={`om-stone ${stone === 1 ? 'black' : 'white'} corner`} /></div>
        <div className="om-pcard-info">
          <div className="om-pcard-name">{seat?.name || '—'}</div>
          <div className={`om-pcard-sub ${active ? 'on' : ''} ${won ? 'win' : ''}`}>{(active || won) && <span className="om-sub-dot" />}{sub}</div>
        </div>
      </div>
    )
  }

  const stones = []
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (g.board[r][c]) stones.push({ r, c, v: g.board[r][c] })
  const lineSet = new Set((g.line || []).map(([r, c]) => `${r},${c}`))

  const boardView = (
    <div className="om-board-wrap">
      <div ref={boardRef} className={`om-board ${myTurn ? 'active' : ''}`} onPointerDown={onBoardPointer} style={{ touchAction: 'manipulation' }}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width="100%" height="100%">
          <g stroke="#9a6a2f" strokeWidth="1.1">
            {Array.from({ length: N }).map((_, i) => (
              <g key={i}>
                <line x1={MARGIN} y1={MARGIN + i * GAP} x2={SIZE - MARGIN} y2={MARGIN + i * GAP} />
                <line x1={MARGIN + i * GAP} y1={MARGIN} x2={MARGIN + i * GAP} y2={SIZE - MARGIN} />
              </g>
            ))}
          </g>
          {STARS.map(([r, c], i) => <circle key={i} cx={MARGIN + c * GAP} cy={MARGIN + r * GAP} r={3} fill="#7c531f" />)}
          {stones.map(({ r, c, v }) => {
            const cx = MARGIN + c * GAP, cy = MARGIN + r * GAP
            const winCell = lineSet.has(`${r},${c}`)
            const isLast = g.last && g.last[0] === r && g.last[1] === c
            return (
              <g key={`${r},${c}`}>
                <circle cx={cx} cy={cy} r={GAP * 0.42} fill={v === 1 ? '#26242f' : '#fbfbfd'} stroke={v === 1 ? '#000' : '#c3bfce'} strokeWidth={v === 1 ? 0.5 : 1} />
                {winCell && <circle cx={cx} cy={cy} r={GAP * 0.42} fill="none" stroke="#e5484d" strokeWidth={2.4} />}
                {isLast && <circle cx={cx} cy={cy} r={3.4} fill="#e5484d" />}
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )

  // ---------- 대기실 ----------
  if (g.phase === 'lobby') {
    return (
      <div className="om-root om-lobby" ref={rootRef}>
        {header}
        {chatBox}
        <div className="om-seats">
          <div className="om-seats-row">{seatCard(1)}{seatCard(2)}</div>
          <div className="om-seats-hint">원하는 돌을 <b>직접 탭</b>해서 자리를 선점하세요</div>
        </div>
        <div className="om-bet">
          <div className="om-bet-l"><div className="om-bet-t">츄르 베팅</div><div className="om-bet-s">이긴 사람이 전부 가져가요 🐾 · 최대 {betCap}개</div></div>
          <button type="button" className="om-bet-btn" onClick={() => changeBet(-BET_STEP)} aria-label="줄이기">−</button>
          <span className="om-bet-val">{g.bet}</span>
          <button type="button" className="om-bet-btn" onClick={() => changeBet(BET_STEP)} disabled={g.bet >= betCap} aria-label="늘리기">+</button>
        </div>
        <div className="om-start-wrap">
          <button type="button" className={`om-start ${bothSeated ? 'on' : ''}`} disabled={!bothSeated} onClick={startGame}>
            {bothSeated ? '게임 시작' : '둘 다 자리를 정하면 시작할 수 있어요'}
          </button>
        </div>
        {ruleOn && <RuleModal onClose={() => setRuleOn(false)} />}
      </div>
    )
  }

  // ---------- 게임 / 결과 ----------
  const iWon = g.phase === 'ended' && g.winner?.uid === uid
  const iLost = g.phase === 'ended' && g.winner && g.winner.uid !== uid
  const loserSeat = g.winner ? (g.black?.uid === g.winner.uid ? g.white : g.black) : null
  return (
    <div className="om-root om-play" ref={rootRef}>
      {header}
      <div className="om-players">
        {playerCard(1)}
        <span className="om-vs">VS</span>
        {playerCard(2)}
      </div>
      {boardView}
      {g.phase === 'play' && (
        <div className="om-pot">이 판에 걸린 츄르 <b>🐾 {g.bet}개</b> · 이긴 사람이 다 가져가요</div>
      )}
      {g.phase === 'play' ? chatBox : <div className="om-play-spacer" />}
      {g.phase === 'play' && (
        <button type="button" className="om-resign" onClick={() => { if (window.confirm('기권할까요? 상대가 승리합니다.')) { const pl = { by: uid }; emit('resign', pl); apply('resign', pl) } }}>기권</button>
      )}

      {g.phase === 'ended' && (
        <div className="om-sheet-wrap">
          {toast && <div className="om-toast">{toast}</div>}
          <div className="om-sheet">
            {g.reason === 'draw' ? (
              <><div className="om-sheet-emoji">🤝</div><div className="om-sheet-title">무승부!</div></>
            ) : iWon ? (
              <><div className="om-sheet-emoji">🏆</div><div className="om-sheet-title">이겼다! 오목 완성 🎉</div>
                <div className="om-sheet-sub">{!g.settle ? '정산 중…' : g.settle.bet > 0 ? <>{loserSeat?.name} 님의 츄르 <b>{g.settle.bet}개</b>를 받았어요</> : '이번 판은 베팅 없이 한 판!'}</div></>
            ) : iLost ? (
              <><div className="om-sheet-title big">LOSE!</div>
                <div className="om-sheet-sub">{!g.settle ? '정산 중…' : g.settle.bet > 0 ? <>츄르 <b className="lose">{g.settle.bet}개</b>를 {g.winner?.name} 님께 보냈어요</> : '이번 판은 베팅 없이 한 판!'}</div></>
            ) : (
              <><div className="om-sheet-emoji">🏳️</div><div className="om-sheet-title">{g.winner?.name} 님 승리</div></>
            )}
            <button type="button" className="om-again" onClick={rematch}>돌 바꿔서 한 판 더!</button>
            <button type="button" className="om-tolobby" onClick={backToLobby}>대기실로 돌아가기</button>
          </div>
        </div>
      )}
      {ruleOn && <RuleModal onClose={() => setRuleOn(false)} />}
    </div>
  )
}

function RuleModal({ onClose }) {
  const rules = ['흑이 먼저, 번갈아 한 수씩 둬요', '가로·세로·대각선 5개를 먼저 이으면 승리', '직전에 둔 돌엔 빨간 점이 표시돼요', '베팅한 츄르는 이긴 사람이 전부! 🐾']
  return (
    <div className="om-modal-back" onClick={onClose}>
      <div className="om-modal" onClick={(e) => e.stopPropagation()}>
        <div className="om-modal-head"><div className="om-modal-title">오목, 이렇게 해요</div>
          <button type="button" className="om-icon-btn sm" aria-label="닫기" onClick={onClose}><CloseIcon /></button></div>
        <div className="om-modal-rules">
          {rules.map((r, i) => <div key={i} className="om-rule"><span className="om-rule-n">{i + 1}</span>{r}</div>)}
        </div>
        <button type="button" className="om-modal-ok" onClick={onClose}>알겠어요</button>
      </div>
    </div>
  )
}
