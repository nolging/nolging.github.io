import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { listNotifTemplates, updateNotifTemplate } from '../../lib/api'
import { useScrollToTop } from '../../lib/useScrollRestore'

// 알림센터 이모지 배경색 프리셋(알림 아이콘에 쓰이는 파스텔 톤)
const BG_PRESETS = [
  '#eeebfe', '#e8f4ec', '#fdeee6', '#e6eefd', '#fde8ee',
  '#fff0d6', '#eaf3fb', '#fdecec', '#f3f2f7', '#332c52',
]
const sameColor = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()

// 푸시 알림 메시지 수정 (/admin/notifs/:key)
export default function AdminNotifDetail() {
  useScrollToTop() // 목록 스크롤 위치가 이어지지 않게 항상 맨 위에서 시작
  const { key } = useParams()
  const isMegaphone = key === 'megaphone'   // 확성기: 본문은 사용자가 입력(제목·이모지·배경만 편집)
  const nav = useNavigate()
  const [tpl, setTpl] = useState(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [emoji, setEmoji] = useState('')
  const [bg, setBg] = useState('')
  const bgRef = useRef(null)
  // 배경색은 스와치로도 바뀌므로, 비제어 입력창의 표시값을 함께 맞춘다
  const pickBg = (c) => { setBg(c); if (bgRef.current) bgRef.current.value = c }
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
    if (!title.trim() || (!isMegaphone && !body.trim())) { setError('제목과 본문을 입력해 주세요.'); return }
    const hex = bg.trim()
    if (hex && !/^#[0-9a-fA-F]{6}$/.test(hex)) { setError('배경색은 #RRGGBB 형식으로 입력해 주세요.'); return }
    // 확성기는 본문을 사용자가 입력하므로 템플릿 본문은 그대로 두고 저장(비어 있지 않게 유지)
    const bodyToSave = isMegaphone ? (tpl?.body || '(내용은 사용자가 입력)') : body.trim()
    setBusy(true)
    try { await updateNotifTemplate(key, title.trim(), bodyToSave, emoji.trim(), hex); nav('/admin/notifs', { replace: true }) }
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
          {/* 입력창을 label 로 감싸지 않고 htmlFor 로 연결한다 — iOS 에서 label 안의
              입력창은 탭이 이중 처리돼(라벨→컨트롤) 포커스가 곧바로 풀릴 수 있다.
              또 value(제어) 대신 defaultValue 를 쓰고 key 로 템플릿마다 리마운트해,
              리렌더가 사용자가 입력한 내용을 되돌리지 못하게 한다. */}
          <form onSubmit={save} className="form" key={tpl.key}>
            <div className="field field-narrow"><label htmlFor="nt-emoji">알림센터 이모지</label>
              <input id="nt-emoji" defaultValue={emoji} onChange={(e) => setEmoji(e.target.value)}
                placeholder="예: 🎁" maxLength={16} autoCapitalize="none" /></div>
            <div className="field"><label htmlFor="nt-bg">이모지 배경색</label>
              <div className="an-bg-row">
                {BG_PRESETS.map((c) => (
                  <button key={c} type="button" className={`an-bg-swatch ${sameColor(bg, c) ? 'active' : ''}`}
                    style={{ background: c }} onClick={() => pickBg(c)} aria-label={c} title={c} />
                ))}
                <button type="button" className={`an-bg-swatch an-bg-none ${bg ? '' : 'active'}`}
                  onClick={() => pickBg('')} aria-label="기본" title="기본(타입별 기본 색)">기본</button>
              </div>
              <input id="nt-bg" ref={bgRef} className="an-bg-hex" defaultValue={bg} onChange={(e) => setBg(e.target.value)}
                placeholder="#RRGGBB (비우면 기본)" maxLength={7} autoCapitalize="none" spellCheck={false} />
            </div>
            <div className="field"><label htmlFor="nt-title">제목</label>
              <input id="nt-title" defaultValue={title} onChange={(e) => setTitle(e.target.value)} placeholder="알림 제목" /></div>
            {isMegaphone ? (
              <div className="field"><label>본문</label>
                <div className="admin-notif-note">내용은 사용자가 확성기를 쓸 때 직접 입력해요. 여기서는 제목·이모지·배경색만 바꿀 수 있어요.</div></div>
            ) : (
              <div className="field"><label htmlFor="nt-body">본문</label>
                <textarea id="nt-body" rows={3} defaultValue={body} onChange={(e) => setBody(e.target.value)}
                  placeholder="알림 본문" style={{ resize: 'vertical' }} /></div>
            )}
            <div className="admin-notif-preview">
              <span className="admin-notif-preview-ico" style={bg ? { background: bg } : undefined} aria-hidden="true">{emoji || '🔔'}</span>
              <div>
                <div className="admin-notif-preview-t">{title || '제목'}</div>
                <div className="admin-notif-preview-b">{isMegaphone ? '(사용자가 입력한 메시지)' : (body || '본문')}</div>
              </div>
            </div>
            <button className="btn btn-primary btn-block" disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
          </form>
        </div>
      )}
    </div>
  )
}
