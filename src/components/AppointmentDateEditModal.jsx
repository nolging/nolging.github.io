import { useEffect, useState } from 'react'
import { updateAppointment } from '../lib/api'
import Modal from './Modal'

const pad = (n) => String(n).padStart(2, '0')
const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

// 여러 약속 중 하나의 "날짜"만 빠르게 수정하는 경량 모달(시간/반복/알림 등은 그대로 유지).
export default function AppointmentDateEditModal({ open, appointment, onClose, onSaved }) {
  const [date, setDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setDate(appointment?.scheduled_at ? dateStr(new Date(appointment.scheduled_at)) : dateStr(new Date()))
    setError('')
  }, [open, appointment])

  async function submit(e) {
    e.preventDefault()
    if (saving || !appointment || !date) return
    setSaving(true); setError('')
    try {
      const base = appointment.scheduled_at ? new Date(appointment.scheduled_at) : new Date(`${date}T00:00:00`)
      const [y, m, d] = date.split('-').map(Number)
      base.setFullYear(y, m - 1, d)
      await updateAppointment(appointment.id, {
        scheduledAt: base.toISOString(),
        timeSet: appointment.scheduled_time_set,
        repeat: appointment.repeat_rule,
        repeatUntil: appointment.repeat_until,
        remind: appointment.remind_min ?? '',
      })
      onSaved?.()
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={() => { if (!saving) onClose() }} cardClassName="appt-date-edit-modal">
      <form onSubmit={submit}>
        <div className="cg-field">
          <div className="cg-label">날짜</div>
          <div className="cg-input-wrap">
            <input type="date" className="cg-input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        {error && <div className="alert alert-error cg-mt-16">{error}</div>}
        <div className="cg-footer">
          <button type="submit" className="cg-btn-primary" disabled={saving}>{saving ? '저장 중…' : '저장'}</button>
        </div>
      </form>
    </Modal>
  )
}
