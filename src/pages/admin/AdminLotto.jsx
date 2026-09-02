import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  adminListLottoRounds, adminListLottoEntries, adminSetLottoWinningNumbers,
  adminUpdateLottoConfig, getLottoConfig,
} from '../../lib/api'

function formatDate(iso) {
  try { return new Date(iso).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) } catch { return '' }
}

// 관리자가 미추첨 회차의 당첨 번호를 직접 고르는 번호판. 본번호(pick_count개) 먼저, 그다음
// 보너스 번호(1개, 본번호와 중복 불가) 순서로 고른다.
function AdminDrawPicker({ round, onSettled }) {
  const [main, setMain] = useState([])
  const [bonus, setBonus] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const nums = useMemo(() => {
    const arr = []
    for (let n = round.number_min; n <= round.number_max; n++) arr.push(n)
    return arr
  }, [round.number_min, round.number_max])

  function toggleMain(n) {
    if (busy) return
    setMain((prev) => {
      if (prev.includes(n)) return prev.filter((x) => x !== n)
      if (prev.length >= round.pick_count) return prev
      return [...prev, n].sort((a, b) => a - b)
    })
    setBonus((prev) => (prev === n ? null : prev))
  }
  function toggleBonus(n) {
    if (busy || main.includes(n)) return
    setBonus((prev) => (prev === n ? null : n))
  }

  async function handleConfirm() {
    if (main.length !== round.pick_count || bonus == null || busy) return
    if (!window.confirm(`${round.round_no}회 당첨 번호를 이대로 확정할까요? 확정 즉시 응모자 정산(츄르 지급)이 진행돼요.`)) return
    setBusy(true); setError('')
    try {
      await adminSetLottoWinningNumbers(round.id, main, bonus)
      await onSettled()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="la-picker">
      {error && <div className="alert alert-error">{error}</div>}
      <div className="la-picker-label">당첨 번호 <span className="muted">{main.length}/{round.pick_count}</span></div>
      <div className="lotto-grid la-picker-grid">
        {nums.map((n) => (
          <button key={n} type="button" className={`lotto-num ${main.includes(n) ? 'on' : ''}`}
            disabled={busy || (!main.includes(n) && main.length >= round.pick_count)}
            onClick={() => toggleMain(n)}>{n}</button>
        ))}
      </div>
      <div className="la-picker-label">보너스 번호 <span className="muted">{bonus == null ? 0 : 1}/1</span></div>
      <div className="lotto-grid la-picker-grid">
        {nums.map((n) => (
          <button key={n} type="button" className={`lotto-num la-bonus-num ${bonus === n ? 'on' : ''}`}
            disabled={busy || main.includes(n)}
            onClick={() => toggleBonus(n)}>{n}</button>
        ))}
      </div>
      <button type="button" className="aq-btn-save la-confirm-btn"
        disabled={main.length !== round.pick_count || bonus == null || busy}
        onClick={handleConfirm}>{busy ? '확정 중…' : '당첨 번호 확정'}</button>
    </div>
  )
}

// 선택한 회차의 응모 현황(아이디/응모 번호) + 당첨 번호(발표됨=조회, 미발표=관리자 지정).
function LottoRoundPanel({ round, entries, entriesLoading, onSettled }) {
  const drawn = !!round.winning_numbers
  return (
    <div className="la-round-panel">
      <div className="la-entries-head">
        <span>응모 현황</span>
        <span className="aq-count">{round.entry_count}</span>
      </div>
      {entriesLoading ? <div className="spinner sm" /> : entries.length === 0 ? (
        <p className="muted sm">아직 응모가 없어요.</p>
      ) : (
        <div className="la-entries">
          {entries.map((e, i) => (
            <div key={i} className="la-entry-row">
              <span className="la-entry-id">{e.login_id}</span>
              <span className="lotto-ticket-row">
                {e.numbers.map((n) => <span key={n} className="lotto-ticket-num">{n}</span>)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="la-entries-head">
        <span>당첨 번호</span>
      </div>
      {drawn ? (
        <div className="lotto-draw la-draw-readonly">
          <div className="lotto-draw-nums">
            {round.winning_numbers.map((n) => <span key={n} className="lotto-draw-ball">{n}</span>)}
            <span className="lotto-draw-plus">+</span>
            <span className="lotto-draw-ball bonus">{round.bonus_number}</span>
          </div>
          {round.drawn_at && <div className="lotto-draw-date">{formatDate(round.drawn_at)} 추첨</div>}
        </div>
      ) : (
        <>
          <p className="muted sm">아직 추첨 전이에요. 별도 지정이 없으면 토요일 18시에 자동으로 추첨돼요.</p>
          <AdminDrawPicker round={round} onSettled={onSettled} />
        </>
      )}
    </div>
  )
}

function emptyTier() { return { match: '', bonus: false, reward: '' } }

// 당첨 룰 설정 — 번호 범위/추첨 개수/등수별 지급 츄르. 저장해도 지금 진행 중인 회차에는
// 영향 없고, 새로 열리는 다음 회차부터 적용된다(서버가 회차 생성 시점에 스냅샷).
function LottoRuleForm() {
  const [min, setMin] = useState('1')
  const [max, setMax] = useState('30')
  const [pick, setPick] = useState('6')
  const [tiers, setTiers] = useState([emptyTier()])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const cfg = await getLottoConfig()
      if (cfg) {
        setMin(String(cfg.number_min)); setMax(String(cfg.number_max)); setPick(String(cfg.pick_count))
        const arr = Array.isArray(cfg.prize_tiers) ? cfg.prize_tiers : []
        setTiers(arr.length
          ? arr.map((t) => ({ match: String(t.match ?? ''), bonus: !!t.bonus, reward: String(t.reward ?? '') }))
          : [emptyTier()])
      }
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  function updateTier(i, patch) { setTiers((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t))) }
  function addTier() { setTiers((prev) => [...prev, emptyTier()]) }
  function removeTier(i) { setTiers((prev) => prev.filter((_, idx) => idx !== i)) }

  async function save(e) {
    e.preventDefault(); setError(''); setSaved(false)
    const numberMin = Number(min), numberMax = Number(max), pickCount = Number(pick)
    if (!Number.isInteger(numberMin) || !Number.isInteger(numberMax) || numberMin < 1 || numberMax <= numberMin) {
      setError('번호 범위를 올바르게 입력해 주세요.'); return
    }
    if (!Number.isInteger(pickCount) || pickCount < 1 || pickCount > numberMax - numberMin) {
      setError('추첨 개수를 올바르게 입력해 주세요.'); return
    }
    const cleanTiers = []
    for (const t of tiers) {
      if (t.match === '' && t.reward === '') continue
      const match = Number(t.match), reward = Number(t.reward)
      if (!Number.isInteger(match) || match < 0 || match > pickCount) { setError('일치 개수를 0~추첨 개수 사이로 입력해 주세요.'); return }
      if (!Number.isInteger(reward) || reward < 0) { setError('지급 츄르를 0 이상으로 입력해 주세요.'); return }
      cleanTiers.push({ match, bonus: !!t.bonus, reward })
    }
    // rank = 화면에 나열한 순서(위 등수가 먼저 판정됨) 그대로.
    const withRank = cleanTiers.map((t, i) => ({ rank: i + 1, ...t }))
    setBusy(true)
    try {
      await adminUpdateLottoConfig({ numberMin, numberMax, pickCount, prizeTiers: withRank })
      setSaved(true)
    } catch (e2) { setError(e2.message) } finally { setBusy(false) }
  }

  if (loading) return <div className="spinner" />

  return (
    <form className="aq-form" onSubmit={save}>
      <p className="muted sm la-rule-note">지금 진행 중인 회차가 아니라, 새로 열리는 다음 회차부터 적용돼요.</p>
      <div className="aq-frow">
        <label className="aq-flabel">번호 범위</label>
        <div className="la-range-row">
          <input type="number" inputMode="numeric" value={min} onChange={(e) => { setMin(e.target.value); setSaved(false) }} />
          <span className="muted">~</span>
          <input type="number" inputMode="numeric" value={max} onChange={(e) => { setMax(e.target.value); setSaved(false) }} />
        </div>
      </div>
      <div className="aq-frow">
        <label className="aq-flabel" htmlFor="lc-pick">추첨 개수(보너스 제외)</label>
        <input id="lc-pick" type="number" inputMode="numeric" value={pick} onChange={(e) => { setPick(e.target.value); setSaved(false) }} />
      </div>
      <div className="aq-frow">
        <label className="aq-flabel">등수별 지급 츄르</label>
        <div className="la-tiers">
          {tiers.map((t, i) => (
            <div key={i} className="la-tier-row">
              <span className="la-tier-rank">{i + 1}등</span>
              <input type="number" inputMode="numeric" min="0" placeholder="일치 개수"
                value={t.match} onChange={(e) => { updateTier(i, { match: e.target.value }); setSaved(false) }} />
              <label className="la-tier-bonus">
                <input type="checkbox" checked={t.bonus} onChange={(e) => { updateTier(i, { bonus: e.target.checked }); setSaved(false) }} />보너스
              </label>
              <input type="number" inputMode="numeric" min="0" placeholder="츄르"
                value={t.reward} onChange={(e) => { updateTier(i, { reward: e.target.value }); setSaved(false) }} />
              <button type="button" className="la-tier-del" onClick={() => { removeTier(i); setSaved(false) }} aria-label="등수 삭제">✕</button>
            </div>
          ))}
          <button type="button" className="la-tier-add" onClick={() => { addTier(); setSaved(false) }}>+ 등수 추가</button>
        </div>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {saved && <div className="alert alert-success">저장했어요.</div>}
      <div className="aq-actions">
        <div className="aq-actions-right">
          <button type="submit" className="aq-btn-save" disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
        </div>
      </div>
    </form>
  )
}

// 로또 당첨 관리 — 회차별 응모 확인 + 미추첨 회차 당첨 번호 수동 지정 + 당첨 룰 설정.
export default function AdminLotto() {
  const [rounds, setRounds] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [entries, setEntries] = useState([])
  const [entriesLoading, setEntriesLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const rows = await adminListLottoRounds()
      setRounds(rows)
      setSelectedId((prev) => (prev != null && rows.some((r) => r.id === prev)) ? prev : (rows[0]?.id ?? null))
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const selectedRound = rounds.find((r) => r.id === selectedId) || null

  useEffect(() => {
    if (selectedId == null) { setEntries([]); return }
    let on = true
    setEntriesLoading(true)
    adminListLottoEntries(selectedId).then((rows) => { if (on) setEntries(rows) })
      .catch((e) => { if (on) setError(e.message) })
      .finally(() => { if (on) setEntriesLoading(false) })
    return () => { on = false }
  }, [selectedId])

  return (
    <div className="page admin-page aq-page la-page">
      {error && <div className="alert alert-error">{error}</div>}

      <section>
        <div className="aq-section-head">
          <span className="aq-section-title">회차별 응모 현황</span>
        </div>
        {loading ? <div className="spinner" /> : rounds.length === 0 ? (
          <p className="muted sm">아직 생성된 회차가 없어요. 누군가 로또를 처음 응모하면 회차가 열려요.</p>
        ) : (
          <>
            <select className="la-round-select" value={selectedId ?? ''} onChange={(e) => setSelectedId(Number(e.target.value))}>
              {rounds.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.round_no}회 · 응모 {r.entry_count}건 · {r.winning_numbers ? '추첨 완료' : '미추첨'}
                </option>
              ))}
            </select>
            {selectedRound && (
              <LottoRoundPanel round={selectedRound} entries={entries} entriesLoading={entriesLoading} onSettled={load} />
            )}
          </>
        )}
      </section>

      <section>
        <div className="aq-section-head">
          <span className="aq-section-title">당첨 룰 설정</span>
        </div>
        <LottoRuleForm />
      </section>
    </div>
  )
}
