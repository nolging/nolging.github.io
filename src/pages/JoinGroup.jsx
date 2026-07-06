import { useState, useEffect } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { previewGroup, joinGroupWithProfile } from '../lib/api'
import AvatarEditor from '../components/AvatarEditor'

export default function JoinGroup() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { setBackHandler } = useOutletContext()

  const [code, setCode] = useState('')
  const [preview, setPreview] = useState(null) // 미리보기 대상 그룹
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // 상단바 뒤로가기: 2단계(프로필)면 1단계(코드 입력)로, 1단계면 기본(내 그룹)
  useEffect(() => {
    setBackHandler(() => (preview ? () => setPreview(null) : null))
  }, [preview, setBackHandler])
  useEffect(() => () => setBackHandler(() => null), [setBackHandler])

  // 프로필 설정(2단계)
  const [form, setForm] = useState({ display_nickname: '', avatar_url: '', show_contact: false, show_birthdate: false, show_ott: false })
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  async function lookup(e) {
    e.preventDefault()
    if (!code.trim()) return
    setBusy(true); setError('')
    try {
      const g = await previewGroup(code.trim())
      if (!g) { setError('유효하지 않은 초대 코드입니다.'); return }
      if (g.already_member) { navigate(`/groups/${g.id}`); return }
      setPreview(g)
      setForm({ display_nickname: '', avatar_url: '', show_contact: false, show_birthdate: false, show_ott: false })
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  async function join() {
    setBusy(true); setError('')
    try {
      await joinGroupWithProfile(code.trim(), profile.id, form)
      navigate(`/groups/${preview.id}`)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  // ---- 1단계: 초대 코드 입력 ----
  if (!preview) {
    return (
      <div className="page">
        <div className="card narrow">
          <p className="muted">그룹 관리자에게 받은 초대 코드를 입력하세요.</p>
          <form onSubmit={lookup} className="form">
            <input autoFocus value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="초대 코드 (예: A1B2C3)" />
            {error && <p className="field-error">{error}</p>}
            <button className="btn btn-primary btn-block" disabled={busy}>
              {busy ? '확인 중…' : '다음'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ---- 2단계: 그룹 정보 확인 + 프로필 설정 후 가입 ----
  return (
    <div className="page">
      <div className="card narrow">
        <div className="join-group-info">
          <h2 className="join-group-name">{preview.name}</h2>
          <p className="muted sm">소유자 · {preview.owner_nickname}</p>
          {preview.description && <p className="muted">{preview.description}</p>}
        </div>

        <hr className="divider" />

        <p className="muted sm">이 그룹에서 사용할 프로필을 설정하세요.</p>

        <div className="form">
          <AvatarEditor value={form.avatar_url} name={form.display_nickname || profile?.nickname}
            userId={profile?.id} onChange={(v) => set({ avatar_url: v })} onError={setError} />

          <label className="field"><span>닉네임</span>
            <input value={form.display_nickname} onChange={(e) => set({ display_nickname: e.target.value })}
              placeholder="그룹 내에서 사용할 닉네임을 입력해 주세요" /></label>

          {preview.show_contact && (
            <label className="check">
              <input type="checkbox" checked={form.show_contact} onChange={(e) => set({ show_contact: e.target.checked })} />
              이 그룹에 내 연락처 공개
            </label>
          )}
          {preview.show_birthdate && (
            <label className="check">
              <input type="checkbox" checked={form.show_birthdate} onChange={(e) => set({ show_birthdate: e.target.checked })} />
              이 그룹에 내 생년월일 공개
            </label>
          )}
          {preview.show_ott && (
            <label className="check">
              <input type="checkbox" checked={form.show_ott} onChange={(e) => set({ show_ott: e.target.checked })} />
              이 그룹에 내 구독 OTT 공개
            </label>
          )}

          {error && <p className="field-error">{error}</p>}
          <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={join}>
            {busy ? '가입 중…' : '가입하기'}
          </button>
        </div>
      </div>
    </div>
  )
}
