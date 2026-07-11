import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { getMyGroupMember, awardOmok } from '../lib/api'

const N = 15               // 15×15 바둑판
const GAP = 28, MARGIN = 22
const SIZE = MARGIN * 2 + GAP * (N - 1)
const STARS = [[3, 3], [3, 11], [11, 3], [11, 11], [7, 7]]
const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]]
const emptyBoard = () => Array.from({ length: N }, () => Array(N).fill(0))

// 표준룰: 놓은 돌을 지나는 연속 라인이 "정확히 5"면 승리(6목 이상 장목은 무효). 승리 라인 좌표 반환.
function checkWin(board, r, c, color) {
  for (const [dr, dc] of DIRS) {
    const cells = [[r, c]]
    for (let s = 1; ; s++) { const nr = r + dr * s, nc = c + dc * s; if (nr < 0 || nr >= N || nc < 0 || nc >= N || board[nr][nc] !== color) break; cells.push([nr, nc]) }
    for (let s = 1; ; s++) { const nr = r - dr * s, nc = c - dc * s; if (nr < 0 || nr >= N || nc < 0 || nc >= N || board[nr][nc] !== color) break; cells.unshift([nr, nc]) }
    if (cells.length === 5) return cells
  }
  return null
}

function Av({ name, avatar }) {
  return <span className="omok-av">{avatar ? <img src={avatar} alt="" /> : <span className="omok-av-ini">{(name || '?').slice(0, 1)}</span>}</span>
}

export default function Omok() {
  const { groupId } = useParams()
  const { profile } = useAuth()
  const uid = profile?.id

  const chanRef = useRef(null)
  const [peers, setPeers] = useState({})
  const peersRef = useRef(peers); peersRef.current = peers

  const [g, setGraw] = useState({ phase: 'lobby', board: emptyBoard(), turn: 1, black: null, white: null, winner: null, line: null, reason: null, last: null })
  const gRef = useRef(g)
  const setG = useCallback((up) => setGraw((p) => { const n = typeof up === 'function' ? up(p) : up; gRef.current = n; return n }), [])
  const [awarded, setAwarded] = useState(null)

  const myName = useRef(profile?.nickname || '')
  const myAvatar = useRef(profile?.avatar_url || null)
  const boardRef = useRef(null)
  const applyRef = useRef(null)

  const emit = useCallback((type, payload) => { chanRef.current?.send({ type: 'broadcast', event: type, payload }) }, [])

  const myColor = g.black?.uid === uid ? 1 : g.white?.uid === uid ? 2 : 0
  const myTurn = g.phase === 'play' && g.turn === myColor

  const maybeAward = useCallback((winner) => {
    if (winner && winner.uid === uid) {
      awardOmok(groupId, uid).then((res) => { emit('award', res); applyRef.current('award', res) }).catch(() => {})
    }
  }, [uid, groupId, emit])

  const apply = useCallback((type, pl) => {
    if (type === 'game_start') {
      setAwarded(null)
      setG({ phase: 'play', board: emptyBoard(), turn: 1, black: pl.black, white: pl.white, winner: null, line: null, reason: null, last: null })
    } else if (type === 'move') {
      const st = gRef.current
      if (st.phase !== 'play' || st.turn !== pl.color || st.board[pl.r][pl.c] !== 0) return
      const board = st.board.map((row) => row.slice()); board[pl.r][pl.c] = pl.color
      const line = checkWin(board, pl.r, pl.c, pl.color)
      const full = !line && board.every((row) => row.every((v) => v !== 0))
      if (line) { const winner = pl.color === 1 ? st.black : st.white; setG({ ...st, board, last: [pl.r, pl.c], phase: 'ended', winner, line, reason: 'five' }); maybeAward(winner) }
      else if (full) setG({ ...st, board, last: [pl.r, pl.c], phase: 'ended', winner: null, reason: 'draw' })
      else setG({ ...st, board, last: [pl.r, pl.c], turn: pl.color === 1 ? 2 : 1 })
    } else if (type === 'resign') {
      const st = gRef.current
      if (st.phase !== 'play') return
      const winner = st.black?.uid === pl.by ? st.white : st.black
      setG({ ...st, phase: 'ended', winner, reason: 'resign' }); maybeAward(winner)
    } else if (type === 'reset') {
      setAwarded(null)
      setG((st) => ({ ...st, phase: 'lobby', board: emptyBoard(), turn: 1, winner: null, line: null, reason: null, last: null }))
    } else if (type === 'award') {
      setAwarded(pl)
    }
  }, [setG, maybeAward])
  applyRef.current = apply

  useEffect(() => {
    if (!groupId || !uid) return
    const ch = supabase.channel(`omok:${groupId}`, { config: { broadcast: { self: false }, presence: { key: uid } } })
    chanRef.current = ch
    const retrack = () => { if (ch.state === 'joined') ch.track({ uid, name: myName.current, avatar: myAvatar.current }).catch(() => {}) }
    getMyGroupMember(groupId, uid).then((m) => {
      if (m?.display_nickname) myName.current = m.display_nickname
      if (m?.avatar_url) myAvatar.current = m.avatar_url
      retrack()
    }).catch(() => {})
    ;['game_start', 'move', 'resign', 'reset', 'award'].forEach((ev) => ch.on('broadcast', { event: ev }, ({ payload }) => applyRef.current(ev, payload)))
    ch.on('presence', { event: 'sync' }, () => { const st = ch.presenceState(), map = {}; for (const k of Object.keys(st)) { if (k === uid) continue; const p = st[k][0] || {}; map[k] = { name: p.name || '?', avatar: p.avatar || null } } setPeers(map) })
    ch.subscribe(async (s) => { if (s === 'SUBSCRIBED') retrack() })
    return () => { supabase.removeChannel(ch); chanRef.current = null }
  }, [groupId, uid])

  function place(r, c) {
    if (!myTurn || g.board[r][c] !== 0) return
    const pl = { r, c, color: myColor, by: uid }
    emit('move', pl); apply('move', pl)
  }
  function onBoardPointer(e) {
    if (!myTurn) return
    const rect = boardRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * SIZE
    const y = ((e.clientY - rect.top) / rect.height) * SIZE
    const c = Math.round((x - MARGIN) / GAP), r = Math.round((y - MARGIN) / GAP)
    if (r < 0 || r >= N || c < 0 || c >= N) return
    place(r, c)
  }
  function startGame(myStone) {
    const oppId = Object.keys(peersRef.current)[0]
    if (!oppId) { alert('상대가 같은 화면에 들어와야 시작할 수 있어요.'); return }
    const me = { uid, name: myName.current, avatar: myAvatar.current }
    const opp = { uid: oppId, name: peersRef.current[oppId].name, avatar: peersRef.current[oppId].avatar }
    const black = myStone === 1 ? me : opp
    const white = myStone === 1 ? opp : me
    const pl = { black, white }; emit('game_start', pl); apply('game_start', pl)
  }
  function resign() {
    if (!window.confirm('기권할까요? 상대가 승리합니다.')) return
    const pl = { by: uid }; emit('resign', pl); apply('resign', pl)
  }
  function reset() { const pl = {}; emit('reset', pl); apply('reset', pl) }

  const oppId = Object.keys(peers)[0]
  const opp = oppId ? peers[oppId] : null
  const isHost = opp ? uid < oppId : false

  if (g.phase === 'lobby') {
    return (
      <div className="page omok-page">
        <div className="omok-lobby">
          <div className="omok-title">오목</div>
          <div className="omok-sub">가로·세로·대각선으로 <b>정확히 5목</b>을 먼저 만들면 승리! 이긴 사람은 <b>츄르 10개</b> (하루 1회)</div>
          <div className="omok-lobby-players">
            <span className="omok-chip"><Av name={myName.current} avatar={myAvatar.current} />{myName.current || '나'} (나)</span>
            {opp
              ? <span className="omok-chip"><Av name={opp.name} avatar={opp.avatar} />{opp.name}</span>
              : <span className="omok-chip omok-chip-wait">상대 기다리는 중…</span>}
          </div>
          {!opp && <div className="omok-hint">상대가 같은 화면에 들어오면 시작할 수 있어요.</div>}
          {opp && isHost && (
            <>
              <div className="omok-choose">
                <button type="button" className="omok-start black" onClick={() => startGame(1)}>흑으로 시작 <span>(선공)</span></button>
                <button type="button" className="omok-start white" onClick={() => startGame(2)}>백으로 시작 <span>(후공)</span></button>
              </div>
              <div className="omok-hint">돌 색을 고르면 바로 대국이 시작돼요.</div>
            </>
          )}
          {opp && !isHost && <div className="omok-hint">{opp.name} 님이 시작하기를 기다리는 중…</div>}
        </div>
      </div>
    )
  }

  const stones = []
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (g.board[r][c]) stones.push({ r, c, v: g.board[r][c] })
  const lineSet = new Set((g.line || []).map(([r, c]) => `${r},${c}`))
  const oppP = myColor === 1 ? g.white : g.black
  const meP = myColor === 1 ? g.black : g.white

  let status
  if (g.phase === 'play') status = myTurn ? '내 차례예요' : `${oppP?.name || '상대'} 님 차례`
  else if (g.reason === 'draw') status = '무승부!'
  else status = g.winner?.uid === uid ? '🎉 승리!' : `${g.winner?.name || '상대'} 님 승리`

  return (
    <div className="page omok-page omok-play">
      <div className="omok-bar">
        <div className={`omok-p ${g.phase === 'play' && g.turn === 1 ? 'on' : ''}`}>
          <span className="omok-dot black" /><Av name={g.black?.name} avatar={g.black?.avatar} />
          <span className="omok-pname">{g.black?.name}{g.black?.uid === uid ? ' (나)' : ''}</span>
        </div>
        <span className="omok-vs">VS</span>
        <div className={`omok-p right ${g.phase === 'play' && g.turn === 2 ? 'on' : ''}`}>
          <span className="omok-pname">{g.white?.name}{g.white?.uid === uid ? ' (나)' : ''}</span>
          <Av name={g.white?.name} avatar={g.white?.avatar} /><span className="omok-dot white" />
        </div>
      </div>
      <div className={`omok-status ${g.phase === 'ended' ? 'end' : ''} ${myTurn ? 'mine' : ''}`}>{status}</div>

      <div className="omok-board-wrap">
        <div ref={boardRef} className={`omok-board ${myTurn ? 'active' : ''}`} onPointerDown={onBoardPointer} style={{ touchAction: 'manipulation' }}>
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width="100%" height="100%">
            <g stroke="#9a6a2f" strokeWidth="1.2">
              {Array.from({ length: N }).map((_, i) => (
                <g key={i}>
                  <line x1={MARGIN} y1={MARGIN + i * GAP} x2={SIZE - MARGIN} y2={MARGIN + i * GAP} />
                  <line x1={MARGIN + i * GAP} y1={MARGIN} x2={MARGIN + i * GAP} y2={SIZE - MARGIN} />
                </g>
              ))}
            </g>
            {STARS.map(([r, c], i) => <circle key={i} cx={MARGIN + c * GAP} cy={MARGIN + r * GAP} r={3.2} fill="#7c531f" />)}
            {stones.map(({ r, c, v }) => {
              const cx = MARGIN + c * GAP, cy = MARGIN + r * GAP
              const winCell = lineSet.has(`${r},${c}`)
              const isLast = g.last && g.last[0] === r && g.last[1] === c
              return (
                <g key={`${r},${c}`}>
                  <circle cx={cx} cy={cy} r={GAP * 0.42} fill={v === 1 ? '#26242f' : '#fbfbfd'} stroke={v === 1 ? '#000' : '#c3bfce'} strokeWidth={v === 1 ? 0.5 : 1} />
                  {winCell && <circle cx={cx} cy={cy} r={GAP * 0.42} fill="none" stroke="#e5484d" strokeWidth={2.4} />}
                  {isLast && !winCell && <circle cx={cx} cy={cy} r={3} fill={v === 1 ? '#fff' : '#7363e8'} />}
                </g>
              )
            })}
          </svg>
        </div>
      </div>

      {g.phase === 'play' ? (
        <div className="omok-actions">
          <span className="omok-turn-tag">{myTurn ? '돌을 놓을 곳을 터치하세요' : '상대가 두는 중…'}</span>
          <button type="button" className="omok-resign" onClick={resign}>기권</button>
        </div>
      ) : (
        <div className="omok-result">
          <div className="omok-result-t">{g.reason === 'draw' ? '무승부' : g.winner?.uid === uid ? '🎉 승리했어요!' : `${g.winner?.name || '상대'} 님 승리`}</div>
          {g.winner && (
            <div className="omok-result-coin">
              {!awarded ? '보상 확인 중…'
                : awarded.ok ? `🐾 ${g.winner.name} 님 츄르 10개 획득!`
                : awarded.reason === 'already' ? '오늘은 이미 오목 보상을 받았어요'
                : '보상은 다음 기회에!'}
            </div>
          )}
          <button type="button" className="omok-again" onClick={reset}>다시 하기</button>
        </div>
      )}
    </div>
  )
}
