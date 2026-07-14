import { useCallback, useEffect, useState } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/Modal'
import RecipientPicker from '../components/RecipientPicker'
import StoreItemImage from '../components/StoreItemImage'
import { listStoreItems, purchaseItem, giftItem, ownsCoupleRing, listInventory, listCoupleGroups, listFriendGroups } from '../lib/api'
import { CAT, CAT_ORDER, catOf, imgBgOf } from '../lib/storeMeta'

const num = (n) => (n ?? 0).toLocaleString('ko-KR')

const PawIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="7" cy="7" r="2.4" /><circle cx="12" cy="5.4" r="2.4" /><circle cx="17" cy="7" r="2.4" />
    <path d="M12 10c3.4 0 6 2.4 6 5.2 0 2-1.7 3.3-3.4 2.7-1-.4-1.7-.6-2.6-.6s-1.6.2-2.6.6C7.7 18.5 6 17.2 6 15.2 6 12.4 8.6 10 12 10Z" />
  </svg>
)
export default function Store() {
  const { refreshCoin, setStorePremium } = useOutletContext()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [selected, setSelected] = useState(null)
  const [busy, setBusy] = useState(false)
  const [pickOpen, setPickOpen] = useState(false)
  const [ownsCouple, setOwnsCouple] = useState(false)
  const [hasCouple, setHasCouple] = useState(false)
  const [hasFriend, setHasFriend] = useState(false)
  const [premiumView, setPremiumView] = useState(false)
  const [qty, setQty] = useState(1)
  const [invCounts, setInvCounts] = useState({})
  const [notice, setNotice] = useState(null) // { type:'ok'|'err', kind?:'buy'|'gift', text }

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
    listCoupleGroups(user.id).then((g) => setHasCouple((g || []).length > 0)).catch(() => {})
    listFriendGroups().then((g) => setHasFriend((g || []).length > 0)).catch(() => {})
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
      for (const r of rows) { if (r.status === 'active') m[r.item_id] = (m[r.item_id] || 0) + 1 }
      setInvCounts(m)
    } catch { /* noop */ }
  }, [user?.id])
  useEffect(() => { loadCounts() }, [loadCounts])

  function open(item) { setNotice(null); setBusy(false); setQty(1); setSelected(item) }
  function close() { setSelected(null); setNotice(null); setBusy(false) }

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

  async function handleGift(r) {
    if (!selected || busy) return
    setPickOpen(false); setBusy(true); setNotice(null)
    try {
      await giftItem(selected.id, r.groupId, r.userId, qty)
      await refreshCoin?.()
      setNotice({ type: 'ok', kind: 'gift', text: `${r.name} 님에게 ${selected.name}을(를) 선물로 보냈어요.`, who: r.name })
    } catch (err) { setNotice({ type: 'err', text: err.message }) } finally { setBusy(false) }
  }

  const done = notice?.type === 'ok'
  const hasPremium = hasCouple || hasFriend
  const inPremium = premiumView && hasPremium

  function qualifies(item) {
    if (!item.premium) return !inPremium
    if (!inPremium) return false
    if (item.tier === 'couple') return hasCouple
    if (item.tier === 'friend') return hasFriend
    return true
  }
  const shownItems = items.filter(qualifies)

  const sections = CAT_ORDER.map((key) => ({
    key, label: CAT[key],
    items: shownItems.filter((it) => catOf(it.id) === key),
    comingSoon: inPremium && key === 'avatar',
  })).filter((s) => s.items.length || s.comingSoon)

  return (
    <div className={`page store-page ${inPremium ? 'is-premium' : ''}`}>
      {loadError && <div className="alert alert-error">{loadError}</div>}

      {hasPremium && (
        <div className="st-toolbar">
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
            <div className="st-section-title">{sec.label}</div>
            {sec.comingSoon && <div className="st-coming">아이템 준비 중이에요 ✦</div>}
            {sec.items.length > 0 && (
              <div className="st-grid">
                {sec.items.map((item) => (
                  <button key={item.id} type="button" className={`st-card ${item.premium ? 'st-card-prem' : ''}`} onClick={() => open(item)}>
                    <span className="st-card-thumb" style={{ background: imgBgOf(item.id, item.premium) }}>
                      <StoreItemImage id={item.id} emoji={item.emoji} className="st-card-img" />
                    </span>
                    <span className="st-card-name">{item.name}</span>
                    <span className="st-card-price"><PawIcon className="st-paw" />{num(item.price)}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        ))
      )}

      <Modal open={!!selected} onClose={close} cardClassName="st-modal">
        {selected && (done ? (
          <div className={`st-done ${notice.kind === 'gift' ? 'is-gift' : ''}`}>
            <div className="st-done-ico">
              {notice.kind === 'gift'
                ? '🎁'
                : <svg width="30" viewBox="0 0 24 24" fill="none" stroke="#4a9d6a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
            </div>
            <div className="st-done-t">{notice.kind === 'gift' ? '선물을 보냈어요!' : '구매 완료!'}</div>
            <div className="st-done-s">
              {notice.kind === 'gift'
                ? <>{notice.who} 님에게 {selected.name}을(를)<br />선물로 보냈어요 🎀</>
                : <>{selected.name} {qty}개를 구매했어요.<br />인벤토리에서 확인할 수 있어요.</>}
            </div>
            <button type="button" className="st-btn-buy st-btn-block" onClick={() => navigate(notice.kind === 'gift' ? '/notes' : '/inventory', notice.kind === 'gift' ? { state: { tab: 'sent' } } : undefined)}>
              {notice.kind === 'gift' ? '보낸 쪽지함으로 가기' : '인벤토리로 이동'}
            </button>
            <button type="button" className="st-btn-text" onClick={close}>{notice.kind === 'gift' ? '닫기' : '계속 둘러보기'}</button>
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
                <span className="st-detail-thumb" style={{ background: imgBgOf(selected.id, selected.premium) }}>
                  <StoreItemImage id={selected.id} emoji={selected.emoji} className="st-detail-img" />
                </span>
                {selected.id !== 'couple-ring' && <span className="st-owned">보유 {num(invCounts[selected.id] || 0)}개</span>}
                <div className="st-detail-name">{selected.name}</div>
                <div className="st-detail-desc">{selected.desc}</div>
              </div>

              {notice?.type === 'err' && <div className="st-notice is-err">{notice.text}</div>}

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
                <button type="button" className="st-btn-ghost" disabled={busy} onClick={() => { setNotice(null); setPickOpen(true) }}>선물하기</button>
                <button type="button" className="st-btn-buy" disabled={selected.giftOnly || busy || ownedCouple} onClick={handleBuy}>
                  {ownedCouple ? '보유 중' : busy ? '처리 중…' : '구매하기'}
                </button>
              </div>
            </div>
          )
        })())}
      </Modal>

      <RecipientPicker open={pickOpen} onClose={() => setPickOpen(false)} onPick={handleGift} title="선물 받는 사람" />
    </div>
  )
}
