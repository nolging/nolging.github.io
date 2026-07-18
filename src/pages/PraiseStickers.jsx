import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, useOutletContext } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/Modal'
import { Sticker, fruitBg } from '../components/StickerFruit'
import { praiseGet, praisePlace, praiseEdit, praiseClaim, praiseBoardGet } from '../lib/api'

// 소원권 티켓(자체 반짝이 제거 버전) — 수령 오버레이 전용. viewBox 를 티켓에 딱 맞춰 크게 보이게.
function WishTicket() {
  return (
    <svg className="praise-claim-img" viewBox="10 30 108 68" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="ptGold" x1="18" y1="40" x2="110" y2="92" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FCE59A" /><stop offset="0.5" stopColor="#F1C64B" /><stop offset="1" stopColor="#D2A11D" />
        </linearGradient>
        <mask id="ptEdge" maskUnits="userSpaceOnUse" x="0" y="0" width="128" height="128">
          <rect x="14" y="36" width="100" height="58" fill="#fff" />
          {[47, 53, 59, 65, 71, 77, 83].map((cy) => (
            <g key={cy}><circle cx="18" cy={cy} r="3" fill="#000" /><circle cx="110" cy={cy} r="3" fill="#000" /></g>
          ))}
        </mask>
      </defs>
      <g transform="rotate(-5 64 64)">
        <g mask="url(#ptEdge)"><rect x="18" y="40" width="92" height="50" rx="7" fill="url(#ptGold)" /></g>
        <rect x="26" y="47" width="76" height="36" rx="4" fill="none" stroke="#9C6E16" strokeWidth="1.6" />
        <rect x="28.5" y="49.5" width="71" height="31" rx="3" fill="none" stroke="#B4881F" strokeWidth="0.8" strokeOpacity="0.7" />
        <circle cx="31" cy="52" r="1.5" fill="#9C6E16" /><circle cx="97" cy="52" r="1.5" fill="#9C6E16" />
        <circle cx="31" cy="78" r="1.5" fill="#9C6E16" /><circle cx="97" cy="78" r="1.5" fill="#9C6E16" />
        <text x="64" y="62" textAnchor="middle" fontFamily="Georgia, 'Times New Roman', serif" fontSize="11" fontWeight="700" letterSpacing="3" fill="#7A5410">WISH</text>
        <text x="64" y="76" textAnchor="middle" fontFamily="Georgia, 'Times New Roman', serif" fontSize="11" fontWeight="700" letterSpacing="1.5" fill="#7A5410">TICKET</text>
        <polygon transform="translate(35 65) scale(0.5)" points="0,-8 1.88,-2.59 7.61,-2.47 3.04,0.99 4.7,6.47 0,3.2 -4.7,6.47 -3.04,0.99 -7.61,-2.47 -1.88,-2.59" fill="#8A6410" />
        <polygon transform="translate(93 65) scale(0.5)" points="0,-8 1.88,-2.59 7.61,-2.47 3.04,0.99 4.7,6.47 0,3.2 -4.7,6.47 -3.04,0.99 -7.61,-2.47 -1.88,-2.59" fill="#8A6410" />
        <polygon points="52,46 66,46 44,84 30,84" fill="#FFFFFF" fillOpacity="0.16" />
      </g>
    </svg>
  )
}

// ── 판 구성(시안 좌표 그대로, 박스 대비 %로 변환해 반응형) ──────────────
const VAR = {
  grape: {
    boxW: 372, boxH: 500,
    // [cx, cy, diameter]
    pos: [[208, 448, 94], [224, 387, 92], [136, 407, 91], [86, 345, 82], [159, 343, 85], [277, 346, 90], [216, 299, 89], [135, 276, 88], [58, 269, 88], [49, 181, 92], [114, 196, 103], [207, 223, 95], [243, 158, 94], [291, 256, 102], [314, 195, 97], [298, 112, 92], [165, 134, 105], [69, 104, 96], [139, 61, 88], [227, 72, 89]],
    accent: '#7363e8', slash: '#b6afce', track: '#e7e4f0', bar: 'linear-gradient(90deg,#7363e8,#9a86f5)',
    pageBg: 'linear-gradient(180deg,#f2efff 0%,#fdfcfe 60%)', topColor: '#f2efff', tabBg: '#eceaf3',
    fullBg: '#f0ecff', fullColor: '#7363e8', fullText: '한 송이 가득 채웠어요 🎉',
  },
  apple: {
    boxW: 362, boxH: 472,
    pos: [[62, 218, 46], [125, 194, 42], [188, 206, 50], [243, 240, 44], [304, 241, 48], [316, 298, 40], [267, 329, 46], [218, 296, 50], [162, 263, 42], [99, 271, 48], [38, 279, 44], [88, 327, 46], [160, 331, 40], [178, 88, 50], [126, 130, 44], [192, 148, 42], [300, 159, 48], [251, 182, 44], [68, 158, 46], [248, 120, 42]],
    accent: '#4f9e2f', slash: '#a9c39f', track: '#dcebd6', bar: 'linear-gradient(90deg,#5aa64a,#88c96a)',
    pageBg: 'linear-gradient(180deg,#ecf6ea 0%,#fdfcfe 62%)', topColor: '#ecf6ea', tabBg: '#e6efe4',
    fullBg: '#eaf6e4', fullColor: '#4f9e2f', fullText: '나무를 가득 채웠어요 🎉',
  },
}
const pct = (v, t) => `${(v / t * 100).toFixed(2)}%`
const fmtDateTime = (iso) => { try { const d = new Date(iso); const p = (n) => String(n).padStart(2, '0'); return `${d.getMonth() + 1} 월 ${d.getDate()} 일 ${p(d.getHours())}:${p(d.getMinutes())}` } catch { return '' } }
const fmtYmd = (iso) => { try { const d = new Date(iso); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}` } catch { return '' } }
const ordinalOf = (stickers, id) => [...stickers].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).findIndex((s) => s.id === id) + 1

export default function PraiseStickers() {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const { setHeaderBg, setHeaderMenu } = useOutletContext()
  const { user, isAdmin } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tabOwner, setTabOwner] = useState(null)
  const [modal, setModal] = useState(null) // { ownerId, slot, mode:'write'|'edit'|'view', text, sticker }
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState(false)
  const [claimBusy, setClaimBusy] = useState(false)
  const [histSel, setHistSel] = useState(null)   // 선택된 과거 board_id
  const [histData, setHistData] = useState(null) // 과거 판 조회 결과
  const taRef = useRef(null)
  const primeRef = useRef(null)

  // 탭 제스처 안에서 임시 input 을 포커스해 키보드를 미리 띄운다(iOS 대응).
  function primeKeyboard() {
    const inp = document.createElement('input')
    inp.type = 'text'
    inp.setAttribute('aria-hidden', 'true')
    inp.style.cssText = 'position:fixed;bottom:0;left:0;width:1px;height:1px;opacity:0;border:0;padding:0;font-size:16px;z-index:-1;'
    document.body.appendChild(inp)
    inp.focus()
    primeRef.current = inp
  }

  const load = useCallback(async () => {
    try {
      const d = await praiseGet(groupId)
      if (!d) { setError('칭찬 스티커 기능이 아직 설정되지 않았어요.'); return }
      setData(d)
      setTabOwner((cur) => {
        if (cur) return cur
        const partner = (d.members || []).find((m) => m.user_id !== d.viewer)
        return partner?.user_id || d.viewer
      })
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [groupId])
  useEffect(() => { load() }, [load])

  // 과거 판 조회
  useEffect(() => {
    if (!histSel) { setHistData(null); return }
    let on = true
    praiseBoardGet(histSel).then((d) => { if (on) setHistData(d) }).catch((e) => { if (on) setError(e.message) })
    return () => { on = false }
  }, [histSel])

  // 칭찬 입력/수정 모달이 열리면 입력창 자동 포커스(키보드 유지)
  useEffect(() => {
    if (modal && modal.mode !== 'view') {
      const t = setTimeout(() => {
        taRef.current?.focus()
        if (primeRef.current) { primeRef.current.remove(); primeRef.current = null }
      }, 80)
      return () => clearTimeout(t)
    }
  }, [modal?.slot, modal?.mode])

  // ── 렌더에 쓰일 파생값(훅 순서 유지 위해 early-return 이전에 계산) ──
  const viewer = data?.viewer
  const members = data?.members || []
  const me = members.find((m) => m.user_id === viewer)
  const partner = members.find((m) => m.user_id !== viewer)
  const owner = members.find((m) => m.user_id === tabOwner) || partner
  const isMine = owner?.user_id === viewer
  const ownerBoard = owner?.board || null
  const history = owner?.history || []
  const viewingHist = !!histSel && !!histData && histData.board_id === histSel
  const board = viewingHist ? histData : ownerBoard
  const variant = board?.variant || null
  const cfg = VAR[variant] || VAR.grape
  const fillBg = fruitBg(variant, board?.color)

  // 상단바 그라데이션 색을 현재 표시 중인 판 색으로 연장
  const hdrTop = (VAR[variant] || VAR.grape).topColor
  useEffect(() => { setHeaderBg(hdrTop); return () => setHeaderBg(null) }, [hdrTop, setHeaderBg])

  // 상단바 우측 삼선 메뉴: 이 탭 소유자의 완성한 판(히스토리)
  const histKey = history.map((h) => h.board_id).join(',')
  useEffect(() => {
    if (!setHeaderMenu) return
    if (!history.length) { setHeaderMenu(null); return }
    setHeaderMenu({
      items: history.map((h) => ({ id: h.board_id, label: `${fmtYmd(h.started_at)} - ${fmtYmd(h.completed_at)}` })),
      selectedId: histSel,
      onSelect: (id) => setHistSel((cur) => (cur === id ? null : id)),
    })
  }, [histKey, histSel, tabOwner, setHeaderMenu]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => setHeaderMenu?.(null), [setHeaderMenu])

  if (!isAdmin) return <div className="page"><div className="empty">준비 중인 기능이에요 🐾</div></div>
  if (loading) return <div className="page"><div className="spinner" /></div>
  if (error && !data) return <div className="page"><div className="alert alert-error">{error}</div></div>

  const canAdd = !isMine && !viewingHist && !!ownerBoard && !ownerBoard.completed_at
  const completed = !!ownerBoard?.completed_at
  const claimed = !!ownerBoard?.claimed_at
  const claimable = isMine && completed && !claimed && !viewingHist
  const histLoading = !!histSel && !viewingHist

  const stickers = viewingHist ? (histData.stickers || []) : (data.stickers || []).filter((s) => s.owner_id === owner?.user_id)
  const slots = Array(20).fill(null)
  stickers.forEach((s) => { if (s.slot >= 0 && s.slot < 20) slots[s.slot] = s })
  const count = slots.filter(Boolean).length
  const full = count >= 20

  function showToast(msg) { setToast(msg); clearTimeout(showToast._t); showToast._t = setTimeout(() => setToast(''), 1900) }

  function selectTab(uid) { setTabOwner(uid); setHistSel(null); setHistData(null) }

  function slotClick(slot) {
    const s = slots[slot]
    if (s) {
      if (canAdd) { primeKeyboard(); setModal({ ownerId: owner.user_id, slot, mode: 'edit', text: s.reason, sticker: s }) }
      else setModal({ ownerId: owner.user_id, slot, mode: 'view', sticker: s })
    } else if (canAdd) {
      primeKeyboard()
      setModal({ ownerId: owner.user_id, slot, mode: 'write', text: '' })
    } else if (isMine && !viewingHist) {
      showToast('내 칭찬 스티커는 스스로 붙일 수 없어요')
    }
  }

  async function submit() {
    const text = (modal.text || '').trim()
    if (!text) return
    setBusy(true); setError('')
    try {
      if (modal.mode === 'write') await praisePlace(groupId, modal.ownerId, modal.slot, text)
      else await praiseEdit(modal.sticker.id, text)
      setModal(null); await load()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  async function claim() {
    if (!ownerBoard?.board_id) return
    setClaimBusy(true); setError('')
    try { await praiseClaim(ownerBoard.board_id); await load(); showToast('소원권을 받았어요 🎫') }
    catch (err) { setError(err.message) } finally { setClaimBusy(false) }
  }

  // z-index: 포도는 송이 중심에 가까울수록 앞으로, 사과는 잎 캐노피 위에
  let zOf
  if (variant === 'grape') {
    const cxm = cfg.pos.reduce((a, p) => a + p[0], 0) / cfg.pos.length
    const cym = cfg.pos.reduce((a, p) => a + p[1], 0) / cfg.pos.length
    const order = cfg.pos.map((p, i) => ({ i, d: Math.hypot(p[0] - cxm, p[1] - cym) })).sort((a, b) => b.d - a.d)
    const z = {}; order.forEach((o, r) => { z[o.i] = r }); zOf = (i) => z[i]
  } else {
    zOf = (i, filled) => (filled ? 5 : 3)
  }

  const D = (v) => pct(v, cfg.boxW) // x/size 는 boxW 기준
  const T = (v) => pct(v, cfg.boxH) // y 는 boxH 기준

  return (
    <div className="praise-page" style={{ background: cfg.pageBg }}>
      {error && <div className="alert alert-error">{error}</div>}

      {/* 탭: 왼쪽=상대, 오른쪽=나 */}
      <div className="praise-tabs" style={{ background: cfg.tabBg }}>
        {[partner, me].filter(Boolean).map((mem) => {
          const on = owner?.user_id === mem.user_id
          return (
            <button key={mem.user_id} type="button"
              className={`praise-tab ${on ? 'on' : ''}`}
              onClick={() => selectTab(mem.user_id)}>{mem.name}</button>
          )
        })}
      </div>

      {/* 제목 + 카운트 */}
      <div className="praise-head">
        <div>
          <div className="praise-title">{owner?.name || '짝꿍'} 님의 칭찬 스티커</div>
          <div className="praise-hint">{
            viewingHist ? `${fmtYmd(board.started_at)} - ${fmtYmd(board.completed_at)}`
              : isMine ? '스티커를 다 모아서 소원을 말해 봐요'
                : completed ? '스티커를 다 모았으니 소원권을 전달할게요'
                  : '스티커를 다 모으면 내가 소원을 들어줘요'
          }</div>
        </div>
        <div className="praise-head-right">
          {variant && <div className="praise-count"><span style={{ color: cfg.accent }}>{count}</span><span style={{ color: cfg.slash }}> / 20</span></div>}
          {viewingHist && (
            <button type="button" className="praise-back-btn" aria-label="현재 판으로 돌아가기" onClick={() => selectTab(owner.user_id)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7" /><polyline points="3 3 3 8 8 8" /></svg>
            </button>
          )}
        </div>
      </div>
      {variant && <div className="praise-track" style={{ background: cfg.track }}><div style={{ height: '100%', borderRadius: 999, background: cfg.bar, transition: 'width .45s ease', width: pct(count, 20) }} /></div>}

      {/* 판 */}
      {histLoading ? (
        <div className="praise-boardwrap"><div className="spinner" /></div>
      ) : !variant ? (
        <div className="praise-empty-board">
          <div className="praise-empty-msg">아직 스티커판이 없어요</div>
          <button type="button" className="praise-empty-link" onClick={() => navigate('/store', { state: { premium: true } })}>
            {isMine ? '구매하러 가기' : '선물하러 가기'} <span aria-hidden="true">›</span>
          </button>
        </div>
      ) : (
        <div className={`praise-boardwrap ${variant === 'apple' ? 'is-apple' : 'is-grape'}`}>
          <div className={`praise-boardbox ${claimable ? 'is-blurred' : ''}`} style={{ aspectRatio: `${cfg.boxW} / ${cfg.boxH}`, maxWidth: 460 }}>
            {/* 데코 */}
            {variant === 'grape' ? (
              <>
                <svg viewBox="0 0 30 48" style={{ position: 'absolute', top: T(-16), left: D(163), width: D(38), height: T(60), zIndex: 2 }}><path d="M22 3 C 15 16, 15 32, 19 45" fill="none" stroke="#7d4f28" strokeWidth="6" strokeLinecap="round" /></svg>
                <div style={{ position: 'absolute', top: T(-14), left: '53%', width: D(73), height: T(64), background: 'linear-gradient(135deg,#7cc06a,#5a9e48)', borderRadius: '0 75% 10% 75%', transform: 'rotate(-16deg)', zIndex: 3 }} />
              </>
            ) : (
              <>
                <div style={{ position: 'absolute', bottom: T(-81), left: '50%', transform: 'translateX(-50%)', width: D(500), height: T(130), background: 'radial-gradient(50% 100% at 50% 0,#a7d98a,#84c268)', borderRadius: '50%' }} />
                <div style={{ position: 'absolute', bottom: T(22), left: '50%', transform: 'translateX(-50%)', width: D(78), height: T(138), background: '#7d4f28', clipPath: 'polygon(19% 0,81% 0,100% 100%,0 100%)' }} />
                <div style={{ position: 'absolute', left: D(-1), top: T(196), width: D(172), height: T(172), borderRadius: '50%', background: '#6FB45A' }} />
                <div style={{ position: 'absolute', left: D(187), top: T(194), width: D(172), height: T(172), borderRadius: '50%', background: '#6FB45A' }} />
                <div style={{ position: 'absolute', left: D(94), top: T(38), width: D(160), height: T(154), borderRadius: '50%', background: '#96D181' }} />
                <div style={{ position: 'absolute', left: D(181), top: T(90), width: D(160), height: T(154), borderRadius: '50%', background: '#86c96e', zIndex: 1 }} />
                <div style={{ position: 'absolute', left: D(15), top: T(107), width: D(160), height: T(154), borderRadius: '50%', background: '#86c96e', zIndex: 1 }} />
                <div style={{ position: 'absolute', left: D(74), top: T(217), width: D(214), height: T(160), borderRadius: '50%', background: '#79BD63' }} />
                <div style={{ position: 'absolute', left: D(74), top: T(134), width: D(214), height: T(170), borderRadius: '50%', background: '#8ccb73', zIndex: 2 }} />
              </>
            )}
            {/* 칸 */}
            {cfg.pos.map(([cx, cy, d], i) => {
              const s = slots[i]
              const filled = !!s
              const clickable = filled || canAdd
              return (
                <div key={i} onClick={() => slotClick(i)}
                  style={{ position: 'absolute', left: D(cx - d / 2), top: T(cy - d / 2), width: D(d), aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: clickable ? 'pointer' : 'default', zIndex: 6 + zOf(i, filled) }}>
                  {filled ? <Sticker variant={variant} bg={fillBg} /> : (
                    variant === 'grape' ? (
                      <div style={{ width: '100%', height: '100%', borderRadius: '50%', boxSizing: 'border-box', border: `2px dashed ${canAdd ? 'rgba(115,99,232,.42)' : 'rgba(90,80,130,.2)'}`, background: canAdd ? 'rgba(115,99,232,.06)' : 'rgba(120,110,150,.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {canAdd && <span style={{ color: 'rgba(115,99,232,.5)', fontSize: '1.4em', lineHeight: 1 }}>+</span>}
                      </div>
                    ) : (
                      <div style={{ position: 'relative', width: '100%', height: '100%' }}><div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: '90%', borderRadius: '46% 46% 50% 50%', boxSizing: 'border-box', border: `2px dashed ${canAdd ? 'rgba(79,158,47,.6)' : 'rgba(90,110,80,.25)'}`, background: canAdd ? 'rgba(79,158,47,.07)' : 'rgba(110,130,90,.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{canAdd && <span style={{ color: 'rgba(79,158,47,.62)', fontSize: '1.3em', lineHeight: 1 }}>+</span>}</div></div>
                    )
                  )}
                </div>
              )
            })}
          </div>

          {/* 소원권 수령 오버레이 */}
          {claimable && (
            <button type="button" className="praise-claim" onClick={claim} disabled={claimBusy}>
              <span className="praise-claim-stage">
                <span className="praise-claim-pulse" />
                <span className="praise-claim-spark s1" />
                <span className="praise-claim-spark s2" />
                <span className="praise-claim-spark s3" />
                <span className="praise-claim-spark s4" />
                <span className="praise-claim-spark s5" />
                <span className="praise-claim-ticket"><WishTicket /></span>
              </span>
              <svg className="praise-claim-chev" width="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 15 12 9 18 15" /></svg>
              <span className="praise-claim-label">{claimBusy ? '수령 중…' : '소원권 수령하기'}</span>
            </button>
          )}
        </div>
      )}

      {toast && <div className="praise-toast">{toast}</div>}

      <Modal open={!!modal} onClose={() => setModal(null)} cardClassName="praise-modal-card">
        {modal && (() => {
          const mini = <div className="praise-modal-fruit"><Sticker variant={variant} bg={fillBg} /></div>
          if (modal.mode === 'view') {
            const s = modal.sticker
            return (
              <div className="praise-modal">
                <div className="praise-modal-fruit lg"><Sticker variant={variant} bg={fillBg} /></div>
                <div className="praise-modal-meta">{s ? `${ordinalOf(stickers, s.id)} 번째 칭찬 ${variant === 'apple' ? '사과' : '포도알'} · ${fmtDateTime(s.created_at)}` : ''}</div>
                <div className="praise-modal-reason">{s?.reason}</div>
              </div>
            )
          }
          // write / edit
          const text = modal.text || ''
          const fruitName = variant === 'apple' ? '사과' : '포도알'
          const ordinal = modal.mode === 'edit' ? ordinalOf(stickers, modal.sticker.id) : count + 1
          return (
            <div className="praise-modal">
              {mini}
              <div className="praise-modal-ttl">{modal.mode === 'edit' ? '칭찬 내용 수정' : '칭찬해요'}</div>
              <div className="praise-modal-sub">{ordinal} 번째 칭찬 {fruitName}{modal.mode === 'edit' ? ` · ${fmtDateTime(modal.sticker.created_at)}` : ''}</div>
              <div className="praise-modal-tawrap">
                <textarea ref={taRef} className="praise-modal-ta" value={text} maxLength={100}
                  onChange={(e) => setModal((m) => ({ ...m, text: e.target.value.slice(0, 100) }))}
                  placeholder="칭찬의 한마디를 남겨 주세요" />
                <span className="praise-modal-len">{text.length}/100</span>
              </div>
              <button type="button" className="praise-modal-pill" style={{ opacity: text.trim() && !busy ? 1 : .5 }}
                disabled={!text.trim() || busy} onClick={submit}>{modal.mode === 'edit' ? '저장' : '붙이기'}</button>
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}
