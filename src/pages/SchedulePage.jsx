import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { listMyAppointments, listGroupMembersBrief } from '../lib/api'
import { repeatLabel, categoryStyle } from '../lib/constants'
import Avatar from '../components/Avatar'

const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const WD = ['일', '월', '화', '수', '목', '금', '토']
const DAY = 86400000
const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const minutesOf = (iso) => { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes() }

// 반복 규칙 파싱 → { freq, interval, weekdays }
function parseRule(rule) {
  if (rule && rule[0] === '{') {
    try {
      const c = JSON.parse(rule)
      return { freq: c.freq, interval: c.interval || 1, weekdays: c.weekdays?.length ? c.weekdays : null }
    } catch { return null }
  }
  switch (rule) {
    case 'hourly':
    case 'daily': return { freq: 'daily', interval: 1 }
    case 'weekday': return { freq: 'weekdaySet', weekdays: [1, 2, 3, 4, 5] }
    case 'weekend': return { freq: 'weekdaySet', weekdays: [0, 6] }
    case 'weekly': return { freq: 'weekly', interval: 1 }
    case 'biweekly': return { freq: 'weekly', interval: 2 }
    case 'monthly': return { freq: 'monthly', interval: 1 }
    case 'quarterly': return { freq: 'monthly', interval: 3 }
    case 'semiannually': return { freq: 'monthly', interval: 6 }
    case 'yearly': return { freq: 'yearly', interval: 1 }
    default: return null
  }
}

// 약속(appt) 이 특정 날짜(date)에 발생하는가? (반복 규칙 전개)
function occursOn(appt, date) {
  const baseDay = midnight(new Date(appt.scheduled_at))
  const target = midnight(date)
  // 추억(done)은 지난 일회성 기록이므로 반복 전개하지 않고 실제 날짜에만 표시
  if (appt.status === 'done') return +target === +baseDay
  if (target < baseDay) return false
  if (appt.repeat_until && ymd(target) > appt.repeat_until) return false

  const rule = appt.repeat_rule
  if (!rule || rule === 'none') return +target === +baseDay
  const p = parseRule(rule)
  if (!p) return +target === +baseDay

  const interval = p.interval || 1
  const days = Math.round((target - baseDay) / DAY)
  switch (p.freq) {
    case 'daily':
      return days % interval === 0
    case 'weekdaySet':
      return p.weekdays.includes(target.getDay())
    case 'weekly': {
      const wds = p.weekdays || [baseDay.getDay()]
      if (!wds.includes(target.getDay())) return false
      const weekStart = new Date(baseDay)
      weekStart.setDate(baseDay.getDate() - baseDay.getDay())
      const wi = Math.floor((target - weekStart) / (7 * DAY))
      return wi >= 0 && wi % interval === 0
    }
    case 'monthly': {
      if (target.getDate() !== baseDay.getDate()) return false
      const md = (target.getFullYear() - baseDay.getFullYear()) * 12 + (target.getMonth() - baseDay.getMonth())
      return md >= 0 && md % interval === 0
    }
    case 'yearly': {
      if (target.getMonth() !== baseDay.getMonth() || target.getDate() !== baseDay.getDate()) return false
      const yd = target.getFullYear() - baseDay.getFullYear()
      return yd >= 0 && yd % interval === 0
    }
    default:
      return false
  }
}

export default function SchedulePage() {
  const navigate = useNavigate()
  const [appts, setAppts] = useState([])
  const [memberMap, setMemberMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const today = useMemo(() => new Date(), [])
  // 선택 날짜를 URL(?date=)에 보존 → 상세로 갔다가 뒤로 오면 그 날짜로 복원
  const [searchParams, setSearchParams] = useSearchParams()
  const paramDate = searchParams.get('date')
  const initDate = /^\d{4}-\d{2}-\d{2}$/.test(paramDate || '') ? paramDate : ymd(today)
  const initD = new Date(`${initDate}T00:00:00`)
  const [view, setView] = useState({ y: initD.getFullYear(), m: initD.getMonth() })
  const [selected, setSelected] = useState(initDate)

  function selectDay(key) {
    setSelected(key)
    setSearchParams({ date: key }, { replace: true })
  }

  useEffect(() => {
    (async () => {
      setLoading(true); setError('')
      try {
        const a = await listMyAppointments()
        setAppts(a)
        setMemberMap(await listGroupMembersBrief(a.map((x) => x.group_id)))
      } catch (err) { setError(err.message) }
      finally { setLoading(false) }
    })()
  }, [])

  // 약속의 참여자 표시정보 (그룹 내 아바타/닉네임)
  const partsOf = (a) => (a.task_participants || [])
    .map((p) => memberMap[`${a.group_id}:${p.user_id}`]).filter(Boolean)

  // 이번 달에 약속이 있는 날짜 집합 (반복 전개 포함)
  const daysWithAppt = useMemo(() => {
    const set = new Set()
    const daysIn = new Date(view.y, view.m + 1, 0).getDate()
    for (let day = 1; day <= daysIn; day++) {
      const d = new Date(view.y, view.m, day)
      if (appts.some((a) => occursOn(a, d))) set.add(ymd(d))
    }
    return set
  }, [appts, view])

  // 달력 셀 (앞뒤 빈칸 포함)
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

  // 선택한 날짜의 약속 (반복 전개, 시간순)
  const dayList = useMemo(() => {
    const d = new Date(`${selected}T00:00:00`)
    return appts.filter((a) => occursOn(a, d)).sort((x, y) => minutesOf(x.scheduled_at) - minutesOf(y.scheduled_at))
  }, [appts, selected])

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
                onClick={() => selectDay(key)}>
                <span className={`cal-day ${dow === 0 ? 'sun' : ''} ${dow === 6 ? 'sat' : ''}`}>{d.getDate()}</span>
                <span className={`cal-dot ${daysWithAppt.has(key) ? 'on' : ''}`} />
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
            dayList.map((a) => {
              const parts = partsOf(a)
              const extra = parts.length - 3
              return (
                <button key={a.id} type="button" className={`cal-appt ${a.status === 'done' ? 'done' : ''}`}
                  onClick={() => navigate(`/groups/${a.group_id}/tasks/${a.id}`, { state: { from: 'schedule' } })}>
                  <span className="cal-appt-time">{timeOf(a)}</span>
                  <span className="cal-appt-body">
                    <span className="cal-appt-head">
                      {a.category && <span className="cat-chip" style={categoryStyle(a.category)}>{a.category}</span>}
                      <span className="task-name">{a.title}</span>
                    </span>
                    {a.repeat_rule && (
                      <span className="cal-appt-meta"><span className="cal-appt-rep">{repeatLabel(a.repeat_rule)}</span></span>
                    )}
                  </span>
                  {parts.length > 0 && (
                    <span className={`cal-appt-avs task-parts ${parts.length > 1 ? 'multi' : ''}`}>
                      {parts.slice(0, 3).map((m, i) => <Avatar key={i} src={m.avatar} name={m.name} size={26} />)}
                      {extra > 0 && <span className="task-parts-more">+{extra}</span>}
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
