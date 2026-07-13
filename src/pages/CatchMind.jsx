import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { getGroupMemberMap, getCatchWords, setCatchWords, settleCatchmind } from '../lib/api'
import { CATCH_WORDS, normWord, wordLen } from '../lib/catchWords'

const TURNS = 5, TURN_SEC = 75, REVEAL_MS = 2800, HINT_AT = 10
const uuid = () => (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.round(Math.random() * 1e9)}`)

const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ']
function chosung(word) {
  return Array.from(String(word || '')).map((ch) => {
    const code = ch.charCodeAt(0) - 0xac00
    if (code >= 0 && code < 11172) return CHO[Math.floor(code / 588)]
    return ch
  })
}

const BackIcon = () => <svg width="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 6 9 12 15 18" /></svg>
const CloseIcon = () => <svg width="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
const SendIcon = () => <svg width="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>
function Av({ name, avatar, size = 40 }) {
  return avatar
    ? <img className="om-av-img" src={avatar} alt="" style={{ width: size, height: size }} />
    : <span className="om-av-ini" style={{ width: size, height: size }}>{(name || '?').slice(0, 1)}</span>
}

export default function CatchMind() {
  const { groupId } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const uid = profile?.id

  const chanRef = useRef(null)
  const canvasRef = useRef(null)
  const ctxRef = useRef(null)
  const sizeRef = useRef(1)
  const seenPeers = useRef(new Set())
  const [peers, setPeers] = useState({})
  const peersRef = useRef(peers); peersRef.current = peers

  const [g, setGraw] = useState({ phase: 'lobby', players: [], turn: 0, drawer: null, endsAt: 0, hintLen: 0, cho: [], scores: {}, reveal: null, gameId: null, bet: 5 })
  const gRef = useRef(g)
  const setG = useCallback((up) => setGraw((p) => { const n = typeof up === 'function' ? up(p) : up; gRef.current = n; return n }), [])
  const [lob, setLob] = useState({ participants: [], ready: [], bet: 5 })
  const lobRef = useRef(lob); lobRef.current = lob
  const [chat, setChat] = useState([])
  const [now, setNow] = useState(Date.now())
  const [guess, setGuess] = useState('')
  const [draft, setDraft] = useState('')
  const [words, setWords] = useState(CATCH_WORDS)
  const wordsRef = useRef(words); wordsRef.current = words
  const [awarded, setAwarded] = useState(null)
  const [pen, setPen] = useState('#191722')

  const wordRef = useRef('')
  const usedRef = useRef(new Set())
  const endedRef = useRef(-1)
  const timerRef = useRef(0)
  const chatEndRef = useRef(null)
  const myName = useRef(profile?.login_id || '')
  const myAvatar = useRef(profile?.avatar_url || null)
  const [members, setMembers] = useState({})
  const membersRef = useRef(members); membersRef.current = members
  const drawing = useRef(null)
  const playRef = useRef(null)
  const applyRef = useRef(null), startTurnRef = useRef(null), endTurnRef = useRef(null)

  const meDrawer = g.drawer === uid

  const memberName = useCallback((u) => membersRef.current[u]?.name || peersRef.current[u]?.name || (u === uid ? myName.current : '?'), [uid])
  const memberAvatar = useCallback((u) => membersRef.current[u]?.avatar ?? (u === uid ? myAvatar.current : peersRef.current[u]?.avatar) ?? null, [uid])

  const emit = useCallback((type, payload) => { chanRef.current?.send({ type: 'broadcast', event: type, payload }) }, [])
  const broadcastLobby = useCallback((n) => emit('lobby', n), [emit])
  const pushChat = useCallback((m) => setChat((c) => [...c.slice(-80), m]), [])

  const clearCanvas = useCallback(() => { const ctx = ctxRef.current; if (!ctx) return; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, sizeRef.current, sizeRef.current) }, [])
  const drawSeg = useCallback((pts, color, w, from = 0) => {
    const ctx = ctxRef.current; if (!ctx || !pts.length) return
    const S = sizeRef.current
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = w * S; ctx.lineJoin = 'round'; ctx.lineCap = 'round'
    if (pts.length === 1) { ctx.beginPath(); ctx.arc(pts[0][0] * S, pts[0][1] * S, (w * S) / 2, 0, 7); ctx.fill(); return }
    const s = Math.max(1, from)
    ctx.beginPath(); ctx.moveTo(pts[s - 1][0] * S, pts[s - 1][1] * S)
    for (let i = s; i < pts.length; i++) ctx.lineTo(pts[i][0] * S, pts[i][1] * S)
    ctx.stroke()
  }, [])
  useEffect(() => {
    const cv = canvasRef.current; if (!cv || g.phase !== 'play') return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    cv.width = Math.round(1024 * dpr); cv.height = Math.round(1024 * dpr)
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctxRef.current = ctx; sizeRef.current = 1024; clearCanvas()
  }, [clearCanvas, g.phase])

  const pickWord = useCallback(() => {
    const pool = wordsRef.current.filter((w) => !usedRef.current.has(normWord(w)))
    const list = pool.length ? pool : wordsRef.current
    return list[Math.floor(Math.random() * list.length)]
  }, [])

  const startTurn = useCallback((turnNo, players) => {
    const drawer = players[(turnNo - 1) % players.length]
    if (!drawer || drawer.uid !== uid) return
    const word = pickWord(); wordRef.current = word
    const payload = { turn: turnNo, drawer: uid, hintLen: wordLen(word), cho: chosung(word), endsAt: Date.now() + TURN_SEC * 1000 }
    emit('turn_start', payload); applyRef.current('turn_start', payload)
  }, [uid, emit, pickWord])
  startTurnRef.current = startTurn

  const endGame = useCallback((scores, players) => {
    const best = Math.max(0, ...players.map((p) => scores[p.uid] || 0))
    const winners = best > 0 ? players.filter((p) => (scores[p.uid] || 0) === best) : []
    setG((st) => ({ ...st, phase: 'ended', winners, winScore: best }))
    if (!winners.length) return
    const caller = [...winners].sort((a, b) => (a.uid < b.uid ? -1 : 1))[0]
    if (caller.uid !== uid) return
    const st = gRef.current
    settleCatchmind(groupId, st.gameId, players.map((p) => p.uid), winners.map((w) => w.uid), st.bet || 0)
      .then((res) => { emit('award', res); applyRef.current('award', res) }).catch(() => {})
  }, [groupId, setG, uid, emit])

  const apply = useCallback((type, pl) => {
    if (type === 'lobby') {
      setLob({ participants: pl.participants || [], ready: pl.ready || [], bet: pl.bet ?? 5 })
    } else if (type === 'lobby_req') {
      if (gRef.current.phase === 'lobby') broadcastLobby(lobRef.current)
    } else if (type === 'chat') {
      pushChat(pl)
    } else if (type === 'game_start') {
      usedRef.current = new Set(); endedRef.current = -1; setAwarded(null)
      setChat([{ id: 'gs', sys: true, text: '게임 시작! 그림으로 제시어를 맞혀 보세요.' }])
      setG((st) => ({ ...st, phase: 'play', players: pl.players, turn: 0, drawer: null, endsAt: 0, hintLen: 0, cho: [], scores: {}, reveal: null, gameId: pl.gameId, bet: pl.bet ?? 0 }))
      setTimeout(() => startTurnRef.current(1, pl.players), 400)
    } else if (type === 'turn_start') {
      clearTimeout(timerRef.current); clearCanvas()
      const drawerName = (gRef.current.players.find((p) => p.uid === pl.drawer) || {}).name || '누군가'
      setG((st) => ({ ...st, turn: pl.turn, drawer: pl.drawer, endsAt: pl.endsAt, hintLen: pl.hintLen, cho: pl.cho || [], reveal: null }))
      setChat((c) => [...c, { id: `t${pl.turn}`, sys: true, text: `${pl.turn} 라운드 · ${drawerName} 님이 그리는 중` }])
      if (pl.drawer === uid) timerRef.current = setTimeout(() => endTurnRef.current(null), Math.max(0, pl.endsAt - Date.now()))
    } else if (type === 'stroke') {
      if (pl.clear) clearCanvas(); else drawSeg(pl.pts, pl.color, pl.w, 0)
    } else if (type === 'guess') {
      setChat((c) => [...c, { id: pl.id, guess: true, uid: pl.uid, name: pl.name, text: pl.text }])
      if (gRef.current.drawer === uid && endedRef.current !== gRef.current.turn && normWord(pl.text) === normWord(wordRef.current)) endTurnRef.current(pl.uid)
    } else if (type === 'turn_end') {
      if (endedRef.current === pl.turn) return
      endedRef.current = pl.turn; clearTimeout(timerRef.current)
      usedRef.current.add(normWord(pl.word))
      const winnerName = pl.winner ? (gRef.current.players.find((p) => p.uid === pl.winner) || {}).name : null
      setG((st) => { const scores = { ...st.scores }; if (pl.winner) scores[pl.winner] = (scores[pl.winner] || 0) + 1; return { ...st, scores, reveal: { word: pl.word, winner: pl.winner } } })
      setChat((c) => [...c, { id: `e${pl.turn}`, sys: true, ok: !!winnerName, text: winnerName ? `🎉 ${winnerName} 님 정답! (제시어: ${pl.word})` : `⏰ 시간 초과 — 제시어: ${pl.word}` }])
      setTimeout(() => { const players = gRef.current.players; if (pl.turn >= TURNS) endGame(gRef.current.scores, players); else startTurnRef.current(pl.turn + 1, players) }, REVEAL_MS)
    } else if (type === 'award') {
      setAwarded(pl)
    }
  }, [uid, setG, clearCanvas, drawSeg, endGame, broadcastLobby, pushChat])
  applyRef.current = apply

  function endTurnLocal(winner) {
    if (gRef.current.drawer !== uid || endedRef.current === gRef.current.turn) return
    const payload = { turn: gRef.current.turn, word: wordRef.current, winner }
    emit('turn_end', payload); apply('turn_end', payload)
  }
  endTurnRef.current = endTurnLocal

  useEffect(() => {
    if (!groupId || !uid) return
    const ch = supabase.channel(`catch:${groupId}`, { config: { broadcast: { self: false }, presence: { key: uid } } })
    chanRef.current = ch
    const retrack = () => { if (ch.state === 'joined') ch.track({ uid, name: myName.current, avatar: myAvatar.current }).catch(() => {}) }
    getGroupMemberMap(groupId).then((mm) => {
      setMembers(mm)
      if (mm[uid]) { myName.current = mm[uid].name; myAvatar.current = mm[uid].avatar }
      retrack()
      if (!seenPeers.current.has(uid)) { seenPeers.current.add(uid); if (gRef.current.phase === 'lobby') setChat((c) => [...c.slice(-80), { id: uuid(), sys: true, text: `${myName.current} 님 등장! 🐾` }]) }
    }).catch(() => {})
    getCatchWords(groupId).then((w) => { if (w.length) setWords([...CATCH_WORDS, ...w]) }).catch(() => {})
    ;['lobby', 'lobby_req', 'chat', 'game_start', 'turn_start', 'stroke', 'guess', 'turn_end', 'award']
      .forEach((ev) => ch.on('broadcast', { event: ev }, ({ payload }) => applyRef.current(ev, payload)))
    ch.on('presence', { event: 'join' }, ({ key }) => {
      if (key === uid || seenPeers.current.has(key)) return
      seenPeers.current.add(key)
      if (gRef.current.phase === 'lobby') setChat((c) => [...c.slice(-80), { id: uuid(), sys: true, text: `${membersRef.current[key]?.name || '누군가'} 님 등장! 🐾` }])
    })
    ch.on('presence', { event: 'sync' }, () => { const st = ch.presenceState(), map = {}; for (const k of Object.keys(st)) { if (k === uid) continue; const p = st[k][0] || {}; map[k] = { name: p.name || '?', avatar: p.avatar || null } } setPeers(map) })
    ch.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
      if (key === uid) return
      seenPeers.current.delete(key)
      if (gRef.current.phase !== 'lobby') return
      const nm = membersRef.current[key]?.name || peersRef.current[key]?.name || leftPresences?.[0]?.name || '누군가'
      setChat((c) => [...c.slice(-80), { id: uuid(), sys: true, text: `${nm} 님 퇴장 👋` }])
      setLob((l) => ((l.participants.includes(key) || l.ready.includes(key)) ? { ...l, participants: l.participants.filter((x) => x !== key), ready: l.ready.filter((x) => x !== key) } : l))
    })
    ch.subscribe(async (s) => { if (s === 'SUBSCRIBED') { retrack(); setTimeout(() => emit('lobby_req', {}), 200) } })
    return () => { clearTimeout(timerRef.current); supabase.removeChannel(ch); chanRef.current = null }
  }, [groupId, uid, emit])

  useEffect(() => { if (g.phase !== 'play' || !g.endsAt) return; const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t) }, [g.phase, g.endsAt])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ block: 'end' }) }, [chat])
  useEffect(() => {
    const vv = window.visualViewport, el = playRef.current
    if (g.phase !== 'play' || !vv || !el) return
    const fit = () => { el.style.height = vv.height + 'px' }
    fit(); vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit)
    const t = setTimeout(fit, 300)
    return () => { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit); clearTimeout(t); if (el) el.style.height = '' }
  }, [g.phase])

  function cPos(e) { const r = canvasRef.current.getBoundingClientRect(); return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))] }
  function cDown(e) {
    if (!meDrawer || g.reveal) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const p = cPos(e); drawing.current = { pts: [p], color: pen, w: pen === '#ffffff' ? 0.05 : 0.012 }
    drawSeg([p], drawing.current.color, drawing.current.w, 0); emit('stroke', { pts: [p], color: drawing.current.color, w: drawing.current.w })
  }
  function cMove(e) { const d = drawing.current; if (!d) return; const p = cPos(e); const from = d.pts.length; d.pts.push(p); drawSeg(d.pts, d.color, d.w, from); emit('stroke', { pts: d.pts.slice(from - 1), color: d.color, w: d.w }) }
  function cUp() { drawing.current = null }

  // ---- 로비 조작 ----
  const presentUids = [...new Set([uid, ...Object.keys(peers)])]
  const isSmall = Math.max(Object.keys(members).length, presentUids.length) <= 2
  const parts = lob.participants
  const readySet = new Set(lob.ready)
  const iPart = isSmall ? true : parts.includes(uid)   // 2인 그룹은 자동 참여
  const iReady = readySet.has(uid)

  function toggleParticipate() {
    setLob((l) => { const p = l.participants.includes(uid) ? l.participants.filter((x) => x !== uid) : [...l.participants, uid]; const r = l.ready.filter((x) => p.includes(x)); const n = { ...l, participants: p, ready: r }; broadcastLobby(n); return n })
  }
  function toggleReady() {
    setLob((l) => {
      let p = l.participants
      if (!p.includes(uid)) p = [...p, uid]         // 준비하면 자동 참여
      const r = l.ready.includes(uid) ? l.ready.filter((x) => x !== uid) : [...l.ready, uid]
      const n = { ...l, participants: p, ready: r }; broadcastLobby(n); return n
    })
  }
  function changeBet(d) { setLob((l) => { const bet = Math.max(0, Math.min(20, (l.bet || 0) + d)); const n = { ...l, bet }; broadcastLobby(n); return n }) }
  function sendLobbyChat(e) {
    e?.preventDefault?.(); const text = draft.trim(); if (!text) return
    const m = { id: uuid(), uid, text }; emit('chat', m); pushChat(m); setDraft('')
  }
  function startGame() {
    const partUids = isSmall ? presentUids : lobRef.current.participants
    const playerUids = partUids.filter((u) => readySet.has(u))
    if (playerUids.length < 2) { alert('참여자 두 명 이상이 준비해야 시작할 수 있어요.'); return }
    const players = playerUids.map((u) => ({ uid: u, name: memberName(u), avatar: memberAvatar(u) }))
    const payload = { players, gameId: uuid(), bet: lobRef.current.bet || 0 }
    emit('game_start', payload); apply('game_start', payload)
  }
  function backToLobby(rejoin) {
    setG((st) => ({ ...st, phase: 'lobby' }))
    if (rejoin) setLob((l) => { const p = l.participants.includes(uid) ? l.participants : [...l.participants, uid]; const r = l.ready.includes(uid) ? l.ready : [...l.ready, uid]; const n = { ...l, participants: p, ready: r }; broadcastLobby(n); return n })
    else setLob((l) => { const n = { ...l, participants: l.participants.filter((x) => x !== uid), ready: l.ready.filter((x) => x !== uid) }; broadcastLobby(n); return n })
  }
  function sendGuess(e) {
    e.preventDefault(); const t = guess.trim(); if (!t || meDrawer || g.phase !== 'play' || g.reveal) return
    setGuess('')
    const payload = { id: uuid(), uid, name: memberName(uid), text: t }
    emit('guess', payload); apply('guess', payload)
  }

  const remain = Math.max(0, Math.ceil((g.endsAt - now) / 1000))
  const nameOf = (u) => memberName(u)

  // ===== 로비 (14k / 14r) =====
  if (g.phase === 'lobby') {
    const listUids = isSmall ? presentUids : parts
    const allReady = listUids.length >= 2 && listUids.every((u) => readySet.has(u))
    const chatBox = (
      <div className="om-chat">
        <div className="om-chat-scroll">
          {chat.map((m) => m.sys
            ? <div key={m.id} className="om-chat-sys">{m.text}</div>
            : m.uid === uid
              ? <div key={m.id} className="om-chat-row om-me"><span className="om-bubble om-me">{m.text}</span></div>
              : <div key={m.id} className="om-chat-row"><Av name={nameOf(m.uid)} avatar={memberAvatar(m.uid)} size={26} /><div className="om-chat-msg"><span className="om-chat-nm">{nameOf(m.uid)}</span><span className="om-bubble">{m.text}</span></div></div>)}
          <div ref={chatEndRef} />
        </div>
        <form className="om-chat-input" onSubmit={sendLobbyChat}>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="메시지 보내기" maxLength={100} enterKeyHint="send"
            onFocus={(e) => setTimeout(() => e.target.scrollIntoView({ block: 'center' }), 300)} />
          <button type="submit" className="om-send" aria-label="전송"><SendIcon /></button>
        </form>
      </div>
    )
    return (
      <div className="om-root cm-lobby" ref={playRef}>
        <div className="om-head">
          <button type="button" className="om-icon-btn" aria-label="뒤로" onClick={() => navigate(-1)}><BackIcon /></button>
          <div className="om-title">캐치마인드</div><span className="om-pill">대기실</span>
          {!isSmall && <span className="cm-count">👥 {presentUids.length}</span>}
        </div>
        {chatBox}
        {isSmall ? (
          <div className="cm-cards">
            {presentUids.map((u) => (
              <div key={u} className={`cm-card ${readySet.has(u) ? 'rdy' : ''}`}>
                <Av name={nameOf(u)} avatar={memberAvatar(u)} size={44} />
                <div className="cm-card-info"><div className="cm-card-nm">{nameOf(u)}{u === uid && <span className="om-badge-me">나</span>}</div>
                  <div className={`cm-card-st ${readySet.has(u) ? 'on' : ''}`}>{readySet.has(u) ? '✓ 준비 완료' : '준비 중…'}</div></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="cm-plist-wrap">
            <div className="cm-plist-head"><b>참여자</b> <span className="cm-plist-c">{parts.length}</span>
              <span className="cm-plist-r">{parts.filter((u) => readySet.has(u)).length}/{parts.length} 준비</span></div>
            <div className="cm-plist">
              {parts.length === 0 && <div className="cm-plist-empty">아직 참여자가 없어요 · 참여하기를 눌러 대결에 들어가요</div>}
              {parts.map((u) => (
                <div key={u} className={`cm-prow ${u === uid ? 'me' : ''}`}>
                  <Av name={nameOf(u)} avatar={memberAvatar(u)} size={38} />
                  <span className="cm-prow-nm">{nameOf(u)}{u === uid && <span className="om-badge-me">나</span>}</span>
                  <span className={`cm-prow-st ${readySet.has(u) ? 'on' : ''}`}>{readySet.has(u) ? '✓ 준비 완료' : '준비 중'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="om-bet">
          <div className="om-bet-l"><div className="om-bet-t">츄르 베팅</div><div className="om-bet-s">1등이 다 가져가요 🐾</div></div>
          <button type="button" className="om-bet-btn" onClick={() => changeBet(-5)} aria-label="줄이기">−</button>
          <span className="om-bet-val">{lob.bet}</span>
          <button type="button" className="om-bet-btn" onClick={() => changeBet(5)} aria-label="늘리기">+</button>
        </div>
        <div className="cm-lobby-btns">
          {!isSmall && !iPart && <button type="button" className="cm-btn primary" onClick={toggleParticipate}>참여하기</button>}
          {iPart && <button type="button" className={`cm-btn ${iReady ? 'ghost' : 'primary'}`} onClick={toggleReady}>{iReady ? '준비 취소' : '준비하기!'}</button>}
          <button type="button" className={`cm-btn start ${allReady ? 'on' : ''}`} disabled={!allReady} onClick={startGame}>
            {allReady ? '게임 시작' : '모두 준비되면 시작할 수 있어요'}
          </button>
        </div>
      </div>
    )
  }

  // ===== 결과 (14s) =====
  if (g.phase === 'ended') {
    const rank = g.players.map((p) => ({ ...p, s: g.scores[p.uid] || 0 })).sort((a, b) => b.s - a.s)
    const rankNo = rank.map((p, i) => (i > 0 && rank[i - 1].s === p.s ? null : i + 1))
    for (let i = 0; i < rankNo.length; i++) if (rankNo[i] === null) rankNo[i] = rankNo[i - 1]
    const winners = g.winners || []
    const champ = winners[0]
    const medal = (n) => n === 1 ? '🥇' : n === 2 ? '🥈' : n === 3 ? '🥉' : n
    return (
      <div className="om-root cm-result" ref={playRef}>
        <div className="cm-res-top">
          <div className="cm-res-over">GAME OVER</div>
          <div className="cm-res-title">우승자 🏆</div>
          <div className="cm-res-champ"><span className="cm-crown">👑</span><Av name={champ?.name} avatar={champ?.avatar} size={96} /></div>
          <div className="cm-res-name">{winners.length > 1 ? winners.map((w) => w.name).join(', ') : (champ?.name || '무승부')}</div>
          {champ && <div className="cm-res-badge">정답 {g.winScore || 0}개{awarded?.share > 0 ? ` · 츄르 ${awarded.share}개 획득` : ''}</div>}
        </div>
        <div className="cm-res-list-wrap">
          <div className="cm-res-lh"><b>전체 순위</b><span>정답 개수 순</span></div>
          <div className="cm-res-list">
            {rank.map((p, i) => (
              <div key={p.uid} className={`cm-res-row ${rankNo[i] === 1 ? 'win' : ''} ${p.uid === uid ? 'me' : ''}`}>
                <span className="cm-res-rank">{medal(rankNo[i])}</span>
                <Av name={p.name} avatar={p.avatar} size={34} />
                <span className="cm-res-nm">{p.name}{rankNo[i] === 1 && <span className="cm-res-win">우승 👑</span>}{p.uid === uid && <span className="om-badge-me">나</span>}</span>
                <span className="cm-res-n"><b>{p.s}</b> 개</span>
              </div>
            ))}
          </div>
        </div>
        <div className="cm-res-btns">
          <button type="button" className="cm-btn ghost" onClick={() => backToLobby(false)}>대기실로</button>
          <button type="button" className="cm-btn primary" onClick={() => backToLobby(true)}>한 판 더! 🎨</button>
        </div>
      </div>
    )
  }

  // ===== 게임 (14l / 14m) =====
  const showCho = remain <= HINT_AT && !meDrawer && !g.reveal
  const blanks = meDrawer
    ? <b className="cm-word-mine">{wordRef.current}</b>
    : g.reveal
      ? <b className="cm-word-mine">{g.reveal.word}</b>
      : Array.from({ length: g.hintLen }).map((_, i) => <span key={i} className="cm-blank">{showCho ? (g.cho[i] || '') : ''}</span>)
  return (
    <div className="om-root cm-play" ref={playRef}>
      <div className="om-head">
        <button type="button" className="om-icon-btn" aria-label="나가기" onClick={() => navigate(-1)}><CloseIcon /></button>
        <div className="om-title">캐치마인드</div>
        <span className="cm-drawpill">{meDrawer ? '내가 그리는 중' : `${nameOf(g.drawer)} 님이 그리는 중`}</span>
      </div>
      <div className="cm-roundbar">
        <span className="cm-round">라운드 <b>{g.turn}/{TURNS}</b></span>
        <span className="cm-blanks">{blanks}</span>
        <span className={`cm-timer ${remain <= HINT_AT ? 'hot' : ''}`}>⏱ {Math.floor(remain / 60)}:{String(remain % 60).padStart(2, '0')}</span>
      </div>

      <div className="cm-canvas-card">
        <span className="cm-live">● 실시간</span>
        <canvas ref={canvasRef} className="cm-canvas" onPointerDown={cDown} onPointerMove={cMove} onPointerUp={cUp} onPointerCancel={cUp}
          style={{ touchAction: 'none', cursor: meDrawer && !g.reveal ? 'crosshair' : 'default' }} />
        {meDrawer && !g.reveal && (
          <div className="cm-pens">
            {['#191722', '#e5484d', '#3b82f6', '#4a9d6a', '#f5860a', '#ffffff'].map((c) => (
              <button key={c} type="button" className={`cm-pen ${pen === c ? 'on' : ''} ${c === '#ffffff' ? 'wht' : ''}`} style={{ background: c }} onClick={() => setPen(c)} aria-label="펜 색" />
            ))}
            <button type="button" className="cm-pen-clear" onClick={() => { clearCanvas(); emit('stroke', { clear: true }) }}>지우기</button>
          </div>
        )}
      </div>

      <div className="cm-chat2">
        <div className="cm-chat2-scroll">
          {chat.map((m) => m.sys
            ? <div key={m.id} className={`cm-sys ${m.ok ? 'ok' : ''}`}>{m.text}</div>
            : <div key={m.id} className="cm-guess"><b>{m.name}</b> {m.text}</div>)}
          <div ref={chatEndRef} />
        </div>
        <form className="om-chat-input cm-guessbar" onSubmit={sendGuess}>
          <input value={guess} onChange={(e) => setGuess(e.target.value)} disabled={meDrawer || !!g.reveal} placeholder={meDrawer ? '그림을 그려 주세요' : '정답을 입력해 보세요'} maxLength={20} enterKeyHint="send" />
          <button type="submit" className="om-send" disabled={meDrawer || !guess.trim()} aria-label="전송"><SendIcon /></button>
        </form>
      </div>
    </div>
  )
}
