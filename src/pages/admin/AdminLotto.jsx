import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  adminListLottoRounds, adminListLottoEntries, adminPresetLottoWinningNumbers, adminClearLottoPreset,
} from '../../lib/api'
import Modal from '../../components/Modal'
import Switch from '../../components/Switch'

function formatDate(iso) {
  try { return new Date(iso).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) } catch { return '' }
}

// 다음 정기 추첨/공개 시각(매주 토요일 18:00) — "YYYY-MM-DD 18:00" 형식.
function nextDrawLabel() {
  const d = new Date()
  let daysUntilSat = (6 - d.getDay() + 7) % 7
  if (daysUntilSat === 0 && d.getHours() >= 18) daysUntilSat = 7
  d.setDate(d.getDate() + daysUntilSat)
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day} 18:00`
}

function EditIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  )
}

// 응모자 한 명의 당첨 등수(숫자) — 관리자가 미리 지정했거나(preset) 실제 추첨이 끝난
// 회차에서만 계산할 수 있고, 둘 다 없으면 null. 당첨 등수를 못 찾으면(낙첨) Infinity —
// 당첨순 정렬 시 맨 뒤로 가도록. 보너스 번호가 아직 안 정해졌으면(preset만 있고 보너스는
// 미지정) 보너스 불일치로 간주해 계산한다(나중에 실제 보너스가 정해지면 결과가 바뀔 수 있음).
function lottoRankValue(entry, round) {
  const winNums = round.winning_numbers ?? round.preset_numbers
  if (!winNums) return null
  const bonusNum = round.winning_numbers ? round.bonus_number : round.preset_bonus
  const match = entry.numbers.filter((n) => winNums.includes(n)).length
  const bonusHit = bonusNum != null && entry.numbers.includes(bonusNum)
  const tiers = Array.isArray(round.prize_tiers) ? round.prize_tiers : []
  const tier = tiers.slice().sort((a, b) => a.rank - b.rank)
    .find((t) => t.match === match && (!t.bonus || bonusHit))
  return tier ? tier.rank : Infinity
}

function lottoRankLabel(entry, round) {
  const v = lottoRankValue(entry, round)
  if (v == null) return '-'
  return v === Infinity ? '낙첨' : `${v}등`
}

// 당첨 번호 지정 모달 내부 — 번호 버튼 하나로 본번호(pick_count개)를 먼저 채우고,
// 보너스 토글이 켜져 있으면 그다음 한 번 더 고른 번호가 보너스가 된다.
function LottoPresetPicker({ round, onSaved }) {
  const [main, setMain] = useState(round.preset_numbers ?? [])
  const [bonus, setBonus] = useState(round.preset_bonus ?? null)
  const [bonusOn, setBonusOn] = useState(round.preset_bonus != null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const nums = useMemo(() => {
    const arr = []
    for (let n = round.number_min; n <= round.number_max; n++) arr.push(n)
    return arr
  }, [round.number_min, round.number_max])

  function toggleBonusOn(on) {
    setBonusOn(on)
    if (!on) setBonus(null)
  }

  function toggleNum(n) {
    if (busy) return
    if (main.includes(n)) { setMain((prev) => prev.filter((x) => x !== n)); return }
    if (bonus === n) { setBonus(null); return }
    if (main.length < round.pick_count) { setMain((prev) => [...prev, n].sort((a, b) => a - b)); return }
    if (bonusOn && bonus == null) { setBonus(n) }
  }

  const canSave = main.length === round.pick_count && (!bonusOn || bonus != null)

  async function handleSave() {
    if (!canSave || busy) return
    setBusy(true); setError('')
    try {
      await adminPresetLottoWinningNumbers(round.id, main, bonusOn ? bonus : null)
      onSaved()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="la-preset-picker">
      {error && <div className="alert alert-error">{error}</div>}
      <div className="la-picker-label">당첨 번호 <span className="muted">{main.length}/{round.pick_count}</span></div>
      <div className="lotto-grid la-picker-grid">
        {nums.map((n) => {
          const isMain = main.includes(n)
          const isBonus = bonus === n
          const full = main.length >= round.pick_count
          const bonusSlotOpen = bonusOn && bonus == null
          const disabled = busy || (!isMain && !isBonus && full && !bonusSlotOpen)
          return (
            <button key={n} type="button"
              className={`lotto-num ${isMain ? 'on' : ''} ${isBonus ? 'la-bonus-num on' : ''}`}
              disabled={disabled} onClick={() => toggleNum(n)}>{n}</button>
          )
        })}
      </div>
      <div className="switch-row la-bonus-switch-row">
        <span>보너스 번호도 선택</span>
        <Switch checked={bonusOn} onChange={toggleBonusOn} disabled={busy} />
      </div>
      <button type="button" className="aq-btn-save la-confirm-btn" disabled={!canSave || busy} onClick={handleSave}>
        {busy ? '저장 중…' : '당첨 번호 저장'}
      </button>
    </div>
  )
}

// 회차 선택 셀렉트 하단의 당첨 번호 표시 영역 — 공개됐으면 확정 번호(날짜는 번호 아래),
// 미리 지정만 해뒀으면 그 번호 + 공개 예정일(날짜는 번호 위, 우측 끝에 수정/삭제 아이콘),
// 아무것도 없으면 "추첨 예정" 문구만 가운데 정렬로 보여준다. 보너스 번호를 아직 안 정했으면
// "?"로 표시한다.
function LottoDrawBox({ round, onOpenPicker, onDeletePreset }) {
  const drawn = !!round.winning_numbers
  const hasPreset = !drawn && round.preset_numbers?.length > 0
  const nums = drawn ? round.winning_numbers : (hasPreset ? round.preset_numbers : null)
  const bonusKnown = drawn ? true : (hasPreset ? round.preset_bonus != null : false)
  const bonus = drawn ? round.bonus_number : round.preset_bonus

  return (
    <div className="la-draw-box">
      {nums ? (
        <div className="lotto-draw">
          {hasPreset && (
            <div className="la-preset-date-row">
              <span className="lotto-draw-date">{nextDrawLabel()} 공개 예정</span>
              <span className="la-preset-icons">
                <button type="button" className="la-icon-btn" aria-label="당첨 번호 수정" title="당첨 번호 수정"
                  onClick={onOpenPicker}><EditIcon /></button>
                <button type="button" className="la-icon-btn danger" aria-label="당첨 번호 삭제" title="당첨 번호 삭제"
                  onClick={onDeletePreset}><TrashIcon /></button>
              </span>
            </div>
          )}
          <div className="lotto-draw-nums">
            {nums.map((n) => <span key={n} className="lotto-draw-ball">{n}</span>)}
            {(drawn || hasPreset) && <span className="lotto-draw-plus">+</span>}
            {(drawn || hasPreset) && (
              <span className={`lotto-draw-ball bonus ${bonusKnown ? '' : 'unknown'}`}>{bonusKnown ? bonus : '?'}</span>
            )}
          </div>
          {drawn && <div className="lotto-draw-date">{formatDate(round.drawn_at)} 추첨</div>}
        </div>
      ) : (
        <p className="la-draw-pending">{nextDrawLabel()} 추첨 예정</p>
      )}
      {!drawn && !hasPreset && (
        <button type="button" className="la-preset-open-btn" onClick={onOpenPicker}>당첨 번호 지정</button>
      )}
    </div>
  )
}

// 선택한 회차의 응모 현황(아이디/응모 번호/당첨 등수). "응모 현황" 배지(응모 건수)는
// 흰색 카드 바깥 제목 줄에 두고, 같은 줄 우측 끝엔 정렬 셀렉트(응모순/당첨순), 카드 안
// 각 행 우측 끝에는 당첨 등수를 보여준다. 당첨 번호가 정해지기 전엔 응모순, 정해진
// 후엔 당첨순이 기본값 — 회차를 바꾸면(또는 그 회차의 결정 여부가 바뀌면) 다시 맞춘다.
function LottoEntriesPanel({ round, entries, entriesLoading }) {
  const determined = !!(round.winning_numbers || round.preset_numbers)
  const [sortMode, setSortMode] = useState(determined ? 'rank' : 'recent')
  useEffect(() => { setSortMode(determined ? 'rank' : 'recent') }, [round.id, determined])

  const sorted = useMemo(() => {
    const withRank = entries.map((e) => ({ ...e, _rank: lottoRankValue(e, round) ?? Infinity }))
    if (sortMode === 'rank') {
      withRank.sort((a, b) => a._rank - b._rank || new Date(b.created_at) - new Date(a.created_at))
    } else {
      withRank.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    }
    return withRank
  }, [entries, sortMode, round])

  return (
    <>
      <div className="aq-section-head la-entries-head">
        <span className="aq-section-title">응모 현황</span>
        <span className="aq-count">{round.entry_count}</span>
        <select className="la-sort-select" value={sortMode} onChange={(e) => setSortMode(e.target.value)}>
          <option value="recent">응모순</option>
          <option value="rank">당첨순</option>
        </select>
      </div>
      <div className="la-round-panel">
        {entriesLoading ? <div className="spinner sm" /> : entries.length === 0 ? (
          <p className="muted sm">아직 응모가 없어요.</p>
        ) : (
          <div className="la-entries">
            {sorted.map((e, i) => (
              <div key={i} className="la-entry-row">
                <div className="la-entry-top">
                  <span className="la-entry-id">{e.login_id}</span>
                  <span className="la-entry-rank">{lottoRankLabel(e, round)}</span>
                </div>
                <span className="lotto-ticket-row">
                  {e.numbers.map((n) => <span key={n} className="lotto-ticket-num">{n}</span>)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

// 로또 당첨 관리 — 회차별 당첨 번호 표시/미리 지정 + 응모 확인. 당첨 룰 설정은 별도 페이지
// (AdminLottoRules, 상단바 우측 톱니바퀴 아이콘)로 분리돼 있다.
export default function AdminLotto() {
  const [rounds, setRounds] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [entries, setEntries] = useState([])
  const [entriesLoading, setEntriesLoading] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

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

  async function handleDeletePreset() {
    if (!selectedRound || !window.confirm('지정한 당첨 번호를 삭제할까요?')) return
    try { await adminClearLottoPreset(selectedRound.id); await load() } catch (e) { setError(e.message) }
  }

  return (
    <div className="page admin-page aq-page la-page">
      {error && <div className="alert alert-error">{error}</div>}

      <section>
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
              <>
                <LottoDrawBox round={selectedRound} onOpenPicker={() => setPickerOpen(true)} onDeletePreset={handleDeletePreset} />
                <LottoEntriesPanel round={selectedRound} entries={entries} entriesLoading={entriesLoading} />
              </>
            )}
          </>
        )}
      </section>

      <Modal open={pickerOpen} onClose={() => setPickerOpen(false)} title="당첨 번호 지정" cardClassName="la-preset-modal">
        {selectedRound && (
          <LottoPresetPicker round={selectedRound} onSaved={() => { setPickerOpen(false); load() }} />
        )}
      </Modal>
    </div>
  )
}
