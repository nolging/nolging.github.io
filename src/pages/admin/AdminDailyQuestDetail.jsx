import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { adminListDailyQuestDefs, adminUpsertDailyQuestDef } from '../../lib/api'

// 이모지 배경색 프리셋(마이 페이지 데일리 퀘스트 카드에 쓰이는 파스텔 톤)
const BG_PRESETS = ['#eef1fb', '#e8f4ec', '#fde8ee', '#fdeee6', '#fff0d6', '#eaf3fb', '#eeebfe']
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
    if (!title.trim()) { setError('명칭을 입력해 주세요.'); return }
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
        <div className="card">
          <form onSubmit={save} className="form" key={key}>
            <div className="field field-narrow"><label htmlFor="dq-emoji">이모지</label>
              <input id="dq-emoji" defaultValue={emoji} onChange={(e) => setEmoji(e.target.value)}
                placeholder="예: 🗓️" maxLength={16} autoCapitalize="none" /></div>
            <div className="field"><label htmlFor="dq-bg">이모지 배경색</label>
              <div className="an-bg-row">
                {BG_PRESETS.map((c) => (
                  <button key={c} type="button" className={`an-bg-swatch ${sameColor(bg, c) ? 'active' : ''}`}
                    style={{ background: c }} onClick={() => pickBg(c)} aria-label={c} title={c} />
                ))}
              </div>
              <input id="dq-bg" ref={bgRef} className="an-bg-hex" defaultValue={bg} onChange={(e) => setBg(e.target.value)}
                placeholder="#RRGGBB" maxLength={7} autoCapitalize="none" spellCheck={false} />
            </div>
            <div className="field"><label htmlFor="dq-title">퀘스트 명칭 *</label>
              <input id="dq-title" defaultValue={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 출석하기" /></div>
            <div className="field field-narrow"><label htmlFor="dq-reward">보상(츄르) *</label>
              <input id="dq-reward" type="number" inputMode="numeric" min="0" defaultValue={reward} onChange={(e) => setReward(e.target.value)} placeholder="예: 1" /></div>
            <div className="admin-notif-preview">
              <span className="admin-notif-preview-ico" style={bg ? { background: bg } : undefined} aria-hidden="true">{emoji || '✦'}</span>
              <div>
                <div className="admin-notif-preview-t">{title || '퀘스트 명칭'}</div>
                <div className="admin-notif-preview-b">보상 {reward || 0} 츄르</div>
              </div>
            </div>
            <button className="btn btn-primary btn-block" disabled={busy}>{busy ? '저장 중…' : '수정 저장'}</button>
          </form>
        </div>
      )}
    </div>
  )
}
