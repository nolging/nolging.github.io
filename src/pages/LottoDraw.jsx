import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getLottoDrawByRound } from '../lib/api'

function formatDrawDate(iso) {
  try { return new Date(iso).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) } catch { return '' }
}

// 로또 당첨 번호 추첨 페이지 — "로또 당첨 번호 추첨이 완료됐어요!" 알림 클릭 시 이동.
// 지금은 당첨 번호만 보여준다(당첨 확인/수령 UI는 시안 받으면 추가).
export default function LottoDraw() {
  const { roundId } = useParams()
  const [draw, setDraw] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true); setError('')
    getLottoDrawByRound(roundId).then(setDraw).catch((e) => setError(e.message)).finally(() => setLoading(false))
  }, [roundId])

  return (
    <div className="page lotto-draw-page">
      {error && <div className="alert alert-error">{error}</div>}
      {loading ? <div className="spinner" /> : !draw ? (
        <p className="lotto-draw-empty">회차를 찾을 수 없어요.</p>
      ) : !draw.winning_numbers ? (
        <p className="lotto-draw-empty">아직 추첨 전이에요.</p>
      ) : (
        <div className="lotto-draw">
          <div className="lotto-draw-round">{draw.round_no}회</div>
          <div className="lotto-draw-nums">
            {draw.winning_numbers.map((n) => <span key={n} className="lotto-draw-ball">{n}</span>)}
            <span className="lotto-draw-plus">+</span>
            <span className="lotto-draw-ball bonus">{draw.bonus_number}</span>
          </div>
          {draw.drawn_at && <div className="lotto-draw-date">{formatDrawDate(draw.drawn_at)} 추첨</div>}
        </div>
      )}
    </div>
  )
}
