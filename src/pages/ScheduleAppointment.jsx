import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  getGroup, getTask, listMemberCards, listTaskParticipants, scheduleTask, rescheduleTask,
} from '../lib/api'
import { REPEAT_OPTIONS } from '../lib/constants'
import Avatar from '../components/Avatar'

const pad = (n) => String(n).padStart(2, '0')
function dateStr(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function timeStr(d) { return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
function defaultDate() { return dateStr(new Date()) }
function defaultTime() {
  const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0); return timeStr(d)
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

  const [date, setDate] = useState(defaultDate())
  const [time, setTime] = useState(defaultTime())
  const [repeat, setRepeat] = useState('none')
  const [participants, setParticipants] = useState(() => new Set())

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [g, t, m] = await Promise.all([
        getGroup(groupId), getTask(taskId), listMemberCards(groupId),
      ])
      setGroup(g); setTask(t); setMembers(m)

      // 재조정(이미 잡힌 약속)이면 기존 값 프리필
      if (t.scheduled_at) {
        const d = new Date(t.scheduled_at)
        setDate(dateStr(d)); setTime(timeStr(d))
      }
      if (t.repeat_rule) setRepeat(t.repeat_rule)

      const existing = t.status === 'accepted' ? await listTaskParticipants(taskId) : []
      // 기본 참여자: 위시리스트 작성자 + 신청자(나) (+ 기존 참여자)
      setParticipants(new Set([t.created_by, profile.id, ...existing].filter(Boolean)))
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [groupId, taskId, profile.id])
  useEffect(() => { load() }, [load])

  const isReschedule = task?.status === 'accepted'
  const mandatory = useMemo(
    () => new Set([task?.created_by, profile.id].filter(Boolean)),
    [task, profile.id],
  )
  const needChoose = members.length >= 3

  function toggle(uid) {
    if (mandatory.has(uid)) return
    setParticipants((prev) => {
      const next = new Set(prev)
      next.has(uid) ? next.delete(uid) : next.add(uid)
      return next
    })
  }

  async function submit(e) {
    e.preventDefault()
    if (saving) return
    if (!date || !time) { setError('날짜와 시간을 설정해 주세요.'); return }
    setSaving(true); setError('')
    try {
      const scheduledAt = new Date(`${date}T${time}`).toISOString()
      const ids = needChoose ? Array.from(participants) : Array.from(mandatory)
      const payload = { taskId, scheduledAt, repeat: repeat === 'none' ? null : repeat, participantIds: ids }
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
      <div className="sched-headline">
        {task.category && <span className="cat-chip">{task.category}</span>}
        <span className="task-name">{task.title}</span>
      </div>

      <form onSubmit={submit}>
        <div className="ios-list">
          <label className="ios-row">
            <span className="ios-row-label">날짜</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="ios-row">
            <span className="ios-row-label">시간</span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
          <label className="ios-row">
            <span className="ios-row-label">반복</span>
            <select value={repeat} onChange={(e) => setRepeat(e.target.value)}>
              {REPEAT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        </div>

        {needChoose && (
          <>
            <div className="sched-sec-title">참여 멤버</div>
            <ul className="member-pick">
              {members.map((m) => {
                const checked = participants.has(m.user_id)
                const fixed = mandatory.has(m.user_id)
                return (
                  <li key={m.user_id}
                    className={`member-pick-item ${checked ? 'on' : ''} ${fixed ? 'fixed' : ''}`}
                    onClick={() => toggle(m.user_id)}>
                    <Avatar src={m.avatar_url} name={m.display_nickname} size={32} />
                    <span className="member-pick-name">
                      {m.display_nickname}
                      {fixed && <span className="muted sm"> · 필수</span>}
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
          {saving ? '저장 중…' : isReschedule ? '약속 수정' : '놀기 신청 완료'}
        </button>
      </form>
    </div>
  )
}
