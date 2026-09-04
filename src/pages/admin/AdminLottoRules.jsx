import { useEffect, useState, useCallback } from 'react'
import { adminUpdateLottoConfig, getLottoConfig } from '../../lib/api'

function emptyTier() { return { match: '', bonus: false, reward: '' } }

// 당첨 룰 설정 — 번호 범위/추첨 개수/등수별 당첨 조건. 저장해도 지금 진행 중인 회차에는
// 영향 없고, 새로 열리는 다음 회차부터 적용된다(서버가 회차 생성 시점에 스냅샷).
export default function AdminLottoRules() {
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

  if (loading) return <div className="page admin-page aq-page"><div className="spinner" /></div>

  return (
    <div className="page admin-page aq-page">
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
          <label className="aq-flabel" htmlFor="lc-pick">추첨 개수<span className="la-flabel-sub">(보너스 제외)</span></label>
          <input id="lc-pick" type="number" inputMode="numeric" value={pick} onChange={(e) => { setPick(e.target.value); setSaved(false) }} />
        </div>
        <div className="aq-frow">
          <label className="aq-flabel">당첨 조건</label>
          <div className="la-tiers">
            {tiers.map((t, i) => (
              <div key={i} className="la-tier-row">
                <span className="la-tier-rank">{i + 1}등</span>
                <span className="la-suffix-wrap">
                  <input type="number" inputMode="numeric" min="0"
                    value={t.match} onChange={(e) => { updateTier(i, { match: e.target.value }); setSaved(false) }} />
                  <span className="la-suffix-text">개 일치</span>
                </span>
                <label className="la-tier-bonus">
                  <input type="checkbox" checked={t.bonus} onChange={(e) => { updateTier(i, { bonus: e.target.checked }); setSaved(false) }} />보너스
                </label>
                <span className="la-suffix-wrap">
                  <input type="number" inputMode="numeric" min="0"
                    value={t.reward} onChange={(e) => { updateTier(i, { reward: e.target.value }); setSaved(false) }} />
                  <span className="la-suffix-text">츄르</span>
                </span>
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
    </div>
  )
}
