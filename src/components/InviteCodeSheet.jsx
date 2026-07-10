import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BottomSheet from './BottomSheet'
import { previewGroup } from '../lib/api'

// 초대장 찾기(그룹 가입 STEP 1) 바텀시트 — 6자리 코드 입력·검증(시안 12a·12b)
// 성공 시 onSuccess(preview, code). 이미 멤버면 해당 그룹으로 이동.
export default function InviteCodeSheet({ open, onClose, onSuccess }) {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)   // 유효하지 않은 코드
  const [shake, setShake] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (open) {
      setCode(''); setBusy(false); setError(false); setShake(false)
      // 시트 슬라이드업 후 포커스 → 키패드
      const t = setTimeout(() => inputRef.current?.focus(), 320)
      return () => clearTimeout(t)
    }
  }, [open])

  const filled = code.length === 6

  function onChange(e) {
    const v = (e.target.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
    setCode(v)
    if (error) setError(false)
  }

  // 오류(빨간) 상태에서 다시 입력하려고 칸을 누르면 기존 코드·경고를 비움
  function clearOnError() {
    if (error) { setCode(''); setError(false); setShake(false) }
  }

  function triggerShake() {
    setError(true)
    setShake(false)
    requestAnimationFrame(() => setShake(true))
  }

  async function confirm() {
    if (!filled || busy) return
    setBusy(true)
    try {
      const g = await previewGroup(code.trim())
      if (!g) { triggerShake(); return }
      if (g.already_member) { onClose?.(); navigate(`/groups/${g.id}`); return }
      onSuccess(g, code.trim())
    } catch (err) {
      // preview_group 미배포 등 실제 오류도 유효하지 않음으로 안내
      triggerShake()
    } finally {
      setBusy(false)
    }
  }

  const boxes = Array.from({ length: 6 }, (_, i) => {
    const ch = code[i] || ''
    const active = i === code.length && !filled
    const cls = error ? 'err' : ch ? 'filled' : active ? 'active' : ''
    return { ch, cls }
  })

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="iv-head">
        <span className="iv-ico" aria-hidden="true">
          <svg width="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>
        </span>
        <div className="iv-htext">
          <div className="iv-tt">초대장 찾기</div>
          <div className="iv-sub">그룹 관리자에게 받은 초대 코드를 입력해 주세요</div>
        </div>
        <button type="button" className="iv-x" onClick={onClose} aria-label="닫기" title="닫기">
          <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>

      <div className="iv-body">
        <div className="iv-boxwrap">
          <div className={`iv-boxes ${shake ? 'shake' : ''}`} onAnimationEnd={() => setShake(false)}>
            {boxes.map((b, i) => <div key={i} className={`iv-box ${b.cls}`}>{b.ch}</div>)}
          </div>
          <input ref={inputRef} className="iv-code-input" value={code} onChange={onChange}
            onPointerDown={clearOnError} onFocus={clearOnError}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirm() } }}
            inputMode="text" autoCapitalize="characters" autoComplete="off" autoCorrect="off"
            spellCheck="false" aria-label="초대 코드 입력" />
        </div>

        {error ? (
          <div className="iv-err">
            <svg width="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><line x1="12" y1="8" x2="12" y2="13" /><line x1="12" y1="16.5" x2="12" y2="16.6" /></svg>
            유효하지 않은 초대 코드입니다
          </div>
        ) : (
          <div className="iv-help">영문·숫자 조합의 6 자리 코드를 입력하세요</div>
        )}

        <button type="button" className="iv-confirm" onClick={confirm} disabled={!filled || busy}>
          {busy ? '확인 중…' : '확인'}
        </button>
        <div className="iv-foot">코드가 없다면 그룹 관리자에게 요청하세요</div>
      </div>
    </BottomSheet>
  )
}
