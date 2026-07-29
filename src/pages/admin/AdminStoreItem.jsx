import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { adminListStoreItems, adminUpsertStoreItem, adminSetStoreItemActive, adminDeleteStoreItem } from '../../lib/api'
import { ITEM_KINDS, EMPTY_ITEM, kindToFlags, flagsToKind } from './adminMeta'
import { cleanSvg, imgBgOf } from '../../lib/storeMeta'
import StoreItemImage from '../../components/StoreItemImage'

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
        sortOrder: String(it.sortOrder ?? ''), kind: flagsToKind(it.premium, it.tier), giftOnly: it.giftOnly, isActive: it.isActive, adminOnly: it.adminOnly,
        imageSvg: it.imageSvg || '', imageBg: it.imageBg || '',
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
  async function onSvgFile(e) {
    const f = e.target.files?.[0]
    e.target.value = ''   // 같은 파일 다시 선택 가능하게
    if (!f) return
    try {
      const text = await f.text()
      if (!/<svg[\s>]/i.test(text)) { setError('SVG 파일이 아니에요.'); return }
      setForm((prev) => ({ ...prev, imageSvg: cleanSvg(text) }))
      setError('')
    } catch { setError('파일을 읽지 못했어요.') }
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
        {/* 입력창을 label 로 감싸지 않고 htmlFor 로 연결 + value 대신 defaultValue.
            (iOS 에서 label 안의 컨트롤은 탭이 이중 처리되고, 제어 입력은 리렌더가
             입력값을 되돌릴 수 있다. key 로 아이템마다 리마운트해 값을 새로 채운다) */}
        <form onSubmit={save} className="form" key={id || 'new'}>
          <div className="field"><label htmlFor="si-id">ID *</label>
            <input id="si-id" defaultValue={form.id} onChange={setField('id')} placeholder="예: wish (영문/숫자/-)" disabled={editing} autoCapitalize="none" /></div>
          <div className="field"><label htmlFor="si-name">이름 *</label>
            <input id="si-name" defaultValue={form.name} onChange={setField('name')} placeholder="예: 소원권" /></div>
          <div className="field-row">
            <div className="field field-narrow"><label htmlFor="si-emoji">이모지</label>
              <input id="si-emoji" defaultValue={form.emoji} onChange={setField('emoji')} placeholder="🎁" maxLength={16} /></div>
            <div className="field field-narrow"><label htmlFor="si-price">가격 *</label>
              <input id="si-price" type="number" inputMode="numeric" min="0" defaultValue={form.price} onChange={setField('price')} placeholder="예: 300" /></div>
            <div className="field field-narrow"><label htmlFor="si-sort">정렬</label>
              <input id="si-sort" type="number" inputMode="numeric" defaultValue={form.sortOrder} onChange={setField('sortOrder')} placeholder="예: 5" /></div>
          </div>
          <div className="field"><label htmlFor="si-kind">노출 위치</label>
            <select id="si-kind" value={form.kind} onChange={setField('kind')}>
              {ITEM_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
            </select></div>
          <div className="field"><label htmlFor="si-desc">설명</label>
            <textarea id="si-desc" rows={3} defaultValue={form.description} onChange={setField('description')}
              placeholder="상세 설명 (Enter 로 줄바꿈)" style={{ resize: 'vertical', whiteSpace: 'pre-wrap' }} /></div>

          {/* 이미지(SVG 업로드) + 배경색 + 상점 미리보기 */}
          <div className="field">
            <label>이미지 · 배경</label>
            <div className="si-img-row">
              <span className="si-img-prev" style={{ background: form.imageBg || imgBgOf(form.id, kindToFlags(form.kind).premium) }}>
                <StoreItemImage id={form.id || '_preview'} emoji={form.emoji || '🖼️'} svg={form.imageSvg} className="si-img-prev-in" />
              </span>
              <div className="si-img-ctrls">
                <label className="btn btn-ghost btn-sm si-upload">
                  {form.imageSvg ? 'SVG 교체' : 'SVG 올리기'}
                  <input type="file" accept=".svg,image/svg+xml" onChange={onSvgFile} style={{ display: 'none' }} />
                </label>
                {form.imageSvg && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm((f) => ({ ...f, imageSvg: '' }))}>이미지 제거</button>}
                <span className="si-hint">파일명은 무시하고 아이템 ID로 저장돼요.</span>
              </div>
            </div>
            <div className="si-bg-row">
              <span>배경색</span>
              <input type="color" aria-label="배경색 선택"
                value={/^#[0-9a-fA-F]{6}$/.test(form.imageBg) ? form.imageBg : '#f3f2f7'}
                onChange={(e) => setForm((f) => ({ ...f, imageBg: e.target.value }))} />
              <input className="si-bg-text" value={form.imageBg} onChange={setField('imageBg')}
                placeholder="#f3f2f7 / transparent / gradient" autoCapitalize="none" />
              {form.imageBg && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm((f) => ({ ...f, imageBg: '' }))}>초기화</button>}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label className="chk"><input type="checkbox" checked={form.giftOnly} onChange={setField('giftOnly')} /> 선물 전용(구매 불가)</label>
            <label className="chk"><input type="checkbox" checked={form.isActive} onChange={setField('isActive')} /> 활성(상점 노출)</label>
            <label className="chk"><input type="checkbox" checked={form.adminOnly} onChange={setField('adminOnly')} /> 관리자에게만 보이게(테스트용)</label>
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
