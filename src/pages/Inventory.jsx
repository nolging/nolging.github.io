import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/Modal'
import Avatar from '../components/Avatar'
import StoreItemImage from '../components/StoreItemImage'
import { decoSlot } from '../components/AvatarDeco'
import RecipientPicker from '../components/RecipientPicker'
import GiftItemModal from '../components/GiftItemModal'
import ScratchCard from '../components/ScratchCard'
import { listStoreItems, listInventory, listMyGroups, useWish, useCoupleRing, useFriendRing, useCassette, useLink, useVideo, useBluray, getMyLedBanner, listFriendGroups, listCoupleGroups, scratchNyangpito, applyGroupTheme, unapplyGroupTheme, applyAvatarDeco, unapplyAvatarDeco, giftOwnedItem, useStickerBoard } from '../lib/api'
import { parseMusicUrl } from '../components/MusicPlayer'
import { parseVideoUrl } from '../components/VideoPlayer'
import { LedboardModal, LedEditModal } from '../components/LedModals'
import { FRUIT, Sticker } from '../components/StickerFruit'
import { CAT, CAT_ORDER, catOf, imgBgOf, itemName } from '../lib/storeMeta'

const MAX_WISH = 300

// 인벤토리 모달 공용 헤더 — 좌측 정렬(이미지 + 아이템명 한 줄), 사용 아이템은 설명(1줄) 포함
function ItemHead({ id, name, sub, emoji }) {
  return (
    <div className="nc-link-head">
      <span className="nc-link-ico" style={{ background: imgBgOf(id) }}><StoreItemImage id={id} emoji={emoji} className="nc-img" /></span>
      <div><div className="nc-link-name">{name}</div>{sub && <div className="nc-link-sub">{sub}</div>}</div>
    </div>
  )
}

export default function Inventory() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { refreshCoin } = useOutletContext()
  const [items, setItems] = useState([])   // 원본 인벤토리 행
  const [meta, setMeta] = useState({})     // itemId → { emoji, name }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [wishOpen, setWishOpen] = useState(false)
  const [coupleOpen, setCoupleOpen] = useState(false)
  const [friendOpen, setFriendOpen] = useState(false)
  const [friendGroupIds, setFriendGroupIds] = useState([]) // 이미 우정 링 적용된 그룹(내가 속한)
  const [cassetteOpen, setCassetteOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [videoOpen, setVideoOpen] = useState(false)
  const [blurayOpen, setBlurayOpen] = useState(false)
  const [ledboardOpen, setLedboardOpen] = useState(false)
  const [ledEditOpen, setLedEditOpen] = useState(false)
  const [ledBanner, setLedBanner] = useState(null) // 내가 게재한 활성 전광판
  const [guideItem, setGuideItem] = useState(null) // 사용 방법 + 선물/사용 선택 모달 (id)
  const [giftItemId, setGiftItemId] = useState(null) // 아이템 선물 모달 (id)
  const [scratchOpen, setScratchOpen] = useState(false)
  const [themeItem, setThemeItem] = useState(null) // 적용할 테마 아이템 { id, name }
  const [decoItem, setDecoItem] = useState(null)   // 적용할 아바타 데코 { id, name, appliedGroupId }
  const [stickerUse, setStickerUse] = useState(null) // 스티커판 색 선택 모달 { id, variant }
  const [notice, setNotice] = useState('') // 준비 중 안내(기타 아이템)

  async function reload() {
    if (!user?.id) return
    const [storeItems, inv, banner, friendIds] = await Promise.all([
      listStoreItems(), listInventory(user.id), getMyLedBanner().catch(() => null), listFriendGroups().catch(() => []),
    ])
    const m = {}
    for (const s of storeItems) m[s.id] = { emoji: s.emoji, name: s.name, sortOrder: s.sortOrder ?? 0, desc: s.desc || '' }
    setMeta(m)
    setItems(inv)
    setLedBanner(banner && banner.is_owner ? banner : null)
    setFriendGroupIds(friendIds)
  }

  useEffect(() => {
    let on = true
    ;(async () => {
      try { await reload() } catch (err) { if (on) setError(err.message) } finally { if (on) setLoading(false) }
    })()
    return () => { on = false }
  }, [user?.id])

  // 아이템 종류별로 묶기 (개수 + 원본 행들)
  const groups = useMemo(() => {
    const map = new Map()
    for (const r of items) {
      if (!map.has(r.item_id)) map.set(r.item_id, { id: r.item_id, name: itemName(r.item_id, meta[r.item_id]?.name || r.item_name), emoji: meta[r.item_id]?.emoji || '🎁', count: 0, rows: [] })
      const g = map.get(r.item_id)
      g.count++
      g.rows.push(r)
    }
    return [...map.values()]
  }, [items, meta])

  // 전광판 게재 중이면(아이템은 소모됨) "사용 중" 카드가 보이도록 합성 항목 추가
  const displayGroups = useMemo(() => {
    let list = groups
    if (ledBanner && !groups.some((g) => g.id === 'ledboard')) {
      list = [...groups, { id: 'ledboard', name: meta.ledboard?.name || '전광판', emoji: meta.ledboard?.emoji || '📟', count: 0, rows: [] }]
    }
    // 상점과 동일한 정렬(sort_order) 로 노출
    const ord = (id) => (meta[id]?.sortOrder ?? 999)
    return [...list].sort((a, b) => ord(a.id) - ord(b.id))
  }, [groups, ledBanner, meta])

  // 카테고리 섹션으로 묶기 (상점과 동일한 분류)
  const invSections = useMemo(() => CAT_ORDER.map((key) => ({
    key, label: CAT[key], items: displayGroups.filter((g) => catOf(g.id) === key),
  })).filter((s) => s.items.length), [displayGroups])

  const wishRows = useMemo(() => items.filter((r) => r.item_id === 'wish'), [items])
  // 이미 커플 링을 보냈거나(수락 대기) 장착한 그룹(중복 방지)
  const coupleGroupIds = useMemo(
    () => items.filter((r) => r.item_id === 'couple-ring' && (r.status === 'used' || r.status === 'pending')).map((r) => r.group_id).filter(Boolean),
    [items],
  )

  function useItem(g) {
    setNotice('')
    if (GUIDE[g.id]) setGuideItem(g.id)   // 선물 상자/카세트/비디오/블루레이/지우개/물풍선/망원경 → 중간 안내 모달
    else if (g.id === 'wish') setWishOpen(true)
    else if (g.id === 'couple-ring') setCoupleOpen(true)
    else if (g.id === 'friend-ring') setFriendOpen(true)
    else if (g.id === 'ledboard') setLedboardOpen(true)
    else if (g.id === 'nyangpito') setScratchOpen(true)
    else if (g.id.startsWith('theme-')) {
      const appliedRow = g.rows.find((r) => r.status === 'used')
      setThemeItem({ id: g.id, name: g.name, appliedGroupId: appliedRow?.group_id || null })
    }
    else if (g.id.startsWith('deco-')) {
      const appliedRow = g.rows.find((r) => r.status === 'used')
      setDecoItem({ id: g.id, name: g.name, desc: meta[g.id]?.desc || '', appliedGroupId: appliedRow?.group_id || null })
    }
    else setNotice(`${g.name}은(는) 아직 사용 준비 중이에요 🐾`)
  }

  // 안내 모달에서 '사용하기' → 해당 아이템의 실제 사용 모달 열기 (미디어 4종)
  function openUse(id) {
    setGuideItem(null)
    if (id === 'cassette') setCassetteOpen(true)
    else if (id === 'link') setLinkOpen(true)
    else if (id === 'video') setVideoOpen(true)
    else if (id === 'bluray') setBlurayOpen(true)
    else if (id.startsWith('sticker-')) setStickerUse({ id, variant: id === 'sticker-grape' ? 'grape' : 'apple' })
  }
  // 인벤토리 아이템 선물 → 보유분 1개 소모 + 선물 쪽지 전송
  async function inventoryGiftSend(r, message) {
    await giftOwnedItem(giftItemId, r.groupId, r.userId, 1, { message: message || null })
    await reload()
  }

  return (
    <div className="page">
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      {loading ? (
        <div className="spinner" />
      ) : displayGroups.length === 0 ? (
        <div className="empty">보유한 아이템이 없어요.<br />상점에서 구매하거나 선물받아 보세요.</div>
      ) : (
        invSections.map((sec) => (
          <section key={sec.key} className="inv-section">
            <div className="inv-section-head">
              <span className="inv-section-title">{sec.label}</span>
              <span className="inv-section-count">{sec.items.length}종</span>
            </div>
            <div className="inv-grid">
              {sec.items.map((g) => {
                const activeCount = g.rows.filter((r) => r.status === 'active').length
                const hasActive = activeCount > 0
                const equipped = (g.id === 'couple-ring' || g.id === 'friend-ring') && g.rows.some((r) => r.status === 'used')
                const pending = g.id === 'couple-ring' && g.rows.some((r) => r.status === 'pending')
                const ledLive = g.id === 'ledboard' && !!ledBanner
                const isTheme = g.id.startsWith('theme-')
                const themeApplied = isTheme && g.rows.some((r) => r.status === 'used')
                const isDeco = g.id.startsWith('deco-')
                const decoApplied = isDeco && g.rows.some((r) => r.status === 'used')
                // 시안: 상태 뱃지(좌) + 개수(우) + 카드 전체 클릭
                let badge = null, onClick = () => useItem(g), actionable = true
                let countShown = g.count, showCount = g.count > 1
                if (isTheme) badge = themeApplied ? '적용 중' : null
                else if (isDeco) badge = decoApplied ? '장착 중' : null
                else if (ledLive) { badge = '게재 중'; onClick = () => setLedEditOpen(true) }
                else if (equipped) {
                  // 장착 중이어도 미사용(active) 스페어가 있으면 "장착 중" 뱃지 + ×(남은 개수),
                  // 스페어가 있으면 클릭해 다른 그룹에 추가 사용 가능
                  badge = '장착 중'; actionable = activeCount > 0
                  countShown = activeCount; showCount = activeCount >= 1
                }
                else if (pending) { badge = '수락 대기'; actionable = false }
                else if (hasActive) badge = null
                return (
                  <button key={g.id} type="button" className={`inv-card2 ${actionable ? '' : 'is-static'}`}
                    onClick={actionable ? onClick : undefined}>
                    <span className="inv-thumb" style={{ background: imgBgOf(g.id) }}>
                      <StoreItemImage id={g.id} emoji={g.emoji} className="inv-thumb-img" />
                      {showCount && <span className="inv-badge-count">×{countShown}</span>}
                      {badge && <span className="inv-badge-state">{badge}</span>}
                      {decoSlot(g.id) && <span className="deco-slot-badge">{decoSlot(g.id) === 'head' ? '머리' : '얼굴'}</span>}
                    </span>
                    <span className="inv-name">{g.name}</span>
                  </button>
                )
              })}
            </div>
          </section>
        ))
      )}

      <WishModal open={wishOpen} onClose={() => setWishOpen(false)} wishRows={wishRows} onUsed={reload} />
      <CoupleModal open={coupleOpen} onClose={() => setCoupleOpen(false)} myId={user?.id} excludeGroupIds={coupleGroupIds} onDone={reload} />
      <FriendModal open={friendOpen} onClose={() => setFriendOpen(false)} myId={user?.id} excludeGroupIds={friendGroupIds} onDone={reload} />
      <MediaSendModal open={cassetteOpen} itemId="cassette" onClose={() => setCassetteOpen(false)} onDone={reload} />
      <MediaSendModal open={linkOpen} itemId="link" onClose={() => setLinkOpen(false)} onDone={reload} />
      <MediaSendModal open={videoOpen} itemId="video" onClose={() => setVideoOpen(false)} onDone={reload} />
      <MediaSendModal open={blurayOpen} itemId="bluray" onClose={() => setBlurayOpen(false)} onDone={reload} />
      <LedboardModal open={ledboardOpen} onClose={() => setLedboardOpen(false)} onDone={reload} refreshCoin={refreshCoin} />
      <LedEditModal open={ledEditOpen} onClose={() => setLedEditOpen(false)} banner={ledBanner} onDone={reload} />

      <ItemGuideModal id={guideItem} onClose={() => setGuideItem(null)}
        onUse={() => openUse(guideItem)}
        onGift={() => { const id = guideItem; setGuideItem(null); setGiftItemId(id) }} />

      <StickerUseModal item={stickerUse} coupleGroupId={coupleGroupIds[0]} onClose={() => setStickerUse(null)} onDone={reload} navigate={navigate} />

      <GiftItemModal open={!!giftItemId} onClose={() => setGiftItemId(null)}
        item={giftItemId ? { id: giftItemId, name: itemName(giftItemId, meta[giftItemId]?.name || GUIDE[giftItemId]?.name || giftItemId), emoji: meta[giftItemId]?.emoji || GUIDE[giftItemId]?.emoji } : null}
        qty={1} onSend={inventoryGiftSend} />

      <ScratchModal open={scratchOpen} onClose={() => setScratchOpen(false)} onDone={reload} refreshCoin={refreshCoin} />

      <ThemeModal open={!!themeItem} onClose={() => setThemeItem(null)} myId={user?.id}
        item={themeItem} onDone={reload} />

      <DecoModal open={!!decoItem} onClose={() => setDecoItem(null)} myId={user?.id}
        item={decoItem} onDone={reload} />
    </div>
  )
}

// ---- 아바타 꾸미기 적용/변경/해제 (프리미엄 그룹의 내 아바타) ----
function DecoModal({ open, onClose, myId, item, onDone }) {
  const [groups, setGroups] = useState([])
  const [premiumIds, setPremiumIds] = useState(new Set())
  const [groupId, setGroupId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const applied = !!item?.appliedGroupId

  useEffect(() => {
    if (!open) return
    setGroupId(item?.appliedGroupId || ''); setError('')
    Promise.all([listMyGroups(), listCoupleGroups(myId).catch(() => []), listFriendGroups().catch(() => [])])
      .then(([gs, c, f]) => { setGroups(gs); setPremiumIds(new Set([...(c || []), ...(f || [])])) })
      .catch((e) => setError(e.message))
  }, [open, myId, item])

  const eligible = useMemo(
    () => groups.filter((g) => premiumIds.has(g.id) && (g.group_members || []).some((m) => m.user_id === myId)),
    [groups, premiumIds, myId],
  )
  const appliedGroup = groups.find((g) => g.id === item?.appliedGroupId)
  const target = eligible.find((g) => g.id === groupId)
  const changed = groupId && groupId !== item?.appliedGroupId

  async function apply() {
    if (!target) { setError('그룹을 선택해 주세요.'); return }
    setBusy(true); setError('')
    try { await applyAvatarDeco(item.id, target.id); await onDone(); onClose() }
    catch (e) { setError(e.message); setBusy(false) }
  }
  async function unapply() {
    setBusy(true); setError('')
    try { await unapplyAvatarDeco(item.id); await onDone(); onClose() }
    catch (e) { setError(e.message); setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} cardClassName="nc-link-modal">
      <div className="couple-modal">
        <ItemHead id={item?.id} name={item?.name || '프로필 꾸미기'} emoji="✨"
          sub={item ? (decoSlot(item.id) === 'face' ? '프로필 사진 얼굴에 장착해요' : '프로필 사진 머리 위에 장착해요') : ''} />
        {error && <div className="alert alert-error">{error}</div>}

        {applied && (
          <div className="couple-to">
            <span className="couple-to-label">적용 중</span>
            <span className="couple-to-value">{appliedGroup?.name || '알 수 없는 그룹'}</span>
          </div>
        )}

        <label className="field">
          <span>{applied ? '적용할 그룹 변경' : '적용할 그룹'}</span>
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">{eligible.length ? '그룹 선택' : '적용할 수 있는 프리미엄 그룹이 없어요'}</option>
            {eligible.map((g) => <option key={g.id} value={g.id}>{g.name}{g.id === item?.appliedGroupId ? ' (현재)' : ''}</option>)}
          </select>
        </label>

        <button type="button" className="btn btn-primary btn-block" onClick={apply}
          disabled={busy || !target || (applied && !changed)}>
          {busy ? '적용 중…' : applied ? '이 그룹으로 변경' : '적용하기'}
        </button>
        {applied && (
          <button type="button" className="btn btn-danger btn-block" onClick={unapply} disabled={busy}>
            장착 해제
          </button>
        )}
      </div>
    </Modal>
  )
}

// ---- 그룹 꾸미기 테마 적용/변경/해제 (프리미엄 그룹) ----
function ThemeModal({ open, onClose, myId, item, onDone }) {
  const [groups, setGroups] = useState([])
  const [premiumIds, setPremiumIds] = useState(new Set())
  const [groupId, setGroupId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const applied = !!item?.appliedGroupId

  useEffect(() => {
    if (!open) return
    setGroupId(item?.appliedGroupId || ''); setError('')
    Promise.all([listMyGroups(), listCoupleGroups(myId).catch(() => []), listFriendGroups().catch(() => [])])
      .then(([gs, c, f]) => { setGroups(gs); setPremiumIds(new Set([...(c || []), ...(f || [])])) })
      .catch((e) => setError(e.message))
  }, [open, myId, item])

  const themeId = item ? item.id.replace(/^theme-/, '') : ''
  const eligible = useMemo(
    () => groups.filter((g) => premiumIds.has(g.id) && (g.group_members || []).some((m) => m.user_id === myId)),
    [groups, premiumIds, myId],
  )
  const appliedGroup = groups.find((g) => g.id === item?.appliedGroupId)
  const target = eligible.find((g) => g.id === groupId)
  const changed = groupId && groupId !== item?.appliedGroupId

  async function apply() {
    if (!target) { setError('그룹을 선택해 주세요.'); return }
    setBusy(true); setError('')
    try {
      await applyGroupTheme(target.id, themeId)
      await onDone()
      onClose()
    } catch (e) { setError(e.message); setBusy(false) }
  }

  async function unapply() {
    setBusy(true); setError('')
    try {
      await unapplyGroupTheme(themeId)
      await onDone()
      onClose()
    } catch (e) { setError(e.message); setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} cardClassName="nc-link-modal">
      <div className="couple-modal">
        <ItemHead id={item?.id} name={item?.name || '그룹 테마'} sub="프리미엄 그룹에 적용하는 꾸미기 테마" emoji="💕" />
        {error && <div className="alert alert-error">{error}</div>}

        {applied && (
          <div className="couple-to">
            <span className="couple-to-label">적용 중</span>
            <span className="couple-to-value">{appliedGroup?.name || '알 수 없는 그룹'}</span>
          </div>
        )}

        <label className="field">
          <span>{applied ? '적용할 그룹 변경' : '적용할 그룹'}</span>
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">{eligible.length ? '그룹 선택' : '적용할 수 있는 프리미엄 그룹이 없어요'}</option>
            {eligible.map((g) => <option key={g.id} value={g.id}>{g.name}{g.id === item?.appliedGroupId ? ' (현재)' : ''}</option>)}
          </select>
        </label>

        <button type="button" className="btn btn-primary btn-block" onClick={apply}
          disabled={busy || !target || (applied && !changed)}>
          {busy ? '적용 중…' : applied ? '이 그룹으로 변경' : '적용하기'}
        </button>
        {applied && (
          <button type="button" className="btn btn-danger btn-block" onClick={unapply} disabled={busy}>
            적용 해제
          </button>
        )}
      </div>
    </Modal>
  )
}

// ---- 냥피또: 스크래치 복권 ----
function ScratchModal({ open, onClose, onDone, refreshCoin }) {
  const [prize, setPrize] = useState(null)      // null=아직 미확정(긁기/확인 전)
  const [revealed, setRevealed] = useState(false)
  const [committed, setCommitted] = useState(false) // 실제 사용됨(긁기 시작 또는 결과 확인)
  const [forceReveal, setForceReveal] = useState(false)
  const [error, setError] = useState('')
  const rollingRef = useRef(false)

  useEffect(() => {
    if (open) { setPrize(null); setRevealed(false); setCommitted(false); setForceReveal(false); setError(''); rollingRef.current = false }
  }, [open])

  // 실제 사용: 냥피또 1개 소모 + 당첨 계산(서버). 최초 1회만.
  const roll = useCallback(async () => {
    if (rollingRef.current) return
    rollingRef.current = true
    setCommitted(true)
    try {
      const p = await scratchNyangpito()
      setPrize(p)
    } catch (e) {
      setError(e.message)
    }
  }, [])

  async function finish() {
    try { await onDone() } catch { /* noop */ }
    refreshCoin?.()
    onClose()
  }
  // 배경 클릭 등으로 닫기: 사용했으면 정리(갱신 후 닫기), 안 했으면 그냥 닫기(미사용)
  function handleClose() { if (committed) finish(); else onClose() }
  // 결과 확인 버튼: 아직 안 긁었으면 사용+공개, 이미 공개면 닫기
  async function confirmBtn() {
    if (!revealed) { await roll(); setForceReveal(true); return }
    await finish()
  }

  const known = prize != null
  const win = known && prize > 0

  return (
    <Modal open={open} onClose={handleClose} cardClassName="nc-link-modal">
      <div className="scratch-modal">
        <ItemHead id="nyangpito" name="냥피또" sub="동전으로 긁어 보세요" emoji="🐱" />
        {error ? (
          <>
            <div className="alert alert-error">{error}</div>
            <button type="button" className="btn btn-primary btn-block" onClick={handleClose}>닫기</button>
          </>
        ) : (
          <>
            <ScratchCard onStart={roll} onReveal={() => setRevealed(true)} reveal={forceReveal}>
              {known ? (
                <div className={`scratch-result ${win ? '' : 'lose'}`}>
                  <span className="scratch-emoji">{win ? '🍬' : '🐾'}</span>
                  <span className="scratch-label">{win ? '축하해요! 츄르 당첨' : '아쉬워요… 다음 기회에'}</span>
                  <span className="scratch-amt">{win ? `+${prize}` : '꽝'}</span>
                </div>
              ) : (
                <div className="scratch-result">
                  <span className="scratch-emoji">🐾</span>
                  <span className="scratch-label">긁는 중…</span>
                </div>
              )}
            </ScratchCard>
            {revealed ? (
              <button type="button" className="btn btn-block btn-primary" onClick={confirmBtn}>
                {win ? `${prize}츄르 받기` : '확인'}
              </button>
            ) : (
              <button type="button" className="scratch-reveal-link" onClick={confirmBtn}>결과 바로 확인 &gt;</button>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}

// ---- 링크 URL 정규화 ----
function normalizeUrl(u) {
  const s = (u || '').trim()
  if (!s) return ''
  return /^https?:\/\//i.test(s) ? s : `https://${s}`
}

// 미디어(링크 첨부) 아이템별 설정 — 쪽지 쓰기 페이지 모달과 동일한 헤더/placeholder
const MEDIA_CFG = {
  link: {
    name: () => '선물 상자', emoji: '🎁',
    sub: '선물 상자로 포장할 링크를 입력해 주세요', placeholder: '링크(URL) 입력',
    validate: (u) => { const l = normalizeUrl(u); return l && /\./.test(l) ? l : null },
    linkErr: '올바른 링크(URL)를 입력해 주세요.',
    send: (a) => useLink(a),
  },
  cassette: {
    name: () => itemName('cassette', '카세트 테이프'), emoji: '📼',
    sub: '공유하고 싶은 음악 링크를 입력해 주세요', placeholder: '유튜브 / 사운드클라우드 링크',
    validate: (u) => (parseMusicUrl(u.trim()) ? u.trim() : null),
    linkErr: '유튜브 또는 사운드클라우드 링크만 보낼 수 있어요.',
    send: (a) => useCassette(a),
  },
  video: {
    name: () => '비디오 테이프', emoji: '📹',
    sub: '공유하고 싶은 영상 링크를 입력해 주세요', placeholder: '유튜브 링크',
    validate: (u) => (parseVideoUrl(u.trim()) ? u.trim() : null),
    linkErr: '유튜브 영상 링크만 보낼 수 있어요.',
    send: (a) => useVideo(a),
  },
  bluray: {
    name: () => '블루레이', emoji: '💿',
    sub: '공유하고 싶은 영상 링크를 입력해 주세요', placeholder: '유튜브 링크',
    validate: (u) => (parseVideoUrl(u.trim()) ? u.trim() : null),
    linkErr: '유튜브 영상 링크만 보낼 수 있어요.',
    send: (a) => useBluray(a),
  },
}

// 링크 첨부 아이템 공용 사용 모달(쪽지 쓰기 페이지 모달 디자인) — 받는 사람 + 링크 + 메시지 → 보내기
function MediaSendModal({ open, itemId, onClose, onDone }) {
  const cfg = MEDIA_CFG[itemId]
  const [message, setMessage] = useState('')
  const [url, setUrl] = useState('')
  const [recipient, setRecipient] = useState(null)
  const [pickOpen, setPickOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) { setMessage(''); setUrl(''); setRecipient(null); setError(''); setSending(false) }
  }, [open])

  if (!cfg) return null

  async function send() {
    if (!recipient) { setError('받는 사람을 선택해 주세요.'); return }
    const link = cfg.validate(url)
    if (!link) { setError(cfg.linkErr); return }
    setSending(true); setError('')
    try {
      await cfg.send({ groupId: recipient.groupId, recipientId: recipient.userId, message: message.trim(), url: link })
      await onDone()
      onClose()
    } catch (e) { setError(e.message); setSending(false) }
  }

  return (
    <>
      <Modal open={open && !pickOpen} onClose={onClose} cardClassName="nc-link-modal">
        <div className="nc-link">
          <div className="nc-link-head">
            <span className="nc-link-ico" style={{ background: imgBgOf(itemId) }}><StoreItemImage id={itemId} emoji={cfg.emoji} className="nc-img" /></span>
            <div><div className="nc-link-name">{cfg.name()}</div><div className="nc-link-sub">{cfg.sub}</div></div>
          </div>
          {error && <div className="alert alert-error nc-modal-alert">{error}</div>}

          <button type="button" className="nc-to" onClick={() => setPickOpen(true)}>
            <span className="nc-label">To.</span>
            {recipient
              ? <span className="nc-to-val"><Avatar src={recipient.avatar} name={recipient.name} size={26} />{recipient.name}</span>
              : <span className="nc-placeholder">받는 사람을 선택하세요</span>}
            <svg className="nc-chev" width="16" viewBox="0 0 24 24" fill="none" stroke="#b0b0b8" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18" /></svg>
          </button>

          <div className="nc-link-input">
            <svg width="15" viewBox="0 0 24 24" fill="none" stroke="#b0b0b8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
            <input type="url" value={url} placeholder={cfg.placeholder} onChange={(e) => { setUrl(e.target.value); if (error) setError('') }} inputMode="url" autoCapitalize="none" autoCorrect="off" />
          </div>

          <div className="nc-body-wrap">
            <textarea className="nc-body" placeholder="함께 보낼 메시지(선택)" value={message} maxLength={150} rows={4}
              onChange={(e) => setMessage(e.target.value.slice(0, 150))} />
            <span className="nc-count">{message.length}/150</span>
          </div>

          <button type="button" className="nc-sheet-confirm" onClick={send} disabled={sending}>
            {sending ? '보내는 중…' : '보내기'}
          </button>
        </div>
      </Modal>
      <RecipientPicker open={pickOpen} onClose={() => setPickOpen(false)} title="받는 사람"
        onPick={(r) => { setRecipient(r); setPickOpen(false) }} />
    </>
  )
}

// 중간 안내 모달 대상 아이템: 사용 방법 + [선물하기 / 사용하기|확인]
//  canUse: 사용 모달이 따로 있는 아이템(미디어 4종) 은 '사용하기', 아니면 '확인'
const GUIDE = {
  link:      { name: '선물 상자',      emoji: '🎁', text: '쪽지를 보낼 때 링크를 선물 상자로 예쁘게 포장해서 함께 보내요.', canUse: true },
  cassette:  { name: itemName('cassette', '카세트 테이프'), emoji: '📼', text: '좋아하는 음악 링크를 담아 쪽지와 함께 보내요.', canUse: true },
  video:     { name: '비디오 테이프',  emoji: '📹', text: '보여 주고 싶은 영상 링크를 담아 쪽지와 함께 보내요.', canUse: true },
  bluray:    { name: '블루레이',       emoji: '💿', text: '고화질 영상 링크를 담아 쪽지와 함께 보내요.', canUse: true },
  telescope: { name: '천체 망원경',    emoji: '🔭', text: '흐릿하게 보이는 추억 리뷰가 있을 때 사용해 보세요.', canUse: false },
  eraser:    { name: '지우개',         emoji: '🧽', text: '쪽지를 보낼 때 내 이름을 지우고 익명으로 보내 보세요.', canUse: false },
  waterbomb: { name: '물풍선 폭탄',    emoji: '💧', text: '쪽지에 타이머를 설정해서 함께 보내면 펑! 이후에는 읽을 수 없게 돼요.', canUse: false },
  'sticker-grape': { name: '칭찬 포도판',   emoji: '🍇', text: '사용하면 내 칭찬 포도판이 생겨요. 데이트의 칭찬 스티커에서 짝꿍이 칭찬 포도알을 붙여줄 수 있어요.', canUse: true },
  'sticker-apple': { name: '칭찬 사과나무', emoji: '🍎', text: '사용하면 내 칭찬 사과나무가 생겨요. 데이트의 칭찬 스티커에서 짝꿍이 칭찬 사과를 붙여줄 수 있어요.', canUse: true },
}

// 사용 방법 안내 + 선물/사용 선택 모달 (상점 상세처럼 버튼 2개)
function ItemGuideModal({ id, onClose, onUse, onGift }) {
  const cfg = id ? GUIDE[id] : null
  return (
    <Modal open={!!id} onClose={onClose} cardClassName="nc-link-modal">
      {cfg && (
        <div className="nc-link">
          <div className="nc-link-head">
            <span className="nc-link-ico" style={{ background: imgBgOf(id) }}><StoreItemImage id={id} emoji={cfg.emoji} className="nc-img" /></span>
            <div className="nc-link-name">{cfg.name}</div>
          </div>
          <p className="tele-guide-label nc-mt">사용 방법</p>
          <p className="tele-guide-text">{cfg.text}</p>
          <div className="st-detail-actions ig-actions">
            <button type="button" className="st-btn-ghost" onClick={onGift}>선물하기</button>
            {cfg.canUse
              ? <button type="button" className="st-btn-buy" onClick={onUse}>사용하기</button>
              : <button type="button" className="st-btn-buy" onClick={onClose}>확인</button>}
          </div>
        </div>
      )}
    </Modal>
  )
}

// ---- 칭찬 스티커판: 색 선택 + 적용 완료 모달 ----
function StickerUseModal({ item, coupleGroupId, onClose, onDone, navigate }) {
  const f = item ? FRUIT[item.variant] : null
  const [color, setColor] = useState(f?.def)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  useEffect(() => { if (item) { setColor(FRUIT[item.variant].def); setDone(false); setError('') } }, [item])
  if (!item || !f) return <Modal open={false} onClose={onClose} />

  async function apply() {
    setBusy(true); setError('')
    try { await useStickerBoard(item.id, color); await onDone?.(); setDone(true) }
    catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <Modal open={!!item} onClose={onClose} cardClassName="nc-link-modal">
      {done ? (
        <div className="st-done is-gift">
          <div className="st-done-ico">🎉</div>
          <div className="st-done-t">적용 완료!</div>
          <div className="st-done-s">칭찬 {f.label}을(를) 적용했어요.<br />데이트의 칭찬 스티커에서 확인할 수 있어요.</div>
          <button type="button" className="st-btn-buy st-btn-block" disabled={!coupleGroupId}
            onClick={() => { onClose(); if (coupleGroupId) navigate(`/groups/${coupleGroupId}/praise`) }}>스티커판 보러 가기</button>
          <button type="button" className="st-btn-text" onClick={onClose}>닫기</button>
        </div>
      ) : (
        <div className="sticker-pick">
          <div className="sticker-pick-ttl">어떤 스티커로 붙일까요?</div>
          <div className="sticker-pick-opts">
            {f.options.map((o) => (
              <button key={o.key} type="button" className={`sticker-opt ${color === o.key ? 'on' : ''}`} onClick={() => setColor(o.key)}>
                <span className="sticker-opt-fruit"><Sticker variant={item.variant} bg={f.colors[o.key]} /></span>
                <span className="sticker-opt-label">{o.label}</span>
              </button>
            ))}
          </div>
          {error && <div className="alert alert-error" style={{ marginTop: 4 }}>{error}</div>}
          <button type="button" className="st-btn-buy st-btn-block" disabled={busy} onClick={apply}>{busy ? '적용 중…' : '적용하기'}</button>
        </div>
      )}
    </Modal>
  )
}

// ---- 소원권 사용 모달 ----
function WishModal({ open, onClose, wishRows, onUsed }) {
  const [fromId, setFromId] = useState('')
  const [wish, setWish] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const gifters = useMemo(() => {
    const map = new Map()
    for (const r of wishRows) {
      if (!r.from_user_id) continue
      if (!map.has(r.from_user_id)) map.set(r.from_user_id, { userId: r.from_user_id, name: r.from_name || '?', avatar: r.from_avatar, count: 0 })
      map.get(r.from_user_id).count++
    }
    return [...map.values()]
  }, [wishRows])

  useEffect(() => {
    if (open) {
      setWish(''); setError('')
      setFromId(gifters.length === 1 ? gifters[0].userId : '')
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const selected = gifters.find((g) => g.userId === fromId)

  async function grant() {
    if (!fromId) { setError('소원권을 준 사람을 선택해 주세요.'); return }
    if (!wish.trim()) { setError('소원을 입력해 주세요.'); return }
    setSending(true); setError('')
    try {
      await useWish({ fromUserId: fromId, wish: wish.trim() })
      await onUsed()
      onClose()
    } catch (err) { setError(err.message); setSending(false) }
  }

  return (
    <Modal open={open} onClose={onClose} cardClassName="nc-link-modal">
      <div className="wish-modal">
        <ItemHead id="wish" name="소원권" sub="받은 소원권으로 소원을 빌어 보세요" emoji="🎫" />
        {error && <div className="alert alert-error">{error}</div>}
        <div className="wish-to">
          <span className="wish-to-label">To.</span>
          {gifters.length <= 1 ? (
            selected ? (
              <span className="wish-to-value"><Avatar src={selected.avatar} name={selected.name} size={28} />{selected.name}</span>
            ) : (
              <span className="wish-to-empty">받은 소원권이 없어요</span>
            )
          ) : (
            <span className="wish-to-value">{selected ? <><Avatar src={selected.avatar} name={selected.name} size={28} />{selected.name}</> : <span className="wish-to-empty">아래에서 선택</span>}</span>
          )}
        </div>

        {gifters.length > 1 && (
          <div className="picker-members wish-gifters">
            {gifters.map((g) => (
              <button type="button" key={g.userId}
                className={`picker-member ${fromId === g.userId ? 'active' : ''}`}
                onClick={() => setFromId(g.userId)}>
                <Avatar src={g.avatar} name={g.name} size={32} />
                <span className="picker-member-name">{g.name}</span>
                {g.count > 1 && <span className="wish-gifter-count">{g.count}장</span>}
              </button>
            ))}
          </div>
        )}

        <div className="wish-body">
          <textarea className="wish-input" placeholder="이루고 싶은 소원을 적어 보세요"
            value={wish} maxLength={MAX_WISH} onChange={(e) => setWish(e.target.value)} rows={4} />
        </div>

        <button type="button" className="btn btn-primary btn-block" onClick={grant} disabled={sending}>
          {sending ? '비는 중…' : '소원 빌기'}
        </button>
      </div>
    </Modal>
  )
}

// ---- 커플 링 나눠 끼기 모달 ----
const MAX_COUPLE_MSG = 150

function CoupleModal({ open, onClose, myId, excludeGroupIds, onDone }) {
  const [groups, setGroups] = useState([])
  const [groupId, setGroupId] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || groups.length) return
    listMyGroups().then(setGroups).catch((e) => setError(e.message))
  }, [open, groups.length])
  useEffect(() => { if (open) { setGroupId(''); setMessage(''); setError('') } }, [open])

  const memberName = (m) => m.display_nickname || '멤버'
  // 멤버 2명 + 내가 멤버 + 아직 커플 링 안 낀(보내지 않은) 그룹
  const eligible = useMemo(() => groups.filter((g) => {
    const ms = g.group_members || []
    return ms.length === 2 && ms.some((m) => m.user_id === myId) && !excludeGroupIds.includes(g.id)
  }), [groups, myId, excludeGroupIds])

  const group = eligible.find((g) => g.id === groupId)
  const other = group ? (group.group_members || []).find((m) => m.user_id !== myId) : null

  async function share() {
    if (!group || !other) { setError('그룹을 선택해 주세요.'); return }
    setSending(true); setError('')
    try {
      await useCoupleRing({ groupId: group.id, recipientId: other.user_id, message: message.trim() })
      await onDone()
      onClose()
    } catch (e) { setError(e.message); setSending(false) }
  }

  return (
    <Modal open={open} onClose={onClose} cardClassName="nc-link-modal">
      <div className="couple-modal">
        <ItemHead id="couple-ring" name="커플 링" sub="연인과 나눠 끼면 특별한 능력이 생겨요" emoji="💍" />
        {error && <div className="alert alert-error">{error}</div>}
        <p className="couple-hint">멤버가 2명인 그룹에서 함께 낄 수 있어요. 상대가 수령하면 그때 적용돼요.</p>

        <label className="field">
          <span>그룹</span>
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">{eligible.length ? '그룹 선택' : '나눠 낄 수 있는 그룹이 없어요'}</option>
            {eligible.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>

        {other && (
          <div className="couple-to">
            <span className="couple-to-label">To.</span>
            <span className="couple-to-value"><Avatar src={other.avatar_url} name={memberName(other)} size={28} />{memberName(other)}</span>
          </div>
        )}

        <div className="couple-msg">
          <textarea className="wish-input" placeholder="함께 보낼 메시지를 적어 보세요 (선택)"
            value={message} maxLength={MAX_COUPLE_MSG} onChange={(e) => setMessage(e.target.value)} rows={3} />
          <span className="couple-msg-count">{message.length}/{MAX_COUPLE_MSG}</span>
        </div>

        <button type="button" className="btn btn-primary btn-block" onClick={share} disabled={!group || sending}>
          {sending ? '보내는 중…' : '나눠 끼기'}
        </button>
      </div>
    </Modal>
  )
}

// ---- 우정 링 나눠 끼기 모달 (2명 이상 그룹, 즉시 적용) ----
function FriendModal({ open, onClose, myId, excludeGroupIds, onDone }) {
  const [groups, setGroups] = useState([])
  const [groupId, setGroupId] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || groups.length) return
    listMyGroups().then(setGroups).catch((e) => setError(e.message))
  }, [open, groups.length])
  useEffect(() => { if (open) { setGroupId(''); setMessage(''); setError('') } }, [open])

  // 멤버 2명 이상 + 내가 멤버 + 아직 우정 링 미적용 그룹
  const eligible = useMemo(() => groups.filter((g) => {
    const ms = g.group_members || []
    return ms.length >= 2 && ms.some((m) => m.user_id === myId) && !excludeGroupIds.includes(g.id)
  }), [groups, myId, excludeGroupIds])
  const group = eligible.find((g) => g.id === groupId)

  async function share() {
    if (!group) { setError('그룹을 선택해 주세요.'); return }
    setSending(true); setError('')
    try {
      await useFriendRing({ groupId: group.id, message: message.trim() })
      await onDone()
      onClose()
    } catch (e) { setError(e.message); setSending(false) }
  }

  return (
    <Modal open={open} onClose={onClose} cardClassName="nc-link-modal">
      <div className="couple-modal">
        <ItemHead id="friend-ring" name="우정 링" sub="친구와 나눠 끼면 특별한 능력이 생겨요" emoji="🤝" />
        {error && <div className="alert alert-error">{error}</div>}
        <p className="couple-hint">멤버 2명 이상 그룹에 사용하면 바로 적용돼요. 모든 멤버에게 우정 링 쪽지가 전송돼요.</p>

        <label className="field">
          <span>그룹</span>
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">{eligible.length ? '그룹 선택' : '사용할 수 있는 그룹이 없어요'}</option>
            {eligible.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>

        <div className="couple-msg">
          <textarea className="wish-input" placeholder="함께 보낼 메시지를 적어 보세요 (선택)"
            value={message} maxLength={MAX_COUPLE_MSG} onChange={(e) => setMessage(e.target.value)} rows={3} />
          <span className="couple-msg-count">{message.length}/{MAX_COUPLE_MSG}</span>
        </div>

        <button type="button" className="btn btn-primary btn-block" onClick={share} disabled={!group || sending}>
          {sending ? '적용 중…' : '나눠 끼기'}
        </button>
      </div>
    </Modal>
  )
}
