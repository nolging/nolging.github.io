import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listMyAppointments } from '../lib/api'
import { repeatLabel } from '../lib/constants'

const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const WD = ['일', '월', '화', '수', '목', '금', '토']

export default function SchedulePage() {
  const navigate = useNavigate()
  const [appts, setAppts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const today = useMemo(() => new Date(), [])
  const [view, setView] = useState({ y: today.getFullYear(), m: today.getMonth() })
  const [selected, setSelected] = useState(ymd(today))

  useEffect(() => {
    (async () => {
      setLoading(true); setError('')
      try { setAppts(await listMyAppointments()) }
      catch (err) { setError(err.message) }
      finally { setLoading(false) }
    })()
  }, [])

  // 날짜(YYYY-MM-DD) → 약속 목록
  const byDate = useMemo(() => {
    const map = {}
    appts.forEach((a) => {
      const key = ymd(new Date(a.scheduled_at))
      ;(map[key] = map[key] || []).push(a)
    })
    return map
  }, [appts])

  // 달력 셀 (앞뒤 빈칸 포함, 주 단위로 채움)
  const cells = useMemo(() => {
    const start = new Date(view.y, view.m, 1).getDay()
    const daysIn = new Date(view.y, view.m + 1, 0).getDate()
    const arr = []
    for (let i = 0; i < start; i++) arr.push(null)
    for (let d = 1; d <= daysIn; d++) arr.push(new Date(view.y, view.m, d))
    while (arr.length % 7 !== 0) arr.push(null)
    return arr
  }, [view])

  function move(delta) {
    setView((v) => {
      const total = v.y * 12 + v.m + delta
      return { y: Math.floor(total / 12), m: ((total % 12) + 12) % 12 }
    })
  }

  const dayList = byDate[selected] || []
  const selDate = new Date(`${selected}T00:00:00`)
  const selLabel = `${selDate.getMonth() + 1}월 ${selDate.getDate()}일 (${WD[selDate.getDay()]})`
  const timeOf = (a) => {
    const d = new Date(a.scheduled_at)
    return a.scheduled_time_set === false ? '종일' : `${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  const todayKey = ymd(today)

  return (
    <div className="page">
      <div className="cal">
        <div className="cal-head">
          <button className="btn btn-ghost btn-sm icon-btn" onClick={() => move(-1)} aria-label="이전 달">‹</button>
          <span className="cal-title">{view.y}년 {view.m + 1}월</span>
          <button className="btn btn-ghost btn-sm icon-btn" onClick={() => move(1)} aria-label="다음 달">›</button>
        </div>
        <div className="cal-grid cal-wd">
          {WD.map((w, i) => (
            <div key={w} className={`cal-wdc ${i === 0 ? 'sun' : ''} ${i === 6 ? 'sat' : ''}`}>{w}</div>
          ))}
        </div>
        <div className="cal-grid">
          {cells.map((d, i) => {
            if (!d) return <div key={i} className="cal-cell empty" />
            const key = ymd(d)
            const dow = d.getDay()
            return (
              <button key={i} type="button"
                className={`cal-cell ${key === selected ? 'sel' : ''} ${key === todayKey ? 'today' : ''}`}
                onClick={() => setSelected(key)}>
                <span className={`cal-day ${dow === 0 ? 'sun' : ''} ${dow === 6 ? 'sat' : ''}`}>{d.getDate()}</span>
                {byDate[key] && <span className="cal-dot" />}
              </button>
            )
          })}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="spinner" />
      ) : (
        <div className="cal-list">
          <div className="cal-list-title">{selLabel}</div>
          {dayList.length === 0 ? (
            <p className="muted sm">이 날은 약속이 없어요.</p>
          ) : (
            dayList.map((a) => (
              <button key={a.id} type="button" className="cal-appt"
                onClick={() => navigate(`/groups/${a.group_id}/tasks/${a.id}`)}>
                <span className="cal-appt-time">{timeOf(a)}</span>
                <span className="cal-appt-body">
                  <span className="cal-appt-head">
                    {a.category && <span className="cat-chip">{a.category}</span>}
                    <span className="task-name">{a.title}</span>
                  </span>
                  <span className="cal-appt-meta">
                    <span className="cal-appt-group">{a.groups?.name}</span>
                    {a.repeat_rule && <span className="cal-appt-rep">{repeatLabel(a.repeat_rule)}</span>}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
