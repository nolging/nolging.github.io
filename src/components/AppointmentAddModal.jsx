import { useEffect, useState } from 'react'
import { addAppointment, listTaskParticipants, listMemberCards } from '../lib/api'
import ScheduleFields, { defaultSchedule, buildSchedulePayload } from './ScheduleFields'
import Modal from './Modal'

// 이미 약속인 위시에 일정을 하나 더 추가하는 모달. 참여자는 위시를 처음 약속으로
// 넘길 때 정한 풀(task_participants) 안에서만 고를 수 있다.
// 날짜 토글은 기본으로 켜둔 채 시작(약속을 추가하는 목적상 날짜를 바로 입력하도록)
const initialSchedule = (participants = []) => ({ ...defaultSchedule(), dateOn: true, participants })

export default function AppointmentAddModal({ open, onClose, taskId, groupId, meId, authorId, onAdded }) {
  const [sched, setSched] = useState(defaultSchedule)
  const [poolMembers, setPoolMembers] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setError('')
    ;(async () => {
      try {
        const [pool, cards] = await Promise.all([listTaskParticipants(taskId), listMemberCards(groupId)])
        if (cancelled) return
        const members = cards.filter((m) => pool.includes(m.user_id))
        setPoolMembers(members)
        setSched(initialSchedule(pool)) // 기본값: 풀 전체 참여
      } catch (err) { if (!cancelled) setError(err.message) }
    })()
    return () => { cancelled = true }
  }, [open, taskId, groupId])

  function close() { if (saving) return; onClose() }

  async function submit(e) {
    e.preventDefault()
    if (saving) return
    setSaving(true); setError('')
    try {
      const participantIds = poolMembers.length >= 2 ? sched.participants : poolMembers.map((m) => m.user_id)
      await addAppointment(taskId, { ...buildSchedulePayload(sched), participantIds })
      setSched(initialSchedule(poolMembers.map((m) => m.user_id)))
      onAdded?.()
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={close} cardClassName="appt-add-modal">
      <form onSubmit={submit}>
        <ScheduleFields value={sched} onChange={(patch) => setSched((s) => ({ ...s, ...patch }))}
          members={poolMembers} meId={meId} authorId={authorId} boxed={false} />
        {error && <div className="alert alert-error cg-mt-16">{error}</div>}
        <div className="cg-footer">
          <button type="submit" className="cg-btn-primary appt-add-submit" disabled={saving}>
            {saving ? '추가 중…' : '일정 추가'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
