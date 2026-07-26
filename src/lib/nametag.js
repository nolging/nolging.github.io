import { useEffect, useState } from 'react'

// 명찰(닉네임 24h 잠금) 남은 시간 표기: 23:59 (시:분)
// 분은 내림 → 사용 직후 23:59 부터 00:00 까지 줄어든다.
export function hhmmLeft(until) {
  if (!until) return '00:00'
  const ms = new Date(until).getTime() - Date.now()
  if (!(ms > 0)) return '00:00'
  const mins = Math.floor(ms / 60000)
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
}

export const nametagActive = (until) => !!until && new Date(until).getTime() > Date.now()

// 남은 시간 표기가 멈춰 있지 않도록 주기적으로 리렌더한다(표기 단위가 분이라 15초면 충분).
export function useCountdownTick(active, ms = 15000) {
  const [, bump] = useState(0)
  useEffect(() => {
    if (!active) return
    const iv = setInterval(() => bump((n) => n + 1), ms)
    return () => clearInterval(iv)
  }, [active, ms])
}
