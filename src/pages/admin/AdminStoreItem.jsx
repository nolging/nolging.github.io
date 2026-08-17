import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { adminListStoreItems, adminUpsertStoreItem, adminSetStoreItemActive, adminDeleteStoreItem } from '../../lib/api'
import { ITEM_KINDS, CATEGORY_OPTIONS, EMPTY_ITEM, kindToFlags, flagsToKind } from './adminMeta'
import { cleanSvg, imgBgOf, catOf, DECO_SLOT_ORDER } from '../../lib/storeMeta'
import StoreItemImage from '../../components/StoreItemImage'
import { useScrollToTop } from '../../lib/useScrollRestore'
import CgToggle from '../../components/CgToggle'

// 배경색 팔레트(파스텔 + 프리미엄 다크 + 투명)
const BG_PRESETS = ['#f3f2f7', '#fde8ee', '#e6eefd', '#fff0d6', '#eaf4ec', '#fbf1d3', '#eeebfe', '#e3f1fb', '#fdeee6', '#f4ece0', '#fdeceb', '#332c52', 'transparent']

// 새 프로필 꾸미기 아이템의 정렬 순서: 같은 유형(머리/얼굴/안경/테두리 순)의 마지막 자리에 삽입.
// (해당 유형 아이템이 하나도 없으면 null → 호출부에서 전체 목록 맨 끝으로 폴백)
function nextAvatarSortOrder(items, slot) {
  const avatarItems = items
    .filter((x) => catOf(x.id, x.category) === 'avatar')
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
  if (!avatarItems.length) return null
  const rankOf = (s) => { const i = DECO_SLOT_ORDER.indexOf(s); return i < 0 ? DECO_SLOT_ORDER.length : i }
  const newRank = rankOf(slot)
  let lastBefore = null, firstAfter = null
  for (const it of avatarItems) {
    if (rankOf(it.decoSlot) <= newRank) lastBefore = it
    else if (!firstAfter) firstAfter = it
  }
  if (lastBefore) return lastBefore.sortOrder + (firstAfter ? 1 : 10)
  if (firstAfter) return firstAfter.sortOrder - 1
  return null
}

// 상점 아이템 추가(/admin/store/new) + 상세·수정(/admin/store/:id)
// 추가 시 목록의 + 버튼이 넘겨준 탭(state.kind)으로 노출 위치 기본값을 맞춘다.
export default function AdminStoreItem() {
  useScrollToTop() // 목록 스크롤 위치가 이어지지 않게 항상 맨 위에서 시작
  const { id } = useParams()
  const editing = !!id
  const nav = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState(() => (
    editing || location.state?.kind !== 'prem' ? EMPTY_ITEM : { ...EMPTY_ITEM, kind: 'prem' }
  ))
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
        imageSvg: it.imageSvg || '', imageBg: it.imageBg || '', category: it.category || '', decoSlot: it.decoSlot || '',
      })
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [editing, id])
  useEffect(() => { load() }, [load])

  // 데코 유형(=상점 표시 이름) 후보: 기존에 쓰인 유형 + 기본(머리/얼굴/안경)
  const [slotOptions, setSlotOptions] = useState(['머리', '얼굴', '안경'])
  const [newSlot, setNewSlot] = useState(false) // '새 유형 직접 입력' 모드
  useEffect(() => {
    adminListStoreItems().then((items) => {
      const used = items.map((x) => (x.decoSlot || '').trim()).filter(Boolean)
      setSlotOptions([...new Set(['머리', '얼굴', '안경', ...used])])
    }).catch(() => { })
  }, [])

  async function save(e) {
    e.preventDefault(); setError(''); setNotice('')
    if (!form.id.trim() || !form.name.trim()) { setError('ID와 이름은 필수예요.'); return }
    setBusy(true)
    try {
      const { premium, tier } = kindToFlags(form.kind)
      const description = (form.description || '').replace(/\r\n/g, '\n').replace(/\\n/g, '\n')
      // 새 아이템은 목록 맨 끝으로(가장 큰 sort_order + 10). 수정은 기존 순서 유지.
      // 단, 프로필 꾸미기(avatar) 아이템은 같은 유형(머리/얼굴/안경/테두리 순)의 마지막 자리에 삽입.
      let sortOrder = form.sortOrder
      if (!editing) {
        const items = await adminListStoreItems().catch(() => [])
        const category = catOf(form.id, form.category)
        const bySlot = category === 'avatar' && form.decoSlot.trim()
          ? nextAvatarSortOrder(items, form.decoSlot.trim())
          : null
        sortOrder = bySlot ?? (items.reduce((mx, x) => Math.max(mx, x.sortOrder || 0), 0) + 10)
      }
      await adminUpsertStoreItem({ ...form, sortOrder, description, premium, tier })
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
          </div>
          <div className="field-row">
            <div className="field"><label htmlFor="si-kind">노출 위치</label>
              <select id="si-kind" value={form.kind} onChange={setField('kind')}>
                {ITEM_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
              </select></div>
            <div className="field"><label htmlFor="si-cat">카테고리</label>
              <select id="si-cat" value={form.category} onChange={setField('category')}>
                {CATEGORY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select></div>
          </div>
          {form.id.startsWith('deco-') && (
            <div className="field"><label htmlFor="si-decoslot">꾸미기 유형(상점 표시 이름)</label>
              <select id="si-decoslot" value={newSlot ? '__new__' : (form.decoSlot || '')}
                onChange={(e) => {
                  const v = e.target.value
                  if (v === '__new__') { setNewSlot(true); setForm((f) => ({ ...f, decoSlot: '' })) }
                  else { setNewSlot(false); setForm((f) => ({ ...f, decoSlot: v })) }
                }}>
                <option value="">유형 선택</option>
                {slotOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                <option value="__new__">＋ 새 유형 추가…</option>
              </select>
              {newSlot && (
                <input style={{ marginTop: 8 }} value={form.decoSlot} onChange={setField('decoSlot')}
                  placeholder="상점에 보일 유형 이름 (예: 안경)" autoFocus />
              )}
              <p className="si-hint" style={{ margin: '4px 0 0' }}>여기서 고른(입력한) 이름이 상점·인벤토리에 그대로 표시돼요. 같은 유형끼리는 하나만, 다른 유형은 동시에 장착돼요.</p>
            </div>
          )}
          <p className="si-hint" style={{ margin: '-4px 0 2px' }}>정렬 순서는 아이템 목록에서 ▲▼ 로 조정해요. 새 아이템은 목록 맨 끝에 추가돼요.</p>
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
            <div className="si-bg-palette">
              {BG_PRESETS.map((c) => (
                <button type="button" key={c} title={c}
                  className={`si-bg-swatch${c === 'transparent' ? ' none' : ''}${form.imageBg === c ? ' on' : ''}`}
                  style={c === 'transparent' ? undefined : { background: c }}
                  onClick={() => setForm((f) => ({ ...f, imageBg: c }))} />
              ))}
            </div>
          </div>

          <div className="aq-toggle-row">
            <div>
              <div className="aq-toggle-title">판매</div>
              <div className="aq-toggle-sub">{form.adminOnly ? '관리자 전용 — 상점에 노출되지 않아요' : '상점에 노출돼요'}</div>
            </div>
            <CgToggle on={!form.adminOnly} onClick={() => setForm((f) => ({ ...f, adminOnly: !f.adminOnly }))} />
          </div>
          <div className="aq-toggle-row">
            <div>
              <div className="aq-toggle-title">선물 전용</div>
              <div className="aq-toggle-sub">{form.giftOnly ? '선물만 가능(구매 불가)' : '구매도 가능'}</div>
            </div>
            <CgToggle on={form.giftOnly} onClick={() => setForm((f) => ({ ...f, giftOnly: !f.giftOnly }))} />
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
