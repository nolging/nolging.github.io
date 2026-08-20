import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { getGroupMemberMap, listTarotCards } from '../lib/api'
import Avatar from '../components/Avatar'
import { MAJOR, SPREADS, compat, shuffleDeck, todayKey } from '../lib/tarot'

// 타로 카페 — 혼자 뽑기(오늘의 카드 / 세 장)와, 둘이 동시에 접속했을 때의 궁합.
//
// 동기화는 Broadcast 대신 Presence 로 한다. 뽑은 카드는 "지속되는 상태"라서
// 이벤트 유실·재접속에 취약한 broadcast 로는 어긋나기 쉽다. presence 는 서버가
// 들고 있다가 sync 로 다시 내려 주므로, 늦게 들어와도 상대가 뽑은 카드가 보인다.
// 궁합 점수는 두 장의 카드만으로 정해지는 순수 함수라 양쪽에서 같은 값이 나온다.

export default function TarotCafe() {
  const { groupId } = useParams()
  const { profile, isAdmin } = useAuth()
  const uid = profile?.id

  const chanRef = useRef(null)

  const [mode, setMode] = useState('one')       // one | three | duo
  const [deck, setDeck] = useState(() => shuffleDeck())
  const [picks, setPicks] = useState([])        // 확정된 카드 [{i,rev}]
  const [taken, setTaken] = useState([])        // 부채에서 빠진(확정된) 자리 — 빈 자리 표시용
  const [selected, setSelected] = useState([])  // 확정 전, 위로 들어 올려 고르는 중인 자리(클릭한 순서)
  const [peers, setPeers] = useState({})        // uid -> { name, avatar, pick, mode }
  const [me, setMe] = useState({ name: profile?.login_id || '나', avatar: null })
  const [flipping, setFlipping] = useState(false)
  const [shuffling, setShuffling] = useState(false)
  const [dailyCard, setDailyCard] = useState(null)  // 오늘 뽑아 하루 고정된 "오늘의 카드"
  const [cards, setCards] = useState(MAJOR)          // 카드 데이터(DB, 실패 시 하드코딩 폴백)

  // DB에서 카드 로드. 실패하면 MAJOR 폴백을 그대로 쓴다(양쪽 기기 순서 동일해야 궁합 인덱스 일치).
  // 카드 수가 폴백과 다르면(관리자가 비활성화 등) 그 수에 맞춰 덱을 다시 섞어 인덱스 범위를 맞춘다.
  useEffect(() => {
    let on = true
    listTarotCards().then((list) => {
      if (!on || !list.length) return
      setCards(list)
      if (list.length !== MAJOR.length) { setDeck(shuffleDeck(list.length)); setPicks([]); setTaken([]); setSelected([]) }
    }).catch(() => { })
    return () => { on = false }
  }, [])

  const spread = SPREADS[mode] || SPREADS.one
  const need = mode === 'duo' ? 1 : spread.need
  const done = picks.length >= need
  const dailyLocked = mode === 'one' && !!dailyCard

  // ---- "오늘의 카드" 하루 고정 (기기별 localStorage, DB 없이) ----
  const dailyKey = `tarot:daily:${groupId}:${uid}`
  const loadDaily = useCallback(() => {
    try {
      const o = JSON.parse(localStorage.getItem(dailyKey) || 'null')
      return o?.date === todayKey() ? o.card : null
    } catch { return null }
  }, [dailyKey])
  const saveDaily = useCallback((card) => {
    try { localStorage.setItem(dailyKey, JSON.stringify({ date: todayKey(), card })) } catch { /* noop */ }
  }, [dailyKey])

  // 진입 시 오늘 이미 뽑은 카드가 있으면 그대로 복원(부채 대신 결과부터 보여 줌)
  useEffect(() => {
    if (!uid) return
    const c = loadDaily()
    if (c) { setDailyCard(c); setMode('one'); setPicks([c]) }
  }, [uid, loadDaily])

  // 최신 값을 채널 콜백에서 읽기 위한 ref (effect 는 한 번만 돌기 때문)
  const meRef = useRef(me); meRef.current = me
  const isMemberRef = useRef(false) // 이 그룹 멤버일 때만 presence track(관리자 미가입 미리보기는 접속표시 X)
  const modeRef = useRef(mode); modeRef.current = mode
  const pickRef = useRef(null)
  pickRef.current = mode === 'duo' && picks[0] ? picks[0] : null

  // 내 상태를 presence 에 실어 보낸다(뽑은 카드까지)
  const publish = useCallback((next) => {
    const ch = chanRef.current
    if (!ch || !isMemberRef.current) return   // 미가입(관리자 미리보기)은 track 안 함 → 접속표시에 안 뜸
    ch.track({ uid, ...meRef.current, mode: next.mode, pick: next.pick || null }).catch(() => { })
  }, [uid])

  // ---- 실시간 채널 ----
  useEffect(() => {
    if (!groupId || !uid) return
    let alive = true
    const ch = supabase.channel(`tarot:${groupId}`, { config: { presence: { key: uid } } })
    chanRef.current = ch

    ch.on('presence', { event: 'sync' }, () => {
      const st = ch.presenceState()
      const next = {}
      for (const [k, arr] of Object.entries(st)) {
        if (k === uid) continue
        const m = arr[0]
        if (m) next[k] = { name: m.name, avatar: m.avatar, pick: m.pick || null, mode: m.mode }
      }
      if (alive) setPeers(next)
    })

    ch.subscribe(async (status) => {
      if (status !== 'SUBSCRIBED') return
      try {
        const map = await getGroupMemberMap(groupId)
        const mine = map?.[uid]
        isMemberRef.current = !!mine
        if (mine && alive) {
          const v = { name: mine.name || profile?.login_id || '나', avatar: mine.avatar || null }
          meRef.current = v; setMe(v)
        }
      } catch { /* 이름/사진은 없어도 동작 */ }
      // 재접속이면 상대는 내 상태를 모른다 → 지금 상태를 그대로 다시 올린다
      publish({ mode: modeRef.current, pick: pickRef.current })
    })
    return () => { alive = false; try { ch.untrack() } catch { /* noop */ } supabase.removeChannel(ch); chanRef.current = null }
  }, [groupId, uid, profile?.login_id, publish])

  // 모드가 바뀌면 상대에게도 알린다(궁합 모드에 함께 들어왔는지 보여 주기 위해)
  useEffect(() => { publish({ mode, pick: pickRef.current }) }, [mode, publish])

  const partner = useMemo(() => {
    const [k, v] = Object.entries(peers)[0] || []
    return k ? { uid: k, ...v } : null
  }, [peers])
  const duoReady = !!partner

  // 상대가 나가면 궁합을 볼 수 없다 → 판을 정리하고 혼자 모드로.
  // (고른 카드를 남겨 두면 궁합을 기다리던 화면이 갑자기 혼자 결과로 바뀐다)
  useEffect(() => {
    if (mode !== 'duo' || duoReady) return
    setMode('one'); setDeck(shuffleDeck()); setPicks([]); setTaken([]); setSelected([])
    publish({ mode: 'one', pick: null })
  }, [mode, duoReady, publish])

  // 새 판: 덱을 다시 섞고 고른 카드를 비운다(상대에게도 초기화를 알린다)
  function reset(nextMode = mode) {
    setShuffling(true)
    setDeck(shuffleDeck()); setPicks([]); setTaken([]); setSelected([])
    publish({ mode: nextMode, pick: null })
    setTimeout(() => setShuffling(false), 520)
  }
  function changeMode(m) {
    if (m === mode) return
    setMode(m)
    // 오늘의 카드는 하루 고정 → 다시 섞지 않고 이미 뽑은 카드를 그대로 보여 준다
    if (m === 'one' && dailyCard) {
      setPicks([dailyCard]); setTaken([]); setSelected([]); publish({ mode: m, pick: null })
    } else {
      reset(m)
    }
  }
  // 클릭 = 바로 확정이 아니라 카드를 위로 들어 올려 고르는/내리는 토글(다시 누르면 취소).
  // 필요한 장수만큼 들어 올린 뒤 아래 "선택" 버튼을 눌러야 확정된다(들어 올린 순서 = picks 순서).
  function toggleSelect(slot) {
    if (done || taken.includes(slot) || shuffling) return
    setSelected((s) => {
      if (s.includes(slot)) return s.filter((x) => x !== slot)
      if (s.length >= need) return s
      return [...s, slot]
    })
  }
  function confirmPicks() {
    if (selected.length < need || shuffling) return
    const chosen = selected.map((slot) => deck[slot])
    setPicks(chosen); setTaken((t) => [...t, ...selected]); setSelected([])
    setFlipping(true); setTimeout(() => setFlipping(false), 620)
    if (mode === 'one') { saveDaily(chosen[0]); setDailyCard(chosen[0]) }  // 오늘의 카드 고정
    if (mode === 'duo') publish({ mode, pick: chosen[0] })
  }

  const pair = mode === 'duo' && picks[0] && partner?.pick ? compat(picks[0], partner.pick, cards) : null

  if (!isAdmin) {
    return (
      <div className="page tarot-page">
        <div className="tr-soon">
          <span className="tr-soon-ico">🔮</span>
          <p>타로 카페는 아직 준비 중이에요</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page tarot-page">
      <div className="tr-head">
        <span className="tr-sign">🔮 타로 카페</span>
        <p className="tr-sub">
          {mode === 'duo'
            ? '둘이 각각 한 장씩 뽑으면 궁합이 나와요'
            : '마음이 가는 카드를 골라 보세요'}
        </p>
        <div className="tr-who">
          <Avatar src={me.avatar} name={me.name} size={26} />
          {partner
            ? <>
              <Avatar src={partner.avatar} name={partner.name} size={26} />
              <span className="tr-who-t">{partner.name} 님도 카페에 있어요</span>
            </>
            : <span className="tr-who-t tr-who-alone">지금은 혼자예요</span>}
        </div>
      </div>

      <div className="tr-tabs" role="tablist">
        {['one', 'three'].map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m}
            className={`tr-tab${mode === m ? ' on' : ''}`} onClick={() => changeMode(m)}>
            {SPREADS[m].label}
          </button>
        ))}
        <button type="button" role="tab" aria-selected={mode === 'duo'}
          className={`tr-tab${mode === 'duo' ? ' on' : ''}`} onClick={() => changeMode('duo')}
          disabled={!duoReady} title={duoReady ? '' : '둘이 함께 있을 때 열려요'}>
          궁합 {!duoReady && <span className="tr-tab-lock">둘이서</span>}
        </button>
      </div>

      {!done && (
        <>
          <div className={`tr-fan${shuffling ? ' shuffling' : ''}`}>
            {deck.map((_, k) => {
              const used = taken.includes(k)
              const sel = selected.includes(k)
              const mid = (deck.length - 1) / 2
              return (
                <button key={k} type="button" className={`tr-slot${used ? ' used' : ''}${sel ? ' selected' : ''}`}
                  style={{ '--rot': `${(k - mid) * 3}deg`, '--lift': `${Math.abs(k - mid) * 3}px`, zIndex: k }}
                  onClick={() => toggleSelect(k)} disabled={used || shuffling} aria-pressed={sel}
                  aria-label={`카드 ${k + 1}번${sel ? ' 선택 해제' : ' 선택'}`}>
                  <CardBack />
                  {sel && need > 1 && <span className="tr-slot-order">{selected.indexOf(k) + 1}</span>}
                </button>
              )
            })}
          </div>
          <p className="tr-count">
            {selected.length >= need ? '카드를 다 골랐어요' : `${need - selected.length}장 더 고르세요`}
            {mode === 'duo' && partner && (
              <span className="tr-peer-state">
                {' · '}{partner.pick ? `${partner.name} 님은 다 골랐어요` : `${partner.name} 님도 고르는 중`}
              </span>
            )}
          </p>
          <button type="button" className="tr-confirm" disabled={selected.length < need || shuffling} onClick={confirmPicks}>
            선택
          </button>
        </>
      )}

      {done && mode !== 'duo' && (
        <div className={`tr-result${flipping ? ' flip' : ''}`}>
          <div className={`tr-spread cols-${picks.length}`}>
            {picks.map((c, k) => (
              <div key={k} className="tr-slotwrap">
                <span className="tr-slot-label">{spread.slots[k]}</span>
                <CardFace m={cards[c.i]} rev={c.rev} />
              </div>
            ))}
          </div>
          <div className="tr-read">
            {picks.map((c, k) => (
              <div key={k} className="tr-read-row">
                <b>{spread.slots[k]} · {cards[c.i].ko}{c.rev ? ' (역)' : ''}</b>
                <span>{c.rev ? cards[c.i].rev : cards[c.i].up}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {done && mode === 'duo' && (
        <div className={`tr-result${flipping ? ' flip' : ''}`}>
          <div className="tr-duo">
            <div className="tr-slotwrap">
              <span className="tr-slot-label">{me.name}</span>
              <CardFace m={cards[picks[0].i]} rev={picks[0].rev} />
            </div>
            <span className="tr-duo-x">＋</span>
            <div className="tr-slotwrap">
              <span className="tr-slot-label">{partner?.name || '상대'}</span>
              {partner?.pick ? <CardFace m={cards[partner.pick.i]} rev={partner.pick.rev} /> : <CardBack className="tr-wait" />}
            </div>
          </div>

          {pair ? (
            <div className="tr-score">
              <div className="tr-score-num">{pair.score}<i>%</i></div>
              <div className="tr-score-bar"><span style={{ width: `${pair.score}%` }} /></div>
              <div className="tr-score-tier">{pair.tier.name}</div>
              <p className="tr-score-line">{pair.tier.line}</p>
              <p className="tr-score-note">{pair.note}</p>
              <div className="tr-read">
                <div className="tr-read-row">
                  <b>{me.name} · {cards[picks[0].i].ko}{picks[0].rev ? ' (역)' : ''}</b>
                  <span>{picks[0].rev ? cards[picks[0].i].rev : cards[picks[0].i].up}</span>
                </div>
                <div className="tr-read-row">
                  <b>{partner.name} · {cards[partner.pick.i].ko}{partner.pick.rev ? ' (역)' : ''}</b>
                  <span>{partner.pick.rev ? cards[partner.pick.i].rev : cards[partner.pick.i].up}</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="tr-waiting">{partner?.name || '상대'} 님이 카드를 고르면 궁합이 나와요…</p>
          )}
        </div>
      )}

      {/* 오늘의 카드는 하루 고정 → 다시 뽑기 대신 안내. 그 외 모드는 다시 섞기 가능 */}
      {dailyLocked && done
        ? <p className="tr-daily-note">🌙 오늘의 카드는 내일 다시 뽑을 수 있어요</p>
        : (done || taken.length > 0) && (
          <button type="button" className="tr-again" onClick={() => reset()}>다시 섞어서 뽑기</button>
        )}
    </div>
  )
}

// 카드 뒷면 — 달과 별
function CardBack({ className = '' }) {
  return (
    <svg className={`tr-card tr-back ${className}`} viewBox="0 0 100 156" aria-hidden="true">
      <rect x="1" y="1" width="98" height="154" rx="10" fill="#2a2350" stroke="#b79a5b" strokeWidth="2" />
      <rect x="7" y="7" width="86" height="142" rx="7" fill="none" stroke="#6b5aa8" strokeWidth="1" />
      <circle cx="50" cy="60" r="17" fill="none" stroke="#e8d9a8" strokeWidth="2" />
      <path d="M56 47a17 17 0 1 0 0 26 20 20 0 0 1 0-26Z" fill="#e8d9a8" />
      {[[26, 100], [50, 112], [74, 100], [38, 126], [62, 126]].map(([x, y], i) => (
        <path key={i} d={`M${x} ${y - 5} l1.4 3.6 l3.6 1.4 l-3.6 1.4 l-1.4 3.6 l-1.4 -3.6 l-3.6 -1.4 l3.6 -1.4 z`} fill="#c9b98a" />
      ))}
    </svg>
  )
}

// 카드 앞면 — 카드 그림 이미지(m.image)가 있으면 그걸 꽉 채워 쓰고, 없으면 이모지 도안.
// 역방향이면 그림이 180° 뒤집힌다(이미지·이모지 공통).
function CardFace({ m, rev }) {
  if (!m) return null
  return (
    <div className={`tr-cardwrap${rev ? ' rev' : ''}`}>
      {m.image ? (
        <div className="tr-card tr-face tr-face-img">
          <img className="tr-cardimg" src={m.image} alt="" loading="lazy" />
        </div>
      ) : (
        <svg className="tr-card tr-face" viewBox="0 0 100 156" aria-hidden="true">
          <rect x="1" y="1" width="98" height="154" rx="10" fill="#fffaf0" stroke="#b79a5b" strokeWidth="2" />
          <rect x="7" y="7" width="86" height="142" rx="7" fill="none" stroke="#e0cfa2" strokeWidth="1" />
          <text x="50" y="24" textAnchor="middle" className="tr-num">{m.r}</text>
          <text x="50" y="92" textAnchor="middle" className="tr-glyph">{m.emoji}</text>
          <text x="50" y="132" textAnchor="middle" className="tr-name">{m.ko}</text>
        </svg>
      )}
      {rev && <span className="tr-revtag">역방향</span>}
    </div>
  )
}
