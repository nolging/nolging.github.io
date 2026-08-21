import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useParams, useNavigate, useOutletContext } from 'react-router-dom'
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
// 얼굴/머리 슬롯은 2개까지, 나머지는 1개까지 — apply_avatar_deco 와 동일 규칙
// (deco-face-slot-capacity.sql, deco-head-slot-capacity.sql)
const slotCap = (slot) => (['face', '얼굴', 'head', '머리'].includes(slot) ? 2 : 1)
const tfEq = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null)

// 옷장: 이 그룹에서 내 프로필 꾸미기를 갈아입는 페이지. 화면에서 고르는 동안은 로컬 상태만
// 바뀌고(미리보기 즉시 반영), 실제 서버 반영은 상단바 "완료"를 눌렀을 때 한 번에 이뤄진다.
// "<" 로 나가면(완료를 안 눌렀으면) 아무것도 저장되지 않는다 — 바뀐 게 있으면 확인창을 띄운다.
export default function Closet() {
  const { groupId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { setBackHandler, setHeaderSubmit } = useOutletContext()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rows, setRows] = useState([])   // 보유한 deco-* user_items 행(전체 그룹 포함)
  const [me, setMe] = useState(null)
  const [editItem, setEditItem] = useState(null) // 편집 대상 아이템 id | null
  const [worn, setWorn] = useState(new Map())       // 로컬(미저장) 착장 상태: item_id → tf
  const initialWornRef = useRef(new Map())          // 진입 시점 착장 상태(비교·저장용 기준)
  const wornRef = useRef(worn)
  wornRef.current = worn

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [storeItems, inv, cards] = await Promise.all([
        listStoreItems(), listInventory(user.id), listMemberCards(groupId).catch(() => []),
      ])
      setStoreCatalog(storeItems)
      setRows(inv.filter((r) => r.item_id.startsWith('deco-')))
      setMe(cards.find((c) => c.is_self) || null)
      const w = new Map()
      for (const r of inv) {
        if (r.item_id.startsWith('deco-') && r.status === 'used' && r.group_id === groupId) w.set(r.item_id, r.deco_tf || null)
      }
      setWorn(w); initialWornRef.current = new Map(w)
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }, [groupId, user?.id])
  useEffect(() => { load() }, [load])

  const hasChanges = useMemo(() => {
    const a = initialWornRef.current, b = worn
    if (a.size !== b.size) return true
    for (const [id, tf] of a) { if (!b.has(id) || !tfEq(b.get(id), tf)) return true }
    return false
  }, [worn])

  // 서버에 실제 반영: 진입 시점 대비 늘어난/줄어든/조정값이 바뀐 아이템만 반영
  const save = useCallback(async () => {
    const initial = initialWornRef.current, current = wornRef.current
    const toUnequip = [...initial.keys()].filter((id) => !current.has(id))
    const toEquip = [...current.keys()].filter((id) => !initial.has(id))
    const toRetune = [...current.keys()].filter((id) => initial.has(id) && !tfEq(current.get(id), initial.get(id)))
    try {
      for (const id of toUnequip) await unapplyAvatarDeco(id, groupId)
      for (const id of toEquip) {
        await applyAvatarDeco(id, groupId)
        const tf = current.get(id)
        if (tf && !isTf0(tf)) await setAvatarDecoTf(id, groupId, tf)
      }
      for (const id of toRetune) {
        const tf = current.get(id)
        await setAvatarDecoTf(id, groupId, isTf0(tf) ? null : tf)
      }
      navigate(-1)
    } catch (e) { setError(e.message) }
  }, [groupId, navigate])

  useEffect(() => {
    setHeaderSubmit(() => () => save())
    return () => setHeaderSubmit(null)
  }, [setHeaderSubmit, save])

  useEffect(() => {
    setBackHandler(() => () => {
      if (hasChanges && !window.confirm('갈아입지 않고 원래 상태로 나갈까요?')) return
      navigate(-1)
    })
    return () => setBackHandler(() => null)
  }, [setBackHandler, hasChanges, navigate])

  // item_id → 그 아이템의 보유 행들(여러 그룹에 걸쳐 있을 수 있음)
  const owned = useMemo(() => {
    const map = new Map()
    for (const r of rows) {
      if (!map.has(r.item_id)) map.set(r.item_id, [])
      map.get(r.item_id).push(r)
    }
    return map
  }, [rows])

  // 다른 그룹에 장착 중인 아이템(로컬 상태와 무관 — 실제 서버 기준). 여분 사본(active 행)이
  // 있으면 이 그룹에도 적용할 수 있으니 카드는 그대로 활성 — 없으면 비활성화한다.
  const wornElsewhere = useMemo(() => {
    const s = new Set()
    for (const [id, rs] of owned) {
      if (rs.some((r) => r.status === 'used' && r.group_id && r.group_id !== groupId)) s.add(id)
    }
    return s
  }, [owned, groupId])
  const hasSpare = useMemo(() => {
    const s = new Set()
    for (const [id, rs] of owned) {
      if (rs.some((r) => r.status === 'active')) s.add(id)
    }
    return s
  }, [owned])

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

  const previewDeco = useMemo(() => [...worn.entries()].map(([id, tf]) => ({ id, tf })), [worn])

  // 모달에서 "적용하기" → 로컬 상태만 갱신(서버 반영은 완료를 눌렀을 때)
  function stage(itemId, tf, toRemove) {
    setWorn((prev) => {
      const next = new Map(prev)
      if (toRemove) next.delete(toRemove)
      next.set(itemId, isTf0(tf) ? null : tf)
      return next
    })
    setEditItem(null)
  }
  // 모달에서 "장착 해제" → 로컬 상태에서만 제거
  function unstage(itemId) {
    setWorn((prev) => { const next = new Map(prev); next.delete(itemId); return next })
    setEditItem(null)
  }

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
                const isHere = worn.has(id)
                // 다른 그룹에 적용된 사본이 있어도, 이 그룹에 이미 장착 중이면(다른 사본 얘기이므로)
                // 카드는 그대로 조작 가능해야 한다 — "다른 그룹에서 장착 중" 처리는 그 반대 경우만.
                const isElsewhere = !isHere && wornElsewhere.has(id)
                // 다른 그룹에 장착 중이라도 여분 사본(active 행)이 있으면 이 그룹에도 바로 적용할
                // 수 있으니 카드는 활성 상태로 두고 회색 배지만 단다 — 없으면 비활성화.
                const blocked = isElsewhere && !hasSpare.has(id)
                return (
                  <button key={id} type="button"
                    className={`inv-card2 ${isHere ? 'is-worn' : ''} ${blocked ? 'is-static is-disabled' : ''}`}
                    disabled={blocked} onClick={blocked ? undefined : () => setEditItem(id)}>
                    <span className="inv-thumb" style={{ background: bgOf(id, true) }}>
                      <StoreItemImage id={id} emoji="✨" className="inv-thumb-img" />
                      {(isHere || isElsewhere) && <span className={`inv-badge-state ${isElsewhere ? 'is-muted' : ''}`}>장착 중</span>}
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
        itemId={editItem} worn={worn} me={me} myId={user?.id} onStage={stage} onUnstage={unstage} />
    </div>
  )
}

// 아이템 하나를 이 그룹에 장착(위치·크기·각도 조정 포함) — 인벤토리의 DecoModal 과 같은 동작이지만
// 그룹은 이미 정해져 있어 그룹 선택 필드가 없고, 실제 서버 반영 없이 로컬 상태만 바꾼다(onStage).
function ClosetItemModal({ open, onClose, itemId, worn, me, myId, onStage, onUnstage }) {
  const [tf, setTf] = useState(DECO_TF0)
  const [replaceId, setReplaceId] = useState('')

  const alreadyHere = itemId && worn.has(itemId)
  const slot = itemId ? slotOf(itemId) : null
  const cap = slotCap(slot)
  // 같은 슬롯에서 이 그룹에 이미(로컬 기준) 장착 중인 다른 아이템(자기 자신 제외) — 정원 계산용
  const others = useMemo(() => {
    if (!itemId) return []
    return [...worn.keys()].filter((id) => id !== itemId && slotOf(id) === slot)
  }, [itemId, worn, slot])
  const overCap = !alreadyHere && others.length >= cap
  // 해제할 후보가 2개 이상이면(정원 2인 슬롯에서 이미 꽉 찬 상태로 하나 더 고를 때)
  // 어떤 걸 뺄지 직접 고르게 한다. 후보가 1개뿐이면 고를 필요 없이 그걸 바로 교체.
  const needPick = overCap && others.length > 1

  useEffect(() => {
    if (!open) return
    setTf(itemId && worn.get(itemId) ? clampTf(worn.get(itemId), itemId) : { ...DECO_TF0 })
    setReplaceId(others[0] || '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, itemId])

  function apply() {
    if (!itemId) return
    const toRemove = overCap ? (others.length > 1 ? replaceId : others[0]) : null
    onStage(itemId, clampTf(tf, itemId), toRemove)
  }

  return (
    <Modal open={open} onClose={onClose} cardClassName="nc-link-modal">
      <div className="couple-modal">
        {itemId && (
          <div className="nc-link-head">
            <span className="nc-link-ico" style={{ background: bgOf(itemId, true) }}>
              <StoreItemImage id={itemId} emoji="✨" className="nc-img" />
            </span>
            <div>
              <div className="nc-link-name">{catalogName(itemId) || itemId}</div>
              <div className="nc-link-sub">
                {slot === 'face' || slot === '얼굴' ? '프로필 사진 얼굴에 장착해요 (최대 2개)'
                  : slot === 'head' || slot === '머리' ? '프로필 사진 머리 위에 장착해요 (최대 2개)'
                    : '프로필 사진에 장착해요'}
              </div>
            </div>
          </div>
        )}
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
        <button type="button" className="btn btn-primary btn-block" onClick={apply}>적용하기</button>
        {alreadyHere && (
          <div className="cg-footer-center">
            <button type="button" className="cg-danger-link" onClick={() => onUnstage(itemId)}>장착 해제</button>
          </div>
        )}
      </div>
    </Modal>
  )
}
