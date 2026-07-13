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
    try { const r = await davinci('view', { matchId: mid }); setV(r) } catch { /* noop */ }
  }, [])

  const act = useCallback(async (action, payload = {}) => {
    const mid = matchRef.current; if (!mid && action !== 'open') return
    setBusy(true); setErr('')
    try {
      const r = await davinci(action, { matchId: mid, ...payload })
      setV(r); setSel(null); setMoveSel(null); setGuessVal(null); setJokerSlot(null)
      if (r.matchId) matchRef.current = r.matchId
      ping()
    } catch (e) { setErr(e.message || '오류') }
    finally { setBusy(false) }
  }, [ping])

  useEffect(() => {
    if (!groupId || !uid) return
    let alive = true
    davinci('open', { groupId }).then((r) => {
      if (!alive) return; setV(r); matchRef.current = r.matchId
      if (!seenPeers.current.has(uid) && r.status === 'lobby') { seenPeers.current.add(uid); setChat((c) => [...c.slice(-80), { id: uuid(), sys: true, joinUid: uid }]) }
    }).catch((e) => { if (alive) setErr(e.message || '열기 실패') })
    const ch = supabase.channel(`davinci:${groupId}`, { config: { broadcast: { self: false }, presence: { key: uid } } })
    chanRef.current = ch
    ch.on('broadcast', { event: 'sync' }, () => refresh())
    ch.on('broadcast', { event: 'chat' }, ({ payload }) => pushChat(payload))
    ch.on('broadcast', { event: 'rematch' }, ({ payload }) => {
      if (payload?.uid !== uid) { setToast(`${payload?.name || '상대'} 님이 한 판 더 하고 싶대요`); setTimeout(() => setToast(''), 4000) }
    })
    ch.on('presence', { event: 'join' }, ({ key }) => {
      if (key === uid || seenPeers.current.has(key)) return
      seenPeers.current.add(key)
      setChat((c) => [...c.slice(-80), { id: uuid(), sys: true, joinUid: key }])
    })
    ch.subscribe((s) => { if (s === 'SUBSCRIBED') ch.track({ uid }).catch(() => {}) })
    return () => { alive = false; supabase.removeChannel(ch); chanRef.current = null }
  }, [groupId, uid, refresh, pushChat])

  // 키보드 위에 입력창 유지 + 채팅 자동 스크롤
  useEffect(() => {
    const vv = window.visualViewport; if (!vv) return
    const fit = () => { if (rootRef.current) rootRef.current.style.height = vv.height + 'px' }
    fit(); vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit)
    return () => { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit) }
  }, [])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ block: 'end' }) }, [chat])

  if (err && !v) return <div className="page dv-page"><div className="dv-msg">{err}</div></div>
  if (!v) return <div className="page dv-page"><div className="dv-msg">불러오는 중…</div></div>

  const me = v.players.find((p) => p.uid === v.meUid) || {}
  const opp = v.players.find((p) => p.uid === v.oppUid) || {}
  const iReady = !!v.ready[v.meUid]
  const oppReady = !!v.ready[v.oppUid]
  const myTurn = v.turn === v.meUid
  const canAfford = v.stakeOk?.[v.meUid]

  // 채팅 이름/아바타는 v.players 에서 uid 로 조회(아이디 노출 방지)
  const nameOf = (u) => v.players.find((p) => p.uid === u)?.name || '멤버'
  const avatarOf = (u) => v.players.find((p) => p.uid === u)?.avatar || null

  const chatBox = (
    <div className="om-chat">
      <div className="om-chat-scroll">
        {chat.map((m) => m.sys
          ? <div key={m.id} className="om-chat-sys">{nameOf(m.joinUid)} 님 등장! 🐾</div>
          : m.uid === uid
            ? <div key={m.id} className="om-chat-row om-me"><span className="om-bubble om-me">{m.text}</span></div>
            : <div key={m.id} className="om-chat-row"><LobbyAvatar name={nameOf(m.uid)} avatar={avatarOf(m.uid)} size={26} /><div className="om-chat-msg"><span className="om-chat-nm">{nameOf(m.uid)}</span><span className="om-bubble">{m.text}</span></div></div>)}
        <div ref={chatEndRef} />
      </div>
      <form className="om-chat-input" onSubmit={sendChat}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="메시지 보내기" maxLength={100} enterKeyHint="send"
          onFocus={(e) => setTimeout(() => e.target.scrollIntoView({ block: 'center' }), 300)} />
        <button type="submit" className="om-send" aria-label="전송"><SendIcon /></button>
      </form>
    </div>
  )

  // ---- 로비 (14e) ----
  if (v.status === 'lobby') {
    const changeStake = (d) => act('stake', { stake: Math.max(0, Math.min(20, (v.stake || 0) + d)) })
    const bothReady = iReady && oppReady
    // 준비(참여) 탭 전에는 자리를 비워 둔다(프로필·닉네임 미표시). 준비 = 자리에 앉음.
    const seat = (idx) => {
      const pl = v.players[idx]
      const mine = pl?.uid === v.meUid
      const joined = pl && v.ready[pl.uid]           // 준비완료 = 참여(자리 점유)
      const afford = pl && v.stakeOk?.[pl.uid]
      const canJoin = mine && (iReady || canAfford)
      return (
        <div className={`om-seat ${joined ? 'taken dv-rdy' : 'empty'} ${mine ? 'mine' : ''}`}
          role="button" tabIndex={0}
          onClick={() => { if (canJoin && !busy) act('ready', { ready: !iReady }) }}>
          <div className="om-seat-top"><span className="dv-order">{idx === 0 ? '⚡ 선공' : '후공'}</span></div>
          {joined
            ? <><LobbyAvatar name={pl.name} avatar={pl.avatar} /><div className="om-seat-name">{pl.name}{mine && <span className="om-badge-me">나</span>}</div>
                <div className="dv-seat-st on">준비완료</div></>
            : <><span className="om-seat-empty"><PersonIcon /></span>
                <div className="om-seat-wait">{mine ? (afford ? '탭해서 참여' : '보유 부족') : '대기 중'}</div></>}
        </div>
      )
    }
    return (
      <div className="om-root om-lobby" ref={rootRef}>
        <div className="om-head">
          <button type="button" className="om-icon-btn" aria-label="뒤로" onClick={() => navigate(-1)}><BackIcon /></button>
          <div className="om-title">다빈치 코드</div><span className="om-pill">대기실</span>
          <button type="button" className="om-icon-btn om-help" aria-label="게임 룰" onClick={() => setRuleOn(true)}>?</button>
        </div>
        {chatBox}
        <div className="om-seats">
          <div className="om-seats-row">{seat(0)}{seat(1)}</div>
          <div className="om-seats-hint">내 자리를 <b>탭</b>해서 참여하세요 · 선공이 먼저 추측해요</div>
        </div>
        <div className="om-bet">
          <div className="om-bet-l"><div className="om-bet-t">츄르 베팅</div><div className="om-bet-s">이긴 사람이 전부 가져가요 🐾 · 내 보유 {v.myBalance}</div></div>
          <button type="button" className="om-bet-btn" onClick={() => !busy && changeStake(-5)} aria-label="줄이기">−</button>
          <span className="om-bet-val">{v.stake}</span>
          <button type="button" className="om-bet-btn" onClick={() => !busy && changeStake(5)} aria-label="늘리기">+</button>
        </div>
        <div className="om-start-wrap">
          <button type="button" className={`om-start ${bothReady ? 'on' : ''}`} disabled={!bothReady || busy} onClick={() => act('start')}>
            {bothReady ? '게임 시작' : '둘 다 준비되면 시작할 수 있어요'}
          </button>
        </div>
        {err && <div className="dv-err" style={{ position: 'absolute', bottom: 8, left: 20, right: 20 }}>{err}</div>}
        {ruleOn && <DvRuleModal onClose={() => setRuleOn(false)} />}
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
          {t.up ? (t.j ? '-' : t.n) : <PawMini />}
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
  else if (v.phase === 'setup') banner = { setup: true, title: v.mySetupDone ? '상대 준비를 기다리는 중…' : '조커 위치를 정하고 배치 완료를 누르세요', sub: '' }
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
