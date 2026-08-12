import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/Modal'
import Avatar from '../components/Avatar'
import StoreItemImage from '../components/StoreItemImage'
import { decoSlot, DECO_TF0 } from '../components/AvatarDeco'
import DecoAdjuster, { clampTf, isTf0 } from '../components/DecoAdjuster'
import RecipientPicker from '../components/RecipientPicker'
import GiftItemModal from '../components/GiftItemModal'
import ScratchCard from '../components/ScratchCard'
import GraffitiPad from '../components/GraffitiPad'
import { listStoreItems, listInventory, listMyGroups, useWish, useCoupleRing, useFriendRing, useCassette, useLink, useVideo, useBluray, usePolaroidFilm, getMyLedBanner, listFriendGroups, listCoupleGroups, scratchNyangpito, applyGroupTheme, unapplyGroupTheme, applyAvatarDeco, unapplyAvatarDeco, setAvatarDecoTf, giftOwnedItem, useStickerBoard, useNameTag, nametagState, usePurinMic, purinMicState, listMemberCards, boardEligibleGroups, setupSecretBoard, sendMegaphone, getGroupDecoMap } from '../lib/api'
import { parseMusicUrl } from '../components/MusicPlayer'
import { parseVideoUrl } from '../components/VideoPlayer'
import { LedboardModal, LedEditModal } from '../components/LedModals'
import { FRUIT, Sticker } from '../components/StickerFruit'
import { CAT, CAT_ORDER, catOf, imgBgOf, itemName } from '../lib/storeMeta'
import { setStoreCatalog, bgOf, useStoreCatalog, catalogName, catalogDecoSlot } from '../lib/storeCatalog'
import { hhmmLeft, nametagActive, useCountdownTick } from '../lib/nametag'
import { uploadPolaroidPhoto, resizeToJpeg, uploadGraffitiImage } from '../lib/storage'

const MAX_WISH = 300
const NAME_TAG_MS = 24 * 3600 * 1000
const PURIN_MIC_MS = 24 * 3600 * 1000
// 꾸미기 유형(슬롯): 관리자 설정(카탈로그=표시명) 우선, 없으면 하드코딩 폴백.
// deco_slot 값이 곧 표시명. 레거시 영문 코드만 한글로 매핑.
const slotOf = (id) => catalogDecoSlot(id) || decoSlot(id)
const slotLabel = (slot) => ({ head: '머리', face: '얼굴', glasses: '안경' }[slot] || slot)
// 얼굴 슬롯은 한 번에 2개까지 동시 장착 가능(나머지는 1개, 백엔드 apply_avatar_deco 와 동일 규칙).
// deco_slot 값은 관리자가 자유 문자열로 설정하므로 영문/한글 표기 둘 다 인식한다.
const slotCapacity = (slot) => (slot === 'face' || slot === '얼굴' ? 2 : 1)
// 명찰 used 행이 아직 유효(24h 내)한지
const nameTagLive = (r) => r.item_id === 'name-tag' && r.status === 'used' && r.used_at && new Date(r.used_at).getTime() + NAME_TAG_MS > Date.now()
// 푸린 마이크 used 행이 아직 유효(24h 내)한지 — 명찰과 동일 패턴
const purinMicLive = (r) => r.item_id === 'purin-mic' && r.status === 'used' && r.used_at && new Date(r.used_at).getTime() + PURIN_MIC_MS > Date.now()

// 인벤토리 모달 공용 헤더 — 좌측 정렬(이미지 + 아이템명 한 줄), 사용 아이템은 설명(1줄) 포함
function ItemHead({ id, name, sub, emoji }) {
  useStoreCatalog()
  return (
    <div className="nc-link-head">
      <span className="nc-link-ico" style={{ background: bgOf(id) }}><StoreItemImage id={id} emoji={emoji} className="nc-img" /></span>
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
  const [coupleView, setCoupleView] = useState(null) // 장착 중인 커플 링 → 데이트 미리보기 { groupId, hasSpare }
  const [friendOpen, setFriendOpen] = useState(false)
  const [friendView, setFriendView] = useState(null) // 장착 중인 우정 링만 있을 때 → 장착 그룹 목록 { groupIds }
  const [friendGroupIds, setFriendGroupIds] = useState([]) // 이미 우정 링 적용된 그룹(내가 속한)
  const [cassetteOpen, setCassetteOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [videoOpen, setVideoOpen] = useState(false)
  const [blurayOpen, setBlurayOpen] = useState(false)
  const [polaroidOpen, setPolaroidOpen] = useState(false)
  const [ledboardOpen, setLedboardOpen] = useState(false)
  const [ledEditOpen, setLedEditOpen] = useState(false)
  const [ledBanner, setLedBanner] = useState(null) // 내가 게재한 활성 전광판
  const [guideItem, setGuideItem] = useState(null) // 사용 방법 + 선물/사용 선택 모달 (id)
  const [giftItemId, setGiftItemId] = useState(null) // 아이템 선물 모달 (id)
  const [scratchOpen, setScratchOpen] = useState(false)
  const [themeItem, setThemeItem] = useState(null) // 적용할 테마 아이템 { id, name }
  const [decoItem, setDecoItem] = useState(null)   // 적용할 아바타 데코 { id, name, appliedGroupId }
  const [stickerUse, setStickerUse] = useState(null) // 스티커판 색 선택 모달 { id, variant }
  const [nameTagOpen, setNameTagOpen] = useState(false) // 명찰(닉네임 변경) 모달
  const [purinMicOpen, setPurinMicOpen] = useState(false) // 푸린 마이크(짝꿍 낙서) 모달
  const [boardOpen, setBoardOpen] = useState(false)     // 비밀 게시판 개설 모달
  const [boardItemName, setBoardItemName] = useState('') // 아이템 이름(관리자에서 변경 가능 → 하드코딩 금지)
  const [megaphoneOpen, setMegaphoneOpen] = useState(false) // 확성기 모달
  const [notice, setNotice] = useState('') // 준비 중 안내(기타 아이템)

  async function reload() {
    if (!user?.id) return
    const [storeItems, inv, banner, friendIds] = await Promise.all([
      listStoreItems(), listInventory(user.id), getMyLedBanner().catch(() => null), listFriendGroups().catch(() => []),
    ])
    const m = {}
    for (const s of storeItems) m[s.id] = { emoji: s.emoji, name: s.name, sortOrder: s.sortOrder ?? 0, premium: !!s.premium, desc: s.desc || '', imageBg: s.imageBg || '', imageSvg: s.imageSvg || '', category: s.category || '' }
    setMeta(m); setStoreCatalog(storeItems)
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
      // 만료된 명찰(used) 행은 소모된 것 → 숨김
      if (r.item_id === 'name-tag' && r.status === 'used' && !nameTagLive(r)) continue
      // 만료된 푸린 마이크(used) 행도 동일 — 낙서와 함께 자동으로 사라짐
      if (r.item_id === 'purin-mic' && r.status === 'used' && !purinMicLive(r)) continue
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
    // 상점과 동일한 정렬(sort_order). 단 인벤토리는 일반/프리미엄이 한 카테고리로 합쳐지므로
    // (두 상점의 sort_order 시퀀스가 독립적) 프리미엄 아이템은 항상 일반 아이템 뒤로.
    const prem = (id) => (meta[id]?.premium ? 1 : 0)
    const ord = (id) => (meta[id]?.sortOrder ?? 999)
    return [...list].sort((a, b) => prem(a.id) - prem(b.id) || ord(a.id) - ord(b.id))
  }, [groups, ledBanner, meta])

  // 카테고리 섹션으로 묶기 (상점과 동일한 분류)
  const invSections = useMemo(() => CAT_ORDER.map((key) => ({
    key, label: CAT[key], items: displayGroups.filter((g) => catOf(g.id, meta[g.id]?.category) === key),
  })).filter((s) => s.items.length), [displayGroups, meta])

  const wishRows = useMemo(() => items.filter((r) => r.item_id === 'wish'), [items])
  // 이미 커플 링을 보냈거나(수락 대기) 장착한 그룹(중복 방지)
  const coupleGroupIds = useMemo(
    () => items.filter((r) => r.item_id === 'couple-ring' && (r.status === 'used' || r.status === 'pending')).map((r) => r.group_id).filter(Boolean),
    [items],
  )

  function useItem(g) {
    setNotice('')
    // 명찰 사용 중이면 안내 모달 없이 바로 닉네임 변경 모달
    if (g.id === 'name-tag' && g.rows.some(nameTagLive)) { setNameTagOpen(true); return }
    // 푸린 마이크 사용 중이면 안내 모달 없이 바로 낙서 수정 모달
    if (g.id === 'purin-mic' && g.rows.some(purinMicLive)) { setPurinMicOpen(true); return }
    if (GUIDE[g.id]) setGuideItem(g.id)   // 선물 상자/카세트/비디오/블루레이/지우개/물풍선/망원경 → 중간 안내 모달
    else if (g.id === 'wish') setWishOpen(true)
    else if (g.id === 'couple-ring') setCoupleOpen(true)
    else if (g.id === 'friend-ring') setFriendOpen(true)
    else if (g.id === 'ledboard') setLedboardOpen(true)
    else if (g.id === 'nyangpito') setScratchOpen(true)
    else if (g.id === 'secret-board') { setBoardItemName(g.name); setBoardOpen(true) }
    else if (g.id === 'megaphone') setMegaphoneOpen(true)
    else if (g.id.startsWith('theme-')) {
      const appliedRow = g.rows.find((r) => r.status === 'used')
      setThemeItem({ id: g.id, name: g.name, appliedGroupId: appliedRow?.group_id || null })
    }
    else if (g.id.startsWith('deco-')) {
      const appliedRow = g.rows.find((r) => r.status === 'used')
      setDecoItem({ id: g.id, name: g.name, desc: meta[g.id]?.desc || '',
        appliedGroupId: appliedRow?.group_id || null, tf: appliedRow?.deco_tf || null })
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
    else if (id === 'polaroid-film') setPolaroidOpen(true)
    else if (id.startsWith('sticker-')) setStickerUse({ id, variant: id === 'sticker-grape' ? 'grape' : 'apple' })
    else if (id === 'name-tag') setNameTagOpen(true)
    else if (id === 'purin-mic') setPurinMicOpen(true)
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
                const isNameTag = g.id === 'name-tag'
                const nameTagActive = isNameTag && g.rows.some(nameTagLive)
                const isPurinMic = g.id === 'purin-mic'
                const purinMicActive = isPurinMic && g.rows.some(purinMicLive)
                // 시안: 상태 뱃지(좌) + 개수(우) + 카드 전체 클릭
                let badge = null, onClick = () => useItem(g), actionable = true
                let countShown = g.count, showCount = g.count > 1
                if (isNameTag) { badge = nameTagActive ? '사용 중' : null; countShown = activeCount; showCount = activeCount >= 1 }
                else if (isPurinMic) { badge = purinMicActive ? '사용 중' : null; countShown = activeCount; showCount = activeCount >= 1 }
                else if (isTheme) badge = themeApplied ? '적용 중' : null
                else if (isDeco) badge = decoApplied ? '장착 중' : null
                else if (ledLive) { badge = '게재 중'; onClick = () => setLedEditOpen(true) }
                else if (equipped) {
                  // 장착 중이어도 미사용(active) 스페어가 있으면 "장착 중" 뱃지 + ×(남은 개수)
                  badge = '장착 중'
                  countShown = activeCount; showCount = activeCount >= 1
                  if (g.id === 'couple-ring') {
                    // 장착 중인 커플 링 → 데이트 미리보기 모달(스페어 있으면 나눠 끼기도 가능)
                    const usedGroupId = g.rows.find((r) => r.status === 'used')?.group_id
                    onClick = () => setCoupleView({ groupId: usedGroupId, hasSpare: activeCount > 0 })
                    actionable = true
                  } else if (activeCount > 0) {
                    // 우정 링: 스페어가 있으면 클릭해 다른 그룹에 추가 사용 가능(나눠 끼기 모달)
                    actionable = true
                  } else {
                    // 우정 링: 장착 중인 것만 있으면 나눠 낀 그룹 목록 모달
                    onClick = () => setFriendView({ groupIds: friendGroupIds })
                    actionable = true
                  }
                }
                else if (pending) { badge = '수락 대기'; actionable = false }
                else if (hasActive) badge = null
                return (
                  <button key={g.id} type="button" className={`inv-card2 ${actionable ? '' : 'is-static'}`}
                    onClick={actionable ? onClick : undefined}>
                    <span className="inv-thumb" style={{ background: meta[g.id]?.imageBg || imgBgOf(g.id) }}>
                      <StoreItemImage id={g.id} emoji={g.emoji} svg={meta[g.id]?.imageSvg} className="inv-thumb-img" />
                      {showCount && <span className="inv-badge-count">×{countShown}</span>}
                      {badge && <span className="inv-badge-state">{badge}</span>}
                      {slotOf(g.id) && <span className="deco-slot-badge">{slotLabel(slotOf(g.id))}</span>}
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
      <CoupleRingModal view={coupleView} myId={user?.id} navigate={navigate}
        onClose={() => setCoupleView(null)}
        onShareSpare={() => { setCoupleView(null); setCoupleOpen(true) }} />
      <FriendModal open={friendOpen} onClose={() => setFriendOpen(false)} myId={user?.id} excludeGroupIds={friendGroupIds} onDone={reload}
        equippedGroupIds={friendGroupIds} onViewEquipped={() => { setFriendOpen(false); setFriendView({ groupIds: friendGroupIds }) }} />
      <FriendRingModal view={friendView} navigate={navigate} onClose={() => setFriendView(null)} />
      <MediaSendModal open={cassetteOpen} itemId="cassette" onClose={() => setCassetteOpen(false)} onDone={reload} />
      <MediaSendModal open={linkOpen} itemId="link" onClose={() => setLinkOpen(false)} onDone={reload} />
      <MediaSendModal open={videoOpen} itemId="video" onClose={() => setVideoOpen(false)} onDone={reload} />
      <MediaSendModal open={blurayOpen} itemId="bluray" onClose={() => setBlurayOpen(false)} onDone={reload} />
      <PolaroidSendModal open={polaroidOpen} ownedCount={groups.find((g) => g.id === 'polaroid-film')?.count || 0}
        onClose={() => setPolaroidOpen(false)} onDone={reload} />
      <LedboardModal open={ledboardOpen} onClose={() => setLedboardOpen(false)} onDone={reload} refreshCoin={refreshCoin} />
      <LedEditModal open={ledEditOpen} onClose={() => setLedEditOpen(false)} banner={ledBanner} onDone={reload} />

      <ItemGuideModal id={guideItem} name={guideItem ? itemName(guideItem, meta[guideItem]?.name || GUIDE[guideItem]?.name) : ''}
        onClose={() => setGuideItem(null)}
        onUse={() => openUse(guideItem)}
        onGift={() => { const id = guideItem; setGuideItem(null); setGiftItemId(id) }} />

      <StickerUseModal item={stickerUse} coupleGroupId={coupleGroupIds[0]} onClose={() => setStickerUse(null)} onDone={reload} navigate={navigate} />

      <NameTagModal open={nameTagOpen} coupleGroupId={coupleGroupIds[0]} myId={user?.id} onClose={() => setNameTagOpen(false)} onDone={reload} />
      <PurinMicModal open={purinMicOpen} coupleGroupId={coupleGroupIds[0]} myId={user?.id} onClose={() => setPurinMicOpen(false)} onDone={reload} />
      <SecretBoardApplyModal open={boardOpen} itemName={boardItemName} onClose={() => setBoardOpen(false)} onDone={reload} />
      <MegaphoneModal open={megaphoneOpen} myId={user?.id} onClose={() => setMegaphoneOpen(false)} onDone={reload} />

      <GiftItemModal open={!!giftItemId} onClose={() => setGiftItemId(null)}
        item={giftItemId ? { id: giftItemId, name: itemName(giftItemId, meta[giftItemId]?.name || GUIDE[giftItemId]?.name || giftItemId), emoji: meta[giftItemId]?.emoji || GUIDE[giftItemId]?.emoji } : null}
        qty={1} onSend={inventoryGiftSend}
        excludeGroupIds={giftItemId === 'friend-ring' ? [...new Set([...coupleGroupIds, ...friendGroupIds])] : []} />

      <ScratchModal open={scratchOpen} onClose={() => setScratchOpen(false)} onDone={reload} refreshCoin={refreshCoin}
        count={displayGroups.find((g) => g.id === 'nyangpito')?.count || 0} />

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
  const [tf, setTf] = useState(DECO_TF0)       // 위치·크기·각도 조정값

  const applied = !!item?.appliedGroupId

  // 이 모달은 닫혀도 언마운트되지 않으므로(open=false 로만 바뀜) 열 때마다 상태를 초기화한다.
  // 특히 busy 를 되돌리지 않으면 다음에 열었을 때 버튼이 "적용 중…" 으로 멈춘다.
  useEffect(() => {
    if (!open) return
    setGroupId(item?.appliedGroupId || ''); setError(''); setBusy(false)
    setTf(item?.tf ? clampTf(item.tf, item.id) : { ...DECO_TF0 })
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
  // 그룹을 옮기면 조정값은 그 그룹 기준으로 새로 잡는다(사진이 다르므로)
  const tfChanged = !changed && JSON.stringify(clampTf(tf, item?.id)) !== JSON.stringify(clampTf(item?.tf || DECO_TF0, item?.id))

  // 선택한 그룹에 이미 같은 유형(슬롯)이 정원만큼 장착돼 있으면, 적용 전 어떤 걸 해제할지
  // 사용자가 고르게 한다(pickReplace). 정원 이내면(예: 얼굴 슬롯 1개만 장착 중) 그냥 같이
  // 장착되므로 후보가 비어 있다.
  const [replaceOptions, setReplaceOptions] = useState([]) // [{ id, name }] — 정원 초과 시 후보들
  const [pickReplace, setPickReplace] = useState(null) // { selected } | null — 선택 대기 중인 확인창
  useEffect(() => {
    setReplaceOptions([])
    if (!open || !item || !target) return
    const slot = catalogDecoSlot(item.id) || decoSlot(item.id) // 관리자 설정 슬롯 우선, 폴백 하드코딩
    const cap = slotCapacity(slot)
    let on = true
    getGroupDecoMap(target.id).then((dm) => {
      if (!on) return
      const worn = (dm?.[myId] || []) // [{ id, tf, usedAt }]
        .filter((d) => d.id !== item.id && (catalogDecoSlot(d.id) || decoSlot(d.id)) === slot)
      if (worn.length < cap) return
      // 오래 장착한 순으로 정렬(기본 선택값 = 가장 오래된 것, 백엔드 기본 규칙과 동일)
      const sorted = [...worn].sort((a, b) => new Date(a.usedAt || 0) - new Date(b.usedAt || 0))
      setReplaceOptions(sorted.map((d) => ({ id: d.id, name: catalogName(d.id) || '기존 아이템' })))
    }).catch(() => { })
    return () => { on = false }
  }, [open, item, target, myId])

  // 그룹을 바꾸면(사진이 다르므로) 조정값을 기본으로 되돌린다
  useEffect(() => { if (changed) setTf({ ...DECO_TF0 }) }, [changed])

  // 그룹별로 프로필 사진·닉네임이 다를 수 있어, 선택한 그룹의 내 것을 편집기에 쓴다
  const me = useMemo(
    () => (groups.find((g) => g.id === groupId)?.group_members || []).find((m) => m.user_id === myId),
    [groups, groupId, myId],
  )

  // willApply=true 인데 정원이 이미 찬 슬롯이면, 실제 적용 전에 무엇을 해제할지 사용자가
  // 고르게 한다(pickReplace 확인창) → 고르면 doApply(선택한 id) 로 이어진다.
  function apply() {
    if (!target) { setError('그룹을 선택해 주세요.'); return }
    const willApply = changed || !applied
    if (willApply && replaceOptions.length) { setPickReplace({ selected: replaceOptions[0].id }); return }
    doApply()
  }
  async function doApply(unequipFirst) {
    setBusy(true); setError('')
    try {
      if (unequipFirst) await unapplyAvatarDeco(unequipFirst)
      const willApply = changed || !applied
      if (willApply) await applyAvatarDeco(item.id, target.id)
      // 조정값 저장은 "그 그룹에 장착 중" 이어야 가능해 적용 뒤에 호출한다.
      // 기본값이고 저장된 값도 없으면 호출을 건너뛴다(조정 기능 미배포 DB 호환).
      const v = clampTf(tf, item.id)
      if (!isTf0(v) || !isTf0(item?.tf)) await setAvatarDecoTf(item.id, target.id, isTf0(v) ? null : v)
      setPickReplace(null)
      await onDone(); onClose()
    } catch (e) {
      setError(e.message); setPickReplace(null)
      await onDone().catch(() => { })   // 장착은 됐을 수 있으니 목록은 갱신
    } finally { setBusy(false) }
  }
  async function unapply() {
    setBusy(true); setError('')
    try { await unapplyAvatarDeco(item.id); await onDone(); onClose() }
    catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} cardClassName="nc-link-modal">
      <div className="couple-modal">
        <ItemHead id={item?.id} name={item?.name || '프로필 꾸미기'} emoji="✨"
          sub={item ? (
            slotOf(item.id) === 'face' || slotOf(item.id) === '얼굴' ? '프로필 사진 얼굴에 장착해요 (최대 2개)'
              : slotOf(item.id) === 'head' || slotOf(item.id) === '머리' ? '프로필 사진 머리 위에 장착해요'
                : '프로필 사진에 장착해요'
          ) : ''} />
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

        {/* item 은 모달이 닫히는 순간 null 이 되므로 반드시 함께 확인한다 */}
        {item && target && (
          <DecoAdjuster itemId={item.id} src={me?.avatar_url || null} name={me?.display_nickname || '나'}
            seed={myId} tf={tf} onChange={setTf} />
        )}

        <button type="button" className="btn btn-primary btn-block" onClick={apply}
          disabled={busy || !target || (applied && !changed && !tfChanged)}>
          {busy ? '적용 중…' : (applied && changed) ? '이 그룹으로 변경' : applied ? '조정 저장' : '적용하기'}
        </button>
        {applied && (
          <div className="cg-footer-center">
            <button type="button" className="cg-danger-link" onClick={unapply} disabled={busy}>장착 해제</button>
          </div>
        )}
      </div>

      <Modal open={!!pickReplace} onClose={() => setPickReplace(null)} title="얼굴 장식 교체">
        <div className="confirm-modal">
          <p className="confirm-text">얼굴 장식은 두 개까지만 장착할 수 있어요.<br />어떤 아이템을 해제할까요?</p>
          {pickReplace && (
            <label className="field">
              <span>해제할 아이템</span>
              <select value={pickReplace.selected} onChange={(e) => setPickReplace({ selected: e.target.value })}>
                {replaceOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </label>
          )}
          <div className="confirm-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setPickReplace(null)} disabled={busy}>취소</button>
            <button type="button" className="btn btn-primary" disabled={busy}
              onClick={() => doApply(pickReplace?.selected)}>{busy ? '적용 중…' : '확인'}</button>
          </div>
        </div>
      </Modal>
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

  // 닫혀도 언마운트되지 않으므로 열 때마다 초기화(busy 를 안 되돌리면 버튼이 멈춘다)
  useEffect(() => {
    if (!open) return
    setGroupId(item?.appliedGroupId || ''); setError(''); setBusy(false)
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
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  async function unapply() {
    setBusy(true); setError('')
    try {
      await unapplyGroupTheme(themeId)
      await onDone()
      onClose()
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
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

// ---- 비밀 게시판 개설 (프리미엄 그룹 · 미개설) ----
function SecretBoardApplyModal({ open, onClose, onDone, itemName }) {
  const [groups, setGroups] = useState([])
  const [groupId, setGroupId] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setGroupId(''); setName(''); setError(''); setBusy(false)
    boardEligibleGroups().then((gs) => setGroups(gs || [])).catch((e) => setError(e.message))
  }, [open])

  async function add() {
    if (!groupId) { setError('게시판을 추가할 그룹을 선택해 주세요.'); return }
    if (!name.trim()) { setError('게시판 이름을 입력해 주세요.'); return }
    setBusy(true); setError('')
    try {
      await setupSecretBoard(groupId, name.trim())
      await onDone()
      onClose()
    } catch (e) { setError(e.message); setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} cardClassName="nc-link-modal">
      <div className="couple-modal">
        <ItemHead id="secret-board" name={itemName || '비밀 게시판'} sub="프리미엄 그룹에 만들어요" emoji="🤫" />
        {error && <div className="alert alert-error">{error}</div>}
        <label className="field">
          <span>추가할 그룹</span>
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">{groups.length ? '그룹 선택' : '추가할 수 있는 프리미엄 그룹이 없어요'}</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
        <label className="field">
          <span>게시판 이름</span>
          <input value={name} maxLength={20} placeholder="게시판 이름을 입력하세요"
            onChange={(e) => setName(e.target.value)} />
        </label>
        <button type="button" className="btn btn-primary btn-block" disabled={busy || !groupId || !name.trim()} onClick={add}>
          {busy ? '추가 중…' : '추가하기'}
        </button>
      </div>
    </Modal>
  )
}

// ---- 확성기: 그룹 멤버 전원에게 메시지 알림 ----
function MegaphoneModal({ open, onClose, onDone, myId }) {
  const [groups, setGroups] = useState([])
  const [groupId, setGroupId] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setGroupId(''); setMsg(''); setError(''); setBusy(false)
    listMyGroups().then((gs) => setGroups((gs || []).filter((g) => (g.group_members || []).some((m) => m.user_id === myId))))
      .catch((e) => setError(e.message))
  }, [open, myId])

  async function send() {
    if (!groupId) { setError('보낼 그룹을 선택해 주세요.'); return }
    if (!msg.trim()) { setError('보낼 메시지를 입력해 주세요.'); return }
    setBusy(true); setError('')
    try {
      await sendMegaphone(groupId, msg.trim())
      await onDone()
      onClose()
    } catch (e) { setError(e.message); setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} cardClassName="nc-link-modal">
      <div className="couple-modal">
        <ItemHead id="megaphone" name="확성기" sub="그룹 멤버 전원에게 알림을 보내요" emoji="📣" />
        {error && <div className="alert alert-error">{error}</div>}
        <label className="field">
          <span>그룹</span>
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">{groups.length ? '그룹 선택' : '보낼 수 있는 그룹이 없어요'}</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
        <label className="field">
          <span>메시지</span>
          <textarea rows={3} value={msg} maxLength={500} placeholder="멤버들에게 보낼 메시지를 입력하세요"
            onChange={(e) => setMsg(e.target.value)} style={{ resize: 'vertical' }} />
        </label>
        <button type="button" className="btn btn-primary btn-block" disabled={busy || !groupId || !msg.trim()} onClick={send}>
          {busy ? '보내는 중…' : '확인'}
        </button>
      </div>
    </Modal>
  )
}

// ---- 냥피또: 스크래치 복권 ----
function ScratchModal({ open, onClose, onDone, refreshCoin, count = 0 }) {
  const [prize, setPrize] = useState(null)      // null=아직 미확정(긁기/확인 전)
  const [revealed, setRevealed] = useState(false)
  const [committed, setCommitted] = useState(false) // 실제 사용됨(긁기 시작 또는 결과 확인)
  const [forceReveal, setForceReveal] = useState(false)
  const [error, setError] = useState('')
  const [used, setUsed] = useState(0)           // 이번 세션에서 소모한 냥피또 수
  const [cardKey, setCardKey] = useState(0)     // 다음 장 긁기용 카드 리마운트 key
  const openCountRef = useRef(0)                 // 모달 열 때의 보유 개수(세션 중 고정)
  const rollingRef = useRef(false)

  useEffect(() => {
    if (open) { setPrize(null); setRevealed(false); setCommitted(false); setForceReveal(false); setError(''); setUsed(0); setCardKey(0); openCountRef.current = count; rollingRef.current = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const remaining = Math.max(0, openCountRef.current - used) // 이 장 소모 후 남은 개수

  // 실제 사용: 냥피또 1개 소모 + 당첨 계산·적립(서버). 다 긁으면 버튼 없이 자동 적립됨.
  const roll = useCallback(async () => {
    if (rollingRef.current) return
    rollingRef.current = true
    setCommitted(true)
    try {
      const p = await scratchNyangpito()
      setPrize(p); setUsed((u) => u + 1); refreshCoin?.()
    } catch (e) {
      setError(e.message)
    }
  }, [refreshCoin])

  // 이어서 다음 냥피또 긁기: 카드 리셋
  function scratchNext() {
    if (remaining <= 0) return
    setPrize(null); setRevealed(false); setForceReveal(false); rollingRef.current = false
    setCardKey((k) => k + 1)
  }
  async function finish() {
    try { await onDone() } catch { /* noop */ }
    refreshCoin?.()
    onClose()
  }
  // 배경 클릭 등으로 닫기: 사용했으면 정리(갱신 후 닫기), 안 했으면 그냥 닫기(미사용)
  function handleClose() { if (committed) finish(); else onClose() }
  // 안 긁고 바로 확인: 사용+공개
  async function revealNow() { await roll(); setForceReveal(true) }

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
            <ScratchCard key={cardKey} onStart={roll} onReveal={() => setRevealed(true)} reveal={forceReveal}>
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
              remaining > 0 ? (
                <button type="button" className="btn btn-block btn-primary" onClick={scratchNext}>이어서 긁기 · {remaining}장 남음</button>
              ) : (
                <button type="button" className="btn btn-block btn-primary" onClick={finish}>확인</button>
              )
            ) : (
              <button type="button" className="scratch-reveal-link" onClick={revealNow}>결과 바로 확인 &gt;</button>
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
            <span className="nc-link-ico" style={{ background: bgOf(itemId) }}><StoreItemImage id={itemId} emoji={cfg.emoji} className="nc-img" /></span>
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

// 폴라로이드 필름 사용 모달(쪽지 쓰기 페이지 모달 디자인) — 받는 사람 + 사진(최대 5장) + 메시지 → 보내기
function PolaroidSendModal({ open, ownedCount, onClose, onDone }) {
  const { user } = useAuth()
  const [message, setMessage] = useState('')
  const [photos, setPhotos] = useState([])
  const [uploading, setUploading] = useState(false)
  const [recipient, setRecipient] = useState(null)
  const [pickOpen, setPickOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef(null)
  const max = Math.min(5, ownedCount || 0)

  useEffect(() => {
    if (open) { setMessage(''); setPhotos([]); setRecipient(null); setError(''); setSending(false) }
  }, [open])

  async function onPick(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f || photos.length >= max) return
    setUploading(true); setError('')
    try {
      const { blob } = await resizeToJpeg(f, 1600)
      const url = await uploadPolaroidPhoto(blob, user.id, photos.length)
      setPhotos((p) => [...p, { url }])
    } catch (e2) { setError(e2.message || '사진 업로드에 실패했어요.') }
    finally { setUploading(false) }
  }
  function removePhoto(i) { setPhotos((p) => p.filter((_, idx) => idx !== i)) }

  async function send() {
    if (!recipient) { setError('받는 사람을 선택해 주세요.'); return }
    if (photos.length === 0) { setError('첨부할 사진을 골라 주세요.'); return }
    setSending(true); setError('')
    try {
      await usePolaroidFilm({ groupId: recipient.groupId, recipientId: recipient.userId, message: message.trim(), urls: photos.map((p) => p.url) })
      await onDone()
      onClose()
    } catch (e) { setError(e.message); setSending(false) }
  }

  return (
    <>
      <Modal open={open && !pickOpen} onClose={onClose} cardClassName="nc-link-modal">
        <div className="nc-link">
          <div className="nc-link-head">
            <span className="nc-link-ico" style={{ background: bgOf('polaroid-film') }}><StoreItemImage id="polaroid-film" emoji="📷" className="nc-img" /></span>
            <div><div className="nc-link-name">폴라로이드 필름</div><div className="nc-link-sub">첨부할 사진을 골라 주세요 (최대 {max}장)</div></div>
          </div>
          {error && <div className="alert alert-error nc-modal-alert">{error}</div>}

          <button type="button" className="nc-to" onClick={() => setPickOpen(true)}>
            <span className="nc-label">To.</span>
            {recipient
              ? <span className="nc-to-val"><Avatar src={recipient.avatar} name={recipient.name} size={26} />{recipient.name}</span>
              : <span className="nc-placeholder">받는 사람을 선택하세요</span>}
            <svg className="nc-chev" width="16" viewBox="0 0 24 24" fill="none" stroke="#b0b0b8" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18" /></svg>
          </button>

          <div className="nc-photo-picker">
            {photos.map((p, i) => (
              <span key={p.url} className="nc-photo-thumb lg">
                <img src={p.url} alt="" />
                <button type="button" className="nc-photo-x" onClick={() => removePhoto(i)} aria-label="사진 제거">×</button>
              </span>
            ))}
            {photos.length < max && (
              <button type="button" className="nc-photo-add lg" onClick={() => fileRef.current?.click()} disabled={uploading} aria-label="사진 추가">
                {uploading ? <span className="spinner spinner-sm" /> : '＋'}
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPick} />
          <div className="nc-photo-picker-hint">{photos.length}/{max}장 · 보유 필름 {ownedCount || 0}개</div>

          <div className="nc-body-wrap">
            <textarea className="nc-body" placeholder="함께 보낼 메시지(선택)" value={message} maxLength={150} rows={4}
              onChange={(e) => setMessage(e.target.value.slice(0, 150))} />
            <span className="nc-count">{message.length}/150</span>
          </div>

          <button type="button" className="nc-sheet-confirm" onClick={send} disabled={sending || photos.length === 0}>
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
  'polaroid-film': { name: '폴라로이드 필름', emoji: '📷', text: '쪽지에 사진을 첨부해요(장당 필름 1개 소모).\n상대방이 직접 인화할 수 있어요.', canUse: true },
  telescope: { name: '천체 망원경',    emoji: '🔭', text: '흐릿하게 보이는 추억 리뷰가 있을 때 사용해 보세요.', canUse: false },
  eraser:    { name: '지우개',         emoji: '🧽', text: '쪽지를 보낼 때 내 이름을 지우고 익명으로 보내 보세요.', canUse: false },
  waterbomb: { name: '물풍선 폭탄',    emoji: '💧', text: '쪽지에 타이머를 설정해서 함께 보내면 펑! 이후에는 읽을 수 없게 돼요.', canUse: false },
  'sticker-grape': { name: '칭찬 포도알',   emoji: '🍇', text: '포도송이 디자인의 스티커판이에요.\n포도알 스무 개를 다 모으면 소원권이 생겨요.', canUse: true },
  'sticker-apple': { name: '칭찬 사과나무', emoji: '🍎', text: '사과나무 디자인의 스티커판이에요.\n사과 스무 개를 다 모으면 소원권이 생겨요.', canUse: true },
  'name-tag':  { name: '명찰',     emoji: '🏷️', text: '연인의 이름을 내 마음대로 바꿔요.\n첫 변경 시점부터 24시간 동안 권한이 지속돼요.', canUse: true },
  'time-machine': { name: '타임머신', emoji: '⏳', text: '물풍선 폭탄이 터지기 전으로 한 번 되돌려요.\n젖어 버린 쪽지에 사용해 보세요.', canUse: false },
  'purin-mic': { name: '푸린 마이크', emoji: '🎤', text: '푸린의 노래로 잠든 연인의 얼굴에 낙서해 봐요.\n첫 낙서 시점부터 24 시간 동안 권한이 지속돼요.', canUse: true },
}

// 사용 방법 안내 + 선물/사용 선택 모달 (상점 상세처럼 버튼 2개)
function ItemGuideModal({ id, name, onClose, onUse, onGift }) {
  const cfg = id ? GUIDE[id] : null
  return (
    <Modal open={!!id} onClose={onClose} cardClassName="nc-link-modal">
      {cfg && (
        <div className="nc-link">
          <div className="nc-link-head">
            <span className="nc-link-ico" style={{ background: bgOf(id) }}><StoreItemImage id={id} emoji={cfg.emoji} className="nc-img" /></span>
            <div className="nc-link-name">{name || cfg.name}</div>
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
  const [color, setColor] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  useEffect(() => { if (item) { setColor(null); setDone(false); setError('') } }, [item])
  if (!item || !f) return <Modal open={false} onClose={onClose} />

  async function apply() {
    setBusy(true); setError('')
    try { await useStickerBoard(item.id, color); await onDone?.(); setDone(true) }
    catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <Modal open={!!item} onClose={onClose} cardClassName="nc-link-modal">
      {done ? (
        <div className="st-done">
          <div className="st-done-ico">
            <svg width="30" viewBox="0 0 24 24" fill="none" stroke="#4a9d6a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          </div>
          <div className="st-done-t">적용 완료!</div>
          <div className="st-done-s">칭찬 스티커판을 적용했어요.<br />스티커를 모아 소원권으로 바꿔 보세요.</div>
          <button type="button" className="st-btn-buy st-btn-block" disabled={!coupleGroupId}
            onClick={() => { onClose(); if (coupleGroupId) navigate(`/groups/${coupleGroupId}/praise`) }}>스티커판 보러 가기</button>
          <button type="button" className="st-btn-text" onClick={onClose}>닫기</button>
        </div>
      ) : (
        <div className="sticker-pick">
          <div className="sticker-pick-ttl">어떤 스티커로 붙일까요?</div>
          <div className={`sticker-pick-opts ${color ? 'has-sel' : ''}`}>
            {f.options.map((o) => (
              <button key={o.key} type="button" className={`sticker-opt ${color === o.key ? 'on' : ''}`} onClick={() => setColor(o.key)}>
                <span className="sticker-opt-fruit"><Sticker variant={item.variant} bg={f.colors[o.key]} /></span>
                <span className="sticker-opt-label">{o.label}</span>
              </button>
            ))}
          </div>
          {error && <div className="alert alert-error" style={{ marginTop: 4 }}>{error}</div>}
          <button type="button" className="st-btn-buy st-btn-block" style={{ opacity: color && !busy ? 1 : .5 }} disabled={busy || !color} onClick={apply}>{busy ? '적용 중…' : '적용하기'}</button>
        </div>
      )}
    </Modal>
  )
}

// ---- 명찰: 연인 닉네임 24h 변경 모달 ----
function NameTagModal({ open, coupleGroupId, myId, onClose, onDone }) {
  const [partner, setPartner] = useState(null)
  const [nick, setNick] = useState('')
  const [until, setUntil] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const inFlight = useRef(false)   // 실제 요청 중인지(멈춘 busy 와 구분)

  // 이 컴포넌트는 항상 마운트된 채 open 만 토글되므로(내부 Modal 만 언마운트),
  // 다시 열 때 이전 '변경 중…'(busy) 상태가 남아 버튼이 계속 비활성화되지 않게 초기화한다.
  useEffect(() => {
    if (!open) return
    setError(''); setLoading(true); setBusy(false); inFlight.current = false
    ;(async () => {
      try {
        if (!coupleGroupId) { setError('커플 그룹을 찾을 수 없어요.'); setLoading(false); return }
        const [cards, st] = await Promise.all([
          listMemberCards(coupleGroupId),
          nametagState(coupleGroupId).catch(() => null),
        ])
        const p = (cards || []).find((c) => !c.is_self && !c.is_left) || null
        setPartner(p)
        const active = st?.active || null
        setUntil(active?.until || null)
        setNick(active?.nickname || p?.display_nickname || '')
      } catch (e) { setError(e.message) } finally { setLoading(false) }
    })()
  }, [open, coupleGroupId, myId])

  const active = nametagActive(until)
  useCountdownTick(open && active)   // 남은 시간(23:59) 표기 갱신

  async function submit() {
    if (!nick.trim()) { setError('변경할 이름을 입력해 주세요.'); return }
    if (inFlight.current) return
    setBusy(true); setError(''); inFlight.current = true
    try { await useNameTag(coupleGroupId, nick.trim()); await onDone?.(); onClose() }
    catch (e) { setError(e.message) }
    finally { inFlight.current = false; setBusy(false) }   // 성공 시에도 반드시 해제
  }

  return (
    <Modal open={open} onClose={onClose} cardClassName="nc-link-modal">
      <div className="nametag-modal">
        <ItemHead id="name-tag" name="명찰" emoji="🏷️" sub="24시간 동안 연인의 이름을 바꿔요" />
        {error && <div className="alert alert-error">{error}</div>}
        {loading ? <div className="spinner" /> : (
          <>
            <div className="nametag-target">
              <Avatar src={partner?.avatar_url} name={partner?.display_nickname || '짝꿍'} size={76} />
              {active && <span className="nametag-left">사용 중 · {hhmmLeft(until)} 남음</span>}
            </div>
            <input className="cg-input nametag-input" value={nick} maxLength={12}
              onChange={(e) => {
                setNick(e.target.value)
                if (error) setError('')
                // 요청이 끝났는데도 busy 가 남아 있으면(멈춘 상태) 이름을 고치는 순간 다시 활성화
                if (busy && !inFlight.current) setBusy(false)
              }}
              placeholder="바꿀 이름을 입력하세요" />
            <button type="button" className="st-btn-buy st-btn-block" style={{ opacity: nick.trim() && !busy ? 1 : .5 }}
              disabled={!nick.trim() || busy} onClick={submit}>{busy ? '변경 중…' : '변경하기'}</button>
          </>
        )}
      </div>
    </Modal>
  )
}

// ---- 푸린 마이크: 짝꿍 프로필 사진에 24h 낙서 모달 ----
function PurinMicModal({ open, coupleGroupId, myId, onClose, onDone }) {
  const [partner, setPartner] = useState(null)
  const [until, setUntil] = useState(null)
  const [initialImage, setInitialImage] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const inFlight = useRef(false)   // 실제 요청 중인지(멈춘 busy 와 구분)
  const padRef = useRef(null)

  // 항상 마운트된 채 open 만 토글되므로, 다시 열 때 이전 상태가 남지 않게 초기화한다.
  useEffect(() => {
    if (!open) return
    setError(''); setLoading(true); setBusy(false); inFlight.current = false
    ;(async () => {
      try {
        if (!coupleGroupId) { setError('커플 그룹을 찾을 수 없어요.'); setLoading(false); return }
        const [cards, st] = await Promise.all([
          listMemberCards(coupleGroupId),
          purinMicState(coupleGroupId).catch(() => null),
        ])
        const p = (cards || []).find((c) => !c.is_self && !c.is_left) || null
        setPartner(p)
        const active = st?.active || null
        setUntil(active?.until || null)
        setInitialImage(active?.image_url || null)
      } catch (e) { setError(e.message) } finally { setLoading(false) }
    })()
  }, [open, coupleGroupId, myId])

  const active = nametagActive(until)   // until 기반 범용 헬퍼(이름은 명찰이지만 로직은 공용)
  useCountdownTick(open && active)      // 남은 시간(23:59) 표기 갱신

  async function submit() {
    if (inFlight.current) return
    setBusy(true); setError(''); inFlight.current = true
    try {
      const blob = await padRef.current?.exportBlob()
      if (!blob) throw new Error('낙서를 그려 주세요.')
      const url = await uploadGraffitiImage(blob, myId, coupleGroupId)
      await usePurinMic(coupleGroupId, url)
      await onDone?.()
      onClose()
    } catch (e) { setError(e.message) }
    finally { inFlight.current = false; setBusy(false) }   // 성공 시에도 반드시 해제
  }

  return (
    <Modal open={open} onClose={onClose} cardClassName="nc-link-modal">
      <div className="purinmic-modal">
        <ItemHead id="purin-mic" name="푸린 마이크" emoji="🎤" sub="24 시간 동안 연인의 얼굴에 낙서해요" />
        {error && <div className="alert alert-error">{error}</div>}
        {loading ? <div className="spinner" /> : (
          <>
            {active && <span className="purinmic-left">사용 중 · {hhmmLeft(until)} 남음</span>}
            <GraffitiPad ref={padRef} photoUrl={partner?.avatar_url} initialImageUrl={initialImage} size={240} />
            <button type="button" className="st-btn-buy st-btn-block" disabled={busy} onClick={submit}>
              {busy ? (active ? '수정 중…' : '낙서 그리는 중…') : (active ? '수정하기' : '낙서하기')}
            </button>
          </>
        )}
      </div>
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

// ---- 장착 중인 커플 링: 데이트 미리보기 모달 (나 ♥ 상대 → 데이트하러 가기) ----
function CoupleRingModal({ view, myId, onClose, onShareSpare, navigate }) {
  const open = !!view
  const groupId = view?.groupId
  const [cards, setCards] = useState([])
  const [decoMap, setDecoMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !groupId) return
    setLoading(true); setError('')
    Promise.all([listMemberCards(groupId), getGroupDecoMap(groupId).catch(() => ({}))])
      .then(([cs, dm]) => { setCards(cs || []); setDecoMap(dm || {}) })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [open, groupId])

  const me = cards.find((c) => c.is_self) || null
  const partner = cards.find((c) => !c.is_self && !c.is_left) || cards.find((c) => !c.is_self) || null

  return (
    <Modal open={open} onClose={onClose} cardClassName="nc-link-modal">
      <div className="crm">
        <ItemHead id="couple-ring" name="커플 링" emoji="💍" sub="나눠 끼고 있어요" />
        {error && <div className="alert alert-error">{error}</div>}
        {loading ? <div className="spinner" /> : (
          <>
            <div className="crm-pair">
              <div className="crm-person">
                <Avatar src={me?.avatar_url} name={me?.display_nickname || '나'} size={88} deco={decoMap[myId]} />
                <span className="crm-name">{me?.display_nickname || '나'}</span>
              </div>
              <svg className="crm-heart" viewBox="0 0 24 24" fill="#ec6a8f" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
              <div className="crm-person">
                <Avatar src={partner?.avatar_url} name={partner?.display_nickname || '상대'} size={88} deco={partner ? decoMap[partner.user_id] : null} />
                <span className="crm-name">{partner?.display_nickname || '상대 없음'}</span>
              </div>
            </div>
            <button type="button" className="crm-go" onClick={() => { onClose(); if (groupId) navigate(`/groups/${groupId}/members`) }}>
              데이트하러 가기
            </button>
            {view?.hasSpare && (
              <button type="button" className="crm-share" onClick={onShareSpare}>다른 그룹에 나눠 끼기</button>
            )}
          </>
        )}
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

// ---- 장착 중인 우정 링: 장착 그룹 목록 모달 (그룹명 + 겹친 아바타 → 놀이터로 이동) ----
function FriendRingModal({ view, onClose, navigate }) {
  const open = !!view
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setLoading(true); setError('')
    const set = new Set(view?.groupIds || [])
    listMyGroups()
      .then((gs) => setGroups((gs || []).filter((g) => set.has(g.id))))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [open, view])

  return (
    <Modal open={open} onClose={onClose} cardClassName="nc-link-modal">
      <div className="couple-modal">
        <ItemHead id="friend-ring" name="우정 링" emoji="🤝" sub="나눠 끼고 있어요" />
        {error && <div className="alert alert-error">{error}</div>}
        {loading ? <div className="spinner" /> : (
          <div className="frm-list">
            {groups.map((g) => {
              const ms = g.group_members || []
              const shown = ms.slice(0, 3)
              const extra = ms.length - shown.length
              return (
                <button key={g.id} type="button" className="frm-row"
                  onClick={() => { onClose(); navigate(`/groups/${g.id}/members`) }}>
                  <span className="frm-gname">{g.name}</span>
                  <span className="frm-avstack">
                    {shown.map((m, i) => (
                      <span key={m.user_id} className="frm-av" style={{ zIndex: shown.length - i }}>
                        <Avatar src={m.avatar_url} name={m.display_nickname || '멤버'} size={30} />
                      </span>
                    ))}
                    {extra > 0 && <span className="frm-more">+{extra}</span>}
                  </span>
                  <svg className="frm-chev" width="16" viewBox="0 0 24 24" fill="none" stroke="#b0b0b8" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18" /></svg>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </Modal>
  )
}

// ---- 우정 링 나눠 끼기 모달 (2명 이상 그룹, 즉시 적용) ----
function FriendModal({ open, onClose, myId, excludeGroupIds, onDone, equippedGroupIds, onViewEquipped }) {
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
        {equippedGroupIds?.length > 0 && (
          <button type="button" className="frm-viewlink" onClick={onViewEquipped}>나눠 낀 그룹 보기</button>
        )}
      </div>
    </Modal>
  )
}
