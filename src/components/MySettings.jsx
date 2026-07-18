import { useState } from 'react'
import { updateMyGroupMember } from '../lib/api'
import { deleteAvatarByUrl } from '../lib/storage'
import AvatarEditor from './AvatarEditor'
import GroupBadge from './GroupBadge'
import CgToggle from './CgToggle'

const MEMBER_ROWS = [
  { key: 'contact', icon: '📞', iconBg: '#e6eefd', title: '그룹 내 연락처 공개', sub: '내 연락처를 이 그룹 멤버에게 공개해요', lockedSub: '그룹에서 연락처 공개를 비허용했어요', groupField: 'show_contact', field: 'show_contact' },
  { key: 'birth', icon: '🎂', iconBg: '#fde8ee', title: '그룹 내 생년월일 공개', sub: '내 생일을 이 그룹 멤버에게 공개해요', lockedSub: '그룹에서 생년월일 공개를 비허용했어요', groupField: 'show_birthdate', field: 'show_birthdate' },
  { key: 'ott', icon: '📺', iconBg: '#eeebfe', title: '그룹 내 구독 OTT 공개', sub: '내 구독 OTT를 이 그룹 멤버에게 공개해요', lockedSub: '그룹에서 구독 OTT 공개를 비허용했어요', groupField: 'show_ott', field: 'show_ott' },
]

// 10b 내 정보(그룹 내) 수정 (그룹 만들기 STEP2와 동일 항목의 편집 모드)
export default function MySettings({ group, me, onSaved, secondary }) {
  const [form, setForm] = useState({
    display_nickname: me?.display_nickname || '',
    avatar_url: me?.avatar_url || '',
    show_contact: !!me?.show_contact,
    show_birthdate: !!me?.show_birthdate,
    show_ott: !!me?.show_ott,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [nickErr, setNickErr] = useState('')
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  // 명찰 효과로 내 닉네임이 잠긴 경우 → 닉네임만 수정 불가
  const nickLockedUntil = me?.nick_locked_until ? new Date(me.nick_locked_until) : null
  const nickLocked = !!nickLockedUntil && nickLockedUntil > new Date()
  const lockLeftH = nickLocked ? Math.max(1, Math.ceil((nickLockedUntil - new Date()) / 3600000)) : 0

  async function save() {
    if (!form.display_nickname.trim()) { setNickErr('닉네임을 입력해 주세요.'); return }
    setBusy(true); setError('')
    try {
      await updateMyGroupMember(group.id, me.user_id, {
        display_nickname: form.display_nickname.trim(),
        avatar_url: form.avatar_url || null,
        show_contact: group.show_contact && form.show_contact,
        show_birthdate: group.show_birthdate && form.show_birthdate,
        show_ott: group.show_ott && form.show_ott,
      })
      if (me.avatar_url && me.avatar_url !== form.avatar_url) deleteAvatarByUrl(me.avatar_url)
      onSaved()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <div className="page cg-page">
      <div className="cg-form">
        <div className="cg-continuity">
          {group.emoji && <GroupBadge emoji={group.emoji} bg={group.emoji_bg} name={group.name} size={32} radius={11} />}
          <span><b>{group.name}</b>에서 사용할 내 정보예요</span>
        </div>

        <div className="cg-avatar-wrap">
          <AvatarEditor value={form.avatar_url} name={form.display_nickname || me?.login_id}
            userId={me?.user_id} onChange={(v) => set({ avatar_url: v })} onError={setError} emptyIcon />
          <div className="cg-avatar-cap">프로필 사진 <span>선택</span></div>
        </div>

        {/* 닉네임 */}
        <div className="cg-field cg-mt-22">
          <div className="cg-label">닉네임 <span className="cg-req">*</span></div>
          <div className="cg-input-wrap">
            <input className="cg-input" value={form.display_nickname} maxLength={12} disabled={nickLocked}
              onChange={(e) => { set({ display_nickname: e.target.value }); if (nickErr) setNickErr('') }}
              placeholder="이 그룹에서 불릴 이름" />
          </div>
          {nickLocked
            ? <span className="field-error">🏷️ 명찰 효과로 지금은 닉네임을 바꿀 수 없어요. (약 {lockLeftH}시간 남음)</span>
            : nickErr && <span className="field-error">{nickErr}</span>}
        </div>

        {/* 이 그룹에 공개할 내 정보 */}
        <div className="cg-section cg-mt-24">
          <div className="cg-section-title">이 그룹에 공개할 내 정보</div>
          <div className="cg-section-sub">그룹이 허용한 항목만 공개할 수 있어요.</div>
        </div>
        <div className="cg-list cg-mt-12">
          {MEMBER_ROWS.map((row) => {
            const allowed = group[row.groupField]
            return (
              <div className="cg-row" key={row.key}>
                <span className="cg-row-icon" style={{ background: row.iconBg }}>{row.icon}</span>
                <div className="cg-row-main">
                  <div className="cg-row-title">{row.title}</div>
                  <div className="cg-row-sub">{allowed ? row.sub : row.lockedSub}</div>
                </div>
                {allowed
                  ? <CgToggle on={form[row.field]} onClick={() => set({ [row.field]: !form[row.field] })} />
                  : <CgToggle locked />}
              </div>
            )
          })}
        </div>

        {error && <div className="alert alert-error cg-mt-16">{error}</div>}
        <div className="cg-footer">
          <button type="button" className="cg-btn-primary" disabled={busy} onClick={save}>{busy ? '저장 중…' : '저장'}</button>
          {secondary && (secondary.danger
            ? <div className="cg-footer-center"><button type="button" className="cg-danger-link" onClick={secondary.onClick}>{secondary.label}</button></div>
            : <button type="button" className="cg-btn-outline cg-mt-10" onClick={secondary.onClick}>{secondary.label}</button>)}
        </div>
      </div>
    </div>
  )
}
