import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { safeUrl } from '../lib/safeUrl'
import Avatar from '../components/Avatar'
import SystemAvatar from '../components/SystemAvatar'
import SystemChat from '../components/SystemChat'
import Modal from '../components/Modal'
import MusicPlayer from '../components/MusicPlayer'
import VideoPlayer from '../components/VideoPlayer'
import { BluraySlot } from '../components/BlurayPlayer'
import StoreItemImage from '../components/StoreItemImage'
import { itemName, resolveItemText } from '../lib/storeMeta'
import { bgOf, useStoreCatalog } from '../lib/storeCatalog'
import { listReceivedNotes, listSentNotes, claimCoupleRing, rejectCoupleRing, claimGift, claimFriendRing, getGroupDecoMap, getGroupMemberMap, listNoteItems, claimGiftItem, claimGiftNoteAll, openWaterNote, markNoteRead, useTimeMachine, listInventory, deleteReportGiftNote, listNotePhotos, developPolaroidNote } from '../lib/api'
import { PAGE, notesCache } from '../lib/notesCache'
import { openCompose, NOTE_CHANNEL } from '../lib/composeWindow'

// 물풍선 폭탄 쪽지 판별/폭발 여부
const isWater = (n) => !!n && n.timer_seconds != null && n.timer_seconds > 0
const waterExploded = (n) => isWater(n) && !!n.opened_at && Date.now() >= new Date(n.opened_at).getTime() + n.timer_seconds * 1000
const mmss = (sec) => `${Math.floor(Math.max(0, sec) / 60)}:${String(Math.max(0, sec) % 60).padStart(2, '0')}`
const ClockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15.5 14" /></svg>
)
// 되돌리기(반시계 원형 화살표)
const UndoIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7" /><polyline points="3 3 3 8 8 8" /></svg>
)
const TrashIcon = () => (
  <svg width="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M6 6l1 14h10l1-14" />
  </svg>
)
// 타임머신 아트(자체 반짝이 제거, 시계에 맞춰 크롭) — 확인 모달용
function TimeMachineArt() {
  return (
    <svg className="tm-art-svg" viewBox="18 16 92 96" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="tmGlow2" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#9AD0F5" stopOpacity="0.5" /><stop offset="0.7" stopColor="#9AD0F5" stopOpacity="0.12" /><stop offset="1" stopColor="#9AD0F5" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="tmRim2" x1="64" y1="34" x2="64" y2="94" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#9BD6F7" /><stop offset="1" stopColor="#4EA6E2" />
        </linearGradient>
        <radialGradient id="tmFace2" cx="0.38" cy="0.32" r="0.75">
          <stop offset="0" stopColor="#FBFDFF" /><stop offset="1" stopColor="#E7F1F8" />
        </radialGradient>
        <filter id="tmBlur2" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="1.4" /></filter>
      </defs>
      <circle cx="64" cy="64" r="41" fill="url(#tmGlow2)" />
      <path d="M51.7 30.2 A 36 36 0 1 0 76.3 30.2" stroke="#5F92DB" strokeWidth="4.5" fill="none" strokeLinecap="round" />
      <polygon points="77.5,22 77.5,38 66.5,29.5" fill="#4E7EC6" />
      <circle cx="64" cy="64" r="30" fill="url(#tmRim2)" />
      <circle cx="64" cy="64" r="24.5" fill="url(#tmFace2)" />
      <line x1="64" y1="42.5" x2="64" y2="46.5" stroke="#5A6069" strokeWidth="2.4" strokeLinecap="round" />
      <line x1="64" y1="81.5" x2="64" y2="85.5" stroke="#5A6069" strokeWidth="2.4" strokeLinecap="round" />
      <line x1="42.5" y1="64" x2="46.5" y2="64" stroke="#5A6069" strokeWidth="2.4" strokeLinecap="round" />
      <line x1="81.5" y1="64" x2="85.5" y2="64" stroke="#5A6069" strokeWidth="2.4" strokeLinecap="round" />
      <line x1="64" y1="64" x2="55" y2="48" stroke="#33373E" strokeWidth="3" strokeLinecap="round" />
      <line x1="64" y1="64" x2="75" y2="58" stroke="#33373E" strokeWidth="4" strokeLinecap="round" />
      <circle cx="64" cy="64" r="3.2" fill="#33373E" />
      <circle cx="64" cy="64" r="1.4" fill="#BFE3FB" />
      <ellipse cx="54" cy="54" rx="8" ry="5" fill="#FFFFFF" fillOpacity="0.5" filter="url(#tmBlur2)" transform="rotate(-30 54 54)" />
    </svg>
  )
}

function NoteFabIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  )
}

// 카드: 하루 안이면 상대 시간(방금/N분 전/N시간 전), 날짜가 지나가면 "N 월 N 일"
function formatNoteTime(iso) {
  try {
    const d = new Date(iso)
    const diff = (Date.now() - d.getTime()) / 1000
    if (diff < 60) return '방금'
    if (diff < 3600) return `${Math.floor(diff / 60)} 분 전`
    if (diff < 86400) return `${Math.floor(diff / 3600)} 시간 전`
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

// 폴라로이드 사진 뷰어: animate=true 일 때만 "카메라 → 인화(3초에 걸쳐 필름 배출) → 확대 → 30초 리빌"
// 연출을 태우고, animate=false(이미 인화된 사진을 다시 볼 때)면 처음부터 다 드러난 채로 즉시 보여준다.
// 단계: camera(카메라에서 흰 프레임+까만 사진 영역의 필름이 3초에 걸쳐 천천히 배출) → print(카메라·필름이
// 사라지며 실제 사진 프레임이 그 자리에 확대돼 나타남, 0.4초) → revealing(자리잡은 사진이 30초에 걸쳐
// 서서히 드러남). 카메라 연출은 열람 세션당 한 번만 재생.
// 여러 장인 경우 리빌은 모든 사진에 동시에(같은 순간에) 걸리도록, 사진 img 를 전부 한 번에 마운트해두고
// pv-reveal-anim 클래스도 다같이 붙인다 — 현재 보고 있는 사진만 opacity 로 보여줄 뿐, 안 보이는 사진도
// 백그라운드에서 계속 드러나는 중이라 나중에 넘겨봐도 이미 그만큼 밝아져 있다. 사진마다 key 가 고정돼 있어
// 다른 사진을 봤다가 돌아와도 DOM 이 다시 마운트되지 않으므로(=애니메이션이 리셋되지 않으므로) 이미
// 드러났던 사진이 다시 까매지는 일도 없다.
// 탭(움직임 없는 클릭)과 좌우/아래 스와이프를 구분해주는 제스처 훅. onPointerDown 에서 preventDefault
// 를 호출하지 않으므로, 사진처럼 브라우저 자체의 길게 눌러 저장하는 기능이 필요한 요소에도 그대로
// 붙여 쓸 수 있다(길게 눌러 콜아웃 메뉴가 뜨면 pointercancel 로 제스처 상태만 정리됨).
function useSwipeGesture({ onTap, onSwipeLeft, onSwipeRight, onSwipeDown }) {
  const gestureRef = useRef(null)
  return {
    onPointerDown: (e) => {
      gestureRef.current = { x: e.clientX, y: e.clientY, moved: false }
      e.currentTarget.setPointerCapture?.(e.pointerId)
    },
    onPointerMove: (e) => {
      const g = gestureRef.current
      if (!g) return
      if (Math.abs(e.clientX - g.x) > 8 || Math.abs(e.clientY - g.y) > 8) g.moved = true
    },
    onPointerUp: (e) => {
      const g = gestureRef.current
      gestureRef.current = null
      if (!g) return
      if (!g.moved) { onTap?.(); return }
      const dx = e.clientX - g.x, dy = e.clientY - g.y
      const adx = Math.abs(dx), ady = Math.abs(dy)
      if (ady > 60 && ady > adx) { if (dy > 0) onSwipeDown?.(); return }
      if (adx > 50 && adx > ady) { if (dx < 0) onSwipeLeft?.(); else onSwipeRight?.() }
    },
    onPointerCancel: () => { gestureRef.current = null },
  }
}

function PolaroidPhotoViewer({ polaroidView, notePhotos, onNav }) {
  const [stage, setStage] = useState(() => (polaroidView.animate ? 'camera' : 'static'))
  const [ejecting, setEjecting] = useState(false)
  const [fullscreen, setFullscreen] = useState(null) // { index, showControls } — 원본 비율 전체화면 뷰어

  useEffect(() => {
    if (!polaroidView.animate) { setStage('static'); return }
    setStage('camera')
    setEjecting(false)
    let raf1, raf2
    raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => setEjecting(true)) })
    const t1 = setTimeout(() => setStage('print'), 3000)
    const t2 = setTimeout(() => setStage('revealing'), 3000 + 400)
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); clearTimeout(t1); clearTimeout(t2) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polaroidView.animate, polaroidView.noteId])

  const photos = notePhotos[polaroidView.noteId] || []
  const idx = Math.max(0, Math.min(polaroidView.index, photos.length - 1))
  const revealing = stage === 'revealing'
  const showCamera = stage === 'camera' || stage === 'print'
  const canOpenFullscreen = stage === 'revealing' || stage === 'static'
  // useSwipeGesture 는 훅이므로 아래 early return 보다 앞에서, 매 렌더 조건 없이 호출해야 한다.
  const photoGesture = useSwipeGesture({
    onTap: () => { if (canOpenFullscreen) setFullscreen({ index: idx, showControls: false }) },
    onSwipeLeft: () => { if (canOpenFullscreen && idx < photos.length - 1) onNav(idx + 1) },
    onSwipeRight: () => { if (canOpenFullscreen && idx > 0) onNav(idx - 1) },
  })

  if (!photos.length) return <div className="pv-empty">사진을 불러오는 중…</div>

  return (
    <div className="pv-wrap">
      {showCamera && (
        <div className="pv-camera-scene">
          <div className={`pv-eject-card ${ejecting ? 'is-ejecting' : ''} ${stage === 'print' ? 'is-settled' : ''}`}>
            <div className="pv-eject-photo" />
          </div>
          <div className={`pv-camera ${stage === 'print' ? 'is-hidden' : ''}`}>
            <div className="pv-camera-slot" />
            <span className="pv-camera-brand">NOLGING</span>
            <span className="pv-camera-indicator" />
            <span className="pv-camera-dial" aria-hidden="true"><span /></span>
            <div className="pv-camera-flashbox">
              <span className="pv-camera-bars"><i /><i /><i /></span>
              <span className="pv-camera-flash-icon" />
            </div>
            <div className="pv-camera-lens">
              <span className="pv-camera-lens-glass" />
              <span className="pv-camera-lens-pupil" />
              <span className="pv-camera-lens-glint" />
            </div>
            <div className="pv-camera-wordmark"><span>nolging</span><span>polaroid</span></div>
          </div>
        </div>
      )}
      <div className={`pv-frame ${showCamera ? 'is-camera' : ''}`}>
        <div
          className={`pv-photo ${canOpenFullscreen ? 'is-tappable' : ''}`}
          {...photoGesture}
        >
          {photos.map((photo, i) => (
            <img key={photo.id} src={photo.url} alt="" className={`pv-photo-img ${i === idx ? 'is-current' : ''} ${revealing ? 'pv-reveal-anim' : (stage === 'print' ? 'pv-photo-black' : '')}`} />
          ))}
        </div>
      </div>
      {(stage === 'revealing' || stage === 'static') && photos.length > 1 && (
        <div className="pv-nav">
          <button type="button" className="pv-nav-btn" aria-label="이전 사진" disabled={idx === 0}
            onClick={() => onNav(idx - 1)}>‹</button>
          <span className="pv-nav-count">{idx + 1} / {photos.length}</span>
          <button type="button" className="pv-nav-btn" aria-label="다음 사진" disabled={idx === photos.length - 1}
            onClick={() => onNav(idx + 1)}>›</button>
        </div>
      )}
      {fullscreen && (
        <PolaroidFullscreen
          photos={photos}
          index={fullscreen.index}
          showControls={fullscreen.showControls}
          onNav={(i) => setFullscreen((v) => ({ ...v, index: i }))}
          onToggleControls={() => setFullscreen((v) => ({ ...v, showControls: !v.showControls }))}
          onClose={() => setFullscreen(null)}
        />
      )}
    </div>
  )
}

function extFromUrl(url) {
  try {
    const m = /\.(\w+)(?:\?|$)/.exec(new URL(url).pathname)
    return m ? m[1] : 'jpg'
  } catch { return 'jpg' }
}

function downloadPolaroidPhoto(url, filename) {
  fetch(url)
    .then((res) => res.blob())
    .then((blob) => {
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl; a.download = filename
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(blobUrl), 4000)
    })
    .catch(() => window.open(url, '_blank', 'noopener'))
}

// 사진(들)을 저장한다. iOS Safari 등에서는 <a download> 가 파일마다 "공유 시트 → 이미지 저장"을
// 반복해야 하는 문제가 있어서, Web Share API(navigator.share)로 여러 장을 한 번에 넘겨 시스템
// 공유 시트를 한 번만 띄우고 그 안에서 "이미지 N개 저장"으로 한 번에 갤러리에 저장되게 한다.
// Web Share 를 못 쓰는 환경(대부분의 데스크톱 브라우저)에서는 순차 다운로드로 폴백.
async function shareOrDownloadPhotos(items) {
  if (navigator.share) {
    try {
      const files = await Promise.all(items.map(async ({ url, filename }) => {
        const res = await fetch(url)
        const blob = await res.blob()
        return new File([blob], filename, { type: blob.type || 'image/jpeg' })
      }))
      if (!navigator.canShare || navigator.canShare({ files })) {
        await navigator.share({ files })
        return
      }
    } catch (err) {
      if (err?.name === 'AbortError') return
    }
  }
  items.forEach(({ url, filename }, i) => setTimeout(() => downloadPolaroidPhoto(url, filename), i * 300))
}

const DownloadIcon = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3v12" /><polyline points="7 10 12 15 17 10" /><path d="M4 19h16" />
  </svg>
)
const CloseIcon = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 5l14 14M19 5L5 19" />
  </svg>
)

// 인화된 사진을 원본 비율 그대로 전체화면으로 보여주는 뷰어(여백은 검게). 한 번 탭하면 우측 상단
// 저장/닫기 버튼이 나타나고(다시 탭하면 숨김), 좌우 스와이프로 사진 전환, 아래로 스와이프하면 닫힘.
function PolaroidFullscreen({ photos, index, showControls, onNav, onToggleControls, onClose }) {
  const [saveMenuOpen, setSaveMenuOpen] = useState(false)
  const photo = photos[index]

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const gesture = useSwipeGesture({
    onTap: () => { setSaveMenuOpen(false); onToggleControls() },
    onSwipeLeft: () => { setSaveMenuOpen(false); if (index < photos.length - 1) onNav(index + 1) },
    onSwipeRight: () => { setSaveMenuOpen(false); if (index > 0) onNav(index - 1) },
    onSwipeDown: () => { setSaveMenuOpen(false); onClose() },
  })

  function saveCurrent() {
    shareOrDownloadPhotos([{ url: photo.url, filename: `nolging-polaroid-${index + 1}.${extFromUrl(photo.url)}` }])
  }
  function saveAll() {
    shareOrDownloadPhotos(photos.map((p, i) => ({ url: p.url, filename: `nolging-polaroid-${i + 1}.${extFromUrl(p.url)}` })))
  }
  function onSaveClick() {
    if (photos.length > 1) setSaveMenuOpen((v) => !v)
    else saveCurrent()
  }

  return createPortal(
    <div className="pvfs-overlay" {...gesture}>
      <img src={photo.url} alt="" className="pvfs-img" draggable={false} />
      {showControls && (
        <div className="pvfs-controls" onPointerDown={(e) => e.stopPropagation()}>
          <div className="pvfs-save-wrap">
            <button type="button" className="pvfs-icon-btn" aria-label="저장" onClick={onSaveClick}><DownloadIcon /></button>
            {saveMenuOpen && (
              <div className="pvfs-save-menu">
                <button type="button" onClick={() => { saveCurrent(); setSaveMenuOpen(false) }}>이 사진만 저장</button>
                <button type="button" onClick={() => { saveAll(); setSaveMenuOpen(false) }}>전체 사진 저장</button>
              </div>
            )}
          </div>
          <button type="button" className="pvfs-icon-btn" aria-label="닫기" onClick={onClose}><CloseIcon /></button>
        </div>
      )}
    </div>,
    document.body,
  )
}

export default function Notes() {
  const { user } = useAuth()
  useStoreCatalog()
  const location = useLocation()
  const navigate = useNavigate()
  const { setRefreshHandler, refreshNoteUnread, player, bluray: blurayPlayer } = useOutletContext()
  const [tab, setTab] = useState(location.state?.tab === 'sent' ? 'sent' : 'received')
  const [received, setReceived] = useState([])
  const [sent, setSent] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(null) // 열려 있는 쪽지
  const [busy, setBusy] = useState(false)
  const [decosByGroup, setDecosByGroup] = useState({}) // { groupId: {userId:{head,face}} }
  const [membersByGroup, setMembersByGroup] = useState({}) // { groupId: {userId:{name,avatar}} } — 프로필 사진 최신화용
  const [noteItems, setNoteItems] = useState({})       // { noteId: [{item_id,item_name,qty,claimed}] }
  const [notePhotos, setNotePhotos] = useState({})     // { noteId: [{id,url,sort_order}] } — 폴라로이드(인화 전엔 빈 배열)
  const [polaroidView, setPolaroidView] = useState(null) // { noteId, index } — 폴라로이드 사진 뷰어 모달
  const [recvMore, setRecvMore] = useState(notesCache.recvMore) // 받은함에 더 과거 쪽지가 있는지
  const [sentMore, setSentMore] = useState(notesCache.sentMore) // 보낸함에 더 과거 쪽지가 있는지
  const [loadingMore, setLoadingMore] = useState(false)
  const recvCntRef = useRef(0)  // 현재 로드된 받은/보낸 개수(재조회 시 창 유지용)
  const sentCntRef = useRef(0)
  const [waterLeft, setWaterLeft] = useState(null)     // 열린 물풍선 쪽지의 남은 초
  const [waterPopped, setWaterPopped] = useState(false) // 열린 물풍선이 터졌는지
  const [poppedIds, setPoppedIds] = useState(() => new Set()) // 터진 걸 목격한 쪽지 id
  const [timeMachines, setTimeMachines] = useState(0)  // 보유한 타임머신 개수
  const [tmConfirm, setTmConfirm] = useState(false)    // 타임머신 사용 확인 모달
  const [tmBusy, setTmBusy] = useState(false)

  const decoCacheRef = useRef(notesCache.uid === user?.id ? notesCache.decos : {}) // 그룹 deco 캐시(모듈 캐시와 공유)
  // 그룹 deco 는 캐시에 없는 그룹만 조회(매 재조회마다 전체 그룹 재조회 방지)
  const ensureDecos = useCallback((rows) => {
    const gids = [...new Set(rows.map((n) => n.group_id).filter(Boolean))]
    const missing = gids.filter((id) => !decoCacheRef.current[id])
    if (!missing.length) return
    Promise.all(missing.map((id) => getGroupDecoMap(id).then((m) => [id, m]).catch(() => [id, {}])))
      .then((pairs) => {
        pairs.forEach(([id, m]) => { decoCacheRef.current[id] = m })
        setDecosByGroup({ ...decoCacheRef.current })
      }).catch(() => {})
  }, [])
  const memberCacheRef = useRef(notesCache.uid === user?.id ? notesCache.members : {}) // 그룹 멤버(현재 프로필 사진) 캐시
  // 쪽지에 스냅샷된 sender_avatar/recipient_avatar 는 전송 시점 사진이라, 프로필 사진을 바꾸면
  // 예전 쪽지에서 옛날 사진 그대로 보인다 — 그룹 멤버의 "현재" 아바타를 따로 조회해 덮어씌운다.
  const ensureMembers = useCallback((rows) => {
    const gids = [...new Set(rows.map((n) => n.group_id).filter(Boolean))]
    const missing = gids.filter((id) => !memberCacheRef.current[id])
    if (!missing.length) return
    Promise.all(missing.map((id) => getGroupMemberMap(id).then((m) => [id, m]).catch(() => [id, {}])))
      .then((pairs) => {
        pairs.forEach(([id, m]) => { memberCacheRef.current[id] = m })
        setMembersByGroup({ ...memberCacheRef.current })
      }).catch(() => {})
  }, [])
  // 선물 쪽지 동봉 아이템(상세)은 목록에서 미리 조회하지 않고, 쪽지 모달을 열 때
  // 해당 쪽지 것만 조회해 병합한다. (목록 재진입마다의 조회량을 줄이기 위함)
  const fetchNoteItems = useCallback(async (noteId) => {
    try {
      const ni = await listNoteItems([noteId])
      setNoteItems((prev) => { const m = { ...prev, ...ni }; notesCache.noteItems = m; return m })
    } catch { /* noop */ }
  }, [])
  // 폴라로이드 사진도 같은 방식: 쪽지 모달을 열 때만 조회. 인화(develop) 전엔 RLS 상
  // 빈 배열이 오고, 인화 직후 다시 호출해 실제 사진으로 갱신한다.
  const fetchNotePhotos = useCallback(async (noteId) => {
    try {
      const np = await listNotePhotos([noteId])
      setNotePhotos((prev) => { const m = { ...prev, ...np }; notesCache.notePhotos = m; return m })
    } catch { /* noop */ }
  }, [])

  // 최초/갱신 조회 — 항상 각 탭의 첫 페이지(PAGE)만. 더 과거는 스크롤 시 loadMore 로 이어붙인다.
  // (예전엔 '스크롤로 불러온 개수만큼 유지'했더니, 한 번 끝까지 내리면 이후 모든 재조회가 전량을
  //  다시 끌어와 페이지네이션이 무력화 → egress 급증. 그래서 항상 첫 페이지만 조회.)
  const fetchNotes = useCallback(async () => {
    if (!user?.id) return
    const [rr, ss] = await Promise.all([listReceivedNotes(user.id, PAGE, 0), listSentNotes(user.id, PAGE, 0)])
    const r = rr.rows, s = ss.rows
    setReceived(r); setSent(s); setRecvMore(rr.hasMore); setSentMore(ss.hasMore)
    recvCntRef.current = r.length; sentCntRef.current = s.length
    // 모듈 캐시 갱신(재진입 시 재조회 생략용). uid 가 바뀌면 deco 캐시 초기화.
    if (notesCache.uid !== user.id) { notesCache.uid = user.id; notesCache.decos = {}; decoCacheRef.current = notesCache.decos }
    notesCache.received = r; notesCache.sent = s; notesCache.recvMore = rr.hasMore; notesCache.sentMore = ss.hasMore; notesCache.at = Date.now()
    ensureDecos([...r, ...s])
    // 멤버(현재 아바타) 캐시는 목록을 실제로 새로 불러올 때마다 매번 초기화 — 프로필 사진을
    // 바꾼 직후 다시 들어와도(같은 uid 라 decos 캐시는 안 지워짐) 옛 사진이 남아있지 않게.
    memberCacheRef.current = {}; notesCache.members = {}
    ensureMembers([...r, ...s])
    // 동봉 아이템(선물 쪽지 상세)은 여기서 조회하지 않는다 → 쪽지 모달 열 때 fetchNoteItems 로 조회.
  }, [user?.id, ensureDecos, ensureMembers])

  // 더 과거 쪽지 조회(스크롤 하단 도달 시) — 현재 탭만 다음 페이지 append.
  const loadMore = useCallback(async (which) => {
    if (!user?.id || loadingMore) return
    if (which === 'received' ? !recvMore : !sentMore) return
    setLoadingMore(true)
    try {
      // 스크롤로 더 불러온 결과는 '이번 화면'에만 append. 모듈 캐시에는 반영하지 않는다
      // → 다시 들어오면 항상 첫 페이지(15개)부터 보이게(캐시가 '전량'을 붙들지 않도록).
      if (which === 'received') {
        const off = recvCntRef.current
        const res = await listReceivedNotes(user.id, PAGE, off)
        recvCntRef.current = off + res.rows.length // 서버 offset 전진(중복 제거와 무관)
        setReceived((prev) => { const seen = new Set(prev.map((x) => x.id)); return [...prev, ...res.rows.filter((x) => !seen.has(x.id))] })
        setRecvMore(res.hasMore)
        ensureDecos(res.rows); ensureMembers(res.rows)
      } else {
        const off = sentCntRef.current
        const res = await listSentNotes(user.id, PAGE, off)
        sentCntRef.current = off + res.rows.length
        setSent((prev) => { const seen = new Set(prev.map((x) => x.id)); return [...prev, ...res.rows.filter((x) => !seen.has(x.id))] })
        setSentMore(res.hasMore)
        ensureDecos(res.rows); ensureMembers(res.rows)
      }
    } finally { setLoadingMore(false) }
  }, [user?.id, loadingMore, recvMore, sentMore, ensureDecos, ensureMembers])
  // 액션(수령 등) 후 목록만 갱신
  async function load() {
    try { await fetchNotes() } catch (err) { setError(err.message) }
  }

  // 최초 로드 — 스피너가 무한히 돌지 않도록 15초 안전장치 포함.
  // 캐시가 있으면 즉시 표시해 빈 화면/스피너를 막되, 쪽지 페이지에 들어올 때마다 '항상'
  // 백그라운드로 재조회해 읽음 상태(카드/하단 탭 점)를 최신화한다. (예전엔 60초 TTL 이내면
  // 재조회를 건너뛰어, 모달로 읽은 뒤 다른 페이지 갔다 오면 점이 되살아나 보였다.)
  useEffect(() => {
    if (!user?.id) return
    let on = true
    const hasCache = notesCache.uid === user.id && notesCache.at > 0
    if (hasCache) {
      setReceived(notesCache.received); setSent(notesCache.sent); setNoteItems(notesCache.noteItems)
      setDecosByGroup({ ...notesCache.decos }); setMembersByGroup({ ...notesCache.members })
      setRecvMore(notesCache.recvMore); setSentMore(notesCache.sentMore)
      recvCntRef.current = notesCache.received.length; sentCntRef.current = notesCache.sent.length
      setError(''); setLoading(false)
    } else {
      setLoading(true)
    }
    const guard = setTimeout(() => {
      if (on && !hasCache) { setError((e) => e || '네트워크가 불안정해요. 아래 다시 시도를 눌러 주세요.'); setLoading(false) }
    }, 15000)
    fetchNotes()
      .then(() => { if (on) setError('') })
      .catch((err) => { if (on && !hasCache) setError(err.message || '쪽지를 불러오지 못했어요.') })
      .finally(() => { if (on) { clearTimeout(guard); setLoading(false) } })
    return () => { on = false; clearTimeout(guard) }
  }, [user?.id, fetchNotes])

  // 백그라운드에서 돌아오면(재개) 조용히 다시 불러오기 — stale/무한 로딩 방지.
  // visibilitychange·focus·pageshow 가 한꺼번에 발화해도 25초 내엔 1회만 실제 조회(중복 egress 방지).
  useEffect(() => {
    const onResume = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - notesCache.at < 25000) return
      fetchNotes().catch(() => {})
    }
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

  // 쪽지 쓰기 팝업 창에서 전송 완료 시 목록/안읽음 갱신
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    let bc
    try {
      bc = new BroadcastChannel(NOTE_CHANNEL)
      bc.onmessage = (e) => {
        if (e.data?.type !== 'note-sent') return
        fetchNotes().catch(() => {})
        refreshNoteUnread?.()
      }
    } catch { /* noop */ }
    return () => { try { bc?.close() } catch { /* noop */ } }
  }, [fetchNotes, refreshNoteUnread])

  // 물풍선 쪽지 모달: 처음 연 시각(opened_at) 기준으로 카운트다운 → 0 이 되면 터짐.
  // opened_at 은 서버에 최초 1회만 기록되고, 목록 데이터에 담겨 오므로 재열람/재접속에도 이어짐.
  useEffect(() => {
    setWaterLeft(null); setWaterPopped(false)
    if (!open || !isWater(open) || tab !== 'received') return
    let iv
    const total = open.timer_seconds

    const begin = (openedAtMs) => {
      const deadline = openedAtMs + total * 1000
      const tick = () => {
        const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
        setWaterLeft(left)
        if (left <= 0) {
          setWaterPopped(true)
          setPoppedIds((s) => new Set(s).add(open.id))
          if (iv) clearInterval(iv)
        }
      }
      tick()
      iv = setInterval(tick, 250)
    }

    if (open.opened_at) {
      // 이미 연 적 있음 → 그 시각 기준으로 이어서(또는 이미 폭발)
      begin(new Date(open.opened_at).getTime())
    } else {
      // 최초 열람 → 지금부터 시작. 서버에 opened_at 기록 + 목록 카드에도 반영.
      const now = Date.now()
      setReceived((prev) => prev.map((x) => (x.id === open.id && !x.opened_at ? { ...x, opened_at: new Date(now).toISOString() } : x)))
      openWaterNote(open.id).catch(() => {})
      begin(now)
    }
    return () => { if (iv) clearInterval(iv) }
  }, [open, tab])

  // 보유 타임머신 개수(터진 물풍선 되돌리기 버튼 노출용)
  const loadTimeMachines = useCallback(async () => {
    if (!user?.id) return
    try {
      const rows = await listInventory(user.id)
      setTimeMachines((rows || []).filter((r) => r.item_id === 'time-machine' && r.status === 'active').length)
    } catch { /* noop */ }
  }, [user?.id])
  useEffect(() => { loadTimeMachines() }, [loadTimeMachines])

  // 타임머신 사용: opened_at 을 지금으로 되돌려 타이머 재시작
  async function restoreWater() {
    if (!open) return
    setTmBusy(true); setError('')
    try {
      const newOpenedAt = await useTimeMachine(open.id)
      const iso = newOpenedAt ? new Date(newOpenedAt).toISOString() : new Date().toISOString()
      setReceived((prev) => prev.map((x) => (x.id === open.id ? { ...x, opened_at: iso } : x)))
      setPoppedIds((s) => { const n = new Set(s); n.delete(open.id); return n })
      setOpen((o) => (o ? { ...o, opened_at: iso } : o))
      setTimeMachines((c) => Math.max(0, c - 1))
      setTmConfirm(false)
    } catch (e) { setError(e.message) } finally { setTmBusy(false) }
  }

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
      await fetchNoteItems(n.id)
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
      await fetchNoteItems(n.id)
      setOpen((o) => (o && o.id === n.id ? { ...o, claimed: true } : o))
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  // 인화하기: 폴라로이드 쪽지 공개(사진은 그 뒤 fetchNotePhotos 로 다시 조회해야 실제로 보임) →
  // 성공하면 바로 뷰어를 여는데, 이번엔 animate:true 로 열어 실제 필름처럼 까맣던 사진이
  // 30초에 걸쳐 서서히 드러나는 연출을 태운다. 이 애니메이션은 "방금 인화한 이번 열람"
  // 에만 재생 — 이후 "사진 보기"로 다시 열면(claimed 는 이미 true) animate:false 라
  // 처음부터 다 드러난 채로 보인다.
  async function developPolaroid(n) {
    setBusy(true); setError('')
    try {
      await developPolaroidNote(n.id)
      await load()
      await fetchNotePhotos(n.id)
      setOpen((o) => (o && o.id === n.id ? { ...o, claimed: true, is_read: true } : o))
      setPolaroidView({ noteId: n.id, index: 0, animate: true })
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  // 이미 인화됐거나(수신자) 내가 보낸 쪽지(발신자)면 바로 뷰어를 연다(애니메이션 없이).
  function openPolaroidViewer(n) {
    fetchNotePhotos(n.id)
    setPolaroidView({ noteId: n.id, index: 0, animate: false })
  }

  // 깜냥 명의 보상 쪽지 삭제(아이템을 전부 수령한 뒤에만 가능)
  async function delSysGift(n) {
    if (busy) return
    setBusy(true); setError('')
    try {
      await deleteReportGiftNote(n.id)
      setOpen(null)
      await fetchNotes()
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

  // 스크롤 콜백은 항상 최신 loadMore/tab 을 참조(리스너 재부착 없이)
  const loadMoreRef = useRef(loadMore); loadMoreRef.current = loadMore
  const tabRef = useRef(tab); tabRef.current = tab
  // 본문 스크롤 감지 → 상단 탭 페이드 + 하단 근접 시 다음 페이지 조회
  useEffect(() => {
    const sc = paneRef.current
    if (!sc) return
    const onScroll = () => {
      setScrolled(sc.scrollTop > 4)
      // 실제로 아래로 스크롤(scrollTop>0)해서 하단 근처에 왔을 때만 추가 로드.
      // (마운트 직후 동기 호출 시엔 scrollTop=0 이라 자동 로드하지 않음 → 처음엔 15개만)
      if (sc.scrollTop > 0 && sc.scrollHeight - sc.scrollTop - sc.clientHeight < 240) loadMoreRef.current?.(tabRef.current)
    }
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
    // 상세(동봉 아이템)는 목록이 아니라 여기서, 열린 쪽지 것만 조회
    if (n.kind === 'gift') fetchNoteItems(n.id)
    // 폴라로이드: 보낸 사람은 언제나, 받는 사람은 인화(claimed)한 뒤에만 실제로 보임(RLS)
    if (n.kind === 'polaroid' && (n.sender_id === user?.id || n.claimed)) fetchNotePhotos(n.id)
    // 받은 쪽지를 열면 읽음 처리(카드 점 제거 + 하단 탭 점 갱신)
    if (tab === 'received' && !n.is_read) {
      setReceived((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)))
      // 모듈 캐시에도 읽음 반영 → 재진입 시 캐시 즉시표시 단계에서 점이 되살아나지 않게
      notesCache.received = notesCache.received.map((x) => (x.id === n.id ? { ...x, is_read: true } : x))
      markNoteRead(n.id).then(() => refreshNoteUnread?.()).catch(() => {})
    }
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

  // 내가 그 그룹을 탈퇴했는지: 탈퇴해도 소프트 삭제라 group_members 행은 남지만
  // getGroupMemberMap 은 left_at 이 없는(현재 멤버인) 행만 돌려주므로, 내 아이디가 없으면 탈퇴한 것.
  const iLeftGroup = (groupId) => { const m = membersByGroup[groupId]; return !!m && !m[user.id] }

  // 쪽지에 스냅샷된 아바타(전송 시점 사진) 대신, 그 그룹 멤버의 "현재" 아바타가 있으면 그걸 쓴다
  // (탈퇴 등으로 없으면 스냅샷으로 폴백). 단, 내가 그 그룹을 탈퇴했으면 상대가 사진을 바꿔도
  // 더 이상 반영하지 않고 스냅샷에 고정한다.
  const liveAvatar = (groupId, userId, fallback) =>
    (groupId && userId && !iLeftGroup(groupId) ? membersByGroup[groupId]?.[userId]?.avatar : undefined) ?? fallback

  // 받은 쪽지에 답장: 원래 보낸이를 To, 그 그룹의 내 정보를 From 으로 자동 채워 작성 화면 이동
  function replyTo(n) {
    openCompose(navigate, {
      reply: {
        recipient: { groupId: n.group_id, groupName: '', userId: n.sender_id, name: n.sender_name, avatar: liveAvatar(n.group_id, n.sender_id, n.sender_avatar) },
        me: { name: n.recipient_name, avatar: liveAvatar(n.group_id, n.recipient_id, n.recipient_avatar) },
      },
    })
  }

  // 오류 리포트 추가 문의(채팅)가 없던 상태에서 깜냥 명의로 지급된 보상 쪽지(kind=gift + report_id)
  const isSysGift = (n) => n.kind === 'gift' && !!n.report_id
  // 쪽지의 상대(카드/모달에 표시할 사람) 정보
  const peer = (n) => (n.kind === 'system' || isSysGift(n))
    ? { name: '깜냥', avatar: null, label: '님이 보냄', userId: null, groupId: null }
    : tab === 'received'
      ? { name: n.sender_name, avatar: liveAvatar(n.group_id, n.sender_id, n.sender_avatar), label: '님이 보냄', userId: n.sender_id, groupId: n.group_id }
      : { name: n.recipient_name, avatar: liveAvatar(n.group_id, n.recipient_id, n.recipient_avatar), label: n.anonymous ? '님에게 익명으로 보냄' : '님에게', userId: n.recipient_id, groupId: n.group_id }
  // 익명(지우개) 쪽지의 아바타는 받은 쪽지함에서 발신자를 '?'로 가림
  const anonAva = (n) => tab === 'received' && n.anonymous
  // 내가 탈퇴한 그룹이면 상대의 꾸미기도 더 이상 표시하지 않는다(스냅샷 고정과 동일한 기준).
  const peerDeco = (p) => (p.groupId && p.userId && !iLeftGroup(p.groupId) ? decosByGroup[p.groupId]?.[p.userId] : undefined)

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
            const sysGift = isSysGift(n) // 채팅 없이 깜냥 명의로 지급된 보상 쪽지
            const cassette = n.kind === 'cassette'
            const link = n.kind === 'link'
            const video = n.kind === 'video'
            const bluray = n.kind === 'bluray'
            const polaroid = n.kind === 'polaroid'
            const system = n.kind === 'system'   // 오류 리포트 SYSTEM 쪽지
            const sysResolved = system && !!n.report_resolved // 처리 완료된 리포트 채팅
            const cardTime = sysResolved && n.report_resolved_at ? n.report_resolved_at : n.created_at
            const sysHasReward = system && !!n.report_has_reward_item // 아이템 보상이 한 번이라도 지급된 리포트
            const sysRewardPending = system && !!n.report_reward_pending // 아직 안 받은 아이템 보상 있음
            // 우정 링을 받은 그룹을 이미 탈퇴한 경우 — 수령 불가(모달과 동일 조건)
            const friendUnavailable = friend && n.group_id && iLeftGroup(n.group_id)
            const needClaim = (couple || (friend && !friendUnavailable) || gift || polaroid) && tab === 'received' && !n.claimed && !n.rejected
            const hasFlag = needClaim || (couple && n.rejected)
            const popped = tab === 'received' && (waterExploded(n) || poppedIds.has(n.id))
            const waterBlue = popped || (tab === 'sent' && isWater(n)) // 옅은 파란색(보낸함 물풍선은 처음부터)
            const waterHide = tab === 'received' && isWater(n) // 받은함 물풍선은 미리보기 숨김
            // 타입 배지(라벨, 클래스) — 본문 줄 우측으로 이동
            const tagInfo = wish ? ['🌟 소원', 'note-tag']
              : couple ? [n.rejected ? '💍 거절' : '💍 커플 링', 'note-tag note-tag-couple']
                : friend ? ['🤝 우정 링', `note-tag note-tag-friend${friendUnavailable ? ' note-tag-disabled' : ''}`]
                  : gift ? ['📦 아이템', 'note-tag note-tag-gift']
                    : cassette ? ['🎶 이어폰', 'note-tag note-tag-cassette']
                      : link ? ['🎁 선물', 'note-tag note-tag-link']
                        : video ? ['📼 비디오', 'note-tag note-tag-video']
                          : bluray ? ['💿 블루레이', 'note-tag note-tag-video']
                            : polaroid ? ['📷 사진', 'note-tag note-tag-cassette']
                              : system ? ['🔧 SYSTEM', 'note-tag note-tag-system']
                                : null
            return (
              <li key={n.id}>
                <button type="button" className={`note-card ${wish ? 'note-wish' : ''} ${couple ? 'note-couple' : ''} ${friend ? 'note-friend' : ''} ${gift && !sysGift ? 'note-gift' : ''} ${system ? 'note-syscard' : ''} ${sysResolved || sysGift ? 'note-syscard-resolved' : ''} ${n.anonymous ? 'note-anon' : ''} ${waterBlue ? 'note-water-pop' : ''} ${hasFlag ? 'has-flag' : ''}`} onClick={() => onCardClick(n)}>
                  {(system || sysGift) ? <SystemAvatar size={40} /> : <Avatar src={anonAva(n) ? null : p.avatar} name={anonAva(n) ? '?' : p.name} size={40} deco={anonAva(n) ? undefined : peerDeco(p)} />}
                  <div className="note-card-main">
                    <div className="note-card-head">
                      <span className="note-card-peer">
                        {p.name}{' '}
                        {system
                          ? <span className={`${tagInfo[1]} note-tag-pill note-syscard-badge`}>{tagInfo[0]}</span>
                          : <span className="note-card-rel">{p.label}</span>}
                      </span>
                      <span className="note-card-when">
                        <span className="note-card-date">{formatNoteTime(cardTime)}</span>
                        {tab === 'received' && !n.is_read && <span className="note-card-unread-dot" aria-label="안 읽음" />}
                      </span>
                    </div>
                    <div className="note-card-bodyrow">
                      {waterHide ? (
                        popped ? (
                          <>
                            <p className="note-card-body note-water-blur">{n.body}</p>
                            <span className="note-water-card-label">물풍선 폭탄이 터졌어요</span>
                          </>
                        ) : (
                          <p className="note-card-body note-water-hidden">꽁꽁 싸매서 내용이 보이지 않아요</p>
                        )
                      ) : sysResolved ? (
                        <p className="note-card-body">처리 완료된 리포트입니다</p>
                      ) : (
                        <p className="note-card-body">{resolveItemText(n.body)}</p>
                      )}
                      {tagInfo && !system && (
                        <span className={`note-card-tag ${needClaim ? 'note-tag-bounce' : ''}`}>
                          <span className={`${tagInfo[1]} note-tag-pill ${needClaim ? 'note-tag-seesaw' : ''}`}>{tagInfo[0]}</span>
                        </span>
                      )}
                      {sysHasReward && (
                        <span className={`note-card-tag ${sysRewardPending ? 'note-tag-bounce' : ''}`}>
                          <span className={`note-tag note-tag-gift note-tag-pill ${sysRewardPending ? 'note-tag-seesaw' : ''}`}>📦 아이템</span>
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            )
          })}
          {(tab === 'received' ? recvMore : sentMore) && (
            <li className="note-more">
              {loadingMore
                ? <span className="spinner spinner-sm" />
                : <button type="button" className="note-more-btn" onClick={() => loadMore(tab)}>이전 쪽지 더 보기</button>}
            </li>
          )}
        </ul>
      )}
      </div>
      </div>

      <Modal open={!!open} onClose={() => setOpen(null)}
        below={open?.kind === 'video' && safeUrl(open.media_url) ? <VideoPlayer url={open.media_url} />
          : open?.kind === 'bluray' && safeUrl(open.media_url) ? <BluraySlot url={open.media_url} player={blurayPlayer} />
          : open?.kind === 'cassette' && safeUrl(open.media_url) ? <MusicPlayer url={open.media_url} player={player} title={`${open.sender_name || '익명'} 님의 음악 선물`} />
          : null}
        cardClassName={`${open?.kind === 'wish' ? 'modal-wish' : open?.kind === 'couple_ring' ? 'modal-couple' : open?.kind === 'friend_ring' ? 'modal-friend' : isSysGift(open || {}) ? '' : open?.kind === 'gift' ? 'modal-gift' : open?.kind === 'system' ? 'modal-syschat' : ''}${open?.anonymous ? ' modal-anon' : ''}${isWater(open) && (tab === 'sent' || waterPopped) ? ' modal-water-pop' : ''}`}>
        {open && open.kind === 'system' ? (
          <SystemChat note={open} onDeleted={() => { setOpen(null); fetchNotes().catch(() => {}) }} />
        ) : open && (() => {
          const p = peer(open)
          const wish = open.kind === 'wish'
          const couple = open.kind === 'couple_ring'
          const friend = open.kind === 'friend_ring'
          const gift = open.kind === 'gift'
          const sysGift = isSysGift(open) // 채팅 없이 깜냥 명의로 지급된 보상 쪽지
          const cassette = open.kind === 'cassette'
          const link = open.kind === 'link'
          const video = open.kind === 'video'
          const bluray = open.kind === 'bluray'
          const polaroid = open.kind === 'polaroid'
          const system = open.kind === 'system'
          const mine = open.recipient_id === user?.id
          const gItems = gift ? giftItemsOf(open) : []
          const allGiftClaimed = gItems.length === 0 || gItems.every((it) => it.claimed)
          const pItems = polaroid ? (notePhotos[open.id] || []) : []
          const tagInfo = wish ? ['🌟 소원', 'note-tag']
            : couple ? [open.rejected ? '💍 거절' : '💍 커플 링', 'note-tag note-tag-couple']
              : friend ? ['🤝 우정 링', 'note-tag note-tag-friend']
                : gift ? ['📦 아이템', 'note-tag note-tag-gift']
                  : cassette ? ['🎶 이어폰', 'note-tag note-tag-cassette']
                    : link ? ['🎁 선물', 'note-tag note-tag-link']
                      : video ? ['📼 비디오', 'note-tag note-tag-video']
                        : bluray ? ['💿 블루레이', 'note-tag note-tag-video']
                          : polaroid ? ['📷 폴라로이드', 'note-tag note-tag-cassette']
                            : system ? ['🔧 SYSTEM', 'note-tag note-tag-system']
                              : null
          return (
            <div className="note-view">
              <div className="note-view-head">
                {(system || sysGift) ? <SystemAvatar size={44} /> : <Avatar src={anonAva(open) ? null : p.avatar} name={anonAva(open) ? '?' : p.name} size={44} deco={anonAva(open) ? undefined : peerDeco(p)} />}
                <div className="note-view-who">
                  <span className="note-view-peer">
                    <span className="note-view-name">{p.name} <span className="note-card-rel">{p.label}</span></span>
                    {tagInfo && <span className={`${tagInfo[1]} note-view-tag`}>{tagInfo[0]}</span>}
                  </span>
                  <span className="note-view-date">{formatNoteFull(open.created_at)}</span>
                </div>
                {isWater(open) && tab === 'received' && (
                  <span className={`note-water-clock ${!waterPopped && waterLeft != null && waterLeft <= 5 ? 'is-blink' : ''}`}>
                    <ClockIcon />{mmss(waterLeft != null ? waterLeft : open.timer_seconds)}
                  </span>
                )}
                {sysGift && mine && allGiftClaimed && (
                  <button type="button" className="rc-trash" aria-label="쪽지 삭제" title="쪽지 삭제"
                    onClick={() => delSysGift(open)} disabled={busy}><TrashIcon /></button>
                )}
              </div>
              {isWater(open) && tab === 'received' ? (
                <div className="note-water-bodywrap">
                  <p className={`note-view-body ${waterPopped ? 'note-water-blur' : ''}`}>{resolveItemText(open.body)}</p>
                  {waterPopped && <span className="note-water-overlay">펑!</span>}
                </div>
              ) : sysGift ? (
                <div className="note-view-body">
                  <div className="rc-sysgift-title">{open.report_title}</div>
                  <p className="rc-sysgift-report">{open.body}</p>
                  <p className="rc-sysgift-done">처리 완료됐어요</p>
                </div>
              ) : (
                <p className="note-view-body">{resolveItemText(open.body)}</p>
              )}
              {isWater(open) && tab === 'received' && waterPopped && timeMachines > 0 && (
                <div className="note-tm-row">
                  <button type="button" className="note-tm-restore" onClick={() => setTmConfirm(true)}>
                    <UndoIcon /> 되돌리기
                  </button>
                </div>
              )}
              {link && safeUrl(open.media_url) && (
                <a className="note-giftbox" href={safeUrl(open.media_url)} target="_blank" rel="noreferrer noopener" aria-label="선물 열기">
                  <span className="note-giftbox-art" aria-hidden="true">
                    <span className="note-giftbox-glow" />
                    <span className="gb-spark gb-spark1">✦</span>
                    <span className="gb-spark gb-spark2">✦</span>
                    <span className="gb-spark gb-spark3">✧</span>
                    <span className="gb-spark gb-spark4">✦</span>
                    <span className="gb-spark gb-spark5">✧</span>
                    <span className="note-giftbox-emoji">🎁</span>
                  </span>
                  <svg className="note-giftbox-caret" width="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 15 12 9 18 15" /></svg>
                  <span className="note-giftbox-hint">눌러서 선물 열기</span>
                </a>
              )}
              {gift && (() => {
                if (!gItems.length) return null
                const anyUnclaimed = gItems.some((it) => !it.claimed)
                return (
                  <div className="note-gifts">
                    <div className="note-gifts-head">
                      <span className="note-gifts-label">{sysGift ? '오류 리포트 보상' : '동봉된 아이템'}</span>
                      {mine && gItems.length > 1 && anyUnclaimed && (
                        <button type="button" className="note-gift-all" onClick={() => claimAll(open)} disabled={busy}>일괄 수령</button>
                      )}
                    </div>
                    <ul className="note-gift-list">
                      {gItems.map((it) => (
                        <li key={it.item_id} className="note-gift-row">
                          <span className="note-gift-thumb" style={{ background: bgOf(it.item_id) }}>
                            <StoreItemImage id={it.item_id} emoji="🎁" className="note-gift-img" />
                          </span>
                          <span className="note-gift-name">{itemName(it.item_id, it.item_name)}{it.qty > 1 && <span className="note-gift-qty">×{it.qty}</span>}</span>
                          {mine && (it.claimed
                            ? <span className="note-gift-done">수령 완료</span>
                            : <button type="button" className="note-gift-claim" onClick={() => claimOne(open, it)} disabled={busy}>수령하기</button>)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })()}
              {sysGift && open.reward_coin > 0 && (
                <div className="note-gifts">
                  <div className="note-gifts-head"><span className="note-gifts-label">오류 리포트 보상</span></div>
                  <ul className="note-gift-list">
                    <li className="note-gift-row">
                      <span className="note-gift-thumb note-gift-coin-thumb">🐾</span>
                      <span className="note-gift-name">{open.reward_coin} 츄르 지급됐어요</span>
                    </li>
                  </ul>
                </div>
              )}
              {polaroid && (
                <div className="note-gifts note-polaroid">
                  <div className="note-gifts-head"><span className="note-gifts-label">첨부된 사진</span></div>
                  <ul className="note-gift-list">
                    <li className="note-gift-row">
                      <span className="note-gift-thumb" style={{ background: bgOf('polaroid-film') }}>
                        <StoreItemImage id="polaroid-film" emoji="📷" className="note-gift-img" />
                      </span>
                      <span className="note-gift-name">사진 {open.qty || pItems.length || 1}장{mine && !open.claimed ? '이 첨부됨' : ''}</span>
                      {mine && !open.claimed ? (
                        <button type="button" className="note-polaroid-develop" onClick={() => developPolaroid(open)} disabled={busy}>인화하기</button>
                      ) : (
                        <button type="button" className="note-polaroid-develop is-view" onClick={() => openPolaroidViewer(open)}>사진 보기</button>
                      )}
                    </li>
                  </ul>
                </div>
              )}
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
                ) : open.group_id && iLeftGroup(open.group_id) ? (
                  // 우정 링을 받은 그룹을 이미 탈퇴한 경우 — 해당 그룹에 더 이상 적용할 수 없음
                  <button type="button" className="btn btn-block" disabled>수령 불가</button>
                ) : (
                  <button type="button" className="btn btn-primary btn-block" onClick={() => acceptFriend(open)} disabled={busy}>
                    {busy ? '수령 중…' : '수령하기'}
                  </button>
                )
              ) : gift ? (
                sysGift
                  ? null // 깜냥 명의 보상 쪽지는 답장 불가(삭제는 상단 휴지통 버튼으로)
                  : mine && !open.anonymous && open.sender_active !== false
                    ? <button type="button" className="btn btn-primary btn-block" onClick={() => replyTo(open)}>답장하기</button>
                    : null
              ) : !wish && !couple && !friend && !gift && !system && mine && !open.anonymous && open.sender_active !== false ? (
                <button type="button" className="btn btn-primary btn-block" onClick={() => replyTo(open)}>답장하기</button>
              ) : null}
            </div>
          )
        })()}
      </Modal>

      {/* 폴라로이드 사진 뷰어: 필름 프레임 안에 사진, 여러 장이면 </> 로 넘김.
          인화 직후(animate:true)엔 카메라 연출 → 인화(줌인) → 30초 리빌, 이미 인화된 걸 다시 보면 즉시 표시. */}
      <Modal open={!!polaroidView} onClose={() => setPolaroidView(null)} cardClassName="modal-polaroid-viewer">
        {polaroidView && (
          <PolaroidPhotoViewer
            polaroidView={polaroidView}
            notePhotos={notePhotos}
            onNav={(nextIdx) => setPolaroidView((v) => ({ ...v, index: nextIdx }))}
          />
        )}
      </Modal>

      <Modal open={tmConfirm} onClose={() => setTmConfirm(false)} cardClassName="tm-modal">
        <div className="tm-confirm">
          <span className="tm-stage">
            <span className="tm-pulse" />
            <span className="tm-spark s1" /><span className="tm-spark s2" /><span className="tm-spark s3" /><span className="tm-spark s4" /><span className="tm-spark s5" />
            <span className="tm-art"><TimeMachineArt /></span>
          </span>
          <div className="tm-title">타임머신을 사용해 시간을 되돌릴까요?</div>
          <div className="tm-sub">물풍선 폭탄이 터지기 전으로 돌아가요</div>
          {error && <div className="alert alert-error" style={{ marginTop: 8 }}>{error}</div>}
          <div className="tm-actions">
            <button type="button" className="tm-cancel" onClick={() => setTmConfirm(false)} disabled={tmBusy}>취소</button>
            <button type="button" className="tm-ok" onClick={restoreWater} disabled={tmBusy}>{tmBusy ? '되돌리는 중…' : '확인'}</button>
          </div>
        </div>
      </Modal>

      <button type="button" onClick={() => openCompose(navigate, null)} className="fab fab-above-nav" aria-label="쪽지 쓰기" title="쪽지 쓰기">
        <NoteFabIcon />
      </button>
    </div>
  )
}
