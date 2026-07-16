import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { getMyProfile, updateMyProfile } from '../lib/api'
import { SUBSCRIBABLE_OTTS } from '../lib/constants'

// 한국 전화번호 자동 하이픈: 숫자만 입력해도 010-1111-1234 형태로 표시
function formatPhone(value) {
  const d = String(value).replace(/\D/g, '').slice(0, 11)
  if (d.startsWith('02')) { // 서울 지역번호
    if (d.length <= 2) return d
    if (d.length <= 5) return d.replace(/(\d{2})(\d+)/, '$1-$2')
    if (d.length <= 9) return d.replace(/(\d{2})(\d{3})(\d+)/, '$1-$2-$3')
    return d.replace(/(\d{2})(\d{4})(\d{4})/, '$1-$2-$3')
  }
  if (d.length <= 3) return d
  if (d.length <= 7) return d.replace(/(\d{3})(\d+)/, '$1-$2')
  if (d.length <= 10) return d.replace(/(\d{3})(\d{3})(\d+)/, '$1-$2-$3')
  return d.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3')
}

export default function ProfileEdit() {
  const navigate = useNavigate()
  const location = useLocation()
  const grade = location.state?.grade
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ contact: '', birthdate: '', subscribed_ott: [] })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const toggleOtt = (key) => setForm((f) => ({
    ...f,
    subscribed_ott: f.subscribed_ott.includes(key)
      ? f.subscribed_ott.filter((k) => k !== key)
      : [...f.subscribed_ott, key],
  }))

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const p = await getMyProfile()
        if (!mounted) return
        setForm({
          contact: p?.contact ? formatPhone(p.contact) : '',
          birthdate: p?.birthdate ? String(p.birthdate).slice(0, 10) : '',
          subscribed_ott: Array.isArray(p?.subscribed_ott) ? p.subscribed_ott : [],
        })
      } catch (err) {
        if (mounted) setError(err.message)
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  async function saveInfo() {
    setBusy(true); setError('')
    try {
      await updateMyProfile({ contact: form.contact.trim(), birthdate: form.birthdate || null, subscribed_ott: form.subscribed_ott })
      navigate('/me/info', { state: { grade } }) // 저장 후 조회 페이지로 복귀
    } catch (err) { setError(err.message); setBusy(false) }
  }

  const ottCount = form.subscribed_ott.length

  return (
    <div className="page me-edit">
      {loading ? (
        <div className="spinner" />
      ) : (
        <>
          <div className="me-field">
            <div className="me-field-label">연락처</div>
            <input className="me-input" value={form.contact} inputMode="numeric"
              onChange={(e) => set({ contact: formatPhone(e.target.value) })}
              placeholder="숫자만 입력 (예: 01011112222)" />
          </div>

          <div className="me-field">
            <div className="me-field-label">생년월일</div>
            <input className="me-input" type="date" value={form.birthdate}
              onChange={(e) => set({ birthdate: e.target.value })} />
          </div>

          <div className="me-field">
            <div className="me-field-head">
              <span className="me-field-label">구독 OTT</span>
              <span className="me-field-note">{ottCount}개 구독 중</span>
            </div>
            <div className="me-ott-list">
              {SUBSCRIBABLE_OTTS.map((o) => {
                const on = form.subscribed_ott.includes(o.key)
                return (
                  <div className="me-ott-row" key={o.key}>
                    <img src={o.logo} alt="" />
                    <span className="me-ott-name">{o.label}</span>
                    <button type="button" className={`me-switch ${on ? 'on' : ''}`}
                      role="switch" aria-checked={on} aria-label={o.label}
                      onClick={() => toggleOtt(o.key)}><span className="me-knob" /></button>
                  </div>
                )
              })}
            </div>
          </div>

          <p className="muted sm me-hint">연락처·생년월일·구독 OTT는 그룹 공개 설정이 켜져 있을 때만 다른 멤버에게 노출됩니다.</p>

          {error && <div className="alert alert-error">{error}</div>}

          <button type="button" className="me-save" disabled={busy} onClick={saveInfo}>
            {busy ? '저장 중…' : '저장'}
          </button>
        </>
      )}
    </div>
  )
}
