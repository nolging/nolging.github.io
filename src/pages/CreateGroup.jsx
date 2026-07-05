import { useState, useEffect } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { createGroup, updateMyGroupMember } from '../lib/api'
import { DEFAULT_THEME } from '../lib/constants'
import AvatarEditor from '../components/AvatarEditor'
import Switch from '../components/Switch'

export default function CreateGroup() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { setBackHandler } = useOutletContext()

  const [step, setStep] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // 1단계: 그룹 정보
  const [ginfo, setGinfo] = useState({ name: '', description: '', showContact: false, showBirthdate: false })
  const setG = (patch) => setGinfo((f) => ({ ...f, ...patch }))
  const [nameErr, setNameErr] = useState('')

  // 2단계: 소유자의 그룹 내 프로필
  const [prof, setProf] = useState({ display_nickname: '', avatar_url: '', show_contact: false, show_birthdate: false })
  const setP = (patch) => setProf((f) => ({ ...f, ...patch }))
  const [nickErr, setNickErr] = useState('')

  // 상단바 < 버튼: 2단계면 1단계로 (이전 버튼 대체), 1단계면 기본(내 그룹)
  useEffect(() => {
    setBackHandler(() => (step === 2 ? () => setStep(1) : null))
  }, [step, setBackHandler])
  useEffect(() => () => setBackHandler(() => null), [setBackHandler])

  function next(e) {
    e.preventDefault()
    if (!ginfo.name.trim()) { setNameErr('그룹명을 입력해 주세요.'); return }
    setNameErr(''); setError(''); setStep(2)
  }

  async function finish() {
    if (!prof.display_nickname.trim()) { setNickErr('닉네임을 입력해 주세요.'); return }
    setNickErr(''); setBusy(true); setError('')
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
        display_nickname: prof.display_nickname.trim(),
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
            <input autoFocus value={ginfo.name}
              onChange={(e) => { setG({ name: e.target.value }); if (nameErr) setNameErr('') }}
              placeholder="그룹 이름" />
            {nameErr && <span className="field-error">{nameErr}</span>}
          </label>
          <label className="field"><span>설명 (선택)</span>
            <input value={ginfo.description} onChange={(e) => setG({ description: e.target.value })} placeholder="설명" /></label>

          <div className="switch-row">
            <span>멤버 연락처 공개 허용</span>
            <Switch checked={ginfo.showContact} onChange={(v) => setG({ showContact: v })} />
          </div>
          <div className="switch-row">
            <span>멤버 생년월일 공개 허용</span>
            <Switch checked={ginfo.showBirthdate} onChange={(v) => setG({ showBirthdate: v })} />
          </div>

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

        <label className="field"><span>닉네임 *</span>
          <input value={prof.display_nickname}
            onChange={(e) => { setP({ display_nickname: e.target.value }); if (nickErr) setNickErr('') }}
            placeholder="그룹 내에서 사용할 닉네임을 입력해 주세요" />
          {nickErr && <span className="field-error">{nickErr}</span>}
        </label>

        {ginfo.showContact && (
          <div className="switch-row">
            <span>이 그룹에 내 연락처 공개</span>
            <Switch checked={prof.show_contact} onChange={(v) => setP({ show_contact: v })} />
          </div>
        )}
        {ginfo.showBirthdate && (
          <div className="switch-row">
            <span>이 그룹에 내 생년월일 공개</span>
            <Switch checked={prof.show_birthdate} onChange={(v) => setP({ show_birthdate: v })} />
          </div>
        )}

        {error && <div className="alert alert-error">{error}</div>}
        <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={finish}>
          {busy ? '만드는 중…' : '그룹 만들기'}
        </button>
      </div>
    </div>
  )
}
