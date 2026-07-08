import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  getGroup, getTask, listMemberCards, listTaskParticipants, scheduleTask, rescheduleTask, updateTask,
} from '../lib/api'
import { REPEAT_OPTIONS, REMIND_OPTIONS, CUSTOM_FREQ, WEEKDAYS, WISH_CATEGORIES, categoryStyle, categoryEmoji, MEDIA_LOOKUP_CATS } from '../lib/constants'
import CategoryChip from '../components/CategoryChip'
import Avatar from '../components/Avatar'
import MediaInfo from '../components/MediaInfo'

const pad = (n) => String(n).padStart(2, '0')
const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const timeStr = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
function defaultDate() { return dateStr(new Date()) }
function defaultTime() { const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0); return timeStr(d) }

function Switch({ checked, onChange }) {
  return (
    <label className="switch" onClick={(e) => e.stopPropagation()}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="slider" />
    </label>
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
  const [title, setTitle] = useState('')       // 작성자 태스크 정보 수정용
  const [category, setCategory] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [g, t, m] = await Promise.all([getGroup(groupId), getTask(taskId), listMemberCards(groupId)])
      setGroup(g); setTask(t); setMembers(m)
      setTitle(t.title || ''); setCategory(t.category || '')

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
  const isCreator = task?.created_by === profile.id
  const canEditTask = isReschedule && isCreator   // 작성자는 약속 수정 페이지에서 태스크 정보도 수정
  const isNolging = true
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
    if (canEditTask && !title.trim()) { setError('제목을 입력해 주세요.'); return }
    setSaving(true); setError('')
    try {
      // 작성자면 태스크 정보(제목/카테고리)도 함께 저장
      if (canEditTask) {
        await updateTask(taskId, {
          title: title.trim(),
          description: isNolging ? '' : (task.description ?? ''),
          category: isNolging ? (category || null) : null,
        })
      }
      let scheduledAt = null, timeSet = false
      if (dateOn) {
        if (!date) { setError('날짜를 설정해 주세요.'); setSaving(false); return }
        scheduledAt = new Date(`${date}T${timeOn ? time : '00:00'}`).toISOString()
        timeSet = timeOn
      }
      const rule = buildRepeat()
      // 3명 이상: 선택한 참여자 / 그 외(1~2명): 그룹 전원(2명이면 둘 다 참여)
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

  if (loading) return <div className="page"><div className="spinner" /></div>
  if (error && !task) return <div className="page"><div className="alert alert-error">{error}</div></div>
  if (!task) return null

  return (
    <div className="page">
      {canEditTask ? (
        <div className="sched-taskedit">
          {isNolging && (
            <div className="chip-row">
              {WISH_CATEGORIES.map((c) => (
                <button type="button" key={c} className={`chip ${category === c ? 'active' : ''}`}
                  style={category === c ? categoryStyle(c) : undefined}
                  onClick={() => setCategory(category === c ? '' : c)}>
                  <span className="cat-chip-emoji" aria-hidden="true">{categoryEmoji(c)}</span>{c}</button>
              ))}
            </div>
          )}
          <input className="sched-title-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목" />
        </div>
      ) : (
        <div className="sched-headline">
          <CategoryChip category={task.category} />
          <span className="task-name td-name">{task.title}</span>
        </div>
      )}

      {MEDIA_LOOKUP_CATS.includes(category) && task.media_info && (
        <MediaInfo category={category} info={task.media_info} />
      )}

      <form onSubmit={submit}>
        <div className="sched-rows">
          <div className="sched-row">
            <span className="sched-row-label">날짜</span>
            <span className="sched-spacer" />
            {dateOn && <input type="date" className="sched-val" value={date} onChange={(e) => setDate(e.target.value)} />}
            <Switch checked={dateOn} onChange={setDateOn} />
          </div>

          {dateOn && (
            <div className="sched-row">
              <span className="sched-row-label">시간</span>
              <span className="sched-spacer" />
              {timeOn && <input type="time" className="sched-val" value={time} onChange={(e) => setTime(e.target.value)} />}
              <Switch checked={timeOn} onChange={setTimeOn} />
            </div>
          )}

          {dateOn && (
            <div className="sched-row">
              <span className="sched-row-label">반복</span>
              <span className="sched-spacer" />
              <select className="sched-val" value={repeat} onChange={(e) => setRepeat(e.target.value)}>
                {REPEAT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}

          {dateOn && repeat === 'custom' && (
            <div className="sched-custom">
              <div className="sched-row sub">
                <span className="sched-row-label">빈도</span>
                <span className="sched-spacer" />
                <input type="number" min="1" className="sched-val sched-num" value={cInterval}
                  onChange={(e) => setCInterval(e.target.value)} />
                <select className="sched-val" value={cFreq} onChange={(e) => setCFreq(e.target.value)}>
                  {CUSTOM_FREQ.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
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
            <div className="sched-row">
              <span className="sched-row-label">반복 종료</span>
              <span className="sched-spacer" />
              {untilOn && <input type="date" className="sched-val" value={until} onChange={(e) => setUntil(e.target.value)} />}
              <Switch checked={untilOn} onChange={setUntilOn} />
            </div>
          )}

          {dateOn && (
            <div className="sched-row">
              <span className="sched-row-label">알림</span>
              <span className="sched-spacer" />
              <select className="sched-val" value={remind} onChange={(e) => setRemind(e.target.value)}>
                {REMIND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}
        </div>

        {needChoose && (
          <>
            <div className="sched-sec-title">참여 멤버</div>
            <ul className="member-pick">
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

        {error && <div className="alert alert-error">{error}</div>}
        <button className="btn btn-primary btn-block" disabled={saving}>
          {saving ? '저장 중…' : isReschedule ? '약속 수정' : '놀기 신청'}
        </button>
      </form>
    </div>
  )
}
