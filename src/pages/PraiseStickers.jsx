import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate, useOutletContext } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/Modal'
import { Sticker, fruitBg } from '../components/StickerFruit'
import { praiseGet, praisePlace, praiseEdit } from '../lib/api'

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
const fmtDate = (iso) => { try { const d = new Date(iso); return `${d.getMonth() + 1}월 ${d.getDate()}일` } catch { return '' } }

export default function PraiseStickers() {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const { setHeaderBg } = useOutletContext()
  const { user, isAdmin } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tabOwner, setTabOwner] = useState(null)
  const [modal, setModal] = useState(null) // { ownerId, slot, mode:'write'|'edit'|'view', text, sticker }
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState(false)

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

  // 현재 탭 소유자의 판 색으로 상단바까지 그라데이션 연장(상단바엔 그라데이션 최상단 색)
  const hdrOwner = data ? (data.members.find((m) => m.user_id === tabOwner) || data.members.find((m) => m.user_id !== data.viewer)) : null
  const hdrTop = (VAR[hdrOwner?.variant] || VAR.grape).topColor
  useEffect(() => { setHeaderBg(hdrTop); return () => setHeaderBg(null) }, [hdrTop, setHeaderBg])

  if (!isAdmin) return <div className="page"><div className="empty">준비 중인 기능이에요 🐾</div></div>
  if (loading) return <div className="page"><div className="spinner" /></div>
  if (error) return <div className="page"><div className="alert alert-error">{error}</div></div>

  const viewer = data.viewer
  const members = data.members || []
  const me = members.find((m) => m.user_id === viewer)
  const partner = members.find((m) => m.user_id !== viewer)
  const owner = members.find((m) => m.user_id === tabOwner) || partner
  const isMine = owner?.user_id === viewer
  const canAdd = !isMine
  const variant = owner?.variant || null
  const cfg = VAR[variant] || VAR.grape
  const fillBg = fruitBg(variant, owner?.color)

  const stickers = data.stickers.filter((s) => s.owner_id === owner?.user_id)
  const slots = Array(20).fill(null)
  stickers.forEach((s) => { if (s.slot >= 0 && s.slot < 20) slots[s.slot] = s })
  const count = slots.filter(Boolean).length
  const full = count >= 20

  function showToast(msg) { setToast(msg); clearTimeout(showToast._t); showToast._t = setTimeout(() => setToast(''), 1900) }

  function slotClick(slot) {
    const s = slots[slot]
    if (s) {
      if (canAdd) setModal({ ownerId: owner.user_id, slot, mode: 'edit', text: s.reason, sticker: s })
      else setModal({ ownerId: owner.user_id, slot, mode: 'view', sticker: s })
    } else if (canAdd) {
      setModal({ ownerId: owner.user_id, slot, mode: 'write', text: '' })
    } else {
      showToast('내 칭찬판엔 짝꿍만 붙일 수 있어요 🫶')
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

  // z-index: 포도는 아래→위(뒤 알이 먼저), 사과는 잎 캐노피 위에
  let zOf
  if (variant === 'grape') {
    const order = cfg.pos.map((p, i) => ({ i, s: (186 - Math.abs(p[0] - 186)) - p[1] * 4 })).sort((a, b) => a.s - b.s)
    const z = {}; order.forEach((o, r) => { z[o.i] = 3 + r }); zOf = (i, filled) => z[i]
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
              onClick={() => setTabOwner(mem.user_id)}>{mem.name}</button>
          )
        })}
      </div>

      {/* 제목 + 카운트 */}
      <div className="praise-head">
        <div>
          <div className="praise-title">{owner?.name || '짝꿍'} 님의 칭찬 스티커</div>
          <div className="praise-hint">{canAdd ? '스티커를 다 모으면 내가 소원을 들어줘요' : '스티커를 다 모아서 소원을 말해 봐요'}</div>
          {full && <div className="praise-fullbadge" style={{ background: cfg.fullBg, color: cfg.fullColor }}>{cfg.fullText}</div>}
        </div>
        <div className="praise-count"><span style={{ color: cfg.accent }}>{count}</span><span style={{ color: cfg.slash }}> / 20</span></div>
      </div>
      <div className="praise-track" style={{ background: cfg.track }}><div style={{ height: '100%', borderRadius: 999, background: cfg.bar, transition: 'width .45s ease', width: pct(count, 20) }} /></div>

      {/* 판 */}
      {!variant ? (
        <div className="praise-empty-board">
          <div className="praise-empty-msg">아직 스티커판이 없어요</div>
          <button type="button" className="praise-empty-link" onClick={() => navigate('/store', { state: { premium: true } })}>
            {isMine ? '구매하러 가기' : '선물하러 가기'} <span aria-hidden="true">›</span>
          </button>
        </div>
      ) : (
        <div className={`praise-boardwrap ${variant === 'apple' ? 'is-apple' : 'is-grape'}`}>
          <div className="praise-boardbox" style={{ aspectRatio: `${cfg.boxW} / ${cfg.boxH}`, maxWidth: 460 }}>
            {/* 데코 */}
            {variant === 'grape' ? (
              <>
                <div style={{ position: 'absolute', top: T(-18), left: 'calc(52% )', width: D(73), height: T(64), background: 'linear-gradient(135deg,#7cc06a,#5a9e48)', borderRadius: '0 75% 10% 75%', transform: 'rotate(-16deg)', zIndex: 1 }} />
                <svg viewBox="0 0 30 48" style={{ position: 'absolute', top: T(3), left: D(153), width: D(36), height: T(72), zIndex: 2 }}><path d="M22 3 C 15 15, 15 33, 20 45" fill="none" stroke="#7d4f28" strokeWidth="6" strokeLinecap="round" /></svg>
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
                <div className="praise-modal-meta">{s ? `${(members.find((m) => m.user_id === s.from_id)?.name) || '짝꿍'} → ${owner?.name} · ${fmtDate(s.created_at)}` : ''}</div>
                <div className="praise-modal-reason">{s?.reason}</div>
                <button type="button" className="praise-modal-btn" style={{ background: cfg.accent }} onClick={() => setModal(null)}>닫기</button>
              </div>
            )
          }
          // write / edit
          const text = modal.text || ''
          return (
            <div className="praise-modal">
              {mini}
              <div className="praise-modal-ttl">{modal.mode === 'edit' ? '칭찬 내용 수정' : `${owner?.name || '짝꿍'}에게 칭찬 남기기`}</div>
              <div className="praise-modal-sub">{variant === 'grape' ? '예쁜 칭찬 포도알을 붙여줄게요' : '예쁜 칭찬 사과를 붙여줄게요'}</div>
              <textarea className="praise-modal-ta" value={text} maxLength={100}
                onChange={(e) => setModal((m) => ({ ...m, text: e.target.value.slice(0, 100) }))}
                placeholder="예) 오늘 먼저 연락해줘서 고마워!" />
              <div className="praise-modal-len">{text.length}/100</div>
              <div className="praise-modal-actions">
                <button type="button" className="praise-modal-cancel" onClick={() => setModal(null)}>취소</button>
                <button type="button" className="praise-modal-confirm" style={{ background: cfg.accent, opacity: text.trim() && !busy ? 1 : .5 }}
                  disabled={!text.trim() || busy} onClick={submit}>{modal.mode === 'edit' ? '저장' : '붙이기'}</button>
              </div>
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}
