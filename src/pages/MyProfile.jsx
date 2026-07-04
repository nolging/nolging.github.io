import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getMyProfile, updateMyProfile, changeMyPassword } from '../lib/api'

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

export default function MyProfile() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ contact: '', birthdate: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  // 비밀번호 변경 상태
  const [pwOpen, setPwOpen] = useState(false)
  const [pw, setPw] = useState({ p1: '', p2: '' })
  const [pwBusy, setPwBusy] = useState(false)
  const [pwError, setPwError] = useState('')
  const [pwOk, setPwOk] = useState('')

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const p = await getMyProfile()
        if (!mounted) return
        setForm({
          contact: p?.contact ? formatPhone(p.contact) : '',
          // date 컬럼은 'YYYY-MM-DD' 로 오므로 date 인풋에 그대로 사용
          birthdate: p?.birthdate ? String(p.birthdate).slice(0, 10) : '',
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
    setBusy(true); setError(''); setOk('')
    try {
      await updateMyProfile({ contact: form.contact.trim(), birthdate: form.birthdate || null })
      setOk('저장되었습니다.')
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  async function changePw() {
    setPwError(''); setPwOk('')
    if (pw.p1.length < 6) { setPwError('비밀번호는 6자 이상이어야 합니다.'); return }
    if (pw.p1 !== pw.p2) { setPwError('두 비밀번호가 일치하지 않습니다.'); return }
    setPwBusy(true)
    try {
      await changeMyPassword(pw.p1)
      setPw({ p1: '', p2: '' })
      setPwOpen(false)
      setPwOk('비밀번호가 변경되었습니다.')
    } catch (err) { setPwError(err.message) } finally { setPwBusy(false) }
  }

  function cancelPw() {
    setPwOpen(false); setPw({ p1: '', p2: '' }); setPwError('')
  }

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>내 정보</h1>
        </div>
      </div>

      {loading ? (
        <div className="spinner" />
      ) : (
        <>
        <div className="card form">
          <label className="field"><span>연락처</span>
            <input value={form.contact} inputMode="numeric"
              onChange={(e) => set({ contact: formatPhone(e.target.value) })}
              placeholder="숫자만 입력 (예: 01011112222)" /></label>

          <label className="field"><span>생년월일</span>
            <input type="date" value={form.birthdate}
              onChange={(e) => set({ birthdate: e.target.value })} /></label>

          <p className="muted sm">연락처·생년월일은 그룹 공개 설정이 켜져 있을 때만 다른 멤버에게 노출됩니다.</p>

          {/* 비밀번호 변경 (저장 버튼 위) */}
          {!pwOpen ? (
            <div>
              {pwOk && <div className="alert alert-success" style={{ marginBottom: 10 }}>{pwOk}</div>}
              <button type="button" className="btn" onClick={() => { setPwOpen(true); setPwOk('') }}>
                비밀번호 변경
              </button>
            </div>
          ) : (
            <div className="pw-box">
              <label className="field"><span>새 비밀번호</span>
                <input type="password" value={pw.p1} autoComplete="new-password" placeholder="6자 이상"
                  onChange={(e) => setPw((s) => ({ ...s, p1: e.target.value }))} /></label>
              <label className="field"><span>비밀번호 확인</span>
                <input type="password" value={pw.p2} autoComplete="new-password" placeholder="다시 입력"
                  onChange={(e) => setPw((s) => ({ ...s, p2: e.target.value }))} /></label>
              {pwError && <div className="alert alert-error">{pwError}</div>}
              <div className="row-gap">
                <button type="button" className="btn btn-primary" disabled={pwBusy} onClick={changePw}>
                  {pwBusy ? '변경 중…' : '확인'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={cancelPw}>취소</button>
              </div>
            </div>
          )}

          {error && <div className="alert alert-error">{error}</div>}
          {ok && <div className="alert alert-success">{ok}</div>}

          <button type="button" className="btn btn-primary" disabled={busy} onClick={saveInfo}>
            {busy ? '저장 중…' : '저장'}
          </button>
        </div>

        <div className="logout-bar">
          <button type="button" className="btn btn-danger btn-block" onClick={handleLogout}>
            로그아웃
          </button>
        </div>
        </>
      )}
    </div>
  )
}
