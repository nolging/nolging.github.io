import { useEffect, useState } from 'react'
import { updateAppointment, listTaskParticipants, listMemberCards } from '../lib/api'
import ScheduleFields, { defaultSchedule, buildSchedulePayload, scheduleFromAppointment } from './ScheduleFields'
import Modal from './Modal'

// 여러 약속 중 하나를 수정하는 모달. AppointmentAddModal 과 동일한 폼(날짜/시간/반복/
// 반복종료/알림/참여자)을 쓰되, 해당 약속의 기존 값으로 채워서 시작하고 제출 시
// updateAppointment 호출. 참여자는 위시의 참여자 풀 안에서만 고를 수 있다.
export default function AppointmentEditModal({ open, appointment, groupId, meId, authorId, onClose, onSaved }) {
  const [sched, setSched] = useState(defaultSchedule)
  const [poolMembers, setPoolMembers] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !appointment) return
    let cancelled = false
    setSched(scheduleFromAppointment(appointment))
    setError('')
    ;(async () => {
      try {
        const [pool, cards] = await Promise.all([
          listTaskParticipants(appointment.task_id), listMemberCards(groupId),
        ])
        if (cancelled) return
        setPoolMembers(cards.filter((m) => pool.includes(m.user_id)))
      } catch (err) { if (!cancelled) setError(err.message) }
    })()
    return () => { cancelled = true }
  }, [open, appointment, groupId])

  function close() { if (saving) return; onClose() }

  async function submit(e) {
    e.preventDefault()
    if (saving || !appointment) return
    setSaving(true); setError('')
    try {
      const participantIds = poolMembers.length >= 2 ? sched.participants : poolMembers.map((m) => m.user_id)
      await updateAppointment(appointment.id, { ...buildSchedulePayload(sched), participantIds })
      onSaved?.()
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
            {saving ? '저장 중…' : '일정 수정'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
