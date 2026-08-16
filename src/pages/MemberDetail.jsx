import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { listMemberCards, isCoupleGroup, isFriendGroup, pokeMember, getGroup, leaveGroup, getGroupDecoMap, nametagState, useNameTag, purinMicState, usePurinMic, listStoreItems } from '../lib/api'
import { hhmmLeft, nametagActive, useCountdownTick } from '../lib/nametag'
import { formatBirthKo } from '../lib/birthday'
import { openCompose } from '../lib/composeWindow'
import { SETTINGS_EVENT } from '../lib/memberModal'
import { uploadGraffitiImage } from '../lib/storage'
import MemberAvatar from '../components/MemberAvatar'
import OttBadges from '../components/OttBadges'
import GraffitiPad from '../components/GraffitiPad'
import Modal from '../components/Modal'
import StoreItemImage from '../components/StoreItemImage'
import { decoSlot, BORDER_IDS } from '../components/AvatarDeco'
import { setStoreCatalog, catalogDecoSlot, catalogName, bgOf } from '../lib/storeCatalog'

// 오늘의 착장: 슬롯 표시명/정렬 순서(머리→얼굴→안경→테두리), 관리자 설정 슬롯 우선·폴백은 하드코딩.
const OUTFIT_SLOT_LABEL = { head: '머리', face: '얼굴', glasses: '안경', border: '테두리' }
const OUTFIT_SLOT_RANK = { '머리': 0, head: 0, '얼굴': 1, face: 1, '안경': 2, glasses: 2, '테두리': 3, border: 3 }
const outfitSlotOf = (id) => catalogDecoSlot(id) || (BORDER_IDS.has(id) ? '테두리' : decoSlot(id))
const outfitSlotLabel = (slot) => OUTFIT_SLOT_LABEL[slot] || slot

function telHref(s) {
  const cleaned = String(s).replace(/[^\d+]/g, '')
  const digits = cleaned.replace(/\D/g, '')
  return digits.length >= 3 ? `tel:${cleaned}` : ''
}
const birthLabel = (s) => formatBirthKo(s)

function PaperPlane() {
  return (
    <svg width="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
  )
}
function PokeHand() {
  return (
    <svg width="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 14a8 8 0 0 1-8 8" /><path d="M18 11v-1a2 2 0 0 0-2-2 2 2 0 0 0-2 2" />
      <path d="M14 10V9a2 2 0 0 0-2-2 2 2 0 0 0-2 2v1" /><path d="M10 9.5V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v10" />
      <path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </svg>
  )
}
function PencilIcon() {
  return (
    <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}
function LockIcon() {
  return (
    <svg width="16" viewBox="0 0 24 24" fill="none" stroke="#c9c6d6" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
  )
}

export default function MemberDetail({ groupId: groupIdProp, userId: userIdProp, embedded = false, onClose }) {
  // PC 모달로 뜰 땐 groupId/userId 를 props 로 받는다(라우트 파라미터 폴백).
  const params = useParams()
  const groupId = groupIdProp ?? params.groupId
  const userId = userIdProp ?? params.userId
  const navigate = useNavigate()
  const [member, setMember] = useState(null)
  const [group, setGroup] = useState(null)
  const [premium, setPremium] = useState(false) // 커플/우정 링 → 콕 찌르기 가능
  const [iAmOwner, setIAmOwner] = useState(false)
  const [meCard, setMeCard] = useState(null) // 내 그룹내 닉네임·아바타 (쪽지 From)
  const [poking, setPoking] = useState(false)
  const [toast, setToast] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [decoMap, setDecoMap] = useState({})
  // 명찰: 내가 이 멤버의 닉네임을 잠근 상태면 여기서도 바로 이름을 바꿀 수 있다
  const [nameLock, setNameLock] = useState(null)   // { until } | null
  const [nickEdit, setNickEdit] = useState(false)
  const [nickDraft, setNickDraft] = useState('')
  const [nickBusy, setNickBusy] = useState(false)
  // 푸린 마이크: 내가 이 멤버의 얼굴에 낙서를 그린 상태면 여기서도 바로 고칠 수 있다
  const [graffitiLock, setGraffitiLock] = useState(null)   // { until, imageUrl } | null
  const [grafEdit, setGrafEdit] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [cards, g, couple, friend, decos, ntState, pmState, storeItems] = await Promise.all([
        listMemberCards(groupId),
        getGroup(groupId).catch(() => null),
        isCoupleGroup(groupId).catch(() => false),
        isFriendGroup(groupId).catch(() => false),
        getGroupDecoMap(groupId).catch(() => ({})),
        nametagState(groupId).catch(() => null),
        purinMicState(groupId).catch(() => null),
        listStoreItems().catch(() => null), // "오늘의 착장" 슬롯 표시명/이름에 필요(관리자 설정 우선)
      ])
      if (storeItems) setStoreCatalog(storeItems)
      const act = ntState?.active
      setNameLock(act && act.target_id === userId && nametagActive(act.until) ? { until: act.until } : null)
      const gact = pmState?.active
      setGraffitiLock(gact && gact.target_id === userId && nametagActive(gact.until)
        ? { until: gact.until, imageUrl: gact.image_url } : null)
      setDecoMap(decos || {})
      const self = cards.find((m) => m.is_self)
      setMember(cards.find((m) => m.user_id === userId) || null)
      setIAmOwner((self || {}).role === 'owner')
      setMeCard(self || null)
      setGroup(g)
      setPremium(couple || friend)
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [groupId, userId])
  useEffect(() => { load() }, [load])
  useCountdownTick(!!nameLock || !!graffitiLock)   // 남은 시간(23:59) 표기 갱신

  async function poke() {
    if (poking) return
    setPoking(true); setError('')
    try {
      await pokeMember(groupId, userId)
      setToast('콕 찔렀어요!'); setTimeout(() => setToast(''), 1600)
    } catch (err) { setError(err.message) } finally { setPoking(false) }
  }

  function sendNote() {
    openCompose(navigate, {
      reply: {
        recipient: { groupId, groupName: group?.name || '', userId, name: member.display_nickname, avatar: member.avatar_url },
        me: { name: meCard?.display_nickname || '', avatar: meCard?.avatar_url || null },
      },
    })
  }

  async function kick() {
    if (!confirm(`${member.display_nickname} 님을 그룹에서 내보낼까요?`)) return
    try { await leaveGroup(groupId, userId); if (embedded && onClose) onClose(); else navigate(`/groups/${groupId}/members`) }
    catch (err) { setError(err.message) }
  }
  // 명찰로 잠근 상대의 닉네임을 이 화면에서 바로 변경
  async function saveNick() {
    const v = nickDraft.trim()
    if (!v || nickBusy) return
    setNickBusy(true); setError('')
    try { await useNameTag(groupId, v); setNickEdit(false); await load() }
    catch (err) { setError(err.message) } finally { setNickBusy(false) }
  }
  // 내 정보 수정: 그룹 상세가 마운트돼 있으면 가운데 임베드로 열고(userId 를 같이 보내서, 설정
  // 임베드를 닫을 때 이 멤버 모달로 다시 돌아오게), 아니면 설정 페이지로 이동(returnTo 로 동일하게 처리).
  function editMe() {
    const ev = new CustomEvent(SETTINGS_EVENT, { detail: { groupId, userId, view: 'me', handled: false } })
    window.dispatchEvent(ev)
    if (ev.detail.handled) onClose?.()
    else navigate(`/groups/${groupId}/settings`, { state: { returnTo: `/groups/${groupId}/members/${userId}` } })
  }

  if (loading) return <div className="page"><div className="spinner" /></div>
  if (error && !member) return <div className="page"><div className="alert alert-error">{error}</div></div>
  if (!member) return <div className="page"><div className="empty"><p className="muted">멤버를 찾을 수 없어요.</p></div></div>

  if (member.is_left) {
    return (
      <div className="page md-page">
        <div className="md-profile">
          <MemberAvatar src={member.avatar_url} name={member.display_nickname} seed={member.user_id} size={104} fontScale={0.33} deco={decoMap[member.user_id]} />
          <div className="md-name">{member.display_nickname}</div>
          <div className="md-left-badge">탈퇴한 멤버</div>
        </div>
        <div className="md-empty-hint" style={{ textAlign: 'center' }}>그룹을 나간 멤버예요.<br />남긴 글과 댓글은 그대로 남아 있어요.</div>
      </div>
    )
  }

  const ott = Array.isArray(member.subscribed_ott) ? member.subscribed_ott : []
  const hasContact = !!member.contact
  const hasBirth = !!member.birthdate
  const hasOtt = ott.length > 0
  const nothingShared = !hasContact && !hasBirth && !hasOtt
  // 오늘의 착장: 이 그룹에서 현재 장착 중인 꾸미기(낙서 제외), 머리→얼굴→안경→테두리 순
  const outfitItems = (decoMap[member.user_id] || [])
    .filter((d) => d.id !== '__graffiti')
    .slice()
    .sort((a, b) => (OUTFIT_SLOT_RANK[outfitSlotOf(a.id)] ?? 99) - (OUTFIT_SLOT_RANK[outfitSlotOf(b.id)] ?? 99))
  const tel = hasContact ? telHref(member.contact) : ''

  return (
    <div className="page md-page">
      {/* 내 정보(모달)일 때: 우측 상단 톱니(내 정보 수정) */}
      {embedded && member.is_self && (
        <button type="button" className="md-gear" onClick={editMe}
          aria-label="내 정보 수정" title="내 정보 수정">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      )}
      {/* 프로필 */}
      <div className="md-profile">
        <div className="md-avatar-wrap">
          <MemberAvatar src={member.avatar_url} name={member.display_nickname} seed={member.user_id} size={104} fontScale={0.33} deco={decoMap[member.user_id]} />
          {/* 푸린 마이크로 이 멤버 얼굴에 낙서한 사람(나)일 때만 즉석 수정 */}
          {graffitiLock && !member.is_self && (
            <button type="button" className="md-graf-pencil" onClick={() => setGrafEdit(true)}
              aria-label="낙서 수정" title={`낙서 적용 중 · ${hhmmLeft(graffitiLock.until)} 남음`}><PencilIcon /></button>
          )}
        </div>
        {graffitiLock && !member.is_self && (
          <div className="md-name-lock">🎤 낙서 적용 중 · {hhmmLeft(graffitiLock.until)} 남음</div>
        )}
        {nickEdit ? (
          <div className="md-name-edit">
            <input className="cg-input md-name-input" value={nickDraft} maxLength={12} autoFocus
              onChange={(e) => setNickDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveNick(); if (e.key === 'Escape') setNickEdit(false) }}
              placeholder="바꿀 이름" />
            <button type="button" className="md-name-ok" disabled={!nickDraft.trim() || nickBusy} onClick={saveNick}>확인</button>
            <button type="button" className="md-name-cancel" disabled={nickBusy} onClick={() => setNickEdit(false)}>취소</button>
          </div>
        ) : (
          <div className="md-name">
            {member.display_nickname}
            {member.is_self && <span className="md-me">나</span>}
            {/* 명찰 사용 중(내가 잠근 상대)일 때만 닉네임 옆에 연필 */}
            {nameLock && !member.is_self && (
              <button type="button" className="md-name-pencil" onClick={() => { setNickDraft(member.display_nickname || ''); setNickEdit(true) }}
                aria-label="이름 바꾸기" title={`명찰 사용 중 · ${hhmmLeft(nameLock.until)} 남음`}><PencilIcon /></button>
            )}
          </div>
        )}
        {nameLock && !member.is_self && !nickEdit && (
          <div className="md-name-lock">🏷️ 명찰 사용 중 · {hhmmLeft(nameLock.until)} 남음</div>
        )}
        {!member.is_self && (
          <div className="md-actions">
            <button type="button" className="md-btn md-btn-primary" onClick={sendNote}><PaperPlane /> 쪽지 보내기</button>
            {premium && (
              <button type="button" className="md-btn md-btn-ghost" disabled={poking} onClick={poke}><PokeHand /> 콕 찌르기</button>
            )}
          </div>
        )}
      </div>

      {/* 공개된 정보 */}
      <div className="md-info">
        <div className="md-info-label">공개된 정보</div>
        <div className="md-card">
          {/* 연락처 */}
          <div className="md-row">
            <span className={`md-row-icon ${hasContact ? '' : 'off'}`} style={hasContact ? { background: '#e6eefd' } : undefined}>📞</span>
            <div className="md-row-main">
              <div className={`md-row-k ${hasContact ? '' : 'off'}`}>연락처</div>
              {hasContact
                ? <div className="md-row-v">{member.contact}</div>
                : <div className="md-row-v hidden">비공개</div>}
            </div>
            {hasContact
              ? (tel && <a className="md-call" href={tel} aria-label="전화" title="전화">
                  <svg width="16" viewBox="0 0 24 24" fill="none" stroke="#191722" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                </a>)
              : <LockIcon />}
          </div>
          {/* 생년월일 */}
          <div className="md-row">
            <span className={`md-row-icon ${hasBirth ? '' : 'off'}`} style={hasBirth ? { background: '#fde8ee' } : undefined}>🎂</span>
            <div className="md-row-main">
              <div className={`md-row-k ${hasBirth ? '' : 'off'}`}>생년월일</div>
              {hasBirth
                ? <div className="md-row-v">{birthLabel(member.birthdate)}</div>
                : <div className="md-row-v hidden">비공개</div>}
            </div>
            {!hasBirth && <LockIcon />}
          </div>
          {/* 구독 OTT */}
          <div className={`md-row ${hasOtt ? 'md-row-top' : ''}`}>
            <span className={`md-row-icon ${hasOtt ? '' : 'off'}`} style={hasOtt ? { background: '#eeebfe' } : undefined}>📺</span>
            <div className="md-row-main">
              <div className={`md-row-k ${hasOtt ? '' : 'off'}`}>구독 OTT</div>
              {hasOtt
                ? <div className="md-row-ott"><OttBadges list={ott} /></div>
                : <div className="md-row-v hidden">비공개</div>}
            </div>
            {!hasOtt && <LockIcon />}
          </div>
        </div>

        {nothingShared && (
          <div className="md-empty-hint">아직 공개한 정보가 없어요. 멤버가 공개한 정보만 볼 수 있어요.</div>
        )}
      </div>

      {/* 오늘의 착장: 이 그룹에서 장착 중인 꾸미기. 4개 미만이면 그리드, 4개 이상이면 가로 스와이프.
          본인 프로필이면(+ 프리미엄 그룹) 장착한 게 없어도 "갈아입기"로 옷장에 갈 수 있게 보인다. */}
      {(outfitItems.length > 0 || (member.is_self && premium)) && (
        <div className="md-info">
          <div className="md-info-head">
            <div className="md-info-label">오늘의 착장</div>
            {member.is_self && premium && (
              <button type="button" className="md-outfit-edit" onClick={() => navigate(`/groups/${groupId}/closet`)}>갈아입기</button>
            )}
          </div>
          {outfitItems.length === 0 ? (
            <div className="md-empty-hint">아직 장착한 꾸미기가 없어요.</div>
          ) : (
          <div className={outfitItems.length >= 4 ? 'md-outfit-scroll' : 'inv-grid'}>
            {outfitItems.map((d) => (
              <div key={d.id} className="inv-card2 is-static">
                <span className="inv-thumb" style={{ background: bgOf(d.id, true) }}>
                  <StoreItemImage id={d.id} emoji="✨" className="inv-thumb-img" />
                  <span className="deco-slot-badge">{outfitSlotLabel(outfitSlotOf(d.id))}</span>
                </span>
                <span className="inv-name">{catalogName(d.id) || '꾸미기 아이템'}</span>
              </div>
            ))}
          </div>
          )}
        </div>
      )}

      {/* 내보내기 (소유자 전용, 본인 제외) */}
      {iAmOwner && !member.is_self && (
        <div className="md-footer">
          <button type="button" className="md-kick" onClick={kick}>
            <svg width="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18.36 6.64a9 9 0 1 1-12.73 0" /><line x1="12" y1="2" x2="12" y2="12" /></svg>
            그룹에서 내보내기
          </button>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
      <GraffitiEditModal open={grafEdit} onClose={() => setGrafEdit(false)}
        groupId={groupId} myId={meCard?.user_id} member={member} lock={graffitiLock} onDone={load} />
    </div>
  )
}

// 상대 얼굴에 그린 낙서를 이 화면에서 바로 고치는 모달(명찰의 인라인 수정과 동일한 위치의 기능)
function GraffitiEditModal({ open, onClose, groupId, myId, member, lock, onDone }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inFlight = useRef(false)
  const padRef = useRef(null)

  useEffect(() => { if (open) { setError(''); setBusy(false); inFlight.current = false } }, [open])

  async function submit() {
    if (inFlight.current) return
    setBusy(true); setError(''); inFlight.current = true
    try {
      const blob = await padRef.current?.exportBlob()
      if (!blob) throw new Error('낙서를 그려 주세요.')
      const url = await uploadGraffitiImage(blob, myId, groupId)
      await usePurinMic(groupId, url)
      await onDone?.()
      onClose()
    } catch (e) { setError(e.message) }
    finally { inFlight.current = false; setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} cardClassName="nc-link-modal" title="낙서 수정">
      <div className="purinmic-modal">
        {error && <div className="alert alert-error">{error}</div>}
        {lock && <span className="purinmic-left">낙서 적용 중 · {hhmmLeft(lock.until)} 남음</span>}
        <GraffitiPad ref={padRef} photoUrl={member?.avatar_url} initialImageUrl={lock?.imageUrl} size={240} />
        <button type="button" className="st-btn-buy st-btn-block" disabled={busy} onClick={submit}>
          {busy ? '수정 중…' : '수정하기'}
        </button>
      </div>
    </Modal>
  )
}
