import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  adminGetErrorReport, adminErrorReportThread, adminSendErrorReport, adminResolveErrorReport,
  adminReportRewardContext, adminGrantReportReward, listStoreItems,
} from '../../lib/api'
import { supabase } from '../../lib/supabase'
import Modal from '../../components/Modal'
import BottomSheet from '../../components/BottomSheet'
import StoreItemImage from '../../components/StoreItemImage'
import { itemName } from '../../lib/storeMeta'
import { bgOf, useStoreCatalog } from '../../lib/storeCatalog'
import { useScrollToTop } from '../../lib/useScrollRestore'

const PICK_MAX = 20 // 지급 수량 스텝퍼 상한(넉넉한 UI 상한, 서버는 99까지 허용)

const SendIcon = () => (
  <svg width="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
  </svg>
)
const LockIcon = () => (
  <svg width="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
)
const pad = (n) => String(n).padStart(2, '0')
const hhmm = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
const dayKey = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` }
const dayLabel = (iso) => { const d = new Date(iso); return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일` }
function fmt(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// 관리자: 오류 리포트 상세 — 채팅 UI. 회원(상대) 왼쪽 / SYSTEM(나) 오른쪽. 실시간 반영.
export default function AdminReportDetail() {
  useScrollToTop() // 목록 스크롤 위치가 이어지지 않게 항상 맨 위에서 시작(채팅 하단 자동 스크롤이 이후 덮어씀)
  const { id } = useParams()
  const [report, setReport] = useState(null)
  const [thread, setThread] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef(null)
  const chanRef = useRef(null)

  // ---- 해결 처리 + 보상 지급(아이템/츄르) ----
  useStoreCatalog()
  const [store, setStore] = useState({})       // id -> { name, emoji, premium, tier, sort }
  const [rewardCtx, setRewardCtx] = useState({}) // id -> { eligible, owned }
  const [resolveOpen, setResolveOpen] = useState(false) // '해결 처리' 모달
  const [gifts, setGifts] = useState([])          // 확정된 지급 아이템 [{ id, qty }]
  const [giftDraft, setGiftDraft] = useState({})  // 아이템 시트에서 편집 중인 초안 { id: qty }
  const [pickOpen, setPickOpen] = useState(false) // '아이템 지급' 시트
  const [pickNotice, setPickNotice] = useState('') // 지급 불가 아이템 탭 시 안내
  const [coin, setCoin] = useState('')            // 지급할 츄르(문자열 입력)
  const [coinReason, setCoinReason] = useState('') // 츄르 지급 사유(선택)
  const [granting, setGranting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [r, t] = await Promise.all([adminGetErrorReport(id), adminErrorReportThread(id)])
      setReport(r); setThread(t || [])
      if (!r) setError('리포트를 찾을 수 없어요.')
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [id])
  useEffect(() => { load() }, [load])
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [thread, loading])

  // 키보드가 올라와(visualViewport 축소) 채팅 영역이 줄면 마지막 메시지가 보이게 스크롤
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const toEnd = () => requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: 'end' }))
    vv.addEventListener('resize', toEnd)
    return () => vv.removeEventListener('resize', toEnd)
  }, [])

  // 실시간: 어느 쪽이든 메시지를 보내면 'refresh' → 스레드를 다시 읽어 온다(정확히 반영)
  const reloadThread = useCallback(() => {
    adminErrorReportThread(id).then((t) => setThread(t || [])).catch(() => {})
  }, [id])
  useEffect(() => {
    const ch = supabase.channel(`report:${id}`, { config: { broadcast: { self: false } } })
    chanRef.current = ch
    ch.on('broadcast', { event: 'refresh' }, () => reloadThread())
    ch.subscribe()
    return () => { supabase.removeChannel(ch); chanRef.current = null }
  }, [id, reloadThread])

  async function send(e) {
    e?.preventDefault?.()
    const text = msg.trim()
    if (!text || busy || report?.resolved) return
    setBusy(true); setError('')
    try {
      await adminSendErrorReport(id, text)
      setMsg('')
      const t = await adminErrorReportThread(id)
      setThread(t || [])
      chanRef.current?.send({ type: 'broadcast', event: 'refresh', payload: {} })
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  async function toggleResolved() {
    if (busy || !report) return
    if (report.resolved) {
      // 미해결로 되돌리기는 보상과 무관 — 기존처럼 바로 확인 후 처리
      if (!window.confirm('미해결로 되돌릴까요?')) return
      setBusy(true); setError('')
      try {
        await adminResolveErrorReport(id, false)
        chanRef.current?.send({ type: 'broadcast', event: 'resolved', payload: { resolved: false } })
        await load()
      } catch (err) { setError(err.message) } finally { setBusy(false) }
      return
    }
    // 해결 완료로 처리 — 보상(아이템/츄르) 지급을 함께 할 수 있는 모달을 연다
    setGifts([]); setGiftDraft({}); setCoin(''); setCoinReason(''); setPickNotice(''); setError('')
    setResolveOpen(true)
    Promise.all([listStoreItems(), adminReportRewardContext(id)]).then(([items, ctx]) => {
      const sm = {}
      items.forEach((it) => { sm[it.id] = { name: it.name, emoji: it.emoji, premium: !!it.premium, tier: it.tier || null, sort: it.sortOrder ?? 999 } })
      setStore(sm)
      const cm = {}
      ctx.forEach((r) => { cm[r.item_id] = { eligible: !!r.eligible, owned: r.owned_qty || 0 } })
      setRewardCtx(cm)
    }).catch((err) => setError(err.message))
  }

  const metaOf = (id2) => ({
    name: itemName(id2, store[id2]?.name || id2),
    emoji: store[id2]?.emoji || '🎁',
    bg: bgOf(id2, store[id2]?.premium),
  })
  const pickList = Object.keys(rewardCtx).sort((a, b) => (store[a]?.sort ?? 999) - (store[b]?.sort ?? 999))

  function openPicker() {
    const d = {}; gifts.forEach((g) => { d[g.id] = g.qty }); setGiftDraft(d); setPickNotice(''); setPickOpen(true)
  }
  function setDraftQty(itemId, q) {
    setGiftDraft((prev) => { const d = { ...prev }; if (q <= 0) delete d[itemId]; else d[itemId] = Math.min(PICK_MAX, q); return d })
  }
  const draftCount = Object.values(giftDraft).reduce((a, b) => a + b, 0)
  function confirmPicker() {
    setGifts(Object.keys(giftDraft).filter((k) => giftDraft[k] > 0).map((k) => ({ id: k, qty: giftDraft[k] })))
    setPickOpen(false)
  }

  async function confirmResolve() {
    if (granting) return
    setGranting(true); setError('')
    try {
      await adminResolveErrorReport(id, true)
      const coinAmt = Number(coin) || 0
      if (gifts.length > 0 || coinAmt > 0) {
        await adminGrantReportReward(id, { items: gifts, coin: coinAmt, reason: coinReason.trim() })
        chanRef.current?.send({ type: 'broadcast', event: 'refresh', payload: {} })
      }
      chanRef.current?.send({ type: 'broadcast', event: 'resolved', payload: { resolved: true } })
      setResolveOpen(false)
      await load()
      reloadThread()
    } catch (err) { setError(err.message) } finally { setGranting(false) }
  }

  if (loading) return <div className="page admin-page"><div className="spinner" /></div>
  if (!report) return <div className="page admin-page"><div className="alert alert-error">{error || '리포트를 찾을 수 없어요.'}</div></div>

  const rows = []
  let prevDay = null
  for (const m of thread) {
    const dk = dayKey(m.created_at)
    if (dk !== prevDay) { rows.push(<div key={`d-${m.id}`} className="rc-date">{dayLabel(m.created_at)}</div>); prevDay = dk }
    if (m.items && m.items.length > 0) {
      // 보상 아이템 메시지 — 관리자는 열람만(수령은 회원 쪽에서만)
      rows.push(
        <div key={m.id} className="rc-reward-row">
          <ul className="note-gift-list">
            {m.items.map((it) => (
              <li key={it.item_id} className="note-gift-row">
                <span className="note-gift-thumb" style={{ background: bgOf(it.item_id) }}>
                  <StoreItemImage id={it.item_id} emoji="🎁" className="note-gift-img" />
                </span>
                <span className="note-gift-name">{itemName(it.item_id, it.item_name)}{it.qty > 1 && <span className="note-gift-qty">×{it.qty}</span>}</span>
                <span className="note-gift-done">{it.claimed ? '수령 완료' : '수령 대기'}</span>
              </li>
            ))}
          </ul>
        </div>,
      )
      continue
    }
    if (m.reward_coin != null && m.reward_coin > 0) {
      rows.push(
        <div key={m.id} className="rc-reward-coin">
          <span className="rc-reward-coin-emoji">🐾</span>
          <span>{m.body}</span>
        </div>,
      )
      continue
    }
    rows.push(
      // SYSTEM(내가 보낸 것) = 오른쪽(mine), 회원(상대) = 왼쪽(sys)
      <div key={m.id} className={`rc-msg ${m.from_system ? 'mine' : 'sys'}`}>
        <div className="rc-bubble">{m.body}</div>
        <span className="rc-time">{hhmm(m.created_at)}</span>
      </div>,
    )
  }

  return (
    <div className="page admin-page admin-report-chat">
      {error && <div className="alert alert-error">{error}</div>}

      <div className="arc-report">
        <div className="arc-report-top">
          <h3 className="arc-report-title">{report.title}</h3>
          <button type="button" className={`badge arc-status ${report.resolved ? 'badge-done' : 'badge-open'}`}
            disabled={busy} onClick={toggleResolved} title="해결 여부 변경">
            {report.resolved ? '해결 완료' : '미해결'}
          </button>
        </div>
        <p className="arc-report-body">{report.body}</p>
        <div className="arc-report-meta">
          <span className="arc-report-login">{report.reporter_login}</span>
          <span className="arc-report-time">{fmt(report.created_at)}</span>
        </div>
      </div>

      <div className="arc-thread-label">채팅 문의</div>
      <div className="arc-thread">
        {thread.length === 0 ? (
          <p className="arc-empty">추가 질문을 보내면 채팅이 열려요</p>
        ) : rows}
        <div ref={endRef} />
      </div>

      <form className="rc-input" onSubmit={send}>
        <input value={msg} onChange={(e) => setMsg(e.target.value)} disabled={report.resolved}
          placeholder={report.resolved ? '해결 완료된 리포트에는 문의할 수 없어요' : '메시지를 입력하세요'}
          maxLength={1000} enterKeyHint="send"
          onFocus={() => setTimeout(() => endRef.current?.scrollIntoView({ block: 'end' }), 300)} />
        {report.resolved
          ? <span className="rc-send rc-send-locked" aria-hidden="true"><LockIcon /></span>
          : <button type="submit" className="rc-send" aria-label="전송" disabled={busy || !msg.trim()} onMouseDown={(e) => e.preventDefault()}><SendIcon /></button>}
      </form>

      {/* 해결 처리 + 보상 지급(선택). 아이템 지급 시트(z-index 낮음)가 가려지지 않게 시트가
          열려 있는 동안엔 잠시 숨긴다(gifts/coin 등 상태는 유지되므로 다시 열려도 안 사라짐). */}
      <Modal open={resolveOpen && !pickOpen} onClose={() => !granting && setResolveOpen(false)} title="해결 처리" cardClassName="arc-resolve-modal">
        <p className="confirm-text">이 리포트를 해결 완료로 처리할까요?<br />필요하면 보상을 함께 지급할 수 있어요.</p>
        {error && <div className="alert alert-error">{error}</div>}

        <div className="arc-reward-sec">
          <div className="arc-reward-label">아이템 지급</div>
          {gifts.length > 0 && (
            <div className="arc-gift-chips">
              {gifts.map((g) => (
                <div key={g.id} className="nc-chip is-gift">
                  <button type="button" className="nc-chip-x" onClick={() => setGifts(gifts.filter((x) => x.id !== g.id))} aria-label="선물 제거">
                    <svg width="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                  <span className="nc-chip-ico" style={{ background: metaOf(g.id).bg }}><StoreItemImage id={g.id} emoji={metaOf(g.id).emoji} className="nc-img" /></span>
                  <div className="nc-chip-txt">
                    <div className="nc-chip-name">{metaOf(g.id).name} <span className="nc-chip-qty">×{g.qty}</span></div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <button type="button" className="btn btn-ghost btn-block" onClick={openPicker}>
            {gifts.length > 0 ? '아이템 다시 고르기' : '아이템 선택'}
          </button>
        </div>

        <div className="arc-reward-sec">
          <label className="arc-reward-label" htmlFor="arc-coin">츄르 지급</label>
          <input id="arc-coin" type="number" inputMode="numeric" min="0" value={coin}
            onChange={(e) => setCoin(e.target.value)} placeholder="지급할 츄르 수(선택)" />
          {Number(coin) > 0 && (
            <input className="arc-coin-reason" value={coinReason} onChange={(e) => setCoinReason(e.target.value)}
              placeholder="지급 사유(선택)" />
          )}
        </div>

        <button type="button" className="btn btn-primary btn-block" disabled={granting} onClick={confirmResolve}>
          {granting ? '처리 중…' : '완료 처리'}
        </button>
      </Modal>

      {/* 아이템 지급 시트 */}
      <BottomSheet open={pickOpen} onClose={() => setPickOpen(false)}>
        <h3 className="nc-sheet-title">아이템 지급</h3>
        <p className="nc-sheet-sub">지급할 아이템과 수량을 골라 주세요</p>
        {pickNotice && <div className="nc-gift-notice">{pickNotice}</div>}
        {pickList.length === 0 ? (
          <div className="nc-sheet-empty">지급할 수 있는 아이템이 없어요.</div>
        ) : (
          <div className="nc-grid nc-grid-gift">
            {pickList.map((itemId) => {
              const q = giftDraft[itemId] || 0
              const ctx = rewardCtx[itemId] || { eligible: true, owned: 0 }
              const disabled = !ctx.eligible
              const onCard = disabled
                ? () => setPickNotice('프리미엄 조건을 충족하지 않는 회원에게는 지급할 수 없어요.')
                : () => { setPickNotice(''); setDraftQty(itemId, q > 0 ? 0 : 1) }
              return (
                <div key={itemId} className={`nc-gcard ${q > 0 ? 'is-picked' : ''} ${disabled ? 'is-off' : ''} ${!disabled ? 'is-tap' : ''}`}
                  onClick={onCard}>
                  <span className="nc-icard-img" style={{ background: metaOf(itemId).bg }}>
                    <StoreItemImage id={itemId} emoji={metaOf(itemId).emoji} className="nc-img" />
                    {ctx.owned > 0 && <span className="nc-icard-badge">×{ctx.owned}</span>}
                  </span>
                  <span className="nc-icard-name">{metaOf(itemId).name}</span>
                  {disabled ? (
                    <div className="nc-gcard-locked">프리미엄</div>
                  ) : (
                    <div className="nc-step" onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="nc-step-b" disabled={q <= 0} onClick={() => { setPickNotice(''); setDraftQty(itemId, q - 1) }}>−</button>
                      <span className="nc-step-v">{q}</span>
                      <button type="button" className="nc-step-b" disabled={q >= PICK_MAX} onClick={() => { setPickNotice(''); setDraftQty(itemId, q + 1) }}>+</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        <button type="button" className="nc-sheet-confirm" disabled={draftCount === 0} onClick={confirmPicker}>
          {draftCount > 0 ? `확인 · ${draftCount}개` : '아이템을 선택해 주세요'}
        </button>
      </BottomSheet>
    </div>
  )
}
