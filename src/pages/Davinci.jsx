import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { davinci } from '../lib/api'

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

  const [v, setV] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [sel, setSel] = useState(null)       // 추리 대상 상대 pos
  const [moveSel, setMoveSel] = useState(null) // 정렬 단계: 옮길 내 조커 index
  const chanRef = useRef(null)
  const matchRef = useRef(null)

  const ping = useCallback(() => { chanRef.current?.send({ type: 'broadcast', event: 'sync', payload: {} }) }, [])

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
    const ch = supabase.channel(`davinci:${groupId}`, { config: { broadcast: { self: false } } })
    chanRef.current = ch
    ch.on('broadcast', { event: 'sync' }, () => refresh())
    ch.subscribe()
    return () => { alive = false; supabase.removeChannel(ch); chanRef.current = null }
  }, [groupId, uid, refresh])

  if (err && !v) return <div className="page dv-page"><div className="dv-msg">{err}</div></div>
  if (!v) return <div className="page dv-page"><div className="dv-msg">불러오는 중…</div></div>

  const me = v.players.find((p) => p.uid === v.meUid) || {}
  const opp = v.players.find((p) => p.uid === v.oppUid) || {}
  const iReady = !!v.ready[v.meUid]
  const oppReady = !!v.ready[v.oppUid]
  const myTurn = v.turn === v.meUid
  const canAfford = v.stakeOk?.[v.meUid]

  // ---- 로비 ----
  if (v.status === 'lobby') {
    const setStake = (d) => act('stake', { stake: Math.max(0, (v.stake || 0) + d) })
    return (
      <div className="page dv-page">
        <div className="dv-lobby">
          <div className="dv-title">다빈치코드</div>
          <div className="dv-sub">숫자 타일을 추리해 상대 걸 모두 공개시키면 승리! 서로 <b>츄르를 걸고</b> 이긴 사람이 판돈을 가져가요.</div>

          <div className="dv-stakebox">
            <div className="dv-stake-label">판돈 (각자)</div>
            <div className="dv-stake-ctl">
              <button type="button" onClick={() => setStake(-5)} disabled={busy || v.stake <= 0}>−5</button>
              <button type="button" onClick={() => setStake(-1)} disabled={busy || v.stake <= 0}>−1</button>
              <span className="dv-stake-val">🐾 {v.stake}</span>
              <button type="button" onClick={() => setStake(1)} disabled={busy}>+1</button>
              <button type="button" onClick={() => setStake(5)} disabled={busy}>+5</button>
            </div>
            <div className="dv-mybal">내 보유: 🐾 {v.myBalance}</div>
          </div>

          <div className="dv-lobby-players">
            {v.players.map((pl) => (
              <div key={pl.uid} className={`dv-lp ${v.ready[pl.uid] ? 'rdy' : ''}`}>
                <Av name={pl.name} avatar={pl.avatar} />
                <span className="dv-lp-name">{pl.name}{pl.uid === v.meUid ? ' (나)' : ''}</span>
                <span className={`dv-lp-state ${v.stakeOk?.[pl.uid] ? '' : 'short'}`}>
                  {v.ready[pl.uid] ? '준비완료' : v.stakeOk?.[pl.uid] ? '대기중' : '보유 부족'}
                </span>
              </div>
            ))}
          </div>

          <button type="button" className={`dv-ready ${iReady ? 'on' : ''}`} disabled={busy || (!iReady && !canAfford)}
            onClick={() => act('ready', { ready: !iReady })}>
            {iReady ? '준비 취소' : canAfford ? '준비' : '보유 츄르 부족'}
          </button>
          <button type="button" className="dv-start" disabled={busy || !(iReady && oppReady)} onClick={() => act('start')}>
            게임 시작
          </button>
          {err && <div className="dv-err">{err}</div>}
          <div className="dv-hint">둘 다 준비해야 시작할 수 있어요. 판돈을 바꾸면 준비가 초기화돼요.</div>
        </div>
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
    <div className="page dv-page dv-play">
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
  )
}
