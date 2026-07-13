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
      setV(r); setSel(null); setMoveSel(null)
      if (r.matchId) matchRef.current = r.matchId
      ping()
    } catch (e) { setErr(e.message || '오류') }
    finally { setBusy(false) }
  }, [ping])

  useEffect(() => {
    if (!groupId || !uid) return
    let alive = true
    davinci('open', { groupId }).then((r) => { if (!alive) return; setV(r); matchRef.current = r.matchId })
      .catch((e) => { if (alive) setErr(e.message || '열기 실패') })
    const ch = supabase.channel(`davinci:${groupId}`, { config: { broadcast: { self: false }, presence: { key: uid } } })
    chanRef.current = ch
    ch.on('broadcast', { event: 'sync' }, () => refresh())
    ch.on('broadcast', { event: 'chat' }, ({ payload }) => pushChat(payload))
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
            ? <div key={m.id} className="om-chat-row me"><span className="om-bubble me">{m.text}</span></div>
            : <div key={m.id} className="om-chat-row"><LobbyAvatar name={nameOf(m.uid)} avatar={avatarOf(m.uid)} size={26} /><div className="om-chat-msg"><span className="om-chat-nm">{nameOf(m.uid)}</span><span className="om-bubble">{m.text}</span></div></div>)}
        <div ref={chatEndRef} />
      </div>
      <form className="om-chat-input" onSubmit={sendChat}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="메시지 보내기" maxLength={100} enterKeyHint="send" />
        <button type="submit" className="om-send" aria-label="전송"><SendIcon /></button>
      </form>
    </div>
  )

  // ---- 로비 (14e) ----
  if (v.status === 'lobby') {
    const changeStake = (d) => act('stake', { stake: Math.max(0, Math.min(20, (v.stake || 0) + d)) })
    const bothReady = iReady && oppReady
    const seat = (idx) => {
      const pl = v.players[idx]
      const mine = pl?.uid === v.meUid
      const rdy = pl && v.ready[pl.uid]
      const afford = pl && v.stakeOk?.[pl.uid]
      return (
        <div className={`om-seat ${pl ? 'taken' : 'empty'} ${mine ? 'mine' : ''} ${rdy ? 'dv-rdy' : ''}`}
          role="button" tabIndex={0}
          onClick={() => { if (mine && (iReady || canAfford) && !busy) act('ready', { ready: !iReady }) }}>
          <div className="om-seat-top"><span className="dv-order">{idx === 0 ? '⚡ 선공' : '후공'}</span></div>
          {pl
            ? <><LobbyAvatar name={pl.name} avatar={pl.avatar} /><div className="om-seat-name">{pl.name}{mine && <span className="om-badge-me">나</span>}</div>
                <div className={`dv-seat-st ${rdy ? 'on' : afford ? '' : 'short'}`}>{rdy ? '준비완료' : !afford ? '보유 부족' : mine ? '탭해서 준비' : '대기 중'}</div></>
            : <><span className="om-seat-empty"><PersonIcon /></span><div className="om-seat-wait">대기 중</div></>}
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
          <div className="om-seats-hint">준비 상태를 <b>탭</b>해서 정하세요 · 선공이 먼저 추측해요</div>
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

  // ---- 대국/종료 공통: 손패 렌더 ----
  const gap = (slot, onPick) => <button type="button" className="dv-gap" onClick={() => onPick(slot)} aria-label="여기로" />
  const placing = v.phase === 'place' && myTurn && v.myToPlace[0]
  const selfrevealing = v.phase === 'selfreveal' && myTurn
  const setupArrange = v.phase === 'setup' && !v.mySetupDone
  const iHaveJoker = v.myHand.some((t) => t.j)

  function renderMyHand() {
    const showGaps = (setupArrange && moveSel != null) || placing
    const onGap = placing ? (s) => act('place', { slot: s }) : (s) => act('arrange', { from: moveSel, to: s })
    const items = []
    for (let i = 0; i < v.myHand.length; i++) {
      if (showGaps) items.push(<span key={`g${i}`}>{gap(i, onGap)}</span>)
      const t = v.myHand[i]
      let onClick = null
      if (selfrevealing && !t.up) onClick = () => act('selfreveal', { pos: i })
      else if (setupArrange && t.j) onClick = () => setMoveSel(moveSel === i ? null : i)
      items.push(<Tile key={`t${i}`} t={t} mine selected={setupArrange && moveSel === i} onClick={onClick} />)
    }
    if (showGaps) items.push(<span key="gend">{gap(v.myHand.length, onGap)}</span>)
    return items
  }
  function renderOppHand() {
    return v.oppHand.map((t, i) => {
      if (t.placeholder) return <Tile key={i} t={{ c: 'x', up: false }} />
      const clickable = myTurn && v.phase === 'guess' && !t.up ? () => setSel(i) : null
      return <Tile key={i} t={t} onClick={clickable} selected={sel === i} />
    })
  }

  const statusText = () => {
    if (v.status === 'ended') return v.winner === v.meUid ? '🎉 승리!' : `${opp.name} 님 승리`
    if (v.phase === 'setup') {
      if (v.mySetupDone) return `${opp.name} 님이 준비하는 중…`
      if (moveSel != null) return '놓을 위치를 고르세요'
      return iHaveJoker ? '조커(–)를 눌러 위치를 옮기고, 완료를 누르세요' : '배치를 확인하고 완료를 누르세요'
    }
    if (!myTurn) return `${opp.name} 님 차례`
    if (v.phase === 'guess') return sel != null ? '숫자를 골라 추리하세요' : '상대의 가릴 타일을 고르세요'
    if (v.phase === 'decide') return '정답! 계속할까요, 멈출까요?'
    if (v.phase === 'place') return '뽑은 조커를 놓을 위치를 고르세요'
    if (v.phase === 'selfreveal') return '더미가 비었어요 — 공개할 내 타일을 고르세요'
    return ''
  }

  const drawnTile = v.drawn && !v.drawn.hidden ? v.drawn : null

  return (
    <div className="om-root dv-play" ref={rootRef}>
      <div className="om-head">
        <button type="button" className="om-icon-btn" aria-label="나가기" onClick={() => navigate(-1)}><CloseIcon /></button>
        <div className="om-title">다빈치 코드</div>
        {v.status !== 'ended' && <span className={`dv-turnpill ${myTurn ? 'on' : ''}`}>{myTurn ? <><span className="om-sub-dot" /> 내 차례</> : '상대 차례'}</span>}
      </div>
      <div className="dv-body">
      <div className="dv-bar">
        <div className={`dv-pl ${v.turn === v.oppUid ? 'on' : ''}`}>
          <Av name={opp.name} avatar={opp.avatar} /><span className="dv-pl-name">{opp.name}</span>
          <span className="dv-pot">🐾 {v.stake}</span>
        </div>
      </div>

      <div className="dv-hand-area opp">{renderOppHand()}</div>

      <div className={`dv-status ${myTurn ? 'mine' : ''} ${v.status === 'ended' ? 'end' : ''}`}>{statusText()}</div>

      <div className="dv-center">
        {drawnTile && <div className="dv-drawn"><span className="dv-drawn-l">뽑은 타일</span><Tile t={{ ...drawnTile, up: true }} /></div>}
        {v.drawn?.hidden && <div className="dv-drawn dim"><span className="dv-drawn-l">상대가 뽑음</span><Tile t={{ c: 'b', up: false }} /></div>}
        {v.status !== 'ended' && v.phase !== 'setup' && v.deckCount > 0 && <div className="dv-deck">더미 {v.deckCount}</div>}
        {v.phase === 'setup' && <div className="dv-deck">{v.mySetupDone ? '상대 준비 대기 중' : '타일을 배치하세요'}</div>}
      </div>

      <div className="dv-hand-area me">{renderMyHand()}</div>

      {/* 액션 패널 */}
      {v.status === 'ended' ? (
        <div className="dv-result">
          <div className="dv-result-t">{v.winner === v.meUid ? '🎉 승리했어요!' : `${opp.name} 님 승리`}</div>
          {v.stake > 0 && v.settledAmount != null && (
            <div className={`dv-result-coin ${v.winner === v.meUid ? 'up' : 'down'}`}>
              {v.winner === v.meUid ? `🐾 +${v.settledAmount} 츄르` : `🐾 −${v.settledAmount} 츄르`}
            </div>
          )}
          <button type="button" className="dv-again" disabled={busy} onClick={() => act('reset')}>다시 하기</button>
        </div>
      ) : (
        <div className="dv-actions">
          {v.phase === 'setup' && !v.mySetupDone && (
            <button type="button" className="dv-start" disabled={busy} onClick={() => act('confirm')}>배치 완료</button>
          )}
          {myTurn && v.phase === 'guess' && sel != null && (
            <div className="dv-guesspanel">
              <div className="dv-vals">
                {Array.from({ length: 12 }).map((_, n) => (
                  <button key={n} type="button" disabled={busy} onClick={() => act('guess', { pos: sel, val: String(n) })}>{n}</button>
                ))}
                <button type="button" className="dv-joker" disabled={busy} onClick={() => act('guess', { pos: sel, val: 'joker' })}>조커(-)</button>
              </div>
              <button type="button" className="dv-cancel" onClick={() => setSel(null)}>취소</button>
            </div>
          )}
          {myTurn && v.phase === 'decide' && (
            <div className="dv-decide">
              <button type="button" disabled={busy} className="cont" onClick={() => act('decide', { cont: true })}>계속 추리</button>
              <button type="button" disabled={busy} className="stop" onClick={() => act('decide', { cont: false })}>멈추기</button>
            </div>
          )}
          {v.status === 'playing' && v.phase !== 'setup' && (
            <button type="button" className="dv-resign" disabled={busy} onClick={() => { if (window.confirm('기권할까요? 상대가 판돈을 가져갑니다.')) act('resign') }}>기권</button>
          )}
        </div>
      )}

      {err && <div className="dv-err">{err}</div>}
      <div className="dv-log">{(v.log || []).slice(-4).map((l, i) => <div key={i} className="dv-log-l">{l.t}</div>)}</div>
      </div>
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
