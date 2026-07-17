import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { adminListStoreItems, adminUpsertStoreItem, adminSetStoreItemActive, adminDeleteStoreItem } from '../../lib/api'
import { ITEM_KINDS, EMPTY_ITEM, kindToFlags, flagsToKind } from './adminMeta'

// 상점 아이템 추가(/admin/store/new) + 상세·수정(/admin/store/:id)
export default function AdminStoreItem() {
  const { id } = useParams()
  const editing = !!id
  const nav = useNavigate()
  const [form, setForm] = useState(EMPTY_ITEM)
  const [loading, setLoading] = useState(editing)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const setField = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const load = useCallback(async () => {
    if (!editing) return
    setLoading(true)
    try {
      const items = await adminListStoreItems()
      const it = items.find((x) => x.id === id)
      if (!it) { setError('아이템을 찾을 수 없어요.'); return }
      setForm({
        id: it.id, name: it.name, price: String(it.price), emoji: it.emoji || '', description: it.description || '',
        sortOrder: String(it.sortOrder ?? ''), kind: flagsToKind(it.premium, it.tier), giftOnly: it.giftOnly, isActive: it.isActive,
      })
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [editing, id])
  useEffect(() => { load() }, [load])

  async function save(e) {
    e.preventDefault(); setError(''); setNotice('')
    if (!form.id.trim() || !form.name.trim()) { setError('ID와 이름은 필수예요.'); return }
    setBusy(true)
    try {
      const { premium, tier } = kindToFlags(form.kind)
      const description = (form.description || '').replace(/\r\n/g, '\n').replace(/\\n/g, '\n')
      await adminUpsertStoreItem({ ...form, description, premium, tier })
      nav('/admin/store', { replace: true })
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  async function toggleActive() {
    setBusy(true); setError('')
    try { await adminSetStoreItemActive(id, !form.isActive); setForm((f) => ({ ...f, isActive: !f.isActive })); setNotice('상태를 변경했어요.') }
    catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  function remove() {
    if (!confirm(`'${form.name}' 아이템을 삭제할까요? (되돌릴 수 없어요)`)) return
    setBusy(true); setError('')
    adminDeleteStoreItem(id).then(() => nav('/admin/store', { replace: true })).catch((err) => { setError(err.message); setBusy(false) })
  }

  if (loading) return <div className="page admin-page"><div className="spinner" /></div>

  return (
    <div className="page admin-page">
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}
      <div className="card">
        <h3 className="card-title">{editing ? '아이템 수정' : '아이템 추가'}</h3>
        <form onSubmit={save} className="form">
          <label className="field"><span>ID *</span>
            <input value={form.id} onChange={setField('id')} placeholder="예: wish (영문/숫자/-)" disabled={editing} autoCapitalize="none" /></label>
          <label className="field"><span>이름 *</span>
            <input value={form.name} onChange={setField('name')} placeholder="예: 소원권" /></label>
          <div className="field-row">
            <label className="field field-narrow"><span>이모지</span>
              <input value={form.emoji} onChange={setField('emoji')} placeholder="🎁" /></label>
            <label className="field field-narrow"><span>가격 *</span>
              <input type="number" inputMode="numeric" min="0" value={form.price} onChange={setField('price')} placeholder="예: 300" /></label>
            <label className="field field-narrow"><span>정렬</span>
              <input type="number" inputMode="numeric" value={form.sortOrder} onChange={setField('sortOrder')} placeholder="예: 5" /></label>
          </div>
          <label className="field"><span>노출 위치</span>
            <select value={form.kind} onChange={setField('kind')}>
              {ITEM_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
            </select></label>
          <label className="field"><span>설명</span>
            <textarea rows={3} value={form.description} onChange={setField('description')}
              placeholder="상세 설명 (Enter 로 줄바꿈)" style={{ resize: 'vertical', whiteSpace: 'pre-wrap' }} /></label>
          <div className="row-gap" style={{ flexWrap: 'wrap' }}>
            <label className="chk"><input type="checkbox" checked={form.giftOnly} onChange={setField('giftOnly')} /> 선물 전용(구매 불가)</label>
            <label className="chk"><input type="checkbox" checked={form.isActive} onChange={setField('isActive')} /> 활성(상점 노출)</label>
          </div>
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? '저장 중…' : editing ? '수정 저장' : '아이템 추가'}</button>
        </form>
      </div>

      {editing && (
        <div className="card">
          <h3 className="card-title">아이템 관리</h3>
          <div className="row-gap" style={{ flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={toggleActive}>{form.isActive ? '숨기기' : '노출'}</button>
            <button type="button" className="btn btn-danger" disabled={busy} onClick={remove}>아이템 삭제</button>
          </div>
        </div>
      )}
    </div>
  )
}
