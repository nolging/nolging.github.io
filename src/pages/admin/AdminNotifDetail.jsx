import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { listNotifTemplates, updateNotifTemplate, createNotifTemplate } from '../../lib/api'
import { useScrollToTop } from '../../lib/useScrollRestore'
import CgToggle from '../../components/CgToggle'

// 알림센터 이모지 배경색 프리셋(알림 아이콘에 쓰이는 파스텔 톤)
const BG_PRESETS = [
  '#eeebfe', '#e8f4ec', '#fdeee6', '#e6eefd', '#fde8ee',
  '#fff0d6', '#eaf3fb', '#fdecec', '#f3f2f7', '#332c52',
]
const sameColor = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()

// active 기본값 false: 새 알림 메시지는 관리자가 켜기 전까지 비활성으로 시작
const EMPTY_NOTIF = { key: '', label: '', title: '', body: '', emoji: '', emoji_bg: '', active: false }

// 알림 메시지 추가(/admin/notifs/new) + 수정(/admin/notifs/:key)
export default function AdminNotifDetail() {
  useScrollToTop() // 목록 스크롤 위치가 이어지지 않게 항상 맨 위에서 시작
  const { key: routeKey } = useParams()
  const editing = !!routeKey
  const isMegaphone = editing && routeKey === 'megaphone'   // 확성기: 본문은 사용자가 입력(제목·이모지·배경만 편집)
  const nav = useNavigate()
  const [form, setForm] = useState(EMPTY_NOTIF)
  const [vars, setVars] = useState('') // 기존 템플릿의 치환자 안내(읽기 전용 표시)
  const bgRef = useRef(null)
  // 배경색은 스와치로도 바뀌므로, 비제어 입력창의 표시값을 함께 맞춘다
  const pickBg = (c) => { setForm((f) => ({ ...f, emoji_bg: c })); if (bgRef.current) bgRef.current.value = c }
  const [loading, setLoading] = useState(editing)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const setField = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const load = useCallback(async () => {
    if (!editing) return
    setLoading(true); setError('')
    try {
      const rows = await listNotifTemplates()
      const t = rows.find((x) => x.key === routeKey)
      if (!t) { setError('알림 템플릿을 찾을 수 없어요.'); return }
      setForm({ key: t.key, label: t.label || '', title: t.title || '', body: t.body || '', emoji: t.emoji || '', emoji_bg: t.emoji_bg || '', active: t.active !== false })
      setVars(t.vars || '')
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [editing, routeKey])
  useEffect(() => { load() }, [load])

  async function save(e) {
    e.preventDefault(); setError('')
    if (!editing && !form.key.trim()) { setError('키를 입력해 주세요.'); return }
    if (!editing && !form.label.trim()) { setError('이름을 입력해 주세요.'); return }
    if (!form.title.trim() || (!isMegaphone && !form.body.trim())) { setError('제목과 본문을 입력해 주세요.'); return }
    const hex = form.emoji_bg.trim()
    if (hex && !/^#[0-9a-fA-F]{6}$/.test(hex)) { setError('배경색은 #RRGGBB 형식으로 입력해 주세요.'); return }
    // 확성기는 본문을 사용자가 입력하므로 템플릿 본문은 그대로 두고 저장(비어 있지 않게 유지)
    const bodyToSave = isMegaphone ? (form.body || '(내용은 사용자가 입력)') : form.body.trim()
    setBusy(true)
    try {
      if (editing) await updateNotifTemplate(routeKey, form.title.trim(), bodyToSave, form.emoji.trim(), hex, form.active)
      else await createNotifTemplate(form.key.trim(), form.label.trim(), form.title.trim(), bodyToSave, form.emoji.trim(), hex, form.active)
      nav('/admin/notifs', { replace: true })
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  if (loading) return <div className="page admin-page"><div className="spinner" /></div>

  return (
    <div className="page admin-page">
      {error && <div className="alert alert-error">{error}</div>}
      <div className="aq-form-wrap">
        {/* 입력창을 label 로 감싸지 않고 htmlFor 로 연결 + value 대신 defaultValue.
            (iOS 에서 label 안의 컨트롤은 탭이 이중 처리되고, 제어 입력은 리렌더가
             입력값을 되돌릴 수 있다. key 로 템플릿마다 리마운트해 값을 새로 채운다) */}
        <form onSubmit={save} className="aq-form" key={routeKey || 'new'}>
          {!editing && (
            <div className="aq-frow">
              <label className="aq-flabel" htmlFor="nt-key">키 <span className="aq-required">*</span></label>
              <input id="nt-key" defaultValue={form.key} onChange={setField('key')}
                placeholder="예: welcome_back (영문 소문자/숫자/_)" autoCapitalize="none" />
            </div>
          )}
          <div className="aq-frow">
            <label className="aq-flabel" htmlFor="nt-label">이름 {!editing && <span className="aq-required">*</span>}</label>
            <input id="nt-label" defaultValue={form.label} onChange={setField('label')}
              placeholder="관리자 목록에 보일 이름" disabled={editing} />
          </div>
          <div className="aq-frow">
            <label className="aq-flabel" htmlFor="nt-title">제목</label>
            <input id="nt-title" defaultValue={form.title} onChange={setField('title')} placeholder="알림 제목" />
          </div>
          {isMegaphone ? (
            <div className="aq-frow aq-frow-top">
              <label className="aq-flabel">본문</label>
              <div className="admin-notif-note">내용은 사용자가 확성기를 쓸 때 직접 입력해요. 여기서는 제목·이모지·배경색만 바꿀 수 있어요.</div>
            </div>
          ) : (
            <div className="aq-frow aq-frow-top">
              <label className="aq-flabel" htmlFor="nt-body">본문</label>
              <textarea id="nt-body" rows={3} defaultValue={form.body} onChange={setField('body')} placeholder="알림 본문" />
            </div>
          )}
          {vars && <p className="muted sm" style={{ margin: '-10px 0 18px' }}>사용 가능한 치환자 — {vars}</p>}
          <div className="aq-frow">
            <label className="aq-flabel" htmlFor="nt-emoji">아이콘</label>
            <div className="aq-icon-row">
              <input id="nt-emoji" className="aq-icon-input" defaultValue={form.emoji} onChange={setField('emoji')}
                placeholder="🔔" maxLength={16} autoCapitalize="none" />
              <div className="an-bg-row" style={{ margin: 0 }}>
                {BG_PRESETS.map((c) => (
                  <button key={c} type="button" className={`an-bg-swatch ${sameColor(form.emoji_bg, c) ? 'active' : ''}`}
                    style={{ background: c }} onClick={() => pickBg(c)} aria-label={c} title={c} />
                ))}
                <button type="button" className={`an-bg-swatch an-bg-none ${form.emoji_bg ? '' : 'active'}`}
                  onClick={() => pickBg('')} aria-label="기본" title="기본(타입별 기본 색)">기본</button>
              </div>
              <input ref={bgRef} className="an-bg-hex aq-hex" defaultValue={form.emoji_bg} onChange={setField('emoji_bg')}
                placeholder="#RRGGBB (비우면 기본)" maxLength={7} autoCapitalize="none" spellCheck={false} />
            </div>
          </div>

          <div className="admin-notif-preview">
            <span className="admin-notif-preview-ico" style={form.emoji_bg ? { background: form.emoji_bg } : undefined} aria-hidden="true">{form.emoji || '🔔'}</span>
            <div>
              <div className="admin-notif-preview-t">{form.title || '제목'}</div>
              <div className="admin-notif-preview-b">{isMegaphone ? '(사용자가 입력한 메시지)' : (form.body || '본문')}</div>
            </div>
          </div>

          <div className="aq-toggle-row">
            <div>
              <div className="aq-toggle-title">활성</div>
              <div className="aq-toggle-sub">유저에게 알림이 발송돼요</div>
            </div>
            <CgToggle on={form.active} onClick={() => setForm((f) => ({ ...f, active: !f.active }))} />
          </div>

          <div className="aq-actions">
            <div className="aq-actions-right">
              <button type="button" className="aq-btn-cancel" onClick={() => nav('/admin/notifs')}>취소</button>
              <button type="submit" className="aq-btn-save" disabled={busy}>{busy ? '저장 중…' : editing ? '수정 저장' : '알림 추가'}</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
