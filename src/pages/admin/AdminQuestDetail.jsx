import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { adminListQuestDefs, adminUpsertQuestDef, adminDeleteQuestDef } from '../../lib/api'
import { QUEST_GRADES, EMPTY_QUEST } from './adminMeta'

// 퀘스트 추가(/admin/quests/new) + 상세·수정(/admin/quests/:id)
export default function AdminQuestDetail() {
  const { id } = useParams()
  const editing = !!id
  const nav = useNavigate()
  const [form, setForm] = useState(EMPTY_QUEST)
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
      setForm({ id: q.id, title: q.title, body: q.body || '', emoji: q.emoji || '', reward: String(q.reward), grade: q.grade, sort_order: String(q.sort_order ?? ''), active: q.active })
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [editing, id])
  useEffect(() => { load() }, [load])

  async function save(e) {
    e.preventDefault(); setError('')
    if (!form.id.trim() || !form.title.trim()) { setError('ID와 제목은 필수예요.'); return }
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
        <h3 className="card-title">{editing ? '퀘스트 수정' : '퀘스트 추가'}</h3>
        <p className="muted sm" style={{ margin: '0 0 10px' }}>
          ID는 완료 판정 키예요. 새 ID로 추가하면 목록엔 뜨지만, 완료 처리는 개발자가 코드로 구현해야 동작해요.
        </p>
        <form onSubmit={save} className="form">
          <label className="field"><span>ID *</span>
            <input value={form.id} onChange={setField('id')} placeholder="예: r_wish" disabled={editing} autoCapitalize="none" /></label>
          <label className="field"><span>제목 *</span>
            <input value={form.title} onChange={setField('title')} placeholder="예: 위시 작성하기" /></label>
          <label className="field"><span>내용</span>
            <textarea rows={2} value={form.body} onChange={setField('body')} placeholder="퀘스트 설명" style={{ resize: 'vertical' }} /></label>
          <div className="field-row">
            <label className="field field-narrow"><span>이모지</span>
              <input value={form.emoji} onChange={setField('emoji')} placeholder="예: ⭐" maxLength={4} autoCapitalize="none" /></label>
            <label className="field field-narrow"><span>보상(츄르) *</span>
              <input type="number" inputMode="numeric" min="0" value={form.reward} onChange={setField('reward')} placeholder="예: 2" /></label>
            <label className="field field-narrow"><span>정렬</span>
              <input type="number" inputMode="numeric" value={form.sort_order} onChange={setField('sort_order')} placeholder="예: 1" /></label>
          </div>
          <label className="field"><span>대상 등급</span>
            <select value={form.grade} onChange={setField('grade')}>
              {QUEST_GRADES.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
            </select></label>
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
