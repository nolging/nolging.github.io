import { useState, useEffect } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { createGroup, updateMyGroupMember } from '../lib/api'
import { DEFAULT_THEME } from '../lib/constants'
import AvatarEditor from '../components/AvatarEditor'

// 시안 팔레트: 배경 없음(투명) + 파스텔 6색
const CG_BGS = ['transparent', '#eeebfe', '#e8f4ec', '#fdeee6', '#e6eefd', '#fde8ee', '#fbf1d3']
const DEFAULT_CG_BG = '#eeebfe'

// 입력에서 마지막 이모지(그래핌) 하나만 취함 → 새로 입력하면 자연스럽게 교체
function lastGrapheme(str) {
  const s = (str || '').trim()
  if (!s) return ''
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    let out = ''
    for (const { segment } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)) out = segment
    return out
  }
  const arr = Array.from(s)
  return arr[arr.length - 1] || ''
}

function Chevron() {
  return (
    <svg width="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18" /></svg>
  )
}
function Check() {
  return (
    <svg width="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
  )
}
function FriendsIcon() {
  return (
    <svg width="17" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
      <circle cx="7" cy="7" r="2.4" /><circle cx="12" cy="5.4" r="2.4" /><circle cx="17" cy="7" r="2.4" />
      <path d="M12 10c3.4 0 6 2.4 6 5.2 0 2-1.7 3.3-3.4 2.7-1-.4-1.7-.6-2.6-.6s-1.6.2-2.6.6C7.7 18.5 6 17.2 6 15.2 6 12.4 8.6 10 12 10Z" />
    </svg>
  )
}

// 시안 스타일 토글(보라). locked 면 잠금(회색·조작 불가)
function CgToggle({ on, locked, onClick }) {
  if (locked) return <span className="cg-toggle locked" aria-hidden="true"><span className="cg-knob" /></span>
  return (
    <span className={`cg-toggle ${on ? 'on' : ''}`} role="switch" aria-checked={on} onClick={onClick}>
      <span className="cg-knob" />
    </span>
  )
}

const POLICY_ROWS = [
  { key: 'contact', icon: '📞', iconBg: '#e6eefd', title: '연락처 공개 허용', sub: '멤버들의 연락처를 공개할 수 있어요', field: 'showContact' },
  { key: 'birth', icon: '🎂', iconBg: '#fde8ee', title: '생년월일 공개 허용', sub: '생일을 미리 알고 챙길 수 있어요', field: 'showBirthdate' },
  { key: 'ott', icon: '📺', iconBg: '#eeebfe', title: '구독 OTT 공개 허용', sub: '멤버들의 구독 서비스를 공개할 수 있어요', field: 'showOtt' },
]
const MEMBER_ROWS = [
  { key: 'contact', icon: '📞', iconBg: '#e6eefd', title: '그룹 내 연락처 공개', sub: '내 연락처를 이 그룹 멤버에게 공개해요', lockedSub: '그룹에서 연락처 공개를 비허용했어요', groupField: 'showContact', field: 'show_contact' },
  { key: 'birth', icon: '🎂', iconBg: '#fde8ee', title: '그룹 내 생년월일 공개', sub: '내 생일을 이 그룹 멤버에게 공개해요', lockedSub: '그룹에서 생년월일 공개를 비허용했어요', groupField: 'showBirthdate', field: 'show_birthdate' },
  { key: 'ott', icon: '📺', iconBg: '#eeebfe', title: '그룹 내 구독 OTT 공개', sub: '내 구독 OTT를 이 그룹 멤버에게 공개해요', lockedSub: '그룹에서 구독 OTT 공개를 비허용했어요', groupField: 'showOtt', field: 'show_ott' },
]

export default function CreateGroup() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { setBackHandler } = useOutletContext()

  const [step, setStep] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // 1단계: 그룹 정보
  const [ginfo, setGinfo] = useState({ name: '', description: '', emoji: '', emojiBg: DEFAULT_CG_BG, showContact: false, showBirthdate: false, showOtt: false })
  const setG = (patch) => setGinfo((f) => ({ ...f, ...patch }))
  const [nameErr, setNameErr] = useState('')

  // 2단계: 소유자의 그룹 내 프로필
  const [prof, setProf] = useState({ display_nickname: '', avatar_url: '', show_contact: false, show_birthdate: false, show_ott: false })
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
        emoji: ginfo.emoji,
        emojiBg: ginfo.emojiBg,
        showContact: ginfo.showContact,
        showBirthdate: ginfo.showBirthdate,
        showOtt: ginfo.showOtt,
      })
      await updateMyGroupMember(group.id, profile.id, {
        display_nickname: prof.display_nickname.trim(),
        avatar_url: prof.avatar_url || null,
        show_contact: ginfo.showContact && !!prof.show_contact,
        show_birthdate: ginfo.showBirthdate && !!prof.show_birthdate,
        show_ott: ginfo.showOtt && !!prof.show_ott,
      })
      navigate(`/groups/${group.id}`)
    } catch (err) { setError(err.message); setBusy(false) }
  }

  const stepper = (
    <div className="cg-stepper">
      <span className={`cg-step-num ${step === 1 ? 'active' : 'done'}`}>{step === 1 ? '1' : <Check />}</span>
      <span className={`cg-step-label ${step === 1 ? 'active' : ''}`}>그룹 정보</span>
      <span className={`cg-step-line ${step === 2 ? 'done' : ''}`} />
      <span className={`cg-step-num ${step === 2 ? 'active' : ''}`}>2</span>
      <span className={`cg-step-label ${step === 2 ? 'active' : ''}`}>내 정보</span>
    </div>
  )

  // ---- 1단계: 그룹 정보 ----
  if (step === 1) {
    return (
      <div className="page cg-page">
        {stepper}
        <form onSubmit={next} className="cg-form">
          {/* 대표 이모지 + 배경 색 */}
          <div className="cg-emoji-card">
            <div className="cg-emoji-top">
              <input className="cg-emoji-input" style={{ background: ginfo.emojiBg }}
                value={ginfo.emoji} maxLength={8} placeholder="+" aria-label="대표 이모지 입력"
                onChange={(e) => setG({ emoji: lastGrapheme(e.target.value) })} />
              <div className="cg-emoji-guide">그룹을 나타낼 이모지를 직접 입력해 주세요<br /><span>비워 둬도 괜찮아요</span></div>
            </div>
            <div className="cg-emoji-div" />
            <div className="cg-bg-label">배경 색</div>
            <div className="cg-swatches">
              {CG_BGS.map((c) => (
                <button type="button" key={c}
                  className={`cg-swatch ${c === 'transparent' ? 'none' : ''} ${ginfo.emojiBg === c ? 'active' : ''}`}
                  style={c !== 'transparent' ? { background: c } : undefined}
                  onClick={() => setG({ emojiBg: c })}
                  aria-label={c === 'transparent' ? '배경 없음' : `배경색 ${c}`} />
              ))}
            </div>
          </div>

          {/* 그룹 이름 */}
          <div className="cg-field cg-mt-20">
            <div className="cg-label">그룹 이름 <span className="cg-req">*</span></div>
            <div className="cg-input-wrap">
              <input className="cg-input has-count" value={ginfo.name} maxLength={9}
                onChange={(e) => { setG({ name: e.target.value }); if (nameErr) setNameErr('') }}
                placeholder="예) 넷플릭스 앤 칠" />
              <span className="cg-count cg-count-mid">{ginfo.name.length}/9</span>
            </div>
            {nameErr && <span className="field-error">{nameErr}</span>}
          </div>

          {/* 코멘트 */}
          <div className="cg-field cg-mt-16">
            <div className="cg-label">코멘트 <span className="cg-opt">선택</span></div>
            <div className="cg-input-wrap">
              <input className="cg-input has-count" value={ginfo.description} maxLength={14}
                onChange={(e) => setG({ description: e.target.value })}
                placeholder="그룹을 소개하는 한마디를 남겨 보세요" />
              <span className="cg-count cg-count-mid">{ginfo.description.length}/14</span>
            </div>
          </div>

          {/* 공개 허용 설정 */}
          <div className="cg-section cg-mt-24">
            <div className="cg-section-title">공개 허용 설정</div>
            <div className="cg-section-sub">허용한 항목은 멤버가 각자 공개 여부를 정할 수 있어요.</div>
          </div>
          <div className="cg-list cg-mt-12">
            {POLICY_ROWS.map((row) => (
              <div className="cg-row" key={row.key}>
                <span className="cg-row-icon" style={{ background: row.iconBg }}>{row.icon}</span>
                <div className="cg-row-main">
                  <div className="cg-row-title">{row.title} <span className="cg-req">*</span></div>
                  <div className="cg-row-sub">{row.sub}</div>
                </div>
                <CgToggle on={ginfo[row.field]} onClick={() => setG({ [row.field]: !ginfo[row.field] })} />
              </div>
            ))}
          </div>

          {error && <div className="alert alert-error cg-mt-16">{error}</div>}
          <div className="cg-footer">
            <button className="cg-btn-primary">다음 <Chevron /></button>
            <div className="cg-footer-hint">다음 단계에서 이 그룹에 사용할 내 프로필을 설정해요</div>
          </div>
        </form>
      </div>
    )
  }

  // ---- 2단계: 소유자 프로필 설정 ----
  return (
    <div className="page cg-page">
      {stepper}
      <div className="cg-form">
        <div className="cg-continuity"><span>이 그룹에서 사용할 <b>내 정보</b>를 설정해요</span></div>

        <div className="cg-avatar-wrap">
          <AvatarEditor value={prof.avatar_url} name={prof.display_nickname || profile?.nickname}
            userId={profile?.id} onChange={(v) => setP({ avatar_url: v })} onError={setError} emptyIcon />
          <div className="cg-avatar-cap">프로필 사진 <span>선택</span></div>
        </div>

        {/* 닉네임 */}
        <div className="cg-field cg-mt-22">
          <div className="cg-label">닉네임 <span className="cg-req">*</span></div>
          <div className="cg-input-wrap">
            <input className="cg-input" value={prof.display_nickname} maxLength={12}
              onChange={(e) => { setP({ display_nickname: e.target.value }); if (nickErr) setNickErr('') }}
              placeholder="이 그룹에서 불릴 이름" />
          </div>
          {nickErr && <span className="field-error">{nickErr}</span>}
        </div>

        {/* 이 그룹에 공개할 내 정보 */}
        <div className="cg-section cg-mt-24">
          <div className="cg-section-title">이 그룹에 공개할 내 정보</div>
          <div className="cg-section-sub">그룹이 허용한 항목만 공개할 수 있어요.</div>
        </div>
        <div className="cg-list cg-mt-12">
          {MEMBER_ROWS.map((row) => {
            const allowed = ginfo[row.groupField]
            return (
              <div className="cg-row" key={row.key}>
                <span className="cg-row-icon" style={{ background: row.iconBg }}>{row.icon}</span>
                <div className="cg-row-main">
                  <div className="cg-row-title">{row.title}</div>
                  <div className="cg-row-sub">{allowed ? row.sub : row.lockedSub}</div>
                </div>
                {allowed
                  ? <CgToggle on={prof[row.field]} onClick={() => setP({ [row.field]: !prof[row.field] })} />
                  : <CgToggle locked />}
              </div>
            )
          })}
        </div>

        {error && <div className="alert alert-error cg-mt-16">{error}</div>}
        <div className="cg-footer cg-footer-row">
          <button type="button" className="cg-btn-back" onClick={() => setStep(1)}>이전</button>
          <button type="button" className="cg-btn-primary cg-btn-flex" disabled={busy} onClick={finish}>
            {busy ? '만드는 중…' : <><FriendsIcon /> 그룹 만들기</>}
          </button>
        </div>
      </div>
    </div>
  )
}
