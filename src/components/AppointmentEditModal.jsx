import { useEffect, useState } from 'react'
import { updateAppointment } from '../lib/api'
import ScheduleFields, { defaultSchedule, buildSchedulePayload, scheduleFromAppointment } from './ScheduleFields'
import Modal from './Modal'

// 여러 약속 중 하나를 수정하는 모달. AppointmentAddModal 과 동일한 폼(날짜/시간/반복/
// 반복종료/알림)을 쓰되, 해당 약속의 기존 값으로 채워서 시작하고 제출 시 updateAppointment 호출.
export default function AppointmentEditModal({ open, appointment, onClose, onSaved }) {
  const [sched, setSched] = useState(defaultSchedule)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) { setSched(scheduleFromAppointment(appointment)); setError('') }
  }, [open, appointment])

  function close() { if (saving) return; onClose() }

  async function submit(e) {
    e.preventDefault()
    if (saving || !appointment) return
    setSaving(true); setError('')
    try {
      await updateAppointment(appointment.id, buildSchedulePayload(sched))
      onSaved?.()
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={close} cardClassName="appt-add-modal">
      <form onSubmit={submit}>
        <ScheduleFields value={sched} onChange={(patch) => setSched((s) => ({ ...s, ...patch }))} members={[]} showTitle={false} />
        {error && <div className="alert alert-error cg-mt-16">{error}</div>}
        <div className="cg-footer">
          <button type="submit" className="cg-btn-primary appt-add-submit" disabled={saving}>
            {saving ? '저장 중…' : '약속 수정'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
