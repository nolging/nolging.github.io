import { useEffect, useState, useCallback } from 'react'
import { adminCreateUser, adminListUsers, adminSetStatus, adminDeleteUser, adminCoinBalances, adminGrantCoin,
  adminListStoreItems, adminUpsertStoreItem, adminSetStoreItemActive, adminDeleteStoreItem,
  adminListQuestDefs, adminUpsertQuestDef, adminDeleteQuestDef } from '../lib/api'
import { formatCoin } from '../lib/constants'

const EMPTY_QUEST = { id: '', title: '', body: '', reward: '', grade: 'all', sort_order: '', active: true }
const QUEST_GRADES = [
  { key: 'all', label: '전체(모든 회원)' },
  { key: 'premium', label: '프리미엄(커플·우정)' },
  { key: 'vvip', label: 'VVIP(커플)' },
  { key: 'vip', label: 'VIP(우정)' },
]
const QUEST_GRADE_LABEL = Object.fromEntries(QUEST_GRADES.map((g) => [g.key, g.label]))

const STATUS = {
  active: { label: '활성', cls: 'badge-done' },
  pending: { label: '승인 대기', cls: 'badge-open' },
  disabled: { label: '비활성', cls: 'badge' },
}

// 상점 아이템 노출 위치 ↔ premium/tier 매핑
const ITEM_KINDS = [
  { key: 'general', label: '일반 상점' },
  { key: 'prem', label: '프리미엄(공통)' },
  { key: 'couple', label: '프리미엄·커플 전용' },
  { key: 'friend', label: '프리미엄·우정 전용' },
]
const kindToFlags = (kind) => kind === 'prem' ? { premium: true, tier: '' }
  : kind === 'couple' ? { premium: true, tier: 'couple' }
  : kind === 'friend' ? { premium: true, tier: 'friend' }
  : { premium: false, tier: '' }
const flagsToKind = (premium, tier) => !premium ? 'general' : tier === 'couple' ? 'couple' : tier === 'friend' ? 'friend' : 'prem'
const kindLabel = (premium, tier) => ITEM_KINDS.find((k) => k.key === flagsToKind(premium, tier))?.label || '일반 상점'
const EMPTY_ITEM = { id: '', name: '', price: '', emoji: '', description: '', sortOrder: '', kind: 'general', giftOnly: false, isActive: true }

export default function Admin() {
  const [users, setUsers] = useState([])
  const [balances, setBalances] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [form, setForm] = useState({ nickname: '', password: '', role: 'member', contact: '', birthdate: '' })
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  // 츄르 수동 지급/차감 (모바일 숫자 키패드엔 - 키가 없어 부호는 토글로 선택)
  const [grant, setGrant] = useState({ userId: '', sign: 1, amount: '', reason: '' })
  const [grantBusy, setGrantBusy] = useState(false)
  const setGrantField = (k) => (e) => setGrant((g) => ({ ...g, [k]: e.target.value }))

  // 상점 아이템 관리
  const [storeItems, setStoreItems] = useState([])
  const [itemForm, setItemForm] = useState(EMPTY_ITEM)
  const [editingItem, setEditingItem] = useState(false) // 기존 아이템 수정 중(ID 잠금)
  const [itemBusy, setItemBusy] = useState(false)
  const setItemField = (k) => (e) => setItemForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [us, bal] = await Promise.all([adminListUsers(), adminCoinBalances()])
      setUsers(us); setBalances(bal)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const loadItems = useCallback(async () => {
    try { setStoreItems(await adminListStoreItems()) } catch (err) { setError(err.message) }
  }, [])
  useEffect(() => { loadItems() }, [loadItems])

  async function itemAct(fn, okMsg) {
    setError(''); setNotice('')
    try { await fn(); if (okMsg) setNotice(okMsg); await loadItems() }
    catch (err) { setError(err.message) }
  }

  // ---- 랜덤 퀘스트 관리 ----
  const [questDefs, setQuestDefs] = useState([])
  const [questForm, setQuestForm] = useState(EMPTY_QUEST)
  const [editingQuest, setEditingQuest] = useState(false)
  const [questBusy, setQuestBusy] = useState(false)
  const setQuestField = (k) => (e) => setQuestForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const loadQuests = useCallback(async () => {
    try { setQuestDefs(await adminListQuestDefs()) } catch (err) { setError(err.message) }
  }, [])
  useEffect(() => { loadQuests() }, [loadQuests])
  function startAddQuest() { setQuestForm(EMPTY_QUEST); setEditingQuest(false) }
  function startEditQuest(q) {
    setQuestForm({ id: q.id, title: q.title, body: q.body || '', reward: String(q.reward), grade: q.grade, sort_order: String(q.sort_order ?? ''), active: q.active })
    setEditingQuest(true)
  }
  async function questAct(fn, okMsg) {
    setError(''); setNotice('')
    try { await fn(); if (okMsg) setNotice(okMsg); await loadQuests() }
    catch (err) { setError(err.message) }
  }
  async function saveQuest(e) {
    e.preventDefault(); setQuestBusy(true)
    try {
      if (!questForm.id.trim() || !questForm.title.trim()) throw new Error('ID와 제목은 필수예요.')
      await adminUpsertQuestDef(questForm)
      setNotice(`퀘스트 '${questForm.title}'을(를) 저장했습니다.`)
      setQuestForm(EMPTY_QUEST); setEditingQuest(false); await loadQuests()
    } catch (err) { setError(err.message) } finally { setQuestBusy(false) }
  }
  function startAddItem() { setItemForm(EMPTY_ITEM); setEditingItem(false) }
  function startEditItem(it) {
    setItemForm({
      id: it.id, name: it.name, price: String(it.price), emoji: it.emoji, description: it.description,
      sortOrder: String(it.sortOrder), kind: flagsToKind(it.premium, it.tier), giftOnly: it.giftOnly, isActive: it.isActive,
    })
    setEditingItem(true)
  }
  async function saveItem(e) {
    e.preventDefault(); setError(''); setNotice(''); setItemBusy(true)
    try {
      const { premium, tier } = kindToFlags(itemForm.kind)
      // 줄바꿈: 실제 개행 + 예전 방식으로 입력한 리터럴 '\n' 도 실제 개행으로 변환
      const description = (itemForm.description || '').replace(/\r\n/g, '\n').replace(/\\n/g, '\n')
      await adminUpsertStoreItem({ ...itemForm, description, premium, tier })
      setNotice(`상점 아이템 '${itemForm.name}'을(를) 저장했습니다.`)
      setItemForm(EMPTY_ITEM); setEditingItem(false)
      await loadItems()
    } catch (err) { setError(err.message) } finally { setItemBusy(false) }
  }

  async function handleCreate(e) {
    e.preventDefault()
    setError(''); setNotice(''); setBusy(true)
    try {
      await adminCreateUser({
        nickname: form.nickname, password: form.password, role: form.role,
        contact: form.contact, birthdate: form.birthdate || null,
      })
      setNotice(`'${form.nickname.trim().toLowerCase()}' 계정을 생성했습니다.`)
      setForm({ nickname: '', password: '', role: 'member', contact: '', birthdate: '' })
      await load()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  async function handleGrant(e) {
    e.preventDefault()
    setError(''); setNotice('')
    const mag = parseInt(grant.amount, 10)
    if (!grant.userId) { setError('지급할 사용자를 선택해 주세요.'); return }
    if (!Number.isInteger(mag) || mag <= 0) { setError('수량(1 이상 정수)을 입력해 주세요.'); return }
    const amount = grant.sign * mag
    setGrantBusy(true)
    try {
      const bal = await adminGrantCoin({ userId: grant.userId, amount, reason: grant.reason })
      const who = users.find((u) => u.id === grant.userId)?.nickname || '사용자'
      setNotice(`'${who}' ${amount > 0 ? `+${amount}` : amount} 츄르 → 잔액 ${formatCoin(bal)}`)
      setGrant({ userId: '', sign: 1, amount: '', reason: '' })
      await load()
    } catch (err) { setError(err.message) } finally { setGrantBusy(false) }
  }

  async function act(fn, okMsg) {
    setError(''); setNotice('')
    try { await fn(); if (okMsg) setNotice(okMsg); await load() }
    catch (err) { setError(err.message) }
  }

  const pending = users.filter((u) => u.status === 'pending')
  const others = users.filter((u) => u.status !== 'pending')

  return (
    <div className="page">
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      {/* 가입 요청 (승인 대기) */}
      <div className="card">
        <h3 className="card-title">가입 요청 <span className="muted">({pending.length})</span></h3>
        {pending.length === 0 ? (
          <p className="muted sm">대기 중인 요청이 없습니다.</p>
        ) : (
          <ul className="request-list">
            {pending.map((u) => (
              <li key={u.id}>
                <div className="request-head">
                  <strong>{u.nickname}</strong>
                  {u.contact && <span className="muted sm">· {u.contact}</span>}
                  {u.birthdate && <span className="muted sm">· {u.birthdate}</span>}
                </div>
                <div className="row-gap">
                  <button className="btn btn-sm btn-primary"
                    onClick={() => act(() => adminSetStatus(u.id, 'active'), `'${u.nickname}' 승인 완료`)}>승인</button>
                  <button className="btn btn-sm btn-ghost"
                    onClick={() => { if (confirm(`'${u.nickname}' 요청을 거절(삭제)할까요?`)) act(() => adminDeleteUser(u.id), '요청을 거절했습니다.') }}>거절</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 사용자 직접 생성 */}
      <div className="card">
        <h3 className="card-title">사용자 생성</h3>
        <form onSubmit={handleCreate} className="form">
          <div className="field-row">
            <label className="field"><span>아이디 *</span>
              <input value={form.nickname} onChange={set('nickname')} placeholder="영문 소문자/숫자/._-" /></label>
            <label className="field"><span>비밀번호 *</span>
              <input type="text" value={form.password} onChange={set('password')} placeholder="6자 이상" /></label>
            <label className="field field-narrow"><span>역할</span>
              <select value={form.role} onChange={set('role')}>
                <option value="member">멤버</option>
                <option value="admin">관리자</option>
              </select></label>
          </div>
          <div className="field-row">
            <label className="field"><span>연락처 (선택)</span>
              <input value={form.contact} onChange={set('contact')} placeholder="010-1234-5678" /></label>
            <label className="field"><span>생년월일 (선택)</span>
              <input type="date" value={form.birthdate} onChange={set('birthdate')} /></label>
          </div>
          <button className="btn btn-primary" disabled={busy}>{busy ? '생성 중…' : '계정 생성'}</button>
        </form>
      </div>

      {/* 츄르 수동 지급 */}
      <div className="card">
        <h3 className="card-title">츄르 지급</h3>
        <form onSubmit={handleGrant} className="form">
          <label className="field"><span>사용자 *</span>
            <select value={grant.userId} onChange={setGrantField('userId')}>
              <option value="">선택…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.nickname} ({formatCoin(balances[u.id] || 0)})</option>
              ))}
            </select></label>
          <div className="field-row">
            <div className="field"><span>구분 *</span>
              <div className="toggle-group">
                <button type="button" className={`toggle ${grant.sign === 1 ? 'active' : ''}`}
                  onClick={() => setGrant((g) => ({ ...g, sign: 1 }))}>지급 +</button>
                <button type="button" className={`toggle ${grant.sign === -1 ? 'active' : ''}`}
                  onClick={() => setGrant((g) => ({ ...g, sign: -1 }))}>차감 −</button>
              </div>
            </div>
            <label className="field field-narrow"><span>수량 *</span>
              <input type="number" inputMode="numeric" min="1" value={grant.amount}
                onChange={setGrantField('amount')} placeholder="예: 10" /></label>
          </div>
          <label className="field"><span>사유 (선택)</span>
            <input value={grant.reason} onChange={setGrantField('reason')} placeholder="예: 이벤트 보상" /></label>
          <button className="btn btn-primary" disabled={grantBusy}>{grantBusy ? '처리 중…' : '지급/차감'}</button>
        </form>
      </div>

      {/* 상점 아이템 관리 */}
      <div className="card">
        <h3 className="card-title">상점 아이템 {editingItem ? '수정' : '추가'}</h3>
        <form onSubmit={saveItem} className="form">
          <div className="field-row">
            <label className="field"><span>ID *</span>
              <input value={itemForm.id} onChange={setItemField('id')} placeholder="예: wish (영문/숫자/-)" disabled={editingItem} autoCapitalize="none" /></label>
            <label className="field"><span>이름 *</span>
              <input value={itemForm.name} onChange={setItemField('name')} placeholder="예: 소원권" /></label>
            <label className="field field-narrow"><span>이모지</span>
              <input value={itemForm.emoji} onChange={setItemField('emoji')} placeholder="🎁" /></label>
          </div>
          <div className="field-row">
            <label className="field field-narrow"><span>가격 *</span>
              <input type="number" inputMode="numeric" min="0" value={itemForm.price} onChange={setItemField('price')} placeholder="예: 300" /></label>
            <label className="field field-narrow"><span>정렬</span>
              <input type="number" inputMode="numeric" value={itemForm.sortOrder} onChange={setItemField('sortOrder')} placeholder="예: 5" /></label>
            <label className="field"><span>노출 위치</span>
              <select value={itemForm.kind} onChange={setItemField('kind')}>
                {ITEM_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
              </select></label>
          </div>
          <label className="field"><span>설명</span>
            <textarea rows={3} value={itemForm.description} onChange={setItemField('description')}
              placeholder="상세 설명 (Enter 로 줄바꿈)" style={{ resize: 'vertical', whiteSpace: 'pre-wrap' }} /></label>
          <div className="row-gap" style={{ flexWrap: 'wrap' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13.5 }}>
              <input type="checkbox" checked={itemForm.giftOnly} onChange={setItemField('giftOnly')} /> 선물 전용(구매 불가)</label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13.5 }}>
              <input type="checkbox" checked={itemForm.isActive} onChange={setItemField('isActive')} /> 활성(상점 노출)</label>
          </div>
          <div className="row-gap">
            <button className="btn btn-primary" disabled={itemBusy}>{itemBusy ? '저장 중…' : editingItem ? '수정 저장' : '아이템 추가'}</button>
            {editingItem && <button type="button" className="btn btn-ghost" onClick={startAddItem}>취소</button>}
          </div>
        </form>

        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table className="table">
            <thead><tr><th></th><th>ID</th><th>이름</th><th>가격</th><th>위치</th><th>상태</th><th></th></tr></thead>
            <tbody>
              {storeItems.map((it) => (
                <tr key={it.id} style={{ opacity: it.isActive ? 1 : .5 }}>
                  <td style={{ fontSize: 18 }}>{it.emoji}</td>
                  <td className="muted">{it.id}</td>
                  <td>{it.name}{it.giftOnly && <span className="muted sm"> · 선물전용</span>}</td>
                  <td>{formatCoin(it.price)}</td>
                  <td className="muted sm">{kindLabel(it.premium, it.tier)}</td>
                  <td><span className={`badge ${it.isActive ? 'badge-done' : 'badge'}`}>{it.isActive ? '노출' : '숨김'}</span></td>
                  <td className="ta-right row-gap" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn btn-sm btn-ghost" onClick={() => startEditItem(it)}>수정</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => itemAct(() => adminSetStoreItemActive(it.id, !it.isActive))}>{it.isActive ? '숨기기' : '노출'}</button>
                    <button className="btn btn-sm btn-icon" title="삭제"
                      onClick={() => { if (confirm(`'${it.name}' 아이템을 삭제할까요? (되돌릴 수 없어요)`)) itemAct(() => adminDeleteStoreItem(it.id), '아이템을 삭제했습니다.') }}>✕</button>
                  </td>
                </tr>
              ))}
              {storeItems.length === 0 && <tr><td colSpan={7} className="muted sm">등록된 아이템이 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* 랜덤 퀘스트 관리 */}
      <div className="card">
        <h3 className="card-title">랜덤 퀘스트 {editingQuest ? '수정' : '추가'}</h3>
        <p className="muted sm" style={{ margin: '0 0 10px' }}>
          ID는 완료 판정 키예요. 새 ID로 추가하면 목록엔 뜨지만, 완료 처리는 개발자가 코드로 구현해야 동작해요.
        </p>
        <form onSubmit={saveQuest} className="form">
          <div className="field-row">
            <label className="field"><span>ID *</span>
              <input value={questForm.id} onChange={setQuestField('id')} placeholder="예: r_wish" disabled={editingQuest} autoCapitalize="none" /></label>
            <label className="field"><span>제목 *</span>
              <input value={questForm.title} onChange={setQuestField('title')} placeholder="예: 위시 작성하기" /></label>
          </div>
          <label className="field"><span>내용</span>
            <textarea rows={2} value={questForm.body} onChange={setQuestField('body')} placeholder="퀘스트 설명" style={{ resize: 'vertical' }} /></label>
          <div className="field-row">
            <label className="field field-narrow"><span>보상(츄르) *</span>
              <input type="number" inputMode="numeric" min="0" value={questForm.reward} onChange={setQuestField('reward')} placeholder="예: 2" /></label>
            <label className="field field-narrow"><span>정렬</span>
              <input type="number" inputMode="numeric" value={questForm.sort_order} onChange={setQuestField('sort_order')} placeholder="예: 1" /></label>
            <label className="field"><span>대상 등급</span>
              <select value={questForm.grade} onChange={setQuestField('grade')}>
                {QUEST_GRADES.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
              </select></label>
          </div>
          <div className="row-gap" style={{ flexWrap: 'wrap' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13.5 }}>
              <input type="checkbox" checked={questForm.active} onChange={setQuestField('active')} /> 활성(랜덤 풀에 포함)</label>
          </div>
          <div className="row-gap">
            <button className="btn btn-primary" disabled={questBusy}>{questBusy ? '저장 중…' : editingQuest ? '수정 저장' : '퀘스트 추가'}</button>
            {editingQuest && <button type="button" className="btn btn-ghost" onClick={startAddQuest}>취소</button>}
          </div>
        </form>

        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table className="table">
            <thead><tr><th>ID</th><th>제목</th><th>보상</th><th>대상</th><th>상태</th><th></th></tr></thead>
            <tbody>
              {questDefs.map((q) => (
                <tr key={q.id} style={{ opacity: q.active ? 1 : .5 }}>
                  <td className="muted sm">{q.id}</td>
                  <td>{q.title}</td>
                  <td>+{q.reward}</td>
                  <td className="muted sm">{QUEST_GRADE_LABEL[q.grade] || q.grade}</td>
                  <td><span className={`badge ${q.active ? 'badge-done' : 'badge'}`}>{q.active ? '활성' : '비활성'}</span></td>
                  <td className="ta-right row-gap" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn btn-sm btn-ghost" onClick={() => startEditQuest(q)}>수정</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => questAct(() => adminUpsertQuestDef({ ...q, active: !q.active }))}>{q.active ? '비활성' : '활성'}</button>
                    <button className="btn btn-sm btn-icon" title="삭제"
                      onClick={() => { if (confirm(`'${q.title}' 퀘스트를 삭제할까요?`)) questAct(() => adminDeleteQuestDef(q.id), '퀘스트를 삭제했습니다.') }}>✕</button>
                  </td>
                </tr>
              ))}
              {questDefs.length === 0 && <tr><td colSpan={6} className="muted sm">등록된 퀘스트가 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* 사용자 목록 */}
      <div className="card">
        <h3 className="card-title">사용자 목록 <span className="muted">({others.length})</span></h3>
        {loading ? <div className="spinner" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>아이디</th><th>역할</th><th>연락처</th><th>생년월일</th><th>츄르</th><th>상태</th><th></th></tr>
              </thead>
              <tbody>
                {others.map((u) => (
                  <tr key={u.id}>
                    <td>{u.nickname}</td>
                    <td>{u.role === 'admin' ? '관리자' : '멤버'}</td>
                    <td className="muted">{u.contact || '—'}</td>
                    <td className="muted">{u.birthdate || '—'}</td>
                    <td>{formatCoin(balances[u.id] || 0)}</td>
                    <td><span className={`badge ${STATUS[u.status]?.cls}`}>{STATUS[u.status]?.label}</span></td>
                    <td className="ta-right row-gap" style={{ justifyContent: 'flex-end' }}>
                      <button className="btn btn-sm btn-ghost"
                        onClick={() => act(() => adminSetStatus(u.id, u.status === 'active' ? 'disabled' : 'active'))}>
                        {u.status === 'active' ? '비활성화' : '활성화'}
                      </button>
                      {u.role !== 'admin' && (
                        <button className="btn btn-sm btn-icon" title="삭제"
                          onClick={() => { if (confirm(`'${u.nickname}' 계정을 삭제할까요?`)) act(() => adminDeleteUser(u.id)) }}>✕</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
