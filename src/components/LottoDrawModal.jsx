import { useEffect, useState } from 'react'
import Modal from './Modal'
import { getLatestLottoDraw } from '../lib/api'

function formatDrawDate(iso) {
  try { return new Date(iso).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) } catch { return '' }
}

// 로또: 가장 최근 발표된 당첨 번호(전체 공용, 매주 토요일 18시 자동 추첨). 상점의 로또
// 아이템 모달 좌상단 "당첨 확인" 버튼에서 연다.
export default function LottoDrawModal({ open, onClose }) {
  const [draw, setDraw] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setLoading(true); setError('')
    getLatestLottoDraw().then(setDraw).catch((e) => setError(e.message)).finally(() => setLoading(false))
  }, [open])

  return (
    <Modal open={open} onClose={onClose} title="당첨 번호">
      {error && <div className="alert alert-error">{error}</div>}
      {loading ? <div className="spinner" /> : !draw ? (
        <p className="lotto-draw-empty">아직 추첨된 회차가 없어요.<br />매주 토요일 18시에 추첨해요.</p>
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
    </Modal>
  )
}
