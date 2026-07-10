import { useState } from 'react'
import { updateGroup } from '../lib/api'
import { CG_BGS, DEFAULT_CG_BG, lastGrapheme } from '../lib/cgForm'
import CgToggle from './CgToggle'

const POLICY_ROWS = [
  { key: 'contact', icon: '📞', iconBg: '#e6eefd', title: '연락처 공개 허용', sub: '멤버들의 연락처를 공개할 수 있어요', field: 'show_contact' },
  { key: 'birth', icon: '🎂', iconBg: '#fde8ee', title: '생년월일 공개 허용', sub: '생일을 미리 알고 챙길 수 있어요', field: 'show_birthdate' },
  { key: 'ott', icon: '📺', iconBg: '#eeebfe', title: '구독 OTT 공개 허용', sub: '멤버들의 구독 서비스를 공개할 수 있어요', field: 'show_ott' },
]

// 10a 그룹 정보 수정 (그룹 만들기 STEP1과 동일 항목의 편집 모드)
export default function GroupSettings({ group, onSaved, onDelete }) {
  const [form, setForm] = useState({
    name: group.name,
    description: group.description || '',
    emoji: group.emoji || '',
    emoji_bg: group.emoji_bg || DEFAULT_CG_BG,
    show_contact: group.show_contact,
    show_birthdate: group.show_birthdate,
    show_ott: group.show_ott,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [nameErr, setNameErr] = useState('')
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  async function save(e) {
    e.preventDefault()
    if (!form.name.trim()) { setNameErr('그룹명을 입력해 주세요.'); return }
    setBusy(true); setError('')
    try {
      const saved = await updateGroup(group.id, {
        name: form.name.trim(),
        description: form.description.trim(),
        emoji: form.emoji || null,
        emoji_bg: form.emoji_bg || null,
        show_contact: form.show_contact,
        show_birthdate: form.show_birthdate,
        show_ott: form.show_ott,
      })
      onSaved(saved)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <form onSubmit={save} className="page cg-page">
      <div className="cg-form">
        {/* 대표 이모지 + 배경 색 */}
        <div className="cg-emoji-card">
          <div className="cg-emoji-top">
            <input className="cg-emoji-input" style={{ background: form.emoji_bg }}
              value={form.emoji} maxLength={8} placeholder="+" aria-label="대표 이모지 입력"
              onChange={(e) => set({ emoji: lastGrapheme(e.target.value) })} />
            <div className="cg-emoji-guide">그룹을 나타낼 이모지를 직접 입력해 주세요<br /><span>비워 둬도 괜찮아요</span></div>
          </div>
          <div className="cg-emoji-div" />
          <div className="cg-bg-label">배경 색</div>
          <div className="cg-swatches">
            {CG_BGS.map((c) => (
              <button type="button" key={c}
                className={`cg-swatch ${c === 'transparent' ? 'none' : ''} ${form.emoji_bg === c ? 'active' : ''}`}
                style={c !== 'transparent' ? { background: c } : undefined}
                onClick={() => set({ emoji_bg: c })}
                aria-label={c === 'transparent' ? '배경 없음' : `배경색 ${c}`} />
            ))}
          </div>
        </div>

        {/* 그룹 이름 */}
        <div className="cg-field cg-mt-20">
          <div className="cg-label">그룹 이름 <span className="cg-req">*</span></div>
          <div className="cg-input-wrap">
            <input className="cg-input has-count" value={form.name} maxLength={9}
              onChange={(e) => { set({ name: e.target.value }); if (nameErr) setNameErr('') }}
              placeholder="예) 넷플릭스 앤 칠" />
            <span className="cg-count cg-count-mid">{form.name.length}/9</span>
          </div>
          {nameErr && <span className="field-error">{nameErr}</span>}
        </div>

        {/* 코멘트 */}
        <div className="cg-field cg-mt-16">
          <div className="cg-label">코멘트 <span className="cg-opt">선택</span></div>
          <div className="cg-input-wrap">
            <input className="cg-input has-count" value={form.description} maxLength={14}
              onChange={(e) => set({ description: e.target.value })}
              placeholder="그룹을 소개하는 한마디를 남겨 보세요" />
            <span className="cg-count cg-count-mid">{form.description.length}/14</span>
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
                <div className="cg-row-title">{row.title}</div>
                <div className="cg-row-sub">{row.sub}</div>
              </div>
              <CgToggle on={form[row.field]} onClick={() => set({ [row.field]: !form[row.field] })} />
            </div>
          ))}
        </div>

        {error && <div className="alert alert-error cg-mt-16">{error}</div>}
        <div className="cg-footer">
          <button type="submit" className="cg-btn-primary" disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
          {onDelete && (
            <div className="cg-footer-center">
              <button type="button" className="cg-danger-link" onClick={onDelete}>그룹 삭제하기</button>
            </div>
          )}
        </div>
      </div>
    </form>
  )
}
