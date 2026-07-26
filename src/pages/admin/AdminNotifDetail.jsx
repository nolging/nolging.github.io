import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { listNotifTemplates, updateNotifTemplate } from '../../lib/api'

// 알림센터 이모지 배경색 프리셋(알림 아이콘에 쓰이는 파스텔 톤)
const BG_PRESETS = [
  '#eeebfe', '#e8f4ec', '#fdeee6', '#e6eefd', '#fde8ee',
  '#fff0d6', '#eaf3fb', '#fdecec', '#f3f2f7', '#332c52',
]
const sameColor = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()

// 푸시 알림 메시지 수정 (/admin/notifs/:key)
export default function AdminNotifDetail() {
  const { key } = useParams()
  const nav = useNavigate()
  const [tpl, setTpl] = useState(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [emoji, setEmoji] = useState('')
  const [bg, setBg] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const rows = await listNotifTemplates()
      const t = rows.find((x) => x.key === key)
      if (!t) { setError('알림 템플릿을 찾을 수 없어요.'); return }
      setTpl(t); setTitle(t.title || ''); setBody(t.body || ''); setEmoji(t.emoji || ''); setBg(t.emoji_bg || '')
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [key])
  useEffect(() => { load() }, [load])

  async function save(e) {
    e.preventDefault(); setError('')
    if (!title.trim() || !body.trim()) { setError('제목과 본문을 입력해 주세요.'); return }
    const hex = bg.trim()
    if (hex && !/^#[0-9a-fA-F]{6}$/.test(hex)) { setError('배경색은 #RRGGBB 형식으로 입력해 주세요.'); return }
    setBusy(true)
    try { await updateNotifTemplate(key, title.trim(), body.trim(), emoji.trim(), hex); nav('/admin/notifs', { replace: true }) }
    catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  if (loading) return <div className="page admin-page"><div className="spinner" /></div>

  return (
    <div className="page admin-page">
      {error && <div className="alert alert-error">{error}</div>}
      {tpl && (
        <div className="card">
          <h3 className="card-title">{tpl.label}</h3>
          {tpl.vars && <p className="muted sm" style={{ margin: '0 0 10px' }}>사용 가능한 치환자 — {tpl.vars}</p>}
          <form onSubmit={save} className="form">
            <label className="field field-narrow"><span>알림센터 이모지</span>
              <input value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="예: 🎁" maxLength={16} autoCapitalize="none" /></label>
            <div className="field"><span>이모지 배경색</span>
              <div className="an-bg-row">
                {BG_PRESETS.map((c) => (
                  <button key={c} type="button" className={`an-bg-swatch ${sameColor(bg, c) ? 'active' : ''}`}
                    style={{ background: c }} onClick={() => setBg(c)} aria-label={c} title={c} />
                ))}
                <button type="button" className={`an-bg-swatch an-bg-none ${bg ? '' : 'active'}`}
                  onClick={() => setBg('')} aria-label="기본" title="기본(타입별 기본 색)">기본</button>
              </div>
              <input className="an-bg-hex" value={bg} onChange={(e) => setBg(e.target.value)}
                placeholder="#RRGGBB (비우면 기본)" maxLength={7} autoCapitalize="none" spellCheck={false} />
            </div>
            <label className="field"><span>제목</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="알림 제목" /></label>
            <label className="field"><span>본문</span>
              <textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="알림 본문" style={{ resize: 'vertical' }} /></label>
            <div className="admin-notif-preview">
              <span className="admin-notif-preview-ico" style={bg ? { background: bg } : undefined} aria-hidden="true">{emoji || '🔔'}</span>
              <div>
                <div className="admin-notif-preview-t">{title || '제목'}</div>
                <div className="admin-notif-preview-b">{body || '본문'}</div>
              </div>
            </div>
            <button className="btn btn-primary btn-block" disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
          </form>
        </div>
      )}
    </div>
  )
}
