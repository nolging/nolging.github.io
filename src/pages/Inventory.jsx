import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/Modal'
import Avatar from '../components/Avatar'
import StoreItemImage from '../components/StoreItemImage'
import { decoSlot } from '../components/AvatarDeco'
import RecipientPicker from '../components/RecipientPicker'
import ScratchCard from '../components/ScratchCard'
import { listStoreItems, listInventory, listMyGroups, useWish, useCoupleRing, useFriendRing, useCassette, useLink, useVideo, useBluray, getMyLedBanner, listFriendGroups, listCoupleGroups, scratchNyangpito, applyGroupTheme, unapplyGroupTheme, applyAvatarDeco, unapplyAvatarDeco } from '../lib/api'
import { parseMusicUrl } from '../components/MusicPlayer'
import { parseVideoUrl } from '../components/VideoPlayer'
import { LedboardModal, LedEditModal } from '../components/LedModals'
import { CAT, CAT_ORDER, catOf, imgBgOf } from '../lib/storeMeta'

const MAX_WISH = 300
const MAX_CASSETTE_MSG = 150
const MAX_LINK_MSG = 150
const MAX_VIDEO_MSG = 150
const MAX_BLURAY_MSG = 150

export default function Inventory() {
  const { user } = useAuth()
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
  const [telescopeOpen, setTelescopeOpen] = useState(false)
  const [eraserOpen, setEraserOpen] = useState(false)
  const [scratchOpen, setScratchOpen] = useState(false)
  const [themeItem, setThemeItem] = useState(null) // 적용할 테마 아이템 { id, name }
  const [decoItem, setDecoItem] = useState(null)   // 적용할 아바타 데코 { id, name, appliedGroupId }
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
      if (!map.has(r.item_id)) map.set(r.item_id, { id: r.item_id, name: meta[r.item_id]?.name || r.item_name, emoji: meta[r.item_id]?.emoji || '🎁', count: 0, rows: [] })
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
    if (g.id === 'wish') setWishOpen(true)
    else if (g.id === 'couple-ring') setCoupleOpen(true)
    else if (g.id === 'friend-ring') setFriendOpen(true)
    else if (g.id === 'cassette') setCassetteOpen(true)
    else if (g.id === 'link') setLinkOpen(true)
    else if (g.id === 'video') setVideoOpen(true)
    else if (g.id === 'bluray') setBlurayOpen(true)
    else if (g.id === 'ledboard') setLedboardOpen(true)
    else if (g.id === 'telescope') setTelescopeOpen(true)
    else if (g.id === 'eraser') setEraserOpen(true)
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
      <CassetteModal open={cassetteOpen} onClose={() => setCassetteOpen(false)} onDone={reload} />
      <LinkModal open={linkOpen} onClose={() => setLinkOpen(false)} onDone={reload} />
      <VideoModal open={videoOpen} onClose={() => setVideoOpen(false)} onDone={reload} />
      <BlurayModal open={blurayOpen} onClose={() => setBlurayOpen(false)} onDone={reload} />
      <LedboardModal open={ledboardOpen} onClose={() => setLedboardOpen(false)} onDone={reload} />
      <LedEditModal open={ledEditOpen} onClose={() => setLedEditOpen(false)} banner={ledBanner} onDone={reload} />

      <Modal open={telescopeOpen} onClose={() => setTelescopeOpen(false)} title="천체 망원경">
        <div className="couple-modal">
          <p className="tele-guide-label">사용 방법</p>
          <p className="tele-guide-text">흐릿하게 보이는 추억 리뷰가 있을 때 사용해 보세요.</p>
          <button type="button" className="btn btn-primary btn-block" onClick={() => setTelescopeOpen(false)}>확인</button>
        </div>
      </Modal>

      <Modal open={eraserOpen} onClose={() => setEraserOpen(false)} title="지우개">
        <div className="couple-modal">
          <p className="tele-guide-label">사용 방법</p>
          <p className="tele-guide-text">쪽지를 보낼 때 내 이름을 지우고 익명으로 보내 보세요.</p>
          <button type="button" className="btn btn-primary btn-block" onClick={() => setEraserOpen(false)}>확인</button>
        </div>
      </Modal>

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
    <Modal open={open} onClose={onClose} title={item?.name || '프로필 꾸미기'}>
      <div className="couple-modal">
        {error && <div className="alert alert-error">{error}</div>}
        {item?.desc && <p className="deco-desc">{item.desc}</p>}
        <p className="couple-hint">프리미엄 그룹(커플·우정)에 적용하면 그 그룹의 내 아바타가 꾸며져요. 머리 장식(새싹·귀)은 하나만, 얼굴 장식과는 함께 적용돼요.</p>

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
    <Modal open={open} onClose={onClose} title={item?.name || '그룹 테마'}>
      <div className="couple-modal">
        {error && <div className="alert alert-error">{error}</div>}
        <p className="couple-hint">프리미엄 그룹(커플·우정)에 적용하면 그룹 카드와 상세 화면이 꾸며져요.</p>

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
    <Modal open={open} onClose={handleClose} title="냥피또">
      <div className="scratch-modal">
        {error ? (
          <>
            <div className="alert alert-error">{error}</div>
            <button type="button" className="btn btn-primary btn-block" onClick={handleClose}>닫기</button>
          </>
        ) : (
          <>
            <p className="scratch-guide">동전으로 긁듯이 카드를 문질러 보세요</p>
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
            <button type="button" className={`btn btn-block ${revealed ? 'btn-primary' : ''}`} onClick={confirmBtn}>
              {revealed ? (win ? `${prize}츄르 받기` : '확인') : '결과 확인'}
            </button>
          </>
        )}
      </div>
    </Modal>
  )
}

// ---- 비디오 테이프: 영상 링크 + 메시지 보내기 ----
function VideoModal({ open, onClose, onDone }) {
  const [message, setMessage] = useState('')
  const [url, setUrl] = useState('')
  const [recipient, setRecipient] = useState(null)
  const [pickOpen, setPickOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) { setMessage(''); setUrl(''); setRecipient(null); setError(''); setSending(false) }
  }, [open])

  const parsed = parseVideoUrl(url.trim())
  const urlOk = !url.trim() || !!parsed

  async function send() {
    if (!recipient) { setError('받는 사람을 선택해 주세요.'); return }
    if (!url.trim()) { setError('영상 링크를 입력해 주세요.'); return }
    if (!parsed) { setError('유튜브 영상 링크만 보낼 수 있어요.'); return }
    setSending(true); setError('')
    try {
      await useVideo({ groupId: recipient.groupId, recipientId: recipient.userId, message: message.trim(), url: url.trim() })
      await onDone()
      onClose()
    } catch (e) { setError(e.message); setSending(false) }
  }

  return (
    <>
      <Modal open={open && !pickOpen} onClose={onClose} title="비디오 테이프">
        <div className="couple-modal">
          {error && <div className="alert alert-error">{error}</div>}
          <p className="couple-hint">쪽지와 함께 영상(유튜브)을 보내요.</p>

          {recipient ? (
            <div className="couple-to">
              <span className="couple-to-label">To.</span>
              <span className="couple-to-value"><Avatar src={recipient.avatar} name={recipient.name} size={28} />{recipient.name}</span>
              <button type="button" className="btn btn-sm cassette-change" onClick={() => setPickOpen(true)}>변경</button>
            </div>
          ) : (
            <button type="button" className="btn btn-block" onClick={() => setPickOpen(true)}>받는 사람 선택</button>
          )}

          <label className="field">
            <span>영상 링크</span>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="유튜브 링크" inputMode="url" autoCapitalize="none" autoCorrect="off" />
          </label>
          {!urlOk && <p className="field-error">유튜브 영상 링크만 가능해요.</p>}

          <div className="couple-msg">
            <textarea className="wish-input" placeholder="함께 보낼 메시지 (선택)"
              value={message} maxLength={MAX_VIDEO_MSG} onChange={(e) => setMessage(e.target.value)} rows={3} />
            <span className="couple-msg-count">{message.length}/{MAX_VIDEO_MSG}</span>
          </div>

          <button type="button" className="btn btn-primary btn-block" onClick={send} disabled={sending}>
            {sending ? '보내는 중…' : '보내기'}
          </button>
        </div>
      </Modal>
      <RecipientPicker open={pickOpen} onClose={() => setPickOpen(false)} title="받는 사람"
        onPick={(r) => { setRecipient(r); setPickOpen(false) }} />
    </>
  )
}

// ---- 블루레이: 영상 링크 + 메시지 보내기 (시네마 플레이어 + PIP) ----
function BlurayModal({ open, onClose, onDone }) {
  const [message, setMessage] = useState('')
  const [url, setUrl] = useState('')
  const [recipient, setRecipient] = useState(null)
  const [pickOpen, setPickOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) { setMessage(''); setUrl(''); setRecipient(null); setError(''); setSending(false) }
  }, [open])

  const parsed = parseVideoUrl(url.trim())
  const urlOk = !url.trim() || !!parsed

  async function send() {
    if (!recipient) { setError('받는 사람을 선택해 주세요.'); return }
    if (!url.trim()) { setError('영상 링크를 입력해 주세요.'); return }
    if (!parsed) { setError('유튜브 영상 링크만 보낼 수 있어요.'); return }
    setSending(true); setError('')
    try {
      await useBluray({ groupId: recipient.groupId, recipientId: recipient.userId, message: message.trim(), url: url.trim() })
      await onDone()
      onClose()
    } catch (e) { setError(e.message); setSending(false) }
  }

  return (
    <>
      <Modal open={open && !pickOpen} onClose={onClose} title="블루레이">
        <div className="couple-modal">
          {error && <div className="alert alert-error">{error}</div>}
          <p className="couple-hint">쪽지와 함께 영상(유튜브)을 보내요. 받는 사람은 시네마 화면으로 감상하고, 작게 띄워(PIP) 앱을 쓰면서도 볼 수 있어요.</p>

          {recipient ? (
            <div className="couple-to">
              <span className="couple-to-label">To.</span>
              <span className="couple-to-value"><Avatar src={recipient.avatar} name={recipient.name} size={28} />{recipient.name}</span>
              <button type="button" className="btn btn-sm cassette-change" onClick={() => setPickOpen(true)}>변경</button>
            </div>
          ) : (
            <button type="button" className="btn btn-block" onClick={() => setPickOpen(true)}>받는 사람 선택</button>
          )}

          <label className="field">
            <span>영상 링크</span>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="유튜브 링크" inputMode="url" autoCapitalize="none" autoCorrect="off" />
          </label>
          {!urlOk && <p className="field-error">유튜브 영상 링크만 가능해요.</p>}

          <div className="couple-msg">
            <textarea className="wish-input" placeholder="함께 보낼 메시지 (선택)"
              value={message} maxLength={MAX_BLURAY_MSG} onChange={(e) => setMessage(e.target.value)} rows={3} />
            <span className="couple-msg-count">{message.length}/{MAX_BLURAY_MSG}</span>
          </div>

          <button type="button" className="btn btn-primary btn-block" onClick={send} disabled={sending}>
            {sending ? '보내는 중…' : '보내기'}
          </button>
        </div>
      </Modal>
      <RecipientPicker open={pickOpen} onClose={() => setPickOpen(false)} title="받는 사람"
        onPick={(r) => { setRecipient(r); setPickOpen(false) }} />
    </>
  )
}

// ---- 링크: 클릭 가능한 링크 + 메시지 보내기 ----
function normalizeUrl(u) {
  const s = (u || '').trim()
  if (!s) return ''
  return /^https?:\/\//i.test(s) ? s : `https://${s}`
}
function LinkModal({ open, onClose, onDone }) {
  const [message, setMessage] = useState('')
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const [recipient, setRecipient] = useState(null)
  const [pickOpen, setPickOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) { setMessage(''); setUrl(''); setLabel(''); setRecipient(null); setError(''); setSending(false) }
  }, [open])

  async function send() {
    if (!recipient) { setError('받는 사람을 선택해 주세요.'); return }
    if (!label.trim()) { setError('버튼에 표시할 텍스트를 입력해 주세요.'); return }
    const link = normalizeUrl(url)
    if (!link || !/\./.test(link)) { setError('올바른 링크를 입력해 주세요.'); return }
    setSending(true); setError('')
    try {
      await useLink({ groupId: recipient.groupId, recipientId: recipient.userId, message: message.trim(), url: link, label: label.trim() })
      await onDone()
      onClose()
    } catch (e) { setError(e.message); setSending(false) }
  }

  return (
    <>
      <Modal open={open && !pickOpen} onClose={onClose} title="선물 상자">
        <div className="couple-modal">
          {error && <div className="alert alert-error">{error}</div>}
          <p className="couple-hint">버튼에 표시할 텍스트와 연결할 링크를 입력하면, 받는 사람에게는 링크가 걸린 버튼만 보여요.</p>

          {recipient ? (
            <div className="couple-to">
              <span className="couple-to-label">To.</span>
              <span className="couple-to-value"><Avatar src={recipient.avatar} name={recipient.name} size={28} />{recipient.name}</span>
              <button type="button" className="btn btn-sm cassette-change" onClick={() => setPickOpen(true)}>변경</button>
            </div>
          ) : (
            <button type="button" className="btn btn-block" onClick={() => setPickOpen(true)}>받는 사람 선택</button>
          )}

          <label className="field">
            <span>버튼 텍스트</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="예: 여기를 눌러 보세요" maxLength={40} />
          </label>

          <label className="field">
            <span>링크</span>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" inputMode="url" autoCapitalize="none" autoCorrect="off" />
          </label>

          <div className="couple-msg">
            <textarea className="wish-input" placeholder="함께 보낼 메시지 (선택)"
              value={message} maxLength={MAX_LINK_MSG} onChange={(e) => setMessage(e.target.value)} rows={3} />
            <span className="couple-msg-count">{message.length}/{MAX_LINK_MSG}</span>
          </div>

          <button type="button" className="btn btn-primary btn-block" onClick={send} disabled={sending}>
            {sending ? '보내는 중…' : '보내기'}
          </button>
        </div>
      </Modal>
      <RecipientPicker open={pickOpen} onClose={() => setPickOpen(false)} title="받는 사람"
        onPick={(r) => { setRecipient(r); setPickOpen(false) }} />
    </>
  )
}

// ---- 카세트 테이프: 음악 링크 + 메시지 보내기 ----
function CassetteModal({ open, onClose, onDone }) {
  const [message, setMessage] = useState('')
  const [url, setUrl] = useState('')
  const [recipient, setRecipient] = useState(null) // { groupId, userId, name, avatar }
  const [pickOpen, setPickOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) { setMessage(''); setUrl(''); setRecipient(null); setError(''); setSending(false) }
  }, [open])

  const parsed = parseMusicUrl(url.trim())
  const urlOk = !url.trim() || !!parsed

  async function send() {
    if (!recipient) { setError('받는 사람을 선택해 주세요.'); return }
    if (!url.trim()) { setError('음악 링크를 입력해 주세요.'); return }
    if (!parsed) { setError('유튜브 또는 사운드클라우드 링크만 보낼 수 있어요.'); return }
    setSending(true); setError('')
    try {
      await useCassette({ groupId: recipient.groupId, recipientId: recipient.userId, message: message.trim(), url: url.trim() })
      await onDone()
      onClose()
    } catch (e) { setError(e.message); setSending(false) }
  }

  return (
    <>
      <Modal open={open && !pickOpen} onClose={onClose} title="카세트 테이프">
        <div className="couple-modal">
          {error && <div className="alert alert-error">{error}</div>}
          <p className="couple-hint">쪽지와 함께 음악(유튜브·사운드클라우드)을 보내요.</p>

          {recipient ? (
            <div className="couple-to">
              <span className="couple-to-label">To.</span>
              <span className="couple-to-value"><Avatar src={recipient.avatar} name={recipient.name} size={28} />{recipient.name}</span>
              <button type="button" className="btn btn-sm cassette-change" onClick={() => setPickOpen(true)}>변경</button>
            </div>
          ) : (
            <button type="button" className="btn btn-block" onClick={() => setPickOpen(true)}>받는 사람 선택</button>
          )}

          <label className="field">
            <span>음악 링크</span>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="유튜브 / 사운드클라우드 링크" />
          </label>
          {!urlOk && <p className="field-error">유튜브 또는 사운드클라우드 링크만 가능해요.</p>}

          <div className="couple-msg">
            <textarea className="wish-input" placeholder="함께 보낼 메시지 (선택)"
              value={message} maxLength={MAX_CASSETTE_MSG} onChange={(e) => setMessage(e.target.value)} rows={3} />
            <span className="couple-msg-count">{message.length}/{MAX_CASSETTE_MSG}</span>
          </div>

          <button type="button" className="btn btn-primary btn-block" onClick={send} disabled={sending}>
            {sending ? '보내는 중…' : '보내기'}
          </button>
        </div>
      </Modal>
      <RecipientPicker open={pickOpen} onClose={() => setPickOpen(false)} title="받는 사람"
        onPick={(r) => { setRecipient(r); setPickOpen(false) }} />
    </>
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
    <Modal open={open} onClose={onClose} title="소원권 사용">
      <div className="wish-modal">
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
    <Modal open={open} onClose={onClose} title="커플 링 나눠 끼기">
      <div className="couple-modal">
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
    <Modal open={open} onClose={onClose} title="우정 링 나눠 끼기">
      <div className="couple-modal">
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
