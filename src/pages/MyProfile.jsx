import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getMyProfile, updateMyProfile, changeMyPassword } from '../lib/api'

export default function MyProfile() {
  const { profile } = useAuth()
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
          contact: p?.contact || '',
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

  async function saveInfo(e) {
    e.preventDefault()
    setBusy(true); setError(''); setOk('')
    try {
      await updateMyProfile({ contact: form.contact.trim(), birthdate: form.birthdate || null })
      setOk('저장되었습니다.')
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  async function changePw(e) {
    e.preventDefault()
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

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="breadcrumb"><Link to="/">내 그룹</Link> / 내 정보</div>
          <h1>내 정보</h1>
        </div>
        <button className="btn btn-ghost" onClick={() => navigate('/')}>닫기</button>
      </div>

      {loading ? (
        <div className="spinner" />
      ) : (
        <>
          <form onSubmit={saveInfo} className="card form">
            <div className="card-title">기본 정보</div>
            <label className="field"><span>아이디</span>
              <input value={profile?.nickname || ''} disabled /></label>
            <label className="field"><span>연락처</span>
              <input value={form.contact} onChange={(e) => set({ contact: e.target.value })}
                placeholder="예: 010-1234-5678" /></label>
            <label className="field"><span>생년월일</span>
              <input type="date" value={form.birthdate} onChange={(e) => set({ birthdate: e.target.value })} /></label>
            <p className="muted sm">연락처·생년월일은 그룹 공개 설정이 켜져 있을 때만 다른 멤버에게 노출됩니다.</p>

            {error && <div className="alert alert-error">{error}</div>}
            {ok && <div className="alert alert-success">{ok}</div>}
            <button className="btn btn-primary" disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
          </form>

          <div className="card form">
            <div className="card-title">비밀번호</div>
            {!pwOpen ? (
              <>
                {pwOk && <div className="alert alert-success">{pwOk}</div>}
                <button type="button" className="btn" onClick={() => { setPwOpen(true); setPwOk('') }}>
                  비밀번호 변경
                </button>
              </>
            ) : (
              <form onSubmit={changePw} className="form">
                <label className="field"><span>새 비밀번호</span>
                  <input type="password" value={pw.p1} autoComplete="new-password" placeholder="6자 이상"
                    onChange={(e) => setPw((s) => ({ ...s, p1: e.target.value }))} /></label>
                <label className="field"><span>비밀번호 확인</span>
                  <input type="password" value={pw.p2} autoComplete="new-password" placeholder="다시 입력"
                    onChange={(e) => setPw((s) => ({ ...s, p2: e.target.value }))} /></label>
                {pwError && <div className="alert alert-error">{pwError}</div>}
                <div className="row-gap">
                  <button className="btn btn-primary" disabled={pwBusy}>{pwBusy ? '변경 중…' : '확인'}</button>
                  <button type="button" className="btn btn-ghost" onClick={cancelPw}>취소</button>
                </div>
              </form>
            )}
          </div>
        </>
      )}
    </div>
  )
}
