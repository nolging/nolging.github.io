import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { getMyGroupMember, getCatchWords, setCatchWords, awardCatchmind } from '../lib/api'
import { CATCH_WORDS, normWord, wordLen } from '../lib/catchWords'

const TURNS = 10, TURN_SEC = 75, REVEAL_MS = 2800

function Av({ name, avatar, className = '' }) {
  return (
    <span className={`cm-av ${className}`}>
      {avatar ? <img src={avatar} alt="" /> : <span className="cm-av-ini">{(name || '?').slice(0, 1)}</span>}
    </span>
  )
}

export default function CatchMind() {
  const { groupId } = useParams()
  const { profile } = useAuth()
  const uid = profile?.id

  const chanRef = useRef(null)
  const canvasRef = useRef(null)
  const ctxRef = useRef(null)
  const sizeRef = useRef(1)
  const [peers, setPeers] = useState({})
  const peersRef = useRef(peers); peersRef.current = peers

  const [g, setGraw] = useState({ phase: 'lobby', players: [], turn: 0, drawer: null, endsAt: 0, hintLen: 0, scores: {}, reveal: null })
  const gRef = useRef(g)
  const setG = useCallback((up) => setGraw((p) => { const n = typeof up === 'function' ? up(p) : up; gRef.current = n; return n }), [])
  const [chat, setChat] = useState([])
  const [now, setNow] = useState(Date.now())
  const [guess, setGuess] = useState('')
  const [words, setWords] = useState(CATCH_WORDS)
  const wordsRef = useRef(words); wordsRef.current = words
  const [newWord, setNewWord] = useState('')
  const [awarded, setAwarded] = useState(null)
  const [pen, setPen] = useState('#191722')

  const wordRef = useRef('')
  const usedRef = useRef(new Set())
  const endedRef = useRef(-1)
  const timerRef = useRef(0)
  const chatEndRef = useRef(null)
  const myName = useRef(profile?.nickname || '')
  const myAvatar = useRef(profile?.avatar_url || null)
  const drawing = useRef(null)
  const playRef = useRef(null)
  // 순환 참조 방지용 ref
  const applyRef = useRef(null), startTurnRef = useRef(null), endTurnRef = useRef(null)

  const meDrawer = g.drawer === uid

  const clearCanvas = useCallback(() => {
    const ctx = ctxRef.current; if (!ctx) return
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, sizeRef.current, sizeRef.current)
  }, [])
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
    // 고정 해상도 백버퍼(1024) → 표시 크기가 바뀌어도(키보드 등) 캔버스가 초기화/왜곡되지 않음
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    cv.width = Math.round(1024 * dpr); cv.height = Math.round(1024 * dpr)
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctxRef.current = ctx; sizeRef.current = 1024; clearCanvas()
  }, [clearCanvas, g.phase])

  const emit = useCallback((type, payload) => { chanRef.current?.send({ type: 'broadcast', event: type, payload }) }, [])
  const pickWord = useCallback(() => {
    const pool = wordsRef.current.filter((w) => !usedRef.current.has(normWord(w)))
    const list = pool.length ? pool : wordsRef.current
    return list[Math.floor(Math.random() * list.length)]
  }, [])

  const startTurn = useCallback((turnNo, players) => {
    const drawer = players[(turnNo - 1) % players.length]
    if (!drawer || drawer.uid !== uid) return
    const word = pickWord(); wordRef.current = word
    const payload = { turn: turnNo, drawer: uid, hintLen: wordLen(word), endsAt: Date.now() + TURN_SEC * 1000 }
    emit('turn_start', payload); applyRef.current('turn_start', payload)
  }, [uid, emit, pickWord])
  startTurnRef.current = startTurn

  const endGame = useCallback((scores, players) => {
    let win = null, best = -1
    for (const p of players) { const s = scores[p.uid] || 0; if (s > best) { best = s; win = p } }
    setG((st) => ({ ...st, phase: 'ended', winner: win, winScore: best }))
    if (win && best > 0) awardCatchmind(groupId, win.uid).then((ok) => setAwarded({ uid: win.uid, ok })).catch(() => {})
  }, [groupId, setG])

  const apply = useCallback((type, pl) => {
    if (type === 'game_start') {
      usedRef.current = new Set(); endedRef.current = -1
      setChat([{ id: 'gs', kind: 'sys', text: '게임 시작! 10턴 동안 그림으로 제시어를 맞혀 보세요.' }])
      setG({ phase: 'play', players: pl.players, turn: 0, drawer: null, endsAt: 0, hintLen: 0, scores: {}, reveal: null })
      setTimeout(() => startTurnRef.current(1, pl.players), 400)
    } else if (type === 'turn_start') {
      clearTimeout(timerRef.current); clearCanvas()
      const drawerName = (gRef.current.players.find((p) => p.uid === pl.drawer) || {}).name || '누군가'
      setG((st) => ({ ...st, turn: pl.turn, drawer: pl.drawer, endsAt: pl.endsAt, hintLen: pl.hintLen, reveal: null }))
      setChat((c) => [...c, { id: `t${pl.turn}`, kind: 'sys', text: `${pl.turn}턴 · ${drawerName} 님이 그리는 중` }])
      if (pl.drawer === uid) timerRef.current = setTimeout(() => endTurnRef.current(null), Math.max(0, pl.endsAt - Date.now()))
    } else if (type === 'stroke') {
      if (pl.clear) clearCanvas(); else drawSeg(pl.pts, pl.color, pl.w, 0)
    } else if (type === 'guess') {
      setChat((c) => [...c, { id: pl.id, kind: 'guess', uid: pl.uid, name: pl.name, text: pl.text }])
      if (gRef.current.drawer === uid && endedRef.current !== gRef.current.turn && normWord(pl.text) === normWord(wordRef.current)) endTurnRef.current(pl.uid)
    } else if (type === 'turn_end') {
      if (endedRef.current === pl.turn) return
      endedRef.current = pl.turn; clearTimeout(timerRef.current)
      usedRef.current.add(normWord(pl.word))
      const winnerName = pl.winner ? (gRef.current.players.find((p) => p.uid === pl.winner) || {}).name : null
      setG((st) => { const scores = { ...st.scores }; if (pl.winner) scores[pl.winner] = (scores[pl.winner] || 0) + 1; return { ...st, scores, reveal: { word: pl.word, winner: pl.winner } } })
      setChat((c) => [...c, { id: `e${pl.turn}`, kind: 'sys', text: winnerName ? `🎉 ${winnerName} 정답! (제시어: ${pl.word})` : `⏰ 시간 초과 — 제시어: ${pl.word}` }])
      setTimeout(() => { const players = gRef.current.players; if (pl.turn >= TURNS) endGame(gRef.current.scores, players); else startTurnRef.current(pl.turn + 1, players) }, REVEAL_MS)
    }
  }, [uid, setG, clearCanvas, drawSeg, endGame])
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
    // 그룹 표시 닉네임/아바타가 늦게 도착하면 presence 를 다시 track → 상대 화면에도 아이디 대신 닉네임으로 보이게
    getMyGroupMember(groupId, uid).then((m) => {
      if (m?.display_nickname) myName.current = m.display_nickname
      if (m?.avatar_url) myAvatar.current = m.avatar_url
      retrack()
    }).catch(() => {})
    getCatchWords(groupId).then((w) => { if (w.length) setWords([...CATCH_WORDS, ...w]) }).catch(() => {})
    ;['game_start', 'turn_start', 'stroke', 'guess', 'turn_end'].forEach((ev) => ch.on('broadcast', { event: ev }, ({ payload }) => applyRef.current(ev, payload)))
    ch.on('presence', { event: 'sync' }, () => { const st = ch.presenceState(), map = {}; for (const k of Object.keys(st)) { const p = st[k][0] || {}; map[k] = { name: p.name || '?', avatar: p.avatar || null } } setPeers(map) })
    ch.subscribe(async (s) => { if (s === 'SUBSCRIBED') retrack() })
    return () => { clearTimeout(timerRef.current); supabase.removeChannel(ch); chanRef.current = null }
  }, [groupId, uid])

  useEffect(() => { if (g.phase !== 'play' || !g.endsAt) return; const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t) }, [g.phase, g.endsAt])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ block: 'end' }) }, [chat])
  // 키보드가 올라오면 visualViewport 가 줄어듦 → 플레이 영역 높이를 실제 보이는 높이에 맞춰 캔버스를 줄이고 채팅+입력창은 항상 보이게
  useEffect(() => {
    if (g.phase !== 'play') return
    const vv = window.visualViewport, el = playRef.current
    if (!vv || !el) return
    const fit = () => { const top = el.getBoundingClientRect().top; el.style.height = Math.max(240, vv.height - top - 4) + 'px' }
    fit()
    vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit)
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
  function cMove(e) {
    const d = drawing.current; if (!d) return
    const p = cPos(e); const from = d.pts.length; d.pts.push(p)
    drawSeg(d.pts, d.color, d.w, from); emit('stroke', { pts: d.pts.slice(from - 1), color: d.color, w: d.w })
  }
  function cUp() { drawing.current = null }

  function startGame() {
    const all = { [uid]: { name: myName.current, avatar: myAvatar.current }, ...peersRef.current }
    const players = Object.entries(all).map(([u, v]) => ({ uid: u, name: v.name, avatar: v.avatar }))
    if (players.length < 2) { alert('두 명 이상 접속해야 시작할 수 있어요.'); return }
    const payload = { players }; emit('game_start', payload); apply('game_start', payload)
  }
  function sendGuess(e) {
    e.preventDefault()
    const t = guess.trim(); if (!t || meDrawer || g.phase !== 'play') return
    setGuess('')
    const payload = { id: crypto.randomUUID?.() || String(Math.random()), uid, name: myName.current, text: t }
    emit('guess', payload); apply('guess', payload)
  }
  async function addWord() {
    const w = newWord.trim(); if (!w) return
    setNewWord(''); const next = [...words.filter((x) => x !== w), w]; setWords(next)
    try { await setCatchWords(groupId, next.filter((x) => !CATCH_WORDS.includes(x))) } catch { /* noop */ }
  }

  const remain = Math.max(0, Math.ceil((g.endsAt - now) / 1000))
  const peerList = Object.entries({ [uid]: { name: myName.current, avatar: myAvatar.current }, ...peers }).map(([u, v]) => ({ uid: u, name: v.name, avatar: v.avatar }))

  if (g.phase === 'lobby') {
    return (
      <div className="page cm-page">
        <div className="cm-lobby">
          <div className="cm-title">캐치마인드</div>
          <div className="cm-sub">돌아가며 제시어를 그리고, 채팅으로 맞혀요. 10턴 후 가장 많이 맞힌 사람이 <b>츄르 30개</b>!</div>
          <div className="cm-players">{peerList.map((p) => <span key={p.uid} className="cm-chip"><Av name={p.name} avatar={p.avatar} />{p.name}{p.uid === uid ? ' (나)' : ''}</span>)}</div>
          <div className="cm-wordbox">
            <div className="cm-wordbox-t">제시어 추가 <span>(기본 {CATCH_WORDS.length}개 + 직접)</span></div>
            <form className="cm-wordadd" onSubmit={(e) => { e.preventDefault(); addWord() }}>
              <input value={newWord} maxLength={12} onChange={(e) => setNewWord(e.target.value)} placeholder="예: 눈사람" />
              <button type="submit" className="cm-wordbtn">추가</button>
            </form>
          </div>
          <button type="button" className="cm-start" onClick={startGame}>게임 시작</button>
          <div className="cm-hint">상대가 같은 화면에 들어와 있어야 함께 시작돼요.</div>
        </div>
      </div>
    )
  }
  if (g.phase === 'ended') {
    const rank = g.players.map((p) => ({ ...p, s: g.scores[p.uid] || 0 })).sort((a, b) => b.s - a.s)
    return (
      <div className="page cm-page">
        <div className="cm-result">
          <div className="cm-result-emoji">🏆</div>
          <div className="cm-result-t">{g.winner && g.winScore > 0 ? `${g.winner.name} 우승!` : '무승부'}</div>
          {g.winner && g.winScore > 0 && <div className="cm-result-coin">{awarded ? (awarded.ok ? '🐾 츄르 30개 지급 완료!' : '오늘은 이미 보상을 받았어요') : '보상 지급 중…'}</div>}
          <div className="cm-scoreboard">{rank.map((p, i) => <div key={p.uid} className="cm-score-row"><span className="cm-rank">{i + 1}</span><Av name={p.name} avatar={p.avatar} /><span className="cm-score-name">{p.name}</span><span className="cm-score-n">{p.s}</span></div>)}</div>
          <button type="button" className="cm-start" onClick={() => setG((st) => ({ ...st, phase: 'lobby', players: [] }))}>다시 하기</button>
        </div>
      </div>
    )
  }

  return (
    <div className="page cm-page cm-play" ref={playRef}>
      <div className="cm-top">
        <span className="cm-turn">{g.turn}/{TURNS}턴</span>
        <span className="cm-word">{meDrawer ? <b>{wordRef.current}</b> : g.reveal ? <b>{g.reveal.word}</b> : Array.from({ length: g.hintLen }).map((_, i) => <span key={i} className="cm-blank" />)}</span>
        <span className={`cm-timer ${remain <= 10 ? 'hot' : ''}`}>{remain}s</span>
      </div>
      <div className="cm-scores">{g.players.map((p) => <span key={p.uid} className={`cm-sc ${p.uid === g.drawer ? 'drawing' : ''}`}><Av name={p.name} avatar={p.avatar} className="cm-sc-av" />{p.uid === g.drawer ? '✏️ ' : ''}{p.name} {g.scores[p.uid] || 0}</span>)}</div>

      <div className="cm-canvas-wrap">
        <div className="cm-canvas-box">
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
      </div>

      <div className="cm-chat">
        <div className="cm-msgs">
          {chat.map((m) => m.kind === 'sys' ? <div key={m.id} className="cm-msg-sys">{m.text}</div> : <div key={m.id} className="cm-msg"><b>{m.name}</b> {m.text}</div>)}
          <div ref={chatEndRef} />
        </div>
        <form className="cm-guessbar" onSubmit={sendGuess}>
          <input value={guess} onChange={(e) => setGuess(e.target.value)} disabled={meDrawer} placeholder={meDrawer ? '그림을 그려 주세요' : '정답을 입력하세요'} maxLength={20} />
          <button type="submit" className="cm-send" disabled={meDrawer || !guess.trim()}>전송</button>
        </form>
      </div>
    </div>
  )
}
