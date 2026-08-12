import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { adminListQuestDefs, adminUpsertQuestDef, adminDeleteQuestDef } from '../../lib/api'
import { QUEST_GRADES, EMPTY_QUEST } from './adminMeta'

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
  const setField = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

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
      <div className="card">
        {!editing && (
          <>
            <h3 className="card-title">퀘스트 추가</h3>
            <p className="muted sm" style={{ margin: '0 0 10px' }}>
              ID는 완료 판정 키예요. 새 ID로 추가하면 목록엔 뜨지만, 완료 처리는 개발자가 코드로 구현해야 동작해요.
            </p>
          </>
        )}
        {/* label 은 htmlFor 로만 연결하고 텍스트 입력은 defaultValue (관리자 폼 공통 규칙) */}
        <form onSubmit={save} className="form" key={id || 'new'}>
          <div className="field"><label htmlFor="q-id">ID *</label>
            <input id="q-id" defaultValue={form.id} onChange={setField('id')} placeholder="예: r_wish" disabled={editing} autoCapitalize="none" /></div>
          <div className="field"><label htmlFor="q-title">제목 *</label>
            <input id="q-title" defaultValue={form.title} onChange={setField('title')} placeholder="예: 위시 작성하기" /></div>
          <div className="field"><label htmlFor="q-body">내용</label>
            <textarea id="q-body" rows={2} defaultValue={form.body} onChange={setField('body')} placeholder="퀘스트 설명" style={{ resize: 'vertical' }} /></div>
          <div className="field-row">
            <div className="field field-narrow"><label htmlFor="q-emoji">이모지</label>
              <input id="q-emoji" defaultValue={form.emoji} onChange={setField('emoji')} placeholder="예: ⭐" maxLength={16} autoCapitalize="none" /></div>
            <div className="field field-narrow"><label htmlFor="q-reward">보상(츄르) *</label>
              <input id="q-reward" type="number" inputMode="numeric" min="0" defaultValue={form.reward} onChange={setField('reward')} placeholder="예: 2" /></div>
          </div>
          <div className="field"><label htmlFor="q-bg">이모지 배경색</label>
            <div className="an-bg-row">
              {BG_PRESETS.map((c) => (
                <button key={c} type="button" className={`an-bg-swatch ${sameColor(form.emoji_bg, c) ? 'active' : ''}`}
                  style={{ background: c }} onClick={() => pickBg(c)} aria-label={c} title={c} />
              ))}
            </div>
            <input id="q-bg" ref={bgRef} className="an-bg-hex" defaultValue={form.emoji_bg} onChange={setField('emoji_bg')}
              placeholder="#RRGGBB" maxLength={7} autoCapitalize="none" spellCheck={false} />
          </div>
          <div className="field"><label htmlFor="q-grade">대상 등급</label>
            <select id="q-grade" value={form.grade} onChange={setField('grade')}>
              {QUEST_GRADES.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
            </select></div>
          <label className="chk"><input type="checkbox" checked={form.active} onChange={setField('active')} /> 활성(랜덤 풀에 포함)</label>
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? '저장 중…' : editing ? '수정 저장' : '퀘스트 추가'}</button>
        </form>
      </div>

      {editing && (
        <div className="card">
          <h3 className="card-title">퀘스트 관리</h3>
          <button type="button" className="btn btn-danger" disabled={busy} onClick={remove}>퀘스트 삭제</button>
        </div>
      )}
    </div>
  )
}
