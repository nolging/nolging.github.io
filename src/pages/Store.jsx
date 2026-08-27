import { useCallback, useEffect, useRef, useState } from 'react'
import { useOutletContext, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/Modal'
import GiftItemModal from '../components/GiftItemModal'
import RecipientPicker from '../components/RecipientPicker'
import Avatar from '../components/Avatar'
import StoreItemImage from '../components/StoreItemImage'
import PawIcon from '../components/PawIcon'
import { decoSlot } from '../components/AvatarDeco'
import { listStoreItems, purchaseItem, giftItem, donateCoin, getMyCoinBalance, ownsCoupleRing, listInventory, listCoupleGroups, listFriendGroups, touchQuest, markStoreSeen } from '../lib/api'
import { CAT, CAT_ORDER, catOf, imgBgOf, itemName } from '../lib/storeMeta'

const num = (n) => (n ?? 0).toLocaleString('ko-KR')
// "신상" 배지: 유저에게 공개된 시점(public_since) 기준 일주일 이내
const NEW_BADGE_MS = 5 * 24 * 60 * 60 * 1000
const isNewItem = (item) => !!item.publicSince && Date.now() - new Date(item.publicSince).getTime() < NEW_BADGE_MS
// 프로필 꾸미기 섹션 필터 알약(전체 + 유형별). 유형명은 deco_slot 에 저장된 값 그대로 사용.
const DECO_SLOT_FILTERS = ['전체', '머리', '얼굴', '안경', '테두리']
// 꾸미기 유형: deco_slot 값이 곧 표시명. 레거시 영문 코드(head/face/glasses)만 한글로 매핑.
const SLOT_LABEL = { head: '머리', face: '얼굴', glasses: '안경' }
const slotLabel = (slot) => SLOT_LABEL[slot] || slot

// 프리미엄 탭 배경에 뿌리는 반짝이 별(위치 %, 크기 px, 애니 지연) — 탭이 '띠'가 아니라 하늘처럼 보이게
const TOOLBAR_STARS = [
  { l: 5, t: 26, s: 2.5, d: 0 }, { l: 14, t: 62, s: 1.8, d: 0.7 }, { l: 24, t: 34, s: 2, d: 1.4 },
  { l: 40, t: 70, s: 1.6, d: 0.4 }, { l: 52, t: 22, s: 2.4, d: 1.1 }, { l: 63, t: 58, s: 1.8, d: 0.2 },
  { l: 72, t: 30, s: 2, d: 1.7 }, { l: 83, t: 66, s: 1.6, d: 0.9 }, { l: 92, t: 38, s: 2.3, d: 0.5 },
  { l: 34, t: 48, s: 1.5, d: 2.0 }, { l: 88, t: 20, s: 1.6, d: 1.3 },
]

export default function Store() {
  const { refreshCoin, setStorePremium, refreshStoreBadge } = useOutletContext()
  const { user, isAdmin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [selected, setSelected] = useState(null)
  const [busy, setBusy] = useState(false)
  const [giftOpen, setGiftOpen] = useState(false)
  const [ownsCouple, setOwnsCouple] = useState(false)
  const [hasCouple, setHasCouple] = useState(false)
  const [hasFriend, setHasFriend] = useState(false)
  const [premiumGroupIds, setPremiumGroupIds] = useState([]) // 커플/우정 링 적용 그룹(우정 링 선물 시 제외)
  const [decoSlotFilter, setDecoSlotFilter] = useState('전체') // 프로필 꾸미기 섹션 유형 필터
  // 새로 진입하면 일반 상점. 단, 퀘스트 등으로 premium 지정 시 프리미엄 탭, 인벤토리에서 "<"로 돌아온 경우(restore)만 직전 탭 복원.
  const [premiumView, setPremiumView] = useState(() => {
    try {
      if (location.state?.premium) return true
      return !!location.state?.restore && sessionStorage.getItem('storePremiumView') === '1'
    } catch { return false }
  })
  useEffect(() => {
    try { sessionStorage.setItem('storePremiumView', premiumView ? '1' : '0') } catch { /* noop */ }
  }, [premiumView])
  // 일반/프리미엄 탭 전환 시 직전 탭의 스크롤 위치가 그대로 남아있지 않게 맨 위로.
  // 최초 마운트(퀘스트 등에서 프리미엄으로 바로 진입/인벤토리에서 복원된 경우 포함)는 건드리지 않음.
  const premiumViewMounted = useRef(false)
  useEffect(() => {
    if (!premiumViewMounted.current) { premiumViewMounted.current = true; return }
    const el = document.querySelector('.content')
    if (el) el.scrollTop = 0
  }, [premiumView])
  // 지금 보고 있는 탭(일반/프리미엄)을 "확인함"으로 기록 → 하단 탭 신상 점 갱신.
  // 일반/프리미엄 둘 다 신상이 있으면 두 탭에 다 들어가야 점이 없어진다.
  useEffect(() => {
    markStoreSeen(premiumView ? 'premium' : 'general').then(() => refreshStoreBadge?.()).catch(() => {})
  }, [premiumView]) // eslint-disable-line react-hooks/exhaustive-deps
  const [qty, setQty] = useState(1)
  const [invCounts, setInvCounts] = useState({})
  const [notice, setNotice] = useState(null) // { type:'ok'|'err', kind?:'buy'|'gift'|'donation', text }
  // 길냥이 후원(donation) 전용 상태: 대상자 선택 + 후원 금액 + 내 잔액(한도 표시/검증용)
  const [donateRecipient, setDonateRecipient] = useState(null)
  const [donateAmount, setDonateAmount] = useState('')
  const [donatePickOpen, setDonatePickOpen] = useState(false)
  const [myBalance, setMyBalance] = useState(null)
  useEffect(() => {
    if (selected?.id !== 'donation') return
    getMyCoinBalance().then(setMyBalance).catch(() => {})
  }, [selected])
  useEffect(() => {
    let on = true
    listStoreItems()
      .then((rows) => { if (on) setItems(rows) })
      .catch((err) => { if (on) setLoadError(err.message) })
      .finally(() => { if (on) setLoading(false) })
    return () => { on = false }
  }, [])

  useEffect(() => {
    if (!user?.id) return
    ownsCoupleRing(user.id).then(setOwnsCouple).catch(() => {})
    Promise.all([listCoupleGroups(user.id).catch(() => []), listFriendGroups().catch(() => [])])
      .then(([c, f]) => {
        setHasCouple((c || []).length > 0); setHasFriend((f || []).length > 0)
        setPremiumGroupIds([...new Set([...(c || []), ...(f || [])])])
      })
  }, [user?.id])

  // 프리미엄 탭이 켜지면 앱 전체를 다크 테마로 (Layout 이 상단바·하단탭까지 반영)
  useEffect(() => {
    const active = premiumView && (hasCouple || hasFriend)
    setStorePremium?.(active)
    return () => setStorePremium?.(false)
  }, [premiumView, hasCouple, hasFriend, setStorePremium])

  const loadCounts = useCallback(async () => {
    if (!user?.id) return
    try {
      const rows = await listInventory(user.id)
      const m = {}
      // 프로필 꾸미기(deco-*)는 장착 중(used)인 사본도 보유 개수에 포함한다.
      for (const r of rows) {
        if (r.status === 'active' || (r.status === 'used' && r.item_id.startsWith('deco-'))) {
          m[r.item_id] = (m[r.item_id] || 0) + 1
        }
      }
      setInvCounts(m)
    } catch { /* noop */ }
  }, [user?.id])
  useEffect(() => { loadCounts() }, [loadCounts])

  function open(item) {
    setNotice(null); setBusy(false); setQty(1); setSelected(item)
    setDonateRecipient(null); setDonateAmount(''); setDonatePickOpen(false)
  }
  function close() {
    setSelected(null); setNotice(null); setBusy(false)
    setDonateRecipient(null); setDonateAmount(''); setDonatePickOpen(false)
  }

  async function handleBuy() {
    if (!selected || busy) return
    setBusy(true); setNotice(null)
    try {
      await purchaseItem(selected.id, qty)
      await refreshCoin?.()
      await loadCounts()
      if (selected.id === 'couple-ring') setOwnsCouple(true)
      setNotice({ type: 'ok', kind: 'buy', text: `${selected.name} ${qty}개를 구매했어요.` })
    } catch (err) { setNotice({ type: 'err', text: err.message }) } finally { setBusy(false) }
  }

  // 선물 전용 모달의 보내기 → 구매+선물(메시지 포함). 성공 화면은 GiftItemModal 이 표시.
  async function giftSend(r, message) {
    if (!selected) return
    await giftItem(selected.id, r.groupId, r.userId, qty, message || null)
    await refreshCoin?.()
  }

  // 길냥이 후원: 후원할 길냥이 + 금액 확인 → 알러트 재확인 → coin_ledger 양방향 이동.
  async function handleDonate() {
    if (!selected || busy) return
    if (!donateRecipient) { setNotice({ type: 'err', text: '후원할 길냥이를 선택해 주세요.' }); return }
    const amount = parseInt(donateAmount, 10)
    if (!amount || amount <= 0) { setNotice({ type: 'err', text: '후원할 금액을 입력해 주세요.' }); return }
    if (!window.confirm(`${num(amount)} 츄르를 후원할까요?`)) return
    setBusy(true); setNotice(null)
    try {
      const bal = await donateCoin(donateRecipient.groupId, donateRecipient.userId, amount)
      setMyBalance(bal)
      await refreshCoin?.()
      setNotice({ type: 'ok', kind: 'donation', who: donateRecipient.name, amount })
    } catch (err) { setNotice({ type: 'err', text: err.message }) } finally { setBusy(false) }
  }

  const donateAmountNum = parseInt(donateAmount, 10) || 0
  const donateOverBalance = myBalance != null && donateAmountNum > myBalance
  const donateReady = !!donateRecipient && donateAmountNum > 0

  const done = notice?.type === 'ok'
  const hasPremium = hasCouple || hasFriend
  const inPremium = premiumView && hasPremium

  // 프리미엄 상점 입장 → 랜덤 퀘스트 '프리미엄 상점 입장'
  useEffect(() => { if (inPremium) touchQuest('r_premium_shop') }, [inPremium])

  // 좌우 스와이프로 일반↔프리미엄 탭 전환 (프리미엄 회원일 때만)
  const swipeRef = useRef(null)
  function onTouchStart(e) {
    if (!hasPremium || selected || giftOpen || notice || e.touches.length !== 1) { swipeRef.current = null; return }
    const t = e.touches[0]
    swipeRef.current = { x0: t.clientX, y0: t.clientY, locked: null }
  }
  function onTouchMove(e) {
    const s = swipeRef.current; if (!s) return
    const t = e.touches[0]
    const dx = t.clientX - s.x0, dy = t.clientY - s.y0
    if (!s.locked) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
      s.locked = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
    }
  }
  function onTouchEnd(e) {
    const s = swipeRef.current; swipeRef.current = null
    if (!s || s.locked !== 'h') return
    const dx = e.changedTouches[0].clientX - s.x0
    if (Math.abs(dx) < 60) return
    setPremiumView(dx < 0) // 왼쪽으로 밀면 프리미엄(오른쪽 탭), 오른쪽으로 밀면 일반
  }

  function qualifies(item) {
    // 칭찬 스티커판(사과/포도알)은 관리자 전용이지만 커플에게 노출(아래 커플 tier 게이팅으로 제한됨)
    const stickerBoard = item.id === 'sticker-grape' || item.id === 'sticker-apple'
    // 관리자 전용(테스트용, 스티커판 제외): 비관리자는 숨김. 관리자에게는 커플/우정 tier
    // 게이팅 없이 노출하되, 일반/프리미엄 탭 구분은 유지(프리미엄 아이템은 프리미엄 탭에만).
    if (item.adminOnly && !stickerBoard) {
      if (!isAdmin) return false
      return item.premium ? inPremium : !inPremium
    }
    if (!item.premium) return !inPremium
    if (!inPremium) return false
    if (item.tier === 'couple') return hasCouple
    if (item.tier === 'friend') return hasFriend
    return true
  }
  const shownItems = items.filter(qualifies)

  const sections = CAT_ORDER.map((key) => {
    const isAvatar = key === 'avatar'
    const secItemsAll = shownItems.filter((it) => catOf(it.id, it.category) === key)
    const secItems = isAvatar && decoSlotFilter !== '전체'
      ? secItemsAll.filter((it) => slotLabel(it.decoSlot || decoSlot(it.id)) === decoSlotFilter)
      : secItemsAll
    return {
      key, label: CAT[key], items: secItems,
      comingSoon: inPremium && isAvatar && secItemsAll.length === 0,
      showSlotFilter: isAvatar && secItemsAll.length > 0,
    }
  }).filter((s) => s.items.length || s.comingSoon || s.showSlotFilter)

  return (
    <div className={`page store-page ${inPremium ? 'is-premium' : ''}`}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      {loadError && <div className="alert alert-error">{loadError}</div>}

      {hasPremium && (
        <div className="st-toolbar">
          {inPremium && (
            <span className="st-toolbar-sky" aria-hidden="true">
              {TOOLBAR_STARS.map((s, i) => (
                <span key={i} style={{ left: `${s.l}%`, top: `${s.t}%`, width: s.s, height: s.s, animationDelay: `${s.d}s` }} />
              ))}
            </span>
          )}
          <div className="st-seg" role="tablist">
            <button type="button" role="tab" aria-selected={!premiumView}
              className={!premiumView ? 'active' : ''} onClick={() => setPremiumView(false)}>일반 상점</button>
            <button type="button" role="tab" aria-selected={premiumView}
              className={premiumView ? 'active' : ''} onClick={() => setPremiumView(true)}>프리미엄 상점</button>
          </div>
        </div>
      )}

      {inPremium && (
        <div className="st-prem-banner">
          <span className="st-prem-star">✦</span>
          <div className="st-prem-txt">
            <div className="st-prem-t">프리미엄 상점에 오신 것을 환영합니다</div>
            <div className="st-prem-s">프리미엄 고객님들께만 제공되는 특별한 아이템을 만나 보세요</div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="spinner" />
      ) : sections.length === 0 ? (
        <div className="empty">{inPremium ? '아직 이용할 수 있는 프리미엄 아이템이 없어요.' : '판매 중인 아이템이 없어요.'}</div>
      ) : (
        sections.map((sec) => (
          <section key={sec.key} className="st-section">
            <div className="st-section-title-row">
              <div className="st-section-title">{sec.label}</div>
              {sec.showSlotFilter && (
                <div className="st-slot-filter" role="tablist">
                  {DECO_SLOT_FILTERS.map((s) => (
                    <button key={s} type="button" role="tab" aria-selected={decoSlotFilter === s}
                      className={`st-slot-chip ${decoSlotFilter === s ? 'on' : ''}`}
                      onClick={() => setDecoSlotFilter(s)}>{s}</button>
                  ))}
                </div>
              )}
            </div>
            {sec.comingSoon && <div className="st-coming">아이템 준비 중이에요 ✦</div>}
            {sec.showSlotFilter && sec.items.length === 0 && (
              <div className="st-coming">해당 유형의 아이템이 없어요.</div>
            )}
            {sec.items.length > 0 && (
              <div className="st-grid">
                {sec.items.map((item) => (
                  <button key={item.id} type="button" className={`st-card ${item.premium ? 'st-card-prem' : ''}`} onClick={() => open(item)}>
                    <span className="st-card-thumb" style={{ background: item.imageBg || imgBgOf(item.id, item.premium) }}>
                      <StoreItemImage id={item.id} emoji={item.emoji} svg={item.imageSvg} className="st-card-img" />
                      {isNewItem(item) && <span className="st-new-badge">신상</span>}
                      {item.adminOnly && <span className="st-admin-badge">비매품</span>}
                      {(item.decoSlot || decoSlot(item.id)) && <span className="deco-slot-badge">{slotLabel(item.decoSlot || decoSlot(item.id))}</span>}
                    </span>
                    <span className="st-card-name">{itemName(item.id, item.name)}</span>
                    <span className="st-card-price"><PawIcon className="st-paw" />{num(item.price)}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        ))
      )}

      <Modal open={!!selected && !giftOpen && !donatePickOpen} onClose={close} cardClassName="st-modal">
        {selected && (done ? (
          <div className={`st-done ${notice.kind === 'gift' ? 'is-gift' : ''}`}>
            <div className="st-done-ico">
              {notice.kind === 'gift'
                ? '🎁'
                : notice.kind === 'donation'
                ? '🐾'
                : <svg width="30" viewBox="0 0 24 24" fill="none" stroke="#4a9d6a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
            </div>
            <div className="st-done-t">{notice.kind === 'gift' ? '선물을 보냈어요!' : notice.kind === 'donation' ? '후원 완료!' : '구매 완료!'}</div>
            <div className="st-done-s">
              {notice.kind === 'gift'
                ? <>{notice.who} 님에게 {selected.name}을(를)<br />선물로 보냈어요 🎀</>
                : notice.kind === 'donation'
                ? <>{notice.who} 님에게<br />{num(notice.amount)} 츄르를 후원했어요.</>
                : <>{selected.name} {qty}개를 구매했어요.<br />인벤토리에서 확인할 수 있어요.</>}
            </div>
            {notice.kind === 'donation' ? (
              <button type="button" className="st-btn-buy st-btn-block" onClick={close}>확인</button>
            ) : (
              <>
                <button type="button" className="st-btn-buy st-btn-block" onClick={() => navigate(notice.kind === 'gift' ? '/notes' : '/inventory', notice.kind === 'gift' ? { state: { tab: 'sent' } } : undefined)}>
                  {notice.kind === 'gift' ? '보낸 쪽지함으로 가기' : '인벤토리로 이동'}
                </button>
                <button type="button" className="st-btn-text" onClick={close}>{notice.kind === 'gift' ? '닫기' : '계속 둘러보기'}</button>
              </>
            )}
          </div>
        ) : (() => {
          const maxQty = selected.id === 'couple-ring' ? 1 : 99
          const ownedCouple = selected.id === 'couple-ring' && ownsCouple
          return (
            <div className="st-detail">
              <button type="button" className="st-x" onClick={close} aria-label="닫기" title="닫기">
                <svg width="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
              <div className="st-detail-top">
                <span className="st-detail-thumb" style={{ background: selected.imageBg || imgBgOf(selected.id, selected.premium) }}>
                  <StoreItemImage id={selected.id} emoji={selected.emoji} svg={selected.imageSvg} className="st-detail-img" />
                </span>
                {selected.id !== 'couple-ring' && selected.id !== 'donation' && <span className="st-owned">보유 {num(invCounts[selected.id] || 0)} 개</span>}
                <div className="st-detail-name">{itemName(selected.id, selected.name)}</div>
                <div className="st-detail-desc">{selected.desc}</div>
              </div>

              {notice?.type === 'err' && <div className="st-notice is-err">{notice.text}</div>}

              {selected.id === 'donation' ? (
                <>
                  <div className="st-detail-priceRow">
                    <button type="button" className="nc-to" onClick={() => setDonatePickOpen(true)}>
                      <span className="nc-label">To.</span>
                      {donateRecipient
                        ? <span className="nc-to-val"><Avatar src={donateRecipient.avatar} name={donateRecipient.name} size={26} />{donateRecipient.name}</span>
                        : <span className="nc-placeholder">후원할 길냥이를 선택하세요</span>}
                      <svg className="nc-chev" width="16" viewBox="0 0 24 24" fill="none" stroke="#b0b0b8" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18" /></svg>
                    </button>
                  </div>

                  <div className="st-donate-amount">
                    <PawIcon className="st-paw" />
                    <input type="text" inputMode="numeric" placeholder="0" disabled={busy}
                      value={donateAmount ? num(donateAmountNum) : ''}
                      onChange={(e) => setDonateAmount(e.target.value.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, ''))} />
                    {myBalance != null && <span className="st-donate-balance">/ {num(myBalance)}</span>}
                  </div>
                  {donateOverBalance && <div className="st-donate-warn">보유한 츄르보다 많아요.</div>}

                  <div className="st-detail-actions">
                    <button type="button" className="st-btn-buy" disabled={busy || !donateReady} onClick={handleDonate}>
                      {busy ? '처리 중…' : '후원하기'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="st-detail-priceRow">
                    <div className="st-price-big"><PawIcon className="st-paw-lg" />{num(selected.price)}</div>
                    <div className="st-stepper">
                      <button type="button" aria-label="수량 감소" disabled={qty <= 1 || busy} onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
                      <span>{qty}</span>
                      <button type="button" aria-label="수량 증가" disabled={qty >= maxQty || busy} onClick={() => setQty((q) => Math.min(maxQty, q + 1))}>＋</button>
                    </div>
                  </div>

                  <div className="st-total">
                    <span className="st-total-l">합계</span>
                    <span className="st-total-v"><PawIcon className="st-paw" />{num(selected.price * qty)}</span>
                  </div>

                  <div className="st-detail-actions">
                    <button type="button" className="st-btn-ghost" disabled={busy} onClick={() => { setNotice(null); setGiftOpen(true) }}>선물하기</button>
                    <button type="button" className="st-btn-buy" disabled={selected.giftOnly || busy || ownedCouple} onClick={handleBuy}>
                      {ownedCouple ? '보유 중' : busy ? '처리 중…' : '구매하기'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )
        })())}
      </Modal>

      <GiftItemModal open={giftOpen}
        onClose={() => setGiftOpen(false)}
        onFinish={() => { setGiftOpen(false); close() }}
        item={selected ? { id: selected.id, name: itemName(selected.id, selected.name), emoji: selected.emoji } : null}
        qty={qty} price={selected?.price ?? null} purchased onSend={giftSend}
        excludeGroupIds={selected?.id === 'friend-ring' ? premiumGroupIds : []} />

      <RecipientPicker open={donatePickOpen} onClose={() => setDonatePickOpen(false)} title="후원할 길냥이"
        onPick={(r) => { setDonateRecipient(r); setDonatePickOpen(false) }} />
    </div>
  )
}
