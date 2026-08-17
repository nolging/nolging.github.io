import { useState } from 'react'
import { addAppointment } from '../lib/api'
import ScheduleFields, { defaultSchedule, buildSchedulePayload } from './ScheduleFields'
import Modal from './Modal'

// 이미 약속인 위시에 일정을 하나 더 추가하는 모달. ScheduleFields 의 "일정" 섹션만
// 쓰고(members=[] 로 참여자 섹션은 숨김) 위시 정보 등은 다루지 않는다.
export default function AppointmentAddModal({ open, onClose, taskId, onAdded }) {
  const [sched, setSched] = useState(defaultSchedule)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function close() { if (saving) return; onClose(); setSched(defaultSchedule()); setError('') }

  async function submit(e) {
    e.preventDefault()
    if (saving) return
    setSaving(true); setError('')
    try {
      await addAppointment(taskId, buildSchedulePayload(sched))
      setSched(defaultSchedule())
      onAdded?.()
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={close} title="약속 추가" cardClassName="appt-add-modal">
      <form onSubmit={submit}>
        <ScheduleFields value={sched} onChange={(patch) => setSched((s) => ({ ...s, ...patch }))} members={[]} />
        {error && <div className="alert alert-error cg-mt-16">{error}</div>}
        <div className="cg-footer">
          <button type="submit" className="cg-btn-primary appt-add-submit" disabled={saving}>
            {saving ? '추가 중…' : '약속 추가'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
