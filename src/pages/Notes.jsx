import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { safeUrl } from '../lib/safeUrl'
import Avatar from '../components/Avatar'
import Modal from '../components/Modal'
import MusicPlayer from '../components/MusicPlayer'
import VideoPlayer from '../components/VideoPlayer'
import { BluraySlot } from '../components/BlurayPlayer'
import StoreItemImage from '../components/StoreItemImage'
import { imgBgOf } from '../lib/storeMeta'
import { listReceivedNotes, listSentNotes, claimCoupleRing, rejectCoupleRing, claimGift, claimFriendRing, getGroupDecoMap, listNoteItems, claimGiftItem, claimGiftNoteAll } from '../lib/api'

function NoteFabIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  )
}

// 카드: 하루 안이면 상대 시간(방금/N분 전/N시간 전), 날짜가 지나가면 "N 월 N 일"
function formatNoteTime(iso) {
  try {
    const d = new Date(iso)
    const diff = (Date.now() - d.getTime()) / 1000
    if (diff < 60) return '방금'
    if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
    if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`
    return `${d.getMonth() + 1} 월 ${d.getDate()} 일`
  } catch { return '' }
}
// 모달: "NN 년 N 월 N 일 HH24:MI"
function formatNoteFull(iso) {
  try {
    const d = new Date(iso)
    const p = (n) => String(n).padStart(2, '0')
    return `${String(d.getFullYear()).slice(2)} 년 ${d.getMonth() + 1} 월 ${d.getDate()} 일 ${p(d.getHours())}:${p(d.getMinutes())}`
  } catch { return '' }
}

export default function Notes() {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const { setRefreshHandler, player, bluray: blurayPlayer } = useOutletContext()
  const [tab, setTab] = useState(location.state?.tab === 'sent' ? 'sent' : 'received')
  const [received, setReceived] = useState([])
  const [sent, setSent] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(null) // 열려 있는 쪽지
  const [busy, setBusy] = useState(false)
  const [decosByGroup, setDecosByGroup] = useState({}) // { groupId: {userId:{head,face}} }
  const [noteItems, setNoteItems] = useState({})       // { noteId: [{item_id,item_name,qty,claimed}] }

  const fetchNotes = useCallback(async () => {
    if (!user?.id) return
    const [r, s] = await Promise.all([listReceivedNotes(user.id), listSentNotes(user.id)])
    setReceived(r); setSent(s)
    const gids = [...new Set([...r, ...s].map((n) => n.group_id).filter(Boolean))]
    Promise.all(gids.map((id) => getGroupDecoMap(id).then((m) => [id, m]).catch(() => [id, {}])))
      .then((pairs) => setDecosByGroup(Object.fromEntries(pairs))).catch(() => {})
    const giftIds = [...r, ...s].filter((n) => n.kind === 'gift').map((n) => n.id)
    try { setNoteItems(await listNoteItems(giftIds)) } catch { /* noop */ }
  }, [user?.id])
  // 액션(수령 등) 후 목록만 갱신
  async function load() {
    try { await fetchNotes() } catch (err) { setError(err.message) }
  }

  // 최초 로드 — 스피너가 무한히 돌지 않도록 15초 안전장치 포함.
  useEffect(() => {
    if (!user?.id) return
    let on = true
    setLoading(true)
    const guard = setTimeout(() => {
      if (on) { setError((e) => e || '네트워크가 불안정해요. 아래 다시 시도를 눌러 주세요.'); setLoading(false) }
    }, 15000)
    fetchNotes()
      .then(() => { if (on) setError('') })
      .catch((err) => { if (on) setError(err.message || '쪽지를 불러오지 못했어요.') })
      .finally(() => { if (on) { clearTimeout(guard); setLoading(false) } })
    return () => { on = false; clearTimeout(guard) }
  }, [user?.id, fetchNotes])

  // 백그라운드에서 돌아오면(재개) 조용히 다시 불러오기 — stale/무한 로딩 방지.
  useEffect(() => {
    const onResume = () => { if (document.visibilityState === 'visible') fetchNotes().catch(() => {}) }
    document.addEventListener('visibilitychange', onResume)
    window.addEventListener('focus', onResume)
    window.addEventListener('pageshow', onResume)
    return () => {
      document.removeEventListener('visibilitychange', onResume)
      window.removeEventListener('focus', onResume)
      window.removeEventListener('pageshow', onResume)
    }
  }, [fetchNotes])

  // 다시 시도: 8초 내 안 되면(재개 후 Supabase 클라이언트 인증 고착 등으로 조회가
  // fetch 단계에 도달하지 못하고 멈춘 상태) 새로고침으로 클린 복구한다.
  const retryLoad = useCallback(() => {
    setLoading(true); setError('')
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('stuck')), 8000))
    Promise.race([fetchNotes(), timeout])
      .then(() => { setError(''); setLoading(false) })
      .catch(() => { try { window.location.reload() } catch { setLoading(false) } })
  }, [fetchNotes])

  // 당겨서 새로고침: 전체 스피너 없이 목록만 갱신
  const refresh = useCallback(async () => {
    try { await fetchNotes() } catch (err) { setError(err.message) }
  }, [fetchNotes])
  useEffect(() => {
    setRefreshHandler(() => refresh)
    return () => setRefreshHandler(() => null)
  }, [setRefreshHandler, refresh])

  // 커플 링 수령(나눠 끼기): 양쪽 인벤토리에 장착되고 그룹이 프리미엄이 됨
  async function accept(n) {
    setBusy(true); setError('')
    try {
      await claimCoupleRing(n.id)
      await load()
      setOpen((o) => (o && o.id === n.id ? { ...o, claimed: true, is_read: true } : o))
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  // 커플 링 거절: 보낸 사람 인벤토리에 다시 사용 가능한 상태로 돌아감
  async function reject(n) {
    setBusy(true); setError('')
    try {
      await rejectCoupleRing(n.id)
      await load()
      setOpen((o) => (o && o.id === n.id ? { ...o, rejected: true, is_read: true } : o))
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  // 우정 링 수령: 내 인벤토리에 장착 우정 링이 들어옴(거절 없음)
  async function acceptFriend(n) {
    setBusy(true); setError('')
    try {
      await claimFriendRing(n.id)
      await load()
      setOpen((o) => (o && o.id === n.id ? { ...o, claimed: true, is_read: true } : o))
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  // 쪽지에 동봉된 아이템 목록. note_items 있으면 그걸, 없으면(구버전) 쪽지 단일 아이템으로.
  const giftItemsOf = (n) => {
    if (!n) return []
    const rows = noteItems[n.id]
    if (rows && rows.length) return rows
    if (n.item_id) return [{ item_id: n.item_id, item_name: n.item_name, qty: n.qty || 1, claimed: !!n.claimed, _legacy: true }]
    return []
  }

  // 개별 수령
  async function claimOne(n, it) {
    setBusy(true); setError('')
    try {
      if (it._legacy) await claimGift(n.id)
      else await claimGiftItem(n.id, it.item_id)
      await load()
      setOpen((o) => (o && o.id === n.id ? { ...o, ...(it._legacy ? { claimed: true, is_read: true } : {}) } : o))
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  // 일괄 수령
  async function claimAll(n) {
    setBusy(true); setError('')
    try {
      if (noteItems[n.id]?.length) await claimGiftNoteAll(n.id)
      else await claimGift(n.id)
      await load()
      setOpen((o) => (o && o.id === n.id ? { ...o, claimed: true } : o))
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  const list = tab === 'received' ? received : sent

  // ---- 탭(받은/보낸) 좌우 스와이프 + 흰색 알약 인디케이터 ----
  const TABS = ['received', 'sent']
  const activeIdx = TABS.indexOf(tab)
  const tabsRef = useRef(null)
  const wrapRef = useRef(null)      // 고정 탭 래퍼(높이 측정 → 스크롤 영역 상단 여백)
  const paneRef = useRef(null)      // 실제 스크롤 영역(.notes-scroll)
  const [tabH, setTabH] = useState(56)
  useLayoutEffect(() => {
    const measure = () => { if (wrapRef.current) setTabH(wrapRef.current.offsetHeight) }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])
  const swipeRef = useRef(null)
  const suppressClickRef = useRef(false)
  const [tabGeo, setTabGeo] = useState([])
  const [paneW, setPaneW] = useState(0)
  const [gesture, setGesture] = useState(null) // { x, active }
  const [scrolled, setScrolled] = useState(false) // 스크롤 시 상단 탭 뒤 페이드 on

  // 본문 스크롤 감지 → 상단 탭 아래 그라데이션 페이드(카드가 탭 뒤로 자연스럽게 사라짐)
  useEffect(() => {
    const sc = paneRef.current
    if (!sc) return
    const onScroll = () => setScrolled(sc.scrollTop > 4)
    sc.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => sc.removeEventListener('scroll', onScroll)
  }, [tab, loading])

  // 탭 버튼 실제 위치/폭 측정(패딩 안쪽에 딱 맞는 알약을 위해)
  useLayoutEffect(() => {
    const el = tabsRef.current
    if (!el) return
    const measure = () => {
      const btns = [...el.querySelectorAll('.tab')]
      setTabGeo(btns.map((b) => ({ left: b.offsetLeft, width: b.offsetWidth })))
      setPaneW(paneRef.current?.offsetWidth || 0)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [loading])

  function onTouchStart(e) {
    suppressClickRef.current = false
    if (e.touches.length !== 1 || e.target.closest?.('.fab, .modal-root')) { swipeRef.current = null; return }
    swipeRef.current = { x0: e.touches[0].clientX, y0: e.touches[0].clientY, locked: null, w: paneRef.current?.offsetWidth || window.innerWidth }
  }
  function onTouchMove(e) {
    const s = swipeRef.current
    if (!s || e.touches.length !== 1) return
    const dx = e.touches[0].clientX - s.x0, dy = e.touches[0].clientY - s.y0
    if (s.locked === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      s.locked = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'h' : 'v'
      if (s.locked === 'v') { swipeRef.current = null; return }
    }
    if (s.locked !== 'h') return
    suppressClickRef.current = true // 스와이프 후 카드 열림 방지
    let x = dx
    if ((x > 0 && activeIdx === 0) || (x < 0 && activeIdx === TABS.length - 1)) x *= 0.35
    setGesture({ x, active: true })
  }
  function onTouchEnd(e) {
    const s = swipeRef.current; swipeRef.current = null
    if (!s || s.locked !== 'h') { if (gesture) setGesture(null); return }
    const dx = e.changedTouches[0].clientX - s.x0
    if (Math.abs(dx) >= Math.min(70, s.w * 0.22)) {
      const n = dx < 0 ? Math.min(TABS.length - 1, activeIdx + 1) : Math.max(0, activeIdx - 1)
      if (n !== activeIdx) setTab(TABS[n])
    }
    setGesture({ x: 0, active: false })
  }
  function onCardClick(n) {
    if (suppressClickRef.current) { suppressClickRef.current = false; return }
    setOpen(n)
  }

  // 알약: 현재 탭 → 인접 탭으로 드래그 비율만큼 보간
  const cur = tabGeo[activeIdx]
  const gx = gesture?.x || 0
  let uLeft = cur?.left ?? 0, uWidth = cur?.width ?? 0
  if (cur && paneW) {
    if (gx < 0 && activeIdx < TABS.length - 1) {
      const nb = tabGeo[activeIdx + 1], t = Math.min(1, -gx / paneW)
      uLeft = cur.left + (nb.left - cur.left) * t; uWidth = cur.width + (nb.width - cur.width) * t
    } else if (gx > 0 && activeIdx > 0) {
      const nb = tabGeo[activeIdx - 1], t = Math.min(1, gx / paneW)
      uLeft = cur.left + (nb.left - cur.left) * t; uWidth = cur.width + (nb.width - cur.width) * t
    }
  }
  const underlineStyle = cur && cur.width
    ? { transform: `translateX(${uLeft}px)`, width: `${uWidth}px`, transition: gesture?.active ? 'none' : 'transform .2s ease, width .2s ease' }
    : { opacity: 0 }

  // 받은 쪽지에 답장: 원래 보낸이를 To, 그 그룹의 내 정보를 From 으로 자동 채워 작성 화면 이동
  function replyTo(n) {
    navigate('/notes/new', {
      state: {
        reply: {
          recipient: { groupId: n.group_id, groupName: '', userId: n.sender_id, name: n.sender_name, avatar: n.sender_avatar },
          me: { name: n.recipient_name, avatar: n.recipient_avatar },
        },
      },
    })
  }

  // 쪽지의 상대(카드/모달에 표시할 사람) 정보
  const peer = (n) => tab === 'received'
    ? { name: n.sender_name, avatar: n.sender_avatar, label: '님이 보냄', userId: n.sender_id, groupId: n.group_id }
    : { name: n.recipient_name, avatar: n.recipient_avatar, label: '님에게', userId: n.recipient_id, groupId: n.group_id }
  const peerDeco = (p) => (p.groupId && p.userId ? decosByGroup[p.groupId]?.[p.userId] : undefined)

  return (
    <div className="page notes-page" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      {error && (
        <div className="alert alert-error">
          {error}
          <button type="button" className="btn btn-sm picker-retry" onClick={retryLoad} disabled={loading}>
            {loading ? '불러오는 중…' : '다시 시도'}
          </button>
        </div>
      )}

      <div className="notes-body">
      {/* 고정 탭(스크롤/당김에 영향받지 않음) */}
      <div className={`notes-tabs-wrap ${scrolled ? 'is-scrolled' : ''}`} ref={wrapRef}>
        <div className="tabs" ref={tabsRef}>
          <button type="button" className={`tab ${tab === 'received' ? 'active' : ''}`} onClick={() => setTab('received')}>
            받은 쪽지함
          </button>
          <button type="button" className={`tab ${tab === 'sent' ? 'active' : ''}`} onClick={() => setTab('sent')}>
            보낸 쪽지함
          </button>
          <span className="tab-underline" style={underlineStyle} />
        </div>
      </div>
      {/* 탭 아래 실제 스크롤 영역(당겨서 새로고침도 이 영역만) */}
      <div className="notes-scroll" ref={paneRef} style={{ paddingTop: tabH + 14 }}>
      {loading ? (
        <div className="spinner" />
      ) : list.length === 0 ? (
        <div className="empty">{tab === 'received' ? '받은 쪽지가 없어요.' : '보낸 쪽지가 없어요.'}</div>
      ) : (
        <ul className="note-list">
          {list.map((n) => {
            const p = peer(n)
            const wish = n.kind === 'wish'
            const couple = n.kind === 'couple_ring'
            const friend = n.kind === 'friend_ring'
            const gift = n.kind === 'gift'
            const cassette = n.kind === 'cassette'
            const link = n.kind === 'link'
            const video = n.kind === 'video'
            const bluray = n.kind === 'bluray'
            const needClaim = (couple || friend || gift) && tab === 'received' && !n.claimed && !n.rejected
            const hasFlag = needClaim || (couple && n.rejected)
            return (
              <li key={n.id}>
                <button type="button" className={`note-card ${wish ? 'note-wish' : ''} ${couple ? 'note-couple' : ''} ${friend ? 'note-friend' : ''} ${gift ? 'note-gift' : ''} ${hasFlag ? 'has-flag' : ''}`} onClick={() => onCardClick(n)}>
                  <Avatar src={p.avatar} name={p.name} size={40} deco={peerDeco(p)} />
                  <div className="note-card-main">
                    <div className="note-card-head">
                      <span className="note-card-peer">
                        {wish && <span className="note-tag">🌟 소원</span>}
                        {couple && <span className="note-tag note-tag-couple">💍 커플 링</span>}
                        {friend && <span className="note-tag note-tag-friend">🤝 우정 링</span>}
                        {gift && <span className="note-tag note-tag-gift">📦 아이템</span>}
                        {cassette && <span className="note-tag note-tag-cassette">🎵 음악</span>}
                        {link && <span className="note-tag note-tag-link">🎁 선물 상자</span>}
                        {video && <span className="note-tag note-tag-video">📹 영상</span>}
                        {bluray && <span className="note-tag note-tag-video">💿 영상</span>}
                        {p.name} <span className="note-card-rel">{p.label}</span>
                      </span>
                      <span className="note-card-date">{formatNoteTime(n.created_at)}</span>
                    </div>
                    <div className="note-card-bodyrow">
                      <p className="note-card-body">{n.body}</p>
                      {needClaim && <span className="note-claim-flag">수령하기</span>}
                      {couple && n.rejected && <span className="note-claim-flag note-claim-flag-off">거절함</span>}
                    </div>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      </div>
      </div>

      <Modal open={!!open} onClose={() => setOpen(null)}
        cardClassName={open?.kind === 'wish' ? 'modal-wish' : open?.kind === 'couple_ring' ? 'modal-couple' : open?.kind === 'friend_ring' ? 'modal-friend' : open?.kind === 'gift' ? 'modal-gift' : open?.kind === 'cassette' ? 'modal-cassette' : open?.kind === 'link' ? 'modal-link' : (open?.kind === 'video' || open?.kind === 'bluray') ? 'modal-video' : ''}>
        {open && (() => {
          const p = peer(open)
          const wish = open.kind === 'wish'
          const couple = open.kind === 'couple_ring'
          const friend = open.kind === 'friend_ring'
          const gift = open.kind === 'gift'
          const cassette = open.kind === 'cassette'
          const link = open.kind === 'link'
          const video = open.kind === 'video'
          const bluray = open.kind === 'bluray'
          const mine = open.recipient_id === user?.id
          return (
            <div className="note-view">
              <div className="note-view-head">
                <Avatar src={p.avatar} name={p.name} size={44} deco={peerDeco(p)} />
                <div className="note-view-who">
                  <span className="note-view-peer">
                    {wish && <span className="note-tag">🌟 소원</span>}
                    {couple && <span className="note-tag note-tag-couple">💍 커플 링</span>}
                    {gift && <span className="note-tag note-tag-gift">📦 아이템</span>}
                    {cassette && <span className="note-tag note-tag-cassette">🎵 음악</span>}
                    {link && <span className="note-tag note-tag-link">🎁 선물 상자</span>}
                    {video && <span className="note-tag note-tag-video">📹 영상</span>}
                    {bluray && <span className="note-tag note-tag-video">💿 영상</span>}
                    {p.name} <span className="note-card-rel">{p.label}</span>
                  </span>
                  <span className="note-view-date">{formatNoteFull(open.created_at)}</span>
                </div>
              </div>
              <p className="note-view-body">{open.body}</p>
              {cassette && open.media_url && <MusicPlayer url={open.media_url} player={player} />}
              {video && open.media_url && <VideoPlayer url={open.media_url} />}
              {bluray && open.media_url && <BluraySlot url={open.media_url} player={blurayPlayer} />}
              {link && safeUrl(open.media_url) && (
                <a className="note-linkbtn" href={safeUrl(open.media_url)} target="_blank" rel="noreferrer noopener">
                  {open.item_name || '링크 열기'}
                </a>
              )}
              {gift && (() => {
                const gItems = giftItemsOf(open)
                if (!gItems.length) return null
                const anyUnclaimed = gItems.some((it) => !it.claimed)
                return (
                  <div className="note-gifts">
                    <div className="note-gifts-head">
                      <span className="note-gifts-label">동봉된 아이템</span>
                      {mine && gItems.length > 1 && anyUnclaimed && (
                        <button type="button" className="note-gift-all" onClick={() => claimAll(open)} disabled={busy}>일괄 수령</button>
                      )}
                    </div>
                    <ul className="note-gift-list">
                      {gItems.map((it) => (
                        <li key={it.item_id} className="note-gift-row">
                          <span className="note-gift-thumb" style={{ background: imgBgOf(it.item_id) }}>
                            <StoreItemImage id={it.item_id} emoji="🎁" className="note-gift-img" />
                          </span>
                          <span className="note-gift-name">{it.item_name}{it.qty > 1 && <span className="note-gift-qty">×{it.qty}</span>}</span>
                          {mine && (it.claimed
                            ? <span className="note-gift-done">수령 완료</span>
                            : <button type="button" className="note-gift-claim" onClick={() => claimOne(open, it)} disabled={busy}>수령하기</button>)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })()}
              {couple && mine ? (
                open.claimed ? (
                  <button type="button" className="btn btn-block" disabled>수령 완료 💍</button>
                ) : open.rejected ? (
                  <button type="button" className="btn btn-block" disabled>거절함</button>
                ) : (
                  <div className="couple-actions">
                    <button type="button" className="btn btn-ghost couple-reject" onClick={() => reject(open)} disabled={busy}>
                      거절
                    </button>
                    <button type="button" className="btn btn-primary" onClick={() => accept(open)} disabled={busy}>
                      {busy ? '처리 중…' : '나눠 끼기'}
                    </button>
                  </div>
                )
              ) : friend && mine ? (
                open.claimed ? (
                  <button type="button" className="btn btn-block" disabled>수령 완료 🤝</button>
                ) : (
                  <button type="button" className="btn btn-primary btn-block" onClick={() => acceptFriend(open)} disabled={busy}>
                    {busy ? '수령 중…' : '수령하기'}
                  </button>
                )
              ) : gift ? (
                mine && !open.anonymous ? (
                  <button type="button" className="btn btn-primary btn-block" onClick={() => replyTo(open)}>
                    답장하기
                  </button>
                ) : null
              ) : !wish && !couple && !friend && !gift && mine && !open.anonymous ? (
                <button type="button" className="btn btn-primary btn-block" onClick={() => replyTo(open)}>
                  답장하기
                </button>
              ) : null}
            </div>
          )
        })()}
      </Modal>

      <Link to="/notes/new" className="fab fab-above-nav" aria-label="쪽지 쓰기" title="쪽지 쓰기">
        <NoteFabIcon />
      </Link>
    </div>
  )
}
