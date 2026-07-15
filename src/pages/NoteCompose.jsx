import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import RecipientPicker from '../components/RecipientPicker'
import BottomSheet from '../components/BottomSheet'
import Modal from '../components/Modal'
import Avatar from '../components/Avatar'
import { useAuth } from '../context/AuthContext'
import { sendComposedNote, listInventory, listStoreItems, listCoupleGroups, listFriendGroups } from '../lib/api'
import { imgBgOf } from '../lib/storeMeta'

const MAX = 150

// 쪽지에서 사용 가능한 아이템(요구 사양) — 스페셜(링) / 기능 강화(미디어·지우개)
const RINGS = ['couple-ring', 'friend-ring']
const MEDIA = ['link', 'cassette', 'video', 'bluray']
const USE_META = {
  'couple-ring': { name: '커플 링', emoji: '💍', useLabel: '커플 신청' },
  'friend-ring': { name: '우정 링', emoji: '💞', useLabel: '우정 신청' },
  link: { name: '선물 상자', emoji: '🎁', urlHint: '전달할 링크 (URL)' },
  cassette: { name: '카세트 테이프', emoji: '📼', urlHint: '유튜브 / 사운드클라우드 링크' },
  video: { name: '비디오 테이프', emoji: '📹', urlHint: '유튜브 링크' },
  bluray: { name: '블루레이', emoji: '💿', urlHint: '유튜브 링크' },
  eraser: { name: '지우개', emoji: '🧽' },
}
const USE_SECTIONS = [
  { label: '스페셜', ids: RINGS },
  { label: '기능 강화', ids: [...MEDIA, 'eraser'] },
]

const StarIcon = () => (
  <svg width="16" viewBox="0 0 24 24" fill="none" stroke="#7363e8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 2 15 8.5 22 9.3 17 14.1 18.2 21 12 17.7 5.8 21 7 14.1 2 9.3 9 8.5z" /></svg>
)
const GiftIcon = ({ stroke }) => (
  <svg width="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 12 20 22 4 22 4 12" /><rect x="2" y="7" width="20" height="5" /><line x1="12" y1="22" x2="12" y2="7" /><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" /><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" /></svg>
)

export default function NoteCompose() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const reply = location.state?.reply

  const [recipient, setRecipient] = useState(reply?.recipient || null)
  const [me, setMe] = useState(reply?.me || { name: '', avatar: null })
  const [body, setBody] = useState('')
  const [anonymous, setAnonymous] = useState(false)
  const [useItem, setUseItem] = useState(null)   // { id, url? }
  const [gifts, setGifts] = useState([])          // [{ id, qty }]
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const [pickOpen, setPickOpen] = useState(false)
  const [sheet, setSheet] = useState(null)        // 'use' | 'gift'
  const [linkFor, setLinkFor] = useState(null)    // media itemId for URL modal
  const [linkUrl, setLinkUrl] = useState('')
  const [giftDraft, setGiftDraft] = useState({})  // { id: qty }

  const [owned, setOwned] = useState({})          // { id: count(active) }
  const [names, setNames] = useState({})          // { id: { name, emoji } } (from store)
  const [ringExclude, setRingExclude] = useState([]) // 이미 커플/우정 링 적용된 그룹 id (링 사용 시 제외)

  // 보유 아이템 수 + 아이템 이름/이모지 로드
  useEffect(() => {
    if (!user?.id) return
    let on = true
    listInventory(user.id).then((rows) => {
      if (!on) return
      const m = {}
      for (const r of rows) if (r.status === 'active') m[r.item_id] = (m[r.item_id] || 0) + 1
      setOwned(m)
    }).catch(() => {})
    listStoreItems().then((rows) => {
      if (!on) return
      const m = {}
      for (const r of rows) m[r.id] = { name: r.name, emoji: r.emoji }
      setNames(m)
    }).catch(() => {})
    // 링 사용 시 제외할 그룹(이미 커플/우정 링 적용)
    Promise.all([listCoupleGroups(user.id).catch(() => []), listFriendGroups().catch(() => [])])
      .then(([c, f]) => { if (on) setRingExclude([...new Set([...(c || []), ...(f || [])])]) })
    return () => { on = false }
  }, [user?.id])

  const pickerMode = useItem?.id === 'friend-ring' ? 'friend' : null
  const pickerExclude = RINGS.includes(useItem?.id) ? ringExclude : []

  const metaOf = useCallback((id) => ({
    name: USE_META[id]?.name || names[id]?.name || id,
    emoji: USE_META[id]?.emoji || names[id]?.emoji || '🎁',
    bg: imgBgOf(id),
  }), [names])

  function handlePick(r) {
    if (r.groupWide) {
      setRecipient({ groupId: r.groupId, groupName: r.groupName, groupWide: true, members: r.members || [] })
    } else {
      setRecipient({ groupId: r.groupId, groupName: r.groupName, userId: r.userId, name: r.name, avatar: r.avatar })
    }
    setMe({ name: r.myName, avatar: r.myAvatar })
    setPickOpen(false)
  }

  // ---- 아이템 사용 시트 --------------------------------------------------
  const useDisabled = useCallback((id) => {
    const amId = useItem?.id || null
    const specialOn = amId && RINGS.includes(amId)
    if (id === 'eraser') return anonymous || specialOn
    if (RINGS.includes(id)) return (amId && amId !== id) || anonymous || gifts.length > 0
    return (amId && amId !== id) || gifts.length > 0   // 미디어
  }, [useItem, anonymous, gifts])

  function pickUse(id) {
    const active = id === 'eraser' ? anonymous : useItem?.id === id
    if (active || useDisabled(id)) return   // 이미 "사용 중"이면 무시(칩 X로 해제)
    if (id === 'eraser') { setAnonymous(true); setSheet(null); return }
    if (RINGS.includes(id)) {
      // 링은 대상 그룹 제약이 있어 받는 사람을 다시 고르게 한다(필터/그룹단위 반영)
      setUseItem({ id }); setSheet(null); setRecipient(null); setPickOpen(true); return
    }
    setLinkFor(id); setLinkUrl(''); setSheet(null)   // 미디어 → URL 입력
  }
  function clearUseItem() {
    // 우정 링(그룹단위 수신) 해제 시 받는 사람도 초기화
    if (recipient?.groupWide) setRecipient(null)
    setUseItem(null)
  }
  function confirmLink() {
    if (!linkUrl.trim()) return
    setUseItem({ id: linkFor, url: linkUrl.trim() })
    setLinkFor(null)
  }

  // ---- 아이템 선물 시트 --------------------------------------------------
  const giftDisabled = !!useItem
  function openGiftSheet() {
    if (giftDisabled) return
    const d = {}; gifts.forEach((g) => { d[g.id] = g.qty }); setGiftDraft(d); setSheet('gift')
  }
  function setDraft(id, q) {
    setGiftDraft((prev) => { const d = { ...prev }; if (q <= 0) delete d[id]; else d[id] = q; return d })
  }
  const draftCount = Object.values(giftDraft).reduce((a, b) => a + b, 0)
  function confirmGift() {
    setGifts(Object.keys(giftDraft).filter((k) => giftDraft[k] > 0).map((k) => ({ id: k, qty: giftDraft[k] })))
    setSheet(null)
  }

  // 선물 가능한 보유 아이템(active > 0)
  const giftableIds = useMemo(() => Object.keys(owned).filter((id) => owned[id] > 0), [owned])
  // 사용 시트 섹션(보유분만)
  const useSections = USE_SECTIONS
    .map((s) => ({ label: s.label, ids: s.ids.filter((id) => (owned[id] || 0) > 0) }))
    .filter((s) => s.ids.length)

  async function handleSend() {
    if (!recipient) { setError('받는 사람을 선택해 주세요.'); return }
    if (!useItem && gifts.length === 0 && !body.trim()) { setError('쪽지 내용을 입력해 주세요.'); return }
    setSending(true); setError('')
    try {
      await sendComposedNote({
        groupId: recipient.groupId, recipientId: recipient.userId,
        body: body.trim(), anonymous, useItem, gifts,
      })
      navigate('/notes', { state: { tab: 'sent' } })
    } catch (err) { setError(err.message); setSending(false) }
  }

  // 전송 가능: 받는 사람 필수 + (본문/사용아이템/선물 중 하나 이상) + 미디어면 URL 완비
  const mediaNeedsUrl = useItem && MEDIA.includes(useItem.id) && !useItem.url
  const hasContent = !!body.trim() || !!useItem || gifts.length > 0
  const canSend = !!recipient && hasContent && !mediaNeedsUrl && !sending

  const isActive = (id) => (id === 'eraser' ? anonymous : useItem?.id === id)

  return (
    <div className="page nc-page">
      {error && <div className="alert alert-error">{error}</div>}

      {/* To. */}
      <button type="button" className="nc-to" onClick={() => { setError(''); setPickOpen(true) }}>
        <span className="nc-label">To.</span>
        {recipient ? (
          recipient.groupWide ? (
            <span className="nc-to-val">
              <span className="nc-ava-stack">
                {(recipient.members || []).slice(0, 3).map((m, i) => (
                  <span key={m.userId} className="nc-ava-stack-i" style={{ zIndex: 3 - i }}>
                    <Avatar src={m.avatar} name={m.name} size={26} />
                  </span>
                ))}
                {(recipient.members || []).length > 3 && (
                  <span className="nc-ava-stack-more">+{recipient.members.length - 3}</span>
                )}
              </span>
              {recipient.groupName}
            </span>
          ) : (
            <span className="nc-to-val"><Avatar src={recipient.avatar} name={recipient.name} size={30} />{recipient.name}</span>
          )
        ) : (
          <span className="nc-placeholder">받는 사람을 선택하세요</span>
        )}
        <svg className="nc-chev" width="16" viewBox="0 0 24 24" fill="none" stroke="#b0b0b8" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18" /></svg>
      </button>

      {/* 내용 */}
      <div className="nc-body-wrap">
        <textarea className="nc-body" placeholder="전하고 싶은 이야기를 적어 주세요"
          value={body} maxLength={MAX} rows={6} onChange={(e) => setBody(e.target.value.slice(0, MAX))} />
        <span className="nc-count">{body.length}/{MAX}</span>
      </div>

      {/* 사용 아이템 첨부칩 */}
      {useItem && (
        <div className="nc-chip">
          <button type="button" className="nc-chip-x" onClick={clearUseItem} aria-label="첨부 제거">
            <svg width="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
          <span className="nc-chip-ico" style={{ background: metaOf(useItem.id).bg }}>{metaOf(useItem.id).emoji}</span>
          <div className="nc-chip-txt">
            <div className="nc-chip-name">{metaOf(useItem.id).name}</div>
            <div className="nc-chip-hint">{RINGS.includes(useItem.id) ? `✨ ${USE_META[useItem.id].useLabel} 포함` : '📎 첨부됨'}</div>
          </div>
        </div>
      )}

      {/* 선물 첨부칩 */}
      {gifts.map((g) => (
        <div key={g.id} className="nc-chip is-gift">
          <button type="button" className="nc-chip-x" onClick={() => setGifts(gifts.filter((x) => x.id !== g.id))} aria-label="선물 제거">
            <svg width="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
          <span className="nc-chip-ico" style={{ background: metaOf(g.id).bg }}>{metaOf(g.id).emoji}</span>
          <div className="nc-chip-txt">
            <div className="nc-chip-name">{metaOf(g.id).name} <span className="nc-chip-qty">×{g.qty}</span></div>
            <div className="nc-chip-hint is-gift">🎁 선물 첨부됨</div>
          </div>
        </div>
      ))}

      {/* From. */}
      {anonymous ? (
        <div className="nc-from is-anon">
          <span className="nc-label">From.</span>
          <span className="nc-from-ava nc-anon-ava">?</span>
          <div className="nc-from-txt"><div className="nc-from-name">익명</div><div className="nc-from-sub">🧽 지우개로 보내는 사람을 숨겼어요</div></div>
          <button type="button" className="nc-restore" onClick={() => setAnonymous(false)}>되돌리기</button>
        </div>
      ) : me.name ? (
        <div className="nc-from">
          <span className="nc-label">From.</span>
          <Avatar src={me.avatar} name={me.name} size={34} />
          <div className="nc-from-txt"><div className="nc-from-name">{me.name}</div></div>
        </div>
      ) : (
        <div className="nc-from is-empty">
          <span className="nc-label">From.</span>
          <span className="nc-placeholder">받는 사람을 선택하면 자동으로 채워져요</span>
        </div>
      )}

      {/* 하단 액션 */}
      <div className="nc-actions">
        <div className="nc-action-row">
          <button type="button" className="nc-act-btn" onClick={() => setSheet('use')}><StarIcon />아이템 사용</button>
          <button type="button" className={`nc-act-btn ${giftDisabled ? 'is-disabled' : ''}`} disabled={giftDisabled} onClick={openGiftSheet}>
            <GiftIcon stroke={giftDisabled ? '#c8c5d2' : '#7363e8'} />아이템 선물
          </button>
        </div>
        <button type="button" className="nc-send" disabled={!canSend} onClick={handleSend}>
          {sending ? '보내는 중…' : '쪽지 보내기'}
        </button>
      </div>

      {/* 사용 아이템 시트 */}
      <BottomSheet open={sheet === 'use'} onClose={() => setSheet(null)}>
        <h3 className="nc-sheet-title">쪽지에 사용할 아이템</h3>
        <p className="nc-sheet-sub">내 인벤토리에 있는 쪽지 강화 아이템이에요</p>
        {useSections.length === 0 ? (
          <div className="nc-sheet-empty">사용할 수 있는 아이템이 없어요.</div>
        ) : useSections.map((sec) => (
          <div key={sec.label} className="nc-sheet-sec">
            <div className="nc-sheet-sec-t">{sec.label}</div>
            <div className="nc-grid">
              {sec.ids.map((id) => {
                const active = isActive(id)
                const dis = useDisabled(id)
                return (
                  <button key={id} type="button" className={`nc-icard ${active ? 'is-active' : ''}`} disabled={dis}
                    style={{ opacity: dis && !active ? 0.38 : 1 }} onClick={() => pickUse(id)}>
                    <span className="nc-icard-img" style={{ background: metaOf(id).bg }}>{metaOf(id).emoji}
                      {active ? <span className="nc-icard-using">사용 중</span> : <span className="nc-icard-badge">×{owned[id] || 0}</span>}
                    </span>
                    <span className="nc-icard-name">{metaOf(id).name}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </BottomSheet>

      {/* 선물 아이템 시트 */}
      <BottomSheet open={sheet === 'gift'} onClose={() => setSheet(null)}>
        <h3 className="nc-sheet-title">선물할 아이템</h3>
        <p className="nc-sheet-sub">보낼 아이템과 수량을 골라 주세요</p>
        {giftableIds.length === 0 ? (
          <div className="nc-sheet-empty">선물할 수 있는 아이템이 없어요.</div>
        ) : (
          <div className="nc-grid nc-grid-gift">
            {giftableIds.map((id) => {
              const q = giftDraft[id] || 0
              const max = owned[id] || 0
              return (
                <div key={id} className={`nc-gcard ${q > 0 ? 'is-picked' : ''}`}>
                  <span className="nc-icard-img" style={{ background: metaOf(id).bg }}>{metaOf(id).emoji}
                    <span className="nc-icard-badge">×{max}</span>
                  </span>
                  <span className="nc-icard-name">{metaOf(id).name}</span>
                  <div className="nc-step">
                    <button type="button" className="nc-step-b" disabled={q <= 0} onClick={() => setDraft(id, q - 1)}>−</button>
                    <span className="nc-step-v">{q}</span>
                    <button type="button" className="nc-step-b" disabled={q >= max} onClick={() => setDraft(id, q + 1)}>+</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <button type="button" className="nc-sheet-confirm" disabled={draftCount === 0} onClick={confirmGift}>
          {draftCount > 0 ? `확인 · ${draftCount}개` : '아이템을 선택해 주세요'}
        </button>
      </BottomSheet>

      {/* 미디어 URL 입력 모달 */}
      <Modal open={!!linkFor} onClose={() => setLinkFor(null)} cardClassName="nc-link-modal">
        {linkFor && (
          <div className="nc-link">
            <div className="nc-link-head">
              <span className="nc-link-ico" style={{ background: metaOf(linkFor).bg }}>{metaOf(linkFor).emoji}</span>
              <div><div className="nc-link-name">{metaOf(linkFor).name}</div><div className="nc-link-sub">전달하고 싶은 링크를 입력해 주세요</div></div>
            </div>
            <div className="nc-link-input">
              <svg width="15" viewBox="0 0 24 24" fill="none" stroke="#b0b0b8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
              <input type="url" value={linkUrl} placeholder={USE_META[linkFor]?.urlHint || '링크 (URL)'} onChange={(e) => setLinkUrl(e.target.value)} autoFocus />
            </div>
            <button type="button" className="nc-sheet-confirm" disabled={!linkUrl.trim()} onClick={confirmLink}>첨부하기</button>
          </div>
        )}
      </Modal>

      <RecipientPicker open={pickOpen} onClose={() => setPickOpen(false)} onPick={handlePick}
        excludeGroupIds={pickerExclude} mode={pickerMode}
        title={pickerMode === 'friend' ? '우정 링 보낼 그룹' : RINGS.includes(useItem?.id) ? '커플 링 보낼 사람' : '받는 사람'} />
    </div>
  )
}
