import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { adminListDailyQuestDefs, adminUpsertDailyQuestDef } from '../../lib/api'

// 이모지 배경색 프리셋(시안 8종)
const BG_PRESETS = ['#f0eee9', '#eeebfe', '#eafaf0', '#fdf2f3', '#fff7e0', '#e6f4fd', '#fde8d8', '#e4e2f9']
const sameColor = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()

// 데일리 퀘스트 수정(/admin/quests/daily/:key) — key 는 고정, 이모지·배경색·명칭·보상만 편집
export default function AdminDailyQuestDetail() {
  const { key } = useParams()
  const nav = useNavigate()
  const [q, setQ] = useState(null)
  const [title, setTitle] = useState('')
  const [emoji, setEmoji] = useState('')
  const [bg, setBg] = useState('')
  const bgRef = useRef(null)
  const pickBg = (c) => { setBg(c); if (bgRef.current) bgRef.current.value = c }
  const [reward, setReward] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const rows = await adminListDailyQuestDefs()
      const found = rows.find((x) => x.key === key)
      if (!found) { setError('데일리 퀘스트를 찾을 수 없어요.'); return }
      setQ(found); setTitle(found.title || ''); setEmoji(found.emoji || ''); setBg(found.emoji_bg || ''); setReward(String(found.reward ?? ''))
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [key])
  useEffect(() => { load() }, [load])

  async function save(e) {
    e.preventDefault(); setError('')
    if (!title.trim()) { setError('제목을 입력해 주세요.'); return }
    const hex = bg.trim()
    if (hex && !/^#[0-9a-fA-F]{6}$/.test(hex)) { setError('배경색은 #RRGGBB 형식으로 입력해 주세요.'); return }
    setBusy(true)
    try {
      await adminUpsertDailyQuestDef({ key, title: title.trim(), emoji: emoji.trim(), emoji_bg: hex, reward })
      nav('/admin/quests', { replace: true })
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  if (loading) return <div className="page admin-page"><div className="spinner" /></div>

  return (
    <div className="page admin-page">
      {error && <div className="alert alert-error">{error}</div>}
      {q && (
        <div className="aq-form-wrap">
          <h2 className="aq-form-title">데일리 퀘스트 수정</h2>
          <form onSubmit={save} className="aq-form" key={key}>
            <div className="aq-frow">
              <label className="aq-flabel" htmlFor="dq-title">제목 <span className="aq-required">*</span></label>
              <input id="dq-title" defaultValue={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 출석하기" />
            </div>
            <div className="aq-frow">
              <label className="aq-flabel" htmlFor="dq-emoji">아이콘</label>
              <div className="aq-icon-row">
                <input id="dq-emoji" className="aq-icon-input" defaultValue={emoji} onChange={(e) => setEmoji(e.target.value)}
                  placeholder="🗓️" maxLength={16} autoCapitalize="none" style={bg ? { background: bg } : undefined} />
                <div className="aq-swatch-row">
                  {BG_PRESETS.map((c) => (
                    <button key={c} type="button" className={`aq-swatch ${sameColor(bg, c) ? 'active' : ''}`}
                      style={{ background: c }} onClick={() => pickBg(c)} aria-label={c} title={c} />
                  ))}
                </div>
                <input id="dq-bg" ref={bgRef} className="aq-hex" defaultValue={bg} onChange={(e) => setBg(e.target.value)}
                  placeholder="#RRGGBB" maxLength={7} autoCapitalize="none" spellCheck={false} />
              </div>
            </div>
            <div className="aq-frow">
              <label className="aq-flabel" htmlFor="dq-reward">보상</label>
              <div className="aq-reward-row">
                <input id="dq-reward" type="number" inputMode="numeric" min="0" defaultValue={reward} onChange={(e) => setReward(e.target.value)} placeholder="예: 10" />
                <span className="aq-unit">츄르</span>
              </div>
            </div>
            <div className="admin-notif-preview">
              <span className="admin-notif-preview-ico" style={bg ? { background: bg } : undefined} aria-hidden="true">{emoji || '✦'}</span>
              <div>
                <div className="admin-notif-preview-t">{title || '퀘스트 명칭'}</div>
                <div className="admin-notif-preview-b">보상 {reward || 0} 츄르</div>
              </div>
            </div>
            <p className="aq-note">데일리 퀘스트는 매일 자정에 초기화되며, 세 개로 고정되어 있어 추가·삭제할 수 없어요. 항상 전체 회원에게 노출돼요.</p>
            <div className="aq-actions">
              <div className="aq-actions-right">
                <button type="button" className="aq-btn-cancel" onClick={() => nav('/admin/quests')}>취소</button>
                <button type="submit" className="aq-btn-save" disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
