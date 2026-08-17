import { formatWhen, repeatLabel } from '../lib/constants'
import Modal from './Modal'

// 약속이 2개 이상인 위시에서 "수정"을 눌렀을 때, 어떤 약속을 수정할지 고르는 모달.
export default function AppointmentPickModal({ open, onClose, appointments, onPick }) {
  return (
    <Modal open={open} onClose={onClose} title="수정할 약속 선택" cardClassName="appt-pick-modal">
      <ul className="appt-pick-list">
        {appointments.map((a) => (
          <li key={a.id}>
            <button type="button" className="appt-pick-row" onClick={() => onPick(a.id)}>
              <span className="appt-pick-when">
                {a.scheduled_at ? formatWhen(a.scheduled_at, a.scheduled_time_set) : '날짜 미정'}
              </span>
              {a.repeat_rule && <span className="appt-pick-rep">{repeatLabel(a.repeat_rule)}</span>}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
