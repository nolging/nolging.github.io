import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { adminListQuestDefs, adminUpsertQuestDef, adminDeleteQuestDef } from '../../lib/api'
import { QUEST_GRADES, EMPTY_QUEST } from './adminMeta'
import CgToggle from '../../components/CgToggle'

// 이모지 배경색 프리셋(마이 페이지 퀘스트 카드에 쓰이는 파스텔 톤)
const BG_PRESETS = ['#eef1fb', '#e8f4ec', '#fde8ee', '#fdeee6', '#fff0d6', '#eaf3fb', '#eeebfe']
const sameColor = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()

// 퀘스트 추가(/admin/quests/new) + 상세·수정(/admin/quests/:id)
export default function AdminQuestDetail() {
  const { id } = useParams()
  const editing = !!id
  const nav = useNavigate()
  const [form, setForm] = useState(EMPTY_QUEST)
  const bgRef = useRef(null)
  const pickBg = (c) => { setForm((f) => ({ ...f, emoji_bg: c })); if (bgRef.current) bgRef.current.value = c }
  const [loading, setLoading] = useState(editing)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const setField = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const load = useCallback(async () => {
    if (!editing) return
    setLoading(true)
    try {
      const defs = await adminListQuestDefs()
      const q = defs.find((x) => x.id === id)
      if (!q) { setError('퀘스트를 찾을 수 없어요.'); return }
      setForm({ id: q.id, title: q.title, body: q.body || '', emoji: q.emoji || '', emoji_bg: q.emoji_bg || '', reward: String(q.reward), grade: q.grade, active: q.active })
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [editing, id])
  useEffect(() => { load() }, [load])

  async function save(e) {
    e.preventDefault(); setError('')
    if (!form.id.trim() || !form.title.trim()) { setError('ID와 제목은 필수예요.'); return }
    if (form.emoji_bg && !/^#[0-9a-fA-F]{6}$/.test(form.emoji_bg.trim())) { setError('배경색은 #RRGGBB 형식으로 입력해 주세요.'); return }
    setBusy(true)
    try { await adminUpsertQuestDef(form); nav('/admin/quests', { replace: true }) }
    catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  function remove() {
    if (!confirm(`'${form.title}' 퀘스트를 삭제할까요? (되돌릴 수 없어요)`)) return
    setBusy(true); setError('')
    adminDeleteQuestDef(id).then(() => nav('/admin/quests', { replace: true })).catch((err) => { setError(err.message); setBusy(false) })
  }

  if (loading) return <div className="page admin-page"><div className="spinner" /></div>

  return (
    <div className="page admin-page">
      {error && <div className="alert alert-error">{error}</div>}
      <div className="aq-form-wrap">
        {/* label 은 htmlFor 로만 연결하고 텍스트 입력은 defaultValue (관리자 폼 공통 규칙) */}
        <form onSubmit={save} className="aq-form" key={id || 'new'}>
          <div className="aq-frow">
            <label className="aq-flabel" htmlFor="q-id">ID <span className="aq-required">*</span></label>
            <input id="q-id" defaultValue={form.id} onChange={setField('id')} placeholder="예: quest_random_006" disabled={editing} autoCapitalize="none" />
          </div>
          <div className="aq-frow">
            <label className="aq-flabel" htmlFor="q-title">제목 <span className="aq-required">*</span></label>
            <input id="q-title" defaultValue={form.title} onChange={setField('title')} placeholder="퀘스트 이름을 입력하세요" />
          </div>
          <div className="aq-frow aq-frow-top">
            <label className="aq-flabel" htmlFor="q-body">내용</label>
            <textarea id="q-body" rows={2} defaultValue={form.body} onChange={setField('body')} placeholder="퀘스트 내용을 입력하세요" />
          </div>
          <div className="aq-frow">
            <label className="aq-flabel" htmlFor="q-emoji">아이콘</label>
            <div className="aq-icon-row">
              <input id="q-emoji" className="aq-icon-input" defaultValue={form.emoji} onChange={setField('emoji')}
                placeholder="🎁" maxLength={16} autoCapitalize="none" style={form.emoji_bg ? { background: form.emoji_bg } : undefined} />
              <div className="aq-swatch-row">
                {BG_PRESETS.map((c) => (
                  <button key={c} type="button" className={`aq-swatch ${sameColor(form.emoji_bg, c) ? 'active' : ''}`}
                    style={{ background: c }} onClick={() => pickBg(c)} aria-label={c} title={c} />
                ))}
              </div>
              <input id="q-bg" ref={bgRef} className="aq-hex" defaultValue={form.emoji_bg} onChange={setField('emoji_bg')}
                placeholder="#RRGGBB" maxLength={7} autoCapitalize="none" spellCheck={false} />
            </div>
          </div>
          <div className="aq-frow">
            <label className="aq-flabel" htmlFor="q-reward">보상</label>
            <div className="aq-reward-row">
              <input id="q-reward" type="number" inputMode="numeric" min="0" defaultValue={form.reward} onChange={setField('reward')} placeholder="예: 20" />
              <span className="aq-unit">츄르</span>
            </div>
          </div>
          <div className="aq-frow">
            <label className="aq-flabel" htmlFor="q-grade">대상</label>
            <select id="q-grade" value={form.grade} onChange={setField('grade')}>
              {QUEST_GRADES.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
            </select>
          </div>
          <div className="aq-toggle-row">
            <div>
              <div className="aq-toggle-title">사용자에게 노출</div>
              <div className="aq-toggle-sub">비활성화하면 앱에서 이 퀘스트가 보이지 않아요</div>
            </div>
            <CgToggle on={form.active} onClick={() => setForm((f) => ({ ...f, active: !f.active }))} />
          </div>
          <div className="aq-actions">
            {editing && <button type="button" className="aq-btn-delete" disabled={busy} onClick={remove}>삭제</button>}
            <div className="aq-actions-right">
              <button type="button" className="aq-btn-cancel" onClick={() => nav('/admin/quests')}>취소</button>
              <button type="submit" className="aq-btn-save" disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
