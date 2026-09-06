import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { listAllLottoRounds, listMyLottoEntries, claimLottoPrize } from '../lib/api'
import Modal from '../components/Modal'

const num = (n) => (n ?? 0).toLocaleString('ko-KR')
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

function formatDrawDate(iso) {
  try { return new Date(iso).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) } catch { return '' }
}
function formatYmd(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
// 다음 정기 추첨 시각(매주 토요일 18:00) — 아직 추첨 안 된 회차의 기간 표기용.
function nextDrawDate() {
  const d = new Date()
  let daysUntilSat = (6 - d.getDay() + 7) % 7
  if (daysUntilSat === 0 && d.getHours() >= 18) daysUntilSat = 7
  d.setDate(d.getDate() + daysUntilSat)
  d.setHours(18, 0, 0, 0)
  return d
}
// 셀렉트박스에 쓰는 회차 표기 — 관리자 페이지와 마찬가지로 회차 번호 대신 응모 기간
// (직전 추첨~이번 추첨, 매주 토요일 간격이라 항상 7일)으로 표기. "2026-08-29~2026-09-05".
function roundPeriodLabel(round) {
  const end = round.drawn_at ? new Date(round.drawn_at) : nextDrawDate()
  const start = new Date(end)
  start.setDate(start.getDate() - 7)
  return `${formatYmd(start)}~${formatYmd(end)}`
}

// 당첨금 수령 기한 — 추첨(공개) 시각으로부터 정확히 7일. "1일 18:00 공개"면
// "8일 17:59:59"까지만 수령 가능(8일 18:00 부터 만료).
function isClaimExpired(drawnAt) {
  if (!drawnAt) return false
  return Date.now() >= new Date(drawnAt).getTime() + WEEK_MS
}

// 응모 한 장의 우측 알약 — 당첨(수령 전, 기한 내)이면 클릭 가능한 진한 알약("N 등"), 이미
// 수령했으면 회색 "수령 완료", 기한이 지났으면 회색 "기간 만료", 등수는 있는데 지급액이
// 0이면 회색 "N 등", 낙첨이면 회색 "낙첨"(클릭 불가).
function LottoRankPill({ entry, expired, busy, onClaim }) {
  if (entry.rank == null) return <span className="lotto-rank-pill muted">낙첨</span>
  if (!entry.reward) return <span className="lotto-rank-pill muted">{entry.rank} 등</span>
  if (entry.claimed_at) return <span className="lotto-rank-pill muted">수령 완료</span>
  if (expired) return <span className="lotto-rank-pill muted">기간 만료</span>
  return (
    <button type="button" className="lotto-rank-pill claim" disabled={busy} onClick={onClaim}>
      {busy ? '수령 중…' : `${entry.rank} 등`}
    </button>
  )
}

// 로또 당첨 번호 추첨 페이지 — "로또 당첨 번호 추첨이 완료됐어요!" 알림 클릭 시 이동.
// 셀렉트박스로 다른 회차(응모하지 않은 회차 포함)의 당첨 번호도 조회할 수 있다.
// 선택한 회차의 당첨 번호 + 내 응모 번호(일치 번호 하이라이트) + 등수별 수령 버튼을 보여준다.
export default function LottoDraw() {
  const { roundId } = useParams()
  const [rounds, setRounds] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [entriesLoading, setEntriesLoading] = useState(false)
  const [error, setError] = useState('')
  const [claimingId, setClaimingId] = useState(null)
  const [claimedReward, setClaimedReward] = useState(null)

  useEffect(() => {
    setLoading(true); setError('')
    listAllLottoRounds().then((rows) => {
      setRounds(rows)
      const initial = rows.find((r) => String(r.id) === String(roundId))
      setSelectedId((initial ?? rows[0])?.id ?? null)
    }).catch((e) => setError(e.message)).finally(() => setLoading(false))
  }, [roundId])

  const draw = rounds.find((r) => r.id === selectedId) || null

  useEffect(() => {
    if (!draw?.winning_numbers) { setEntries([]); return }
    let on = true
    setEntriesLoading(true)
    listMyLottoEntries(draw.round_no).then((rows) => { if (on) setEntries(rows) })
      .catch((e) => { if (on) setError(e.message) })
      .finally(() => { if (on) setEntriesLoading(false) })
    return () => { on = false }
  }, [draw?.id])

  async function handleClaim(entry) {
    if (claimingId) return
    setClaimingId(entry.id); setError('')
    try {
      const reward = await claimLottoPrize(entry.id)
      setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, claimed_at: new Date().toISOString() } : e)))
      setClaimedReward(reward)
    } catch (e) { setError(e.message) } finally { setClaimingId(null) }
  }

  return (
    <div className="page lotto-draw-page">
      {error && <div className="alert alert-error">{error}</div>}
      {loading ? <div className="spinner" /> : rounds.length === 0 ? (
        <p className="lotto-draw-empty">회차를 찾을 수 없어요.</p>
      ) : (
        <>
          <select className="la-round-select" value={selectedId ?? ''} onChange={(e) => setSelectedId(Number(e.target.value))}>
            {rounds.map((r) => (
              <option key={r.id} value={r.id}>{roundPeriodLabel(r)}</option>
            ))}
          </select>

          {!draw?.winning_numbers ? (
            <p className="lotto-draw-empty">아직 추첨 전이에요.</p>
          ) : (
            <>
              <div className="lotto-draw">
                <div className="lotto-draw-nums">
                  {draw.winning_numbers.map((n) => <span key={n} className="lotto-draw-ball">{n}</span>)}
                  <span className="lotto-draw-plus">+</span>
                  <span className="lotto-draw-ball bonus">{draw.bonus_number}</span>
                </div>
                {draw.drawn_at && <div className="lotto-draw-date">{formatDrawDate(draw.drawn_at)} 추첨</div>}
              </div>

              <div className="lotto-my-entries">
                <div className="lotto-my-entries-head">내 응모 번호</div>
                {entriesLoading ? <div className="spinner sm" /> : entries.length === 0 ? (
                  <p className="lotto-draw-empty">해당 회차에는 응모하지 않았어요.</p>
                ) : (
                  <div className="lotto-my-entries-list">
                    {entries.map((e) => (
                      <div key={e.id} className="lotto-my-entry-row">
                        <span className="lotto-ticket-row">
                          {e.numbers.map((n) => {
                            const isBonusHit = n === draw.bonus_number
                            const isHit = !isBonusHit && draw.winning_numbers.includes(n)
                            return (
                              <span key={n} className={`lotto-ticket-num ${isBonusHit ? 'bonus-hit' : isHit ? 'hit' : ''}`}>{n}</span>
                            )
                          })}
                        </span>
                        <LottoRankPill entry={e} expired={isClaimExpired(draw.drawn_at)} busy={claimingId === e.id} onClaim={() => handleClaim(e)} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      <Modal open={claimedReward != null} onClose={() => setClaimedReward(null)} cardClassName="st-modal">
        <div className="st-done">
          <div className="st-done-ico">🎉</div>
          <div className="st-done-t">수령 완료</div>
          <div className="st-done-s">{num(claimedReward)} 츄르 당첨 축하합니다!</div>
          <button type="button" className="st-btn-buy st-btn-block" onClick={() => setClaimedReward(null)}>확인</button>
        </div>
      </Modal>
    </div>
  )
}
