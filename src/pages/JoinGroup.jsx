import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { joinGroupWithProfile } from '../lib/api'
import AvatarEditor from '../components/AvatarEditor'
import CgToggle from '../components/CgToggle'
import InviteCodeSheet from '../components/InviteCodeSheet'
import { DEFAULT_GROUP_BG } from '../lib/constants'

function firstChar(s) { return s ? Array.from(String(s).trim())[0] || '' : '' }

// 그룹 아이콘: 이모지가 있으면 이모지, 없으면 그룹명 첫 글자
function GroupIcon({ emoji, bg, name }) {
  const has = emoji && emoji.trim()
  return (
    <span className="jg-pv-emoji" style={{ background: has ? (bg || DEFAULT_GROUP_BG) : '#eeebfe' }}>
      {has ? emoji.trim() : firstChar(name)}
    </span>
  )
}

// 그룹 가입 STEP 2 — 그룹 정보 프리뷰 + 프로필·닉네임 + 공개 설정(시안 12c·12d)
export default function JoinGroup() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [preview, setPreview] = useState(location.state?.preview || null)
  const [code, setCode] = useState(location.state?.code || '')
  const [sheetOpen, setSheetOpen] = useState(!location.state?.preview)

  const [form, setForm] = useState({ display_nickname: '', avatar_url: '', show_contact: false, show_birthdate: false, show_ott: false })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [nickErr, setNickErr] = useState('')
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  function onCodeSuccess(g, c) {
    setPreview(g); setCode(c)
    setForm({ display_nickname: '', avatar_url: '', show_contact: false, show_birthdate: false, show_ott: false })
    setNickErr('')
    setSheetOpen(false)
  }

  async function join() {
    // 닉네임 필수: 비우면 다른 멤버에게 아이디가 노출되므로 반드시 그룹 표시 닉네임을 받는다.
    if (!form.display_nickname.trim()) { setNickErr('닉네임을 입력해 주세요.'); return }
    setBusy(true); setError(''); setNickErr('')
    try {
      await joinGroupWithProfile(code.trim(), profile.id, form)
      navigate(`/groups/${preview.id}`)
    } catch (err) { setError(err.message); setBusy(false) }
  }

  // 코드 미입력(직접 진입) → 코드 입력 시트만 표시
  if (!preview) {
    return (
      <div className="page">
        <InviteCodeSheet open={sheetOpen} onClose={() => navigate('/')} onSuccess={onCodeSuccess} />
      </div>
    )
  }

  const anyPublic = preview.show_contact || preview.show_birthdate || preview.show_ott

  return (
    <div className="page jg-page">
      {/* 그룹 프리뷰 */}
      <div className="jg-preview">
        <div className="jg-pv-top">
          <GroupIcon emoji={preview.emoji} bg={preview.emoji_bg} name={preview.name} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="jg-pv-name">{preview.name}</div>
            {preview.description && <div className="jg-pv-desc">{preview.description}</div>}
          </div>
        </div>
        <div className="jg-pv-div" />
        <div className="jg-owner">
          <span className="jg-owner-av" style={{ background: '#9aa0ac' }}>
            {preview.owner_avatar ? <img src={preview.owner_avatar} alt="" /> : firstChar(preview.owner_nickname)}
          </span>
          <span className="jg-owner-name">{preview.owner_nickname}</span>
          <span className="jg-owner-badge"><span aria-hidden="true">👑</span>소유자</span>
        </div>
      </div>

      <div className="jg-section-title">이 그룹에서 사용할 내 정보</div>

      {/* 프로필 사진 */}
      <div className="jg-photo">
        <AvatarEditor value={form.avatar_url} name={form.display_nickname || profile?.login_id}
          userId={profile?.id} emptyIcon onChange={(v) => set({ avatar_url: v })} onError={setError} />
        <div className="jg-photo-label">프로필 사진 <span>선택</span></div>
      </div>

      {/* 닉네임 */}
      <div className="jg-field">
        <div className="jg-label">닉네임 <span className="jg-req">*</span></div>
        <input className={`jg-input ${nickErr ? 'err' : ''}`} value={form.display_nickname} maxLength={12}
          onChange={(e) => { set({ display_nickname: e.target.value }); if (e.target.value.trim()) setNickErr('') }}
          placeholder="이 그룹에서 불릴 이름" aria-invalid={!!nickErr} />
        {nickErr && <div className="jg-field-err">{nickErr}</div>}
      </div>

      {anyPublic ? (
        <>
          {/* 공개 설정 (그룹이 허용한 항목) */}
          <div className="jg-pub">
            <div className="jg-section-title" style={{ marginTop: 0 }}>이 그룹에 공개할 내 정보</div>
            <div className="jg-pub-sub">그룹이 허용한 항목만 공개할 수 있어요. 언제든 바꿀 수 있어요.</div>
          </div>
          <div className="jg-toggles">
            {preview.show_contact && (
              <div className="jg-trow">
                <span className="jg-tico" style={{ background: '#e6eefd' }}>📞</span>
                <div className="jg-tmain">
                  <div className="jg-ttitle">연락처 공개</div>
                  <div className="jg-tdesc">내 연락처를 이 그룹 멤버에게 공개해요</div>
                </div>
                <CgToggle on={form.show_contact} onClick={() => set({ show_contact: !form.show_contact })} />
              </div>
            )}
            {preview.show_birthdate && (
              <div className="jg-trow">
                <span className="jg-tico" style={{ background: '#fde8ee' }}>🎂</span>
                <div className="jg-tmain">
                  <div className="jg-ttitle">생년월일 공개</div>
                  <div className="jg-tdesc">내 생일을 이 그룹 멤버에게 공개해요</div>
                </div>
                <CgToggle on={form.show_birthdate} onClick={() => set({ show_birthdate: !form.show_birthdate })} />
              </div>
            )}
            {preview.show_ott && (
              <div className="jg-trow">
                <span className="jg-tico" style={{ background: '#eeebfe' }}>📺</span>
                <div className="jg-tmain">
                  <div className="jg-ttitle">구독 OTT 공개</div>
                  <div className="jg-tdesc">내 구독 OTT를 이 그룹 멤버에게 공개해요</div>
                </div>
                <CgToggle on={form.show_ott} onClick={() => set({ show_ott: !form.show_ott })} />
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="jg-locked">
          <span className="jg-locked-ico" aria-hidden="true">
            <svg width="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="10.5" width="16" height="10" rx="2" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /></svg>
          </span>
          <div className="jg-locked-text">이 그룹은 <b>프로필 사진과 닉네임</b>만 사용해요.<br />연락처·생년월일·구독 OTT 정보는 공개되지 않아요.</div>
        </div>
      )}

      {error && <div className="alert alert-error" style={{ marginTop: 16 }}>{error}</div>}

      <button type="button" className="jg-join" onClick={join} disabled={busy}>
        <svg width="17" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><circle cx="7" cy="7" r="2.4" /><circle cx="12" cy="5.4" r="2.4" /><circle cx="17" cy="7" r="2.4" /><path d="M12 10c3.4 0 6 2.4 6 5.2 0 2-1.7 3.3-3.4 2.7-1-.4-1.7-.6-2.6-.6s-1.6.2-2.6.6C7.7 18.5 6 17.2 6 15.2 6 12.4 8.6 10 12 10Z" /></svg>
        {busy ? '가입 중…' : '가입하기'}
      </button>
    </div>
  )
}
