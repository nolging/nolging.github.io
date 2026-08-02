import { useEffect, useMemo, useState } from 'react'
import { parseBirth, composeBirth, daysInMonth } from '../lib/birthday'

// 생년월일 입력 — 년(선택) / 월 / 일. 년을 "없음" 으로 두면 생일(월/일)만 저장된다.
// value: 'YYYY-MM-DD'(또는 센티넬 연도) / '', onChange: 같은 형식의 문자열
// ※ 저장값(value)은 월·일이 모두 채워져야 완성되므로, 부분 선택(월만/일만)은 내부 state 로 유지한다.
export default function BirthdayInput({ value, onChange, className = '' }) {
  const [parts, setParts] = useState(() => parseBirth(value))
  const { year, month, day } = parts

  // 외부 value 가 (내 부분선택으로 만들어지는 값과 다르게) 바뀌면 동기화 — 예: 폼 로드/초기화
  useEffect(() => {
    if ((value || '') !== (composeBirth(parts) || '')) setParts(parseBirth(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const thisYear = new Date().getFullYear()
  const years = useMemo(() => Array.from({ length: 100 }, (_, i) => thisYear - i), [thisYear])
  const maxDay = daysInMonth(year, month)
  const days = useMemo(() => Array.from({ length: maxDay }, (_, i) => i + 1), [maxDay])

  function update(next) {
    // 월 변경 등으로 일이 그 달의 최대치를 넘으면 잘라 준다
    const dim = daysInMonth(next.year, next.month)
    if (next.day && Number(next.day) > dim) next.day = String(dim).padStart(2, '0')
    setParts(next)
    onChange(composeBirth(next))
  }

  return (
    <div className={`birthday-input ${className}`}>
      <select className="birthday-sel birthday-year" value={year}
        onChange={(e) => update({ ...parts, year: e.target.value })}>
        <option value="">년(선택)</option>
        {years.map((y) => <option key={y} value={String(y)}>{y}</option>)}
      </select>
      <select className="birthday-sel" value={month}
        onChange={(e) => update({ ...parts, month: e.target.value })}>
        <option value="">월</option>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
          <option key={m} value={String(m).padStart(2, '0')}>{m}월</option>
        ))}
      </select>
      <select className="birthday-sel" value={day}
        onChange={(e) => update({ ...parts, day: e.target.value })}>
        <option value="">일</option>
        {days.map((d) => <option key={d} value={String(d).padStart(2, '0')}>{d}일</option>)}
      </select>
    </div>
  )
}
