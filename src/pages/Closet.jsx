import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { listInventory, listStoreItems, listMemberCards, applyAvatarDeco, unapplyAvatarDeco, setAvatarDecoTf } from '../lib/api'
import { setStoreCatalog, catalogDecoSlot, catalogName, bgOf } from '../lib/storeCatalog'
import { decoSlot, BORDER_IDS, DECO_TF0 } from '../components/AvatarDeco'
import DecoAdjuster, { clampTf, isTf0 } from '../components/DecoAdjuster'
import StoreItemImage from '../components/StoreItemImage'
import Avatar from '../components/Avatar'
import Modal from '../components/Modal'

// 슬롯 표시명/정렬 순서(머리→얼굴→안경→테두리). 관리자 설정 슬롯 우선, 폴백은 하드코딩.
const SLOT_LABEL = { head: '머리', face: '얼굴', glasses: '안경', border: '테두리' }
const SLOT_RANK = { '머리': 0, head: 0, '얼굴': 1, face: 1, '안경': 2, glasses: 2, '테두리': 3, border: 3 }
const slotOf = (id) => catalogDecoSlot(id) || (BORDER_IDS.has(id) ? '테두리' : decoSlot(id))
const slotLabel = (slot) => SLOT_LABEL[slot] || slot
// 얼굴 슬롯은 2개까지, 나머지는 1개까지 — apply_avatar_deco 와 동일 규칙(deco-face-slot-capacity.sql)
const slotCap = (slot) => (slot === 'face' || slot === '얼굴' ? 2 : 1)

// 옷장: 이 그룹에서 내 프로필 꾸미기를 갈아입는 페이지. 보유한 꾸미기를 슬롯별로 보여 주고,
// 클릭하면 위치 조정 모달(그룹 선택 없이 바로 이 그룹 대상)이 뜬다.
export default function Closet() {
  const { groupId } = useParams()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rows, setRows] = useState([])   // 보유한 deco-* user_items 행(전체 그룹 포함)
  const [me, setMe] = useState(null)
  const [editItem, setEditItem] = useState(null) // { } 편집 대상 아이템 id | null

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [storeItems, inv, cards] = await Promise.all([
        listStoreItems(), listInventory(user.id), listMemberCards(groupId).catch(() => []),
      ])
      setStoreCatalog(storeItems)
      setRows(inv.filter((r) => r.item_id.startsWith('deco-')))
      setMe(cards.find((c) => c.is_self) || null)
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }, [groupId, user?.id])
  useEffect(() => { load() }, [load])

  // item_id → 그 아이템의 보유 행들(여러 그룹에 걸쳐 있을 수 있음)
  const owned = useMemo(() => {
    const map = new Map()
    for (const r of rows) {
      if (!map.has(r.item_id)) map.set(r.item_id, [])
      map.get(r.item_id).push(r)
    }
    return map
  }, [rows])

  // item_id → tf(이 그룹에 장착 중인 것만)
  const wornHere = useMemo(() => {
    const m = new Map()
    for (const [id, rs] of owned) {
      const row = rs.find((r) => r.status === 'used' && r.group_id === groupId)
      if (row) m.set(id, row.deco_tf || null)
    }
    return m
  }, [owned, groupId])

  // 다른 그룹에 장착 중이라 이 그룹에서는 고를 수 없는 아이템
  const wornElsewhere = useMemo(() => {
    const s = new Set()
    for (const [id, rs] of owned) {
      if (rs.some((r) => r.status === 'used' && r.group_id && r.group_id !== groupId)) s.add(id)
    }
    return s
  }, [owned, groupId])

  const sections = useMemo(() => {
    const bySlot = new Map()
    for (const id of owned.keys()) {
      const slot = slotOf(id)
      if (!bySlot.has(slot)) bySlot.set(slot, [])
      bySlot.get(slot).push(id)
    }
    return [...bySlot.entries()]
      .sort((a, b) => (SLOT_RANK[a[0]] ?? 99) - (SLOT_RANK[b[0]] ?? 99))
      .map(([slot, ids]) => ({ slot, ids }))
  }, [owned])

  const previewDeco = useMemo(() => [...wornHere.entries()].map(([id, tf]) => ({ id, tf })), [wornHere])

  if (loading) return <div className="page"><div className="spinner" /></div>

  return (
    <div className="page">
      {error && <div className="alert alert-error">{error}</div>}

      <div className="closet-preview">
        <Avatar src={me?.avatar_url || null} name={me?.display_nickname || '나'} size={132} deco={previewDeco} />
      </div>

      {sections.length === 0 ? (
        <div className="empty">보유한 프로필 꾸미기가 없어요.<br />상점에서 구매해 보세요.</div>
      ) : (
        sections.map((sec) => (
          <section key={sec.slot} className="inv-section">
            <div className="inv-section-head">
              <span className="inv-section-title">{slotLabel(sec.slot)}</span>
              <span className="inv-section-count">{sec.ids.length}종</span>
            </div>
            <div className="inv-grid">
              {sec.ids.map((id) => {
                const isHere = wornHere.has(id)
                const isElsewhere = wornElsewhere.has(id)
                return (
                  <button key={id} type="button"
                    className={`inv-card2 ${isHere ? 'is-worn' : ''} ${isElsewhere ? 'is-static is-disabled' : ''}`}
                    disabled={isElsewhere} onClick={isElsewhere ? undefined : () => setEditItem(id)}>
                    <span className="inv-thumb" style={{ background: bgOf(id, true) }}>
                      <StoreItemImage id={id} emoji="✨" className="inv-thumb-img" />
                      {(isHere || isElsewhere) && <span className="inv-badge-state">장착 중</span>}
                    </span>
                    <span className="inv-name">{catalogName(id) || id}</span>
                  </button>
                )
              })}
            </div>
          </section>
        ))
      )}

      <ClosetItemModal open={!!editItem} onClose={() => setEditItem(null)}
        groupId={groupId} itemId={editItem} wornHere={wornHere} me={me} myId={user?.id} onDone={load} />
    </div>
  )
}

// 아이템 하나를 이 그룹에 장착(위치·크기·각도 조정 포함) — 인벤토리의 DecoModal 과 같은 동작이지만
// 그룹은 이미 정해져 있으므로 그룹 선택 필드는 없다.
function ClosetItemModal({ open, onClose, groupId, itemId, wornHere, me, myId, onDone }) {
  const [tf, setTf] = useState(DECO_TF0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [replaceId, setReplaceId] = useState('')

  const alreadyHere = itemId && wornHere.has(itemId)
  const slot = itemId ? slotOf(itemId) : null
  const cap = slotCap(slot)
  // 같은 슬롯에서 이 그룹에 이미 장착 중인 다른 아이템(자기 자신 제외) — 정원 계산용
  const others = useMemo(() => {
    if (!itemId) return []
    return [...wornHere.keys()].filter((id) => id !== itemId && slotOf(id) === slot)
  }, [itemId, wornHere, slot])
  const overCap = others.length >= cap
  // 정원이 1개뿐인 슬롯(머리/안경/테두리)은 고를 필요 없이 바로 교체, 얼굴(2개)만 선택창 필요
  const needPick = overCap && cap > 1

  useEffect(() => {
    if (!open) return
    setError(''); setBusy(false)
    setTf(itemId && wornHere.get(itemId) ? clampTf(wornHere.get(itemId), itemId) : { ...DECO_TF0 })
    setReplaceId(others[0] || '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, itemId])

  async function apply() {
    if (!itemId) return
    setBusy(true); setError('')
    try {
      if (!alreadyHere && overCap) {
        const toRemove = cap > 1 ? replaceId : others[0]
        if (toRemove) await unapplyAvatarDeco(toRemove)
      }
      if (!alreadyHere) await applyAvatarDeco(itemId, groupId)
      const v = clampTf(tf, itemId)
      const prevTf = wornHere.get(itemId) || DECO_TF0
      if (!isTf0(v) || (alreadyHere && !isTf0(prevTf))) await setAvatarDecoTf(itemId, groupId, isTf0(v) ? null : v)
      await onDone(); onClose()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} cardClassName="nc-link-modal">
      <div className="couple-modal">
        {itemId && (
          <div className="nc-link-head">
            <span className="nc-link-ico" style={{ background: bgOf(itemId, true) }}>
              <StoreItemImage id={itemId} emoji="✨" className="nc-img" />
            </span>
            <div><div className="nc-link-name">{catalogName(itemId) || itemId}</div></div>
          </div>
        )}
        {error && <div className="alert alert-error">{error}</div>}
        {needPick && (
          <label className="field">
            <span>해제할 아이템</span>
            <select value={replaceId} onChange={(e) => setReplaceId(e.target.value)}>
              {others.map((id) => <option key={id} value={id}>{catalogName(id) || id}</option>)}
            </select>
          </label>
        )}
        {itemId && (
          <DecoAdjuster itemId={itemId} src={me?.avatar_url || null} name={me?.display_nickname || '나'}
            seed={myId} tf={tf} onChange={setTf} />
        )}
        <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={apply}>
          {busy ? '적용 중…' : '적용하기'}
        </button>
      </div>
    </Modal>
  )
}
