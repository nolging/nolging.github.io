import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  getGroup, getTask, listMemberCards, listTaskParticipants, scheduleTask, rescheduleTask, cancelAppointment,
} from '../lib/api'
import { REPEAT_OPTIONS, REMIND_OPTIONS, CUSTOM_FREQ, WEEKDAYS, CATEGORY_COLORS, categoryEmoji, MEDIA_LOOKUP_CATS } from '../lib/constants'
import Avatar from '../components/Avatar'
import MediaCard from '../components/MediaCard'
import CgToggle from '../components/CgToggle'

const pad = (n) => String(n).padStart(2, '0')
const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const timeStr = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
function defaultDate() { return dateStr(new Date()) }
function defaultTime() { const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0); return timeStr(d) }

const WD = ['일', '월', '화', '수', '목', '금', '토']
function fmtDate(s) {
  if (!s) return ''
  const [y, m, d] = s.split('-').map(Number)
  const wd = new Date(y, m - 1, d).getDay()
  return `${y}년 ${m}월 ${d}일 (${WD[wd]})`
}
function fmtTime(s) {
  if (!s) return ''
  const [h, mi] = s.split(':').map(Number)
  const ap = h < 12 ? '오전' : '오후'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${ap} ${h12}:${pad(mi)}`
}

function Chevron() {
  return <svg width="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
}

// 포맷된 값(보라 텍스트) 위에 투명 네이티브 입력을 겹쳐, 탭하면 피커가 열리게
function PickField({ type, value, onChange, format }) {
  return (
    <label className="sc-pick">
      <span className="sc-pick-text">{format(value)}<Chevron /></span>
      <input type={type} className="sc-pick-input" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} />
    </label>
  )
}

function SelectPill({ value, onChange, options }) {
  return (
    <span className="sc-select">
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <Chevron />
    </span>
  )
}

export default function ScheduleAppointment() {
  const { groupId, taskId } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [group, setGroup] = useState(null)
  const [task, setTask] = useState(null)
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const [dateOn, setDateOn] = useState(true)
  const [timeOn, setTimeOn] = useState(true)
  const [date, setDate] = useState(defaultDate())
  const [time, setTime] = useState(defaultTime())
  const [repeat, setRepeat] = useState('none')
  const [cFreq, setCFreq] = useState('weekly')
  const [cInterval, setCInterval] = useState(1)
  const [cWeekdays, setCWeekdays] = useState(() => new Set())
  const [untilOn, setUntilOn] = useState(false)
  const [until, setUntil] = useState(defaultDate())
  const [remind, setRemind] = useState('')
  const [participants, setParticipants] = useState(() => new Set())

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [g, t, m] = await Promise.all([getGroup(groupId), getTask(taskId), listMemberCards(groupId)])
      setGroup(g); setTask(t); setMembers(m)

      if (t.scheduled_at) {
        const d = new Date(t.scheduled_at)
        setDateOn(true); setDate(dateStr(d))
        setTimeOn(t.scheduled_time_set !== false); setTime(timeStr(d))
      } else if (t.status === 'accepted') {
        setDateOn(false)
      }
      if (t.repeat_rule) {
        if (t.repeat_rule[0] === '{') {
          try {
            const c = JSON.parse(t.repeat_rule)
            setRepeat('custom'); setCFreq(c.freq || 'weekly'); setCInterval(c.interval || 1)
            setCWeekdays(new Set(c.weekdays || []))
          } catch { setRepeat('none') }
        } else setRepeat(t.repeat_rule)
      }
      if (t.repeat_until) { setUntilOn(true); setUntil(t.repeat_until) }
      if (t.remind_min !== null && t.remind_min !== undefined) setRemind(String(t.remind_min))

      const existing = t.status !== 'open' ? await listTaskParticipants(taskId) : []
      setParticipants(new Set([t.created_by, profile.id, ...existing].filter(Boolean)))
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [groupId, taskId, profile.id])
  useEffect(() => { load() }, [load])

  const isReschedule = task && task.status !== 'open'
  const mandatory = useMemo(() => new Set([task?.created_by, profile.id].filter(Boolean)), [task, profile.id])
  const needChoose = members.length >= 3

  function toggleMember(uid) {
    if (mandatory.has(uid)) return
    setParticipants((p) => { const n = new Set(p); n.has(uid) ? n.delete(uid) : n.add(uid); return n })
  }
  function toggleWeekday(i) {
    setCWeekdays((p) => { const n = new Set(p); n.has(i) ? n.delete(i) : n.add(i); return n })
  }

  function buildRepeat() {
    if (!dateOn || repeat === 'none') return null
    if (repeat !== 'custom') return repeat
    const obj = { type: 'custom', freq: cFreq, interval: Math.max(1, Number(cInterval) || 1) }
    if (cFreq === 'weekly') obj.weekdays = [...cWeekdays].sort((a, b) => a - b)
    return JSON.stringify(obj)
  }

  async function submit(e) {
    e.preventDefault()
    if (saving) return
    setSaving(true); setError('')
    try {
      let scheduledAt = null, timeSet = false
      if (dateOn) {
        if (!date) { setError('날짜를 설정해 주세요.'); setSaving(false); return }
        scheduledAt = new Date(`${date}T${timeOn ? time : '00:00'}`).toISOString()
        timeSet = timeOn
      }
      const rule = buildRepeat()
      const ids = needChoose ? [...participants] : members.map((m) => m.user_id)
      const payload = {
        taskId, scheduledAt, timeSet, repeat: rule,
        repeatUntil: (dateOn && rule && untilOn) ? until : null,
        remind: dateOn ? remind : '',
        participantIds: ids,
      }
      if (isReschedule) await rescheduleTask(payload)
      else await scheduleTask(payload)
      navigate(`/groups/${groupId}/tasks/${taskId}`, { state: { groupType: group.group_type } })
    } catch (err) { setError(err.message); setSaving(false) }
  }

  async function removeAppt() {
    if (!confirm('이 약속을 삭제할까요? 위시는 유지돼요.')) return
    setError('')
    try { await cancelAppointment(taskId); navigate(`/groups/${groupId}/tasks/${taskId}`) }
    catch (err) { setError(err.message) }
  }

  if (loading) return <div className="page"><div className="spinner" /></div>
  if (error && !task) return <div className="page"><div className="alert alert-error">{error}</div></div>
  if (!task) return null

  const cat = task.category
  const col = CATEGORY_COLORS[cat] || CATEGORY_COLORS['기타']
  const showMedia = MEDIA_LOOKUP_CATS.includes(cat) && task.media_info

  return (
    <div className="page cg-page">
      <form onSubmit={submit} className="cg-form">
        {/* 위시 요약 */}
        <div className="sc-wish">
          {cat && (
            <span className="sc-wish-chip" style={{ background: col.bg, color: col.fg }}>
              <span aria-hidden="true">{categoryEmoji(cat)}</span>{cat}
            </span>
          )}
          <span className="sc-wish-title">{task.title}</span>
        </div>
        {showMedia && <div className="cg-mt-12"><MediaCard category={cat} info={task.media_info} /></div>}

        {/* 일정 */}
        <div className="cg-section-title cg-mt-24">일정</div>
        <div className="cg-list cg-mt-12">
          <div className="cg-row">
            <span className="cg-row-icon" style={{ background: '#e6eefd' }}>📅</span>
            <div className="cg-row-main">
              <div className="cg-row-title">날짜</div>
              {dateOn && <PickField type="date" value={date} onChange={setDate} format={fmtDate} />}
            </div>
            <CgToggle on={dateOn} onClick={() => setDateOn((v) => !v)} />
          </div>

          {dateOn && (
            <div className="cg-row">
              <span className="cg-row-icon" style={{ background: '#eeebfe' }}>🕗</span>
              <div className="cg-row-main">
                <div className="cg-row-title">시간</div>
                {timeOn && <PickField type="time" value={time} onChange={setTime} format={fmtTime} />}
              </div>
              <CgToggle on={timeOn} onClick={() => setTimeOn((v) => !v)} />
            </div>
          )}

          {dateOn && (
            <div className="cg-row">
              <span className="cg-row-icon" style={{ background: '#e8f4ec' }}>🔁</span>
              <div className="cg-row-main"><div className="cg-row-title">반복</div></div>
              <SelectPill value={repeat} onChange={setRepeat} options={REPEAT_OPTIONS} />
            </div>
          )}

          {dateOn && repeat === 'custom' && (
            <div className="sc-custom">
              <div className="sc-custom-freq">
                <input type="number" min="1" className="sc-num" value={cInterval} onChange={(e) => setCInterval(e.target.value)} />
                <SelectPill value={cFreq} onChange={setCFreq} options={CUSTOM_FREQ} />
              </div>
              {cFreq === 'weekly' && (
                <div className="weekday-row">
                  {WEEKDAYS.map((w, i) => (
                    <button type="button" key={i} className={`weekday ${cWeekdays.has(i) ? 'on' : ''}`}
                      onClick={() => toggleWeekday(i)}>{w}</button>
                  ))}
                </div>
              )}
            </div>
          )}

          {dateOn && repeat !== 'none' && (
            <div className="cg-row">
              <span className="cg-row-icon" style={{ background: '#fde8ee' }}>🗓️</span>
              <div className="cg-row-main">
                <div className="cg-row-title">반복 종료</div>
                {untilOn && <PickField type="date" value={until} onChange={setUntil} format={fmtDate} />}
              </div>
              <CgToggle on={untilOn} onClick={() => setUntilOn((v) => !v)} />
            </div>
          )}

          {dateOn && (
            <div className="cg-row">
              <span className="cg-row-icon" style={{ background: '#fdeee6' }}>🔔</span>
              <div className="cg-row-main"><div className="cg-row-title">알림</div></div>
              <SelectPill value={remind} onChange={setRemind} options={REMIND_OPTIONS} />
            </div>
          )}
        </div>

        {needChoose && (
          <>
            <div className="cg-section-title cg-mt-24">참여 멤버</div>
            <ul className="member-pick cg-mt-12">
              {members.map((m) => {
                const checked = participants.has(m.user_id)
                const fixed = mandatory.has(m.user_id)
                return (
                  <li key={m.user_id} className={`member-pick-item ${fixed ? 'fixed' : ''}`} onClick={() => toggleMember(m.user_id)}>
                    <Avatar src={m.avatar_url} name={m.display_nickname} size={32} />
                    <span className="member-pick-name">
                      {m.display_nickname}{fixed && <span className="muted sm"> · 필수</span>}
                    </span>
                    <span className={`pick-check ${checked ? 'on' : ''}`} aria-hidden="true">✓</span>
                  </li>
                )
              })}
            </ul>
          </>
        )}

        {error && <div className="alert alert-error cg-mt-16">{error}</div>}
        <div className="cg-footer">
          <button type="submit" className="cg-btn-primary" disabled={saving}>
            {saving ? '저장 중…' : isReschedule ? '저장' : (
              <><svg width="17" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><circle cx="7" cy="7" r="2.4" /><circle cx="12" cy="5.4" r="2.4" /><circle cx="17" cy="7" r="2.4" /><path d="M12 10c3.4 0 6 2.4 6 5.2 0 2-1.7 3.3-3.4 2.7-1-.4-1.7-.6-2.6-.6s-1.6.2-2.6.6C7.7 18.5 6 17.2 6 15.2 6 12.4 8.6 10 12 10Z" /></svg> 놀기 신청</>
            )}
          </button>
          {isReschedule && (
            <div className="cg-footer-center">
              <button type="button" className="cg-danger-link" onClick={removeAppt}>약속 삭제하기</button>
            </div>
          )}
        </div>
      </form>
    </div>
  )
}
