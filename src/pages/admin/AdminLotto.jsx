import { useEffect, useState, useCallback, useMemo } from 'react'
import { adminListLottoRounds, adminListLottoEntries, adminPresetLottoWinningNumbers } from '../../lib/api'
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

// 회차 선택 셀렉트 하단의 당첨 번호 표시 영역 — 공개됐으면 확정 번호, 미리 지정만 해뒀으면
// 그 번호(공개 예정일과 함께), 아무것도 없으면 "추첨 예정" 문구만 가운데 정렬로 보여준다.
function LottoDrawBox({ round, onOpenPicker }) {
  const drawn = !!round.winning_numbers
  const hasPreset = !drawn && round.preset_numbers?.length > 0
  const nums = drawn ? round.winning_numbers : (hasPreset ? round.preset_numbers : null)
  const bonus = drawn ? round.bonus_number : (hasPreset ? round.preset_bonus : null)

  return (
    <div className="la-draw-box">
      {hasPreset && (
        <button type="button" className="la-draw-edit-btn" aria-label="당첨 번호 수정" title="당첨 번호 수정"
          onClick={onOpenPicker}><EditIcon /></button>
      )}
      {nums ? (
        <div className="lotto-draw">
          <div className="lotto-draw-nums">
            {nums.map((n) => <span key={n} className="lotto-draw-ball">{n}</span>)}
            {bonus != null && <span className="lotto-draw-plus">+</span>}
            {bonus != null && <span className="lotto-draw-ball bonus">{bonus}</span>}
          </div>
          <div className="lotto-draw-date">{drawn ? `${formatDate(round.drawn_at)} 추첨` : `${nextDrawLabel()} 공개 예정`}</div>
        </div>
      ) : (
        <p className="la-draw-pending">{nextDrawLabel()} 추첨 예정</p>
      )}
      {!drawn && !hasPreset && (
        <button type="button" className="la-preset-open-btn" onClick={onOpenPicker}>당첨 번호 지정 &gt;</button>
      )}
    </div>
  )
}

// 선택한 회차의 응모 현황(아이디/응모 번호).
function LottoEntriesPanel({ entryCount, entries, entriesLoading }) {
  return (
    <div className="la-round-panel">
      <div className="la-entries-head">
        <span>응모 현황</span>
        <span className="aq-count">{entryCount}</span>
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
    </div>
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
                <LottoDrawBox round={selectedRound} onOpenPicker={() => setPickerOpen(true)} />
                <LottoEntriesPanel entryCount={selectedRound.entry_count} entries={entries} entriesLoading={entriesLoading} />
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
