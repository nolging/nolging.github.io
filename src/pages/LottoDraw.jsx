import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getLottoDrawByRound, listMyLottoEntries, claimLottoPrize } from '../lib/api'
import Modal from '../components/Modal'

const num = (n) => (n ?? 0).toLocaleString('ko-KR')

function formatDrawDate(iso) {
  try { return new Date(iso).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) } catch { return '' }
}

// 응모 한 장의 우측 알약 — 당첨(수령 전)이면 클릭 가능한 진한 알약("N등"), 이미
// 수령했으면 회색 "수령완료", 등수는 있는데 지급액이 0이면 회색 "N등", 낙첨이면
// 회색 "낙첨"(클릭 불가).
function LottoRankPill({ entry, busy, onClaim }) {
  if (entry.rank == null) return <span className="lotto-rank-pill muted">낙첨</span>
  if (!entry.reward) return <span className="lotto-rank-pill muted">{entry.rank}등</span>
  if (entry.claimed_at) return <span className="lotto-rank-pill muted">수령완료</span>
  return (
    <button type="button" className="lotto-rank-pill claim" disabled={busy} onClick={onClaim}>
      {busy ? '수령 중…' : `${entry.rank}등`}
    </button>
  )
}

// 로또 당첨 번호 추첨 페이지 — "로또 당첨 번호 추첨이 완료됐어요!" 알림 클릭 시 이동.
// 당첨 번호 + 내가 이번 회차에 낸 응모 번호(일치 번호 하이라이트) + 등수별 수령 버튼을 보여준다.
export default function LottoDraw() {
  const { roundId } = useParams()
  const [draw, setDraw] = useState(null)
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [claimingId, setClaimingId] = useState(null)
  const [claimedReward, setClaimedReward] = useState(null)

  useEffect(() => {
    setLoading(true); setError('')
    getLottoDrawByRound(roundId).then(setDraw).catch((e) => setError(e.message)).finally(() => setLoading(false))
  }, [roundId])

  useEffect(() => {
    if (!draw?.winning_numbers) { setEntries([]); return }
    listMyLottoEntries(draw.round_no).then(setEntries).catch((e) => setError(e.message))
  }, [draw])

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
      {loading ? <div className="spinner" /> : !draw ? (
        <p className="lotto-draw-empty">회차를 찾을 수 없어요.</p>
      ) : !draw.winning_numbers ? (
        <p className="lotto-draw-empty">아직 추첨 전이에요.</p>
      ) : (
        <>
          <div className="lotto-draw">
            <div className="lotto-draw-round">{draw.round_no}회</div>
            <div className="lotto-draw-nums">
              {draw.winning_numbers.map((n) => <span key={n} className="lotto-draw-ball">{n}</span>)}
              <span className="lotto-draw-plus">+</span>
              <span className="lotto-draw-ball bonus">{draw.bonus_number}</span>
            </div>
            {draw.drawn_at && <div className="lotto-draw-date">{formatDrawDate(draw.drawn_at)} 추첨</div>}
          </div>

          {entries.length > 0 && (
            <div className="lotto-my-entries">
              <div className="lotto-my-entries-head">내 응모 번호</div>
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
                    <LottoRankPill entry={e} busy={claimingId === e.id} onClaim={() => handleClaim(e)} />
                  </div>
                ))}
              </div>
            </div>
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
