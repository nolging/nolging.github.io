import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { createGroup, updateMyGroupMember } from '../lib/api'
import { DEFAULT_THEME } from '../lib/constants'
import AvatarEditor from '../components/AvatarEditor'

export default function CreateGroup() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // 1단계: 그룹 정보
  const [ginfo, setGinfo] = useState({ name: '', description: '', showContact: false, showBirthdate: false })
  const setG = (patch) => setGinfo((f) => ({ ...f, ...patch }))

  // 2단계: 소유자의 그룹 내 프로필
  const [prof, setProf] = useState({ display_nickname: '', avatar_url: '', show_contact: false, show_birthdate: false })
  const setP = (patch) => setProf((f) => ({ ...f, ...patch }))

  function next(e) {
    e.preventDefault()
    if (!ginfo.name.trim()) { setError('그룹명을 입력해 주세요.'); return }
    setError('')
    setStep(2)
  }

  async function finish() {
    setBusy(true); setError('')
    try {
      const group = await createGroup({
        name: ginfo.name.trim(),
        description: ginfo.description.trim(),
        ownerId: profile.id,
        groupType: 'nolging',
        theme: DEFAULT_THEME,
        showContact: ginfo.showContact,
        showBirthdate: ginfo.showBirthdate,
      })
      await updateMyGroupMember(group.id, profile.id, {
        display_nickname: prof.display_nickname.trim() || null,
        avatar_url: prof.avatar_url || null,
        show_contact: !!prof.show_contact,
        show_birthdate: !!prof.show_birthdate,
      })
      navigate(`/groups/${group.id}`)
    } catch (err) { setError(err.message); setBusy(false) }
  }

  // ---- 1단계: 그룹 정보 ----
  if (step === 1) {
    return (
      <div className="page">
        <form onSubmit={next} className="form">
          <label className="field"><span>그룹명 *</span>
            <input autoFocus value={ginfo.name} onChange={(e) => setG({ name: e.target.value })} placeholder="그룹 이름" /></label>
          <label className="field"><span>설명 (선택)</span>
            <input value={ginfo.description} onChange={(e) => setG({ description: e.target.value })} placeholder="설명" /></label>

          <label className="check">
            <input type="checkbox" checked={ginfo.showContact} onChange={(e) => setG({ showContact: e.target.checked })} />
            멤버 연락처 공개 허용
          </label>
          <label className="check">
            <input type="checkbox" checked={ginfo.showBirthdate} onChange={(e) => setG({ showBirthdate: e.target.checked })} />
            멤버 생년월일 공개 허용
          </label>

          {error && <div className="alert alert-error">{error}</div>}
          <button className="btn btn-primary btn-block">다음</button>
        </form>
      </div>
    )
  }

  // ---- 2단계: 소유자 프로필 설정 ----
  return (
    <div className="page">
      <p className="muted sm">이 그룹에서 사용할 내 프로필을 설정하세요.</p>
      <div className="form">
        <AvatarEditor value={prof.avatar_url} name={prof.display_nickname || profile?.nickname}
          onChange={(v) => setP({ avatar_url: v })} onError={setError} />

        <label className="field"><span>닉네임</span>
          <input value={prof.display_nickname} onChange={(e) => setP({ display_nickname: e.target.value })}
            placeholder="그룹 내에서 사용할 닉네임을 입력해 주세요" /></label>

        {ginfo.showContact && (
          <label className="check">
            <input type="checkbox" checked={prof.show_contact} onChange={(e) => setP({ show_contact: e.target.checked })} />
            이 그룹에 내 연락처 공개
          </label>
        )}
        {ginfo.showBirthdate && (
          <label className="check">
            <input type="checkbox" checked={prof.show_birthdate} onChange={(e) => setP({ show_birthdate: e.target.checked })} />
            이 그룹에 내 생년월일 공개
          </label>
        )}

        {error && <div className="alert alert-error">{error}</div>}
        <div className="wizard-actions">
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => { setError(''); setStep(1) }}>이전</button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={finish}>{busy ? '만드는 중…' : '그룹 만들기'}</button>
        </div>
      </div>
    </div>
  )
}
