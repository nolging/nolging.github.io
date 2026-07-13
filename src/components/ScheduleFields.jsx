// 일정·참여자 입력 필드 (위시 작성 시 약속/추억으로 등록하거나, 약속 잡기에서 공용).
// 제어 컴포넌트: 부모가 value(일정 상태 객체)와 onChange(patch) 를 소유한다.
import { REPEAT_OPTIONS, REMIND_OPTIONS, CUSTOM_FREQ, WEEKDAYS } from '../lib/constants'
import Avatar from './Avatar'
import CgToggle from './CgToggle'

const pad = (n) => String(n).padStart(2, '0')
const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const timeStr = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
export function defaultScheduleDate() { return dateStr(new Date()) }
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

// 일정 상태 기본값
export function defaultSchedule() {
  return {
    dateOn: true, timeOn: true, date: defaultScheduleDate(), time: defaultTime(),
    repeat: 'none', cFreq: 'weekly', cInterval: 1, cWeekdays: [], untilOn: false, until: defaultScheduleDate(),
    remind: '', participants: [],
  }
}

// value → schedule_task 페이로드 조각 (taskId·participantIds 는 호출측에서 결합)
export function buildSchedulePayload(v) {
  let scheduledAt = null, timeSet = false
  if (v.dateOn && v.date) {
    scheduledAt = new Date(`${v.date}T${v.timeOn ? v.time : '00:00'}`).toISOString()
    timeSet = v.timeOn
  }
  let rule = null
  if (v.dateOn && v.repeat !== 'none') {
    if (v.repeat === 'custom') {
      const obj = { type: 'custom', freq: v.cFreq, interval: Math.max(1, Number(v.cInterval) || 1) }
      if (v.cFreq === 'weekly') obj.weekdays = [...v.cWeekdays].sort((a, b) => a - b)
      rule = JSON.stringify(obj)
    } else rule = v.repeat
  }
  return {
    scheduledAt, timeSet, repeat: rule,
    repeatUntil: (v.dateOn && rule && v.untilOn) ? v.until : null,
    remind: v.dateOn ? v.remind : '',
  }
}

function Chevron() {
  return <svg width="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
}
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

export default function ScheduleFields({ value, onChange, members = [], meId, authorId }) {
  const v = value
  const set = (patch) => onChange(patch)
  const toggleWeekday = (i) => {
    const s = new Set(v.cWeekdays); s.has(i) ? s.delete(i) : s.add(i); set({ cWeekdays: [...s] })
  }
  const toggleMember = (uid) => {
    const s = new Set(v.participants); s.has(uid) ? s.delete(uid) : s.add(uid); set({ participants: [...s] })
  }
  const parts = new Set(v.participants)
  const needChoose = members.length >= 2

  return (
    <>
      {/* 일정 */}
      <div className="cg-section-title cg-mt-24">일정</div>
      <div className="cg-list cg-mt-12">
        <div className="cg-row">
          <span className="cg-row-icon" style={{ background: '#e6eefd' }}>📅</span>
          <div className="cg-row-main">
            <div className="cg-row-title">날짜</div>
            {v.dateOn && <PickField type="date" value={v.date} onChange={(x) => set({ date: x })} format={fmtDate} />}
          </div>
          <CgToggle on={v.dateOn} onClick={() => set({ dateOn: !v.dateOn })} />
        </div>

        {v.dateOn && (
          <div className="cg-row">
            <span className="cg-row-icon" style={{ background: '#eeebfe' }}>🕗</span>
            <div className="cg-row-main">
              <div className="cg-row-title">시간</div>
              {v.timeOn && <PickField type="time" value={v.time} onChange={(x) => set({ time: x })} format={fmtTime} />}
            </div>
            <CgToggle on={v.timeOn} onClick={() => set({ timeOn: !v.timeOn })} />
          </div>
        )}

        {v.dateOn && (
          <div className="cg-row">
            <span className="cg-row-icon" style={{ background: '#e8f4ec' }}>🔁</span>
            <div className="cg-row-main"><div className="cg-row-title">반복</div></div>
            <SelectPill value={v.repeat} onChange={(x) => set({ repeat: x })} options={REPEAT_OPTIONS} />
          </div>
        )}

        {v.dateOn && v.repeat === 'custom' && (
          <div className="sc-custom">
            <div className="sc-custom-freq">
              <input type="number" min="1" className="sc-num" value={v.cInterval} onChange={(e) => set({ cInterval: e.target.value })} />
              <SelectPill value={v.cFreq} onChange={(x) => set({ cFreq: x })} options={CUSTOM_FREQ} />
            </div>
            {v.cFreq === 'weekly' && (
              <div className="weekday-row">
                {WEEKDAYS.map((w, i) => (
                  <button type="button" key={i} className={`weekday ${v.cWeekdays.includes(i) ? 'on' : ''}`}
                    onClick={() => toggleWeekday(i)}>{w}</button>
                ))}
              </div>
            )}
          </div>
        )}

        {v.dateOn && v.repeat !== 'none' && (
          <div className="cg-row">
            <span className="cg-row-icon" style={{ background: '#fde8ee' }}>🗓️</span>
            <div className="cg-row-main">
              <div className="cg-row-title">반복 종료</div>
              {v.untilOn && <PickField type="date" value={v.until} onChange={(x) => set({ until: x })} format={fmtDate} />}
            </div>
            <CgToggle on={v.untilOn} onClick={() => set({ untilOn: !v.untilOn })} />
          </div>
        )}

        {v.dateOn && (
          <div className="cg-row">
            <span className="cg-row-icon" style={{ background: '#fdeee6' }}>🔔</span>
            <div className="cg-row-main"><div className="cg-row-title">알림</div></div>
            <SelectPill value={v.remind} onChange={(x) => set({ remind: x })} options={REMIND_OPTIONS} />
          </div>
        )}
      </div>

      {needChoose && (
        <>
          <div className="cg-section-title cg-mt-24">참여자</div>
          <div className="cg-list cg-mt-12">
            <ul className="member-pick">
              {members.map((m) => {
                const checked = parts.has(m.user_id)
                return (
                  <li key={m.user_id} className="member-pick-item" onClick={() => toggleMember(m.user_id)}>
                    <Avatar src={m.avatar_url} name={m.display_nickname} size={32} />
                    <span className="member-pick-name">
                      {m.display_nickname}
                      {m.user_id === meId && <span className="mp-badge scp-me">나</span>}
                      {m.user_id === authorId && <span className="mp-badge scp-author">위시 작성자</span>}
                    </span>
                    <span className={`pick-check ${checked ? 'on' : ''}`} aria-hidden="true">✓</span>
                  </li>
                )
              })}
            </ul>
          </div>
        </>
      )}
    </>
  )
}
