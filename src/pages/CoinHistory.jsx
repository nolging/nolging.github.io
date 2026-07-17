import { useEffect, useState } from 'react'
import { getMyCoinHistory, getMyCoinBalance } from '../lib/api'
import { resolveItemText } from '../lib/storeMeta'

const fmtDate = (iso) => {
  try {
    return new Date(iso).toLocaleString('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch { return '' }
}

export default function CoinHistory() {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [balance, setBalance] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const [h, b] = await Promise.all([getMyCoinHistory(), getMyCoinBalance()])
        if (!mounted) return
        setRows(h); setBalance(b)
      } catch (err) {
        if (mounted) setError(err.message)
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  return (
    <div className="page">
      {loading ? (
        <div className="spinner" />
      ) : (
        <>
        {error && <div className="alert alert-error">{error}</div>}

        <div className="coin-card">
          <span className="coin-label">보유 츄르</span>
          <span className="coin-amount">🐾 {balance.toLocaleString('ko-KR')}</span>
        </div>

        {rows.length === 0 ? (
          <p className="muted sm coin-empty">아직 적립·사용 내역이 없어요.</p>
        ) : (
          <div className="card coin-hist">
            {rows.map((r) => (
              <div key={r.id} className="coin-hist-row">
                <div className="chr-main">
                  <span className="chr-reason">{resolveItemText(r.reason) || '츄르 변동'}</span>
                  <span className="chr-date">{fmtDate(r.created_at)}</span>
                </div>
                <span className={`chr-delta ${r.delta >= 0 ? 'plus' : 'minus'}`}>
                  {r.delta >= 0 ? '+' : '−'}{Math.abs(r.delta)}
                </span>
              </div>
            ))}
          </div>
        )}
        </>
      )}
    </div>
  )
}
