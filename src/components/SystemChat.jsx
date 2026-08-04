import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  errorReportThread, errorReportInfo, replyErrorReport, deleteErrorReportForUser, markReportRead,
  claimGiftItem, claimGiftNoteAll,
} from '../lib/api'
import SystemAvatar from './SystemAvatar'
import StoreItemImage from './StoreItemImage'
import { itemName } from '../lib/storeMeta'
import { bgOf, useStoreCatalog } from '../lib/storeCatalog'

const SendIcon = () => (
  <svg width="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
  </svg>
)
const TrashIcon = () => (
  <svg width="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M6 6l1 14h10l1-14" />
  </svg>
)
const pad = (n) => String(n).padStart(2, '0')
const hhmm = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
const dayKey = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` }
const dayLabel = (iso) => { const d = new Date(iso); return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일` }

// 오류 리포트 추가 문의 — 채팅 UI(유저 측). 깜냥(SYSTEM) 왼쪽 / 내 답변 오른쪽. 실시간 반영.
export default function SystemChat({ note, onDeleted }) {
  useStoreCatalog()
  const reportId = note.report_id
  const [report, setReport] = useState(null)   // 원문(제목/내용)
  const [msgs, setMsgs] = useState([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [claiming, setClaiming] = useState(false) // 보상 아이템 수령 중
  const [resolved, setResolved] = useState(!!note.report_resolved)
  const [error, setError] = useState('')
  const endRef = useRef(null)
  const chanRef = useRef(null)

  useEffect(() => {
    if (!reportId) { setLoading(false); return }
    let on = true
    const loadThread = () => errorReportThread(reportId).then((t) => { if (on) setMsgs(t || []) }).catch(() => {})
    Promise.all([errorReportInfo(reportId).catch(() => null), errorReportThread(reportId).catch(() => [])])
      .then(([info, t]) => { if (!on) return; setReport(info); setMsgs(t || []); if (info) setResolved(!!info.resolved); setLoading(false) })
    markReportRead(reportId).catch(() => {})
    const ch = supabase.channel(`report:${reportId}`, { config: { broadcast: { self: false } } })
    chanRef.current = ch
    // 어느 쪽이든 새 메시지를 보내면 'refresh' → 서버에서 다시 읽어 온다(중복 없이 정확)
    ch.on('broadcast', { event: 'refresh' }, () => { loadThread(); markReportRead(reportId).catch(() => {}) })
    ch.on('broadcast', { event: 'resolved' }, ({ payload }) => setResolved(!!payload.resolved))
    ch.subscribe()
    return () => { on = false; supabase.removeChannel(ch); chanRef.current = null }
  }, [reportId])

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [msgs, loading])

  // 키보드가 올라와(visualViewport 축소) 채팅 영역이 줄면 마지막 메시지가 보이게 스크롤
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const toEnd = () => requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: 'end' }))
    vv.addEventListener('resize', toEnd)
    return () => vv.removeEventListener('resize', toEnd)
  }, [])

  async function send(e) {
    e?.preventDefault?.()
    const text = input.trim()
    if (!text || busy || resolved) return
    setBusy(true); setError('')
    try {
      await replyErrorReport(reportId, text)
      setInput('')
      // 내 답변은 즉시 오른쪽에 표시(낙관적) → 서버 확정 로드로 재조정하되,
      // 아직 서버에 안 잡히면 로컬 표시를 유지해 "내가 보낸 메시지가 안 보이는" 문제를 막는다.
      const localId = `local-${(typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Date.now()}`
      const local = { id: localId, from_system: false, body: text, created_at: new Date().toISOString(), _local: true }
      setMsgs((prev) => [...prev, local])
      errorReportThread(reportId).then((server) => {
        const srv = server || []
        setMsgs((prev) => {
          const keep = prev.filter((m) => m._local && !srv.some((s) => !s.from_system && s.body === m.body))
          return [...srv, ...keep]
        })
      }).catch(() => {})
      chanRef.current?.send({ type: 'broadcast', event: 'refresh', payload: {} })
    } catch (e2) { setError(e2.message) } finally { setBusy(false) }
  }

  async function del() {
    if (!window.confirm('해당 리포트를 삭제할까요?')) return
    try { await deleteErrorReportForUser(reportId); onDeleted?.() }
    catch (e) { setError(e.message) }
  }

  // 보상 아이템 수령(개별/일괄) — 리포트 채팅에 첨부된 아이템을 인벤토리로
  async function claimOne(m, it) {
    if (claiming) return
    setClaiming(true); setError('')
    try {
      await claimGiftItem(m.id, it.item_id)
      setMsgs(await errorReportThread(reportId))
    } catch (e) { setError(e.message) } finally { setClaiming(false) }
  }
  async function claimAll(m) {
    if (claiming) return
    setClaiming(true); setError('')
    try {
      await claimGiftNoteAll(m.id)
      setMsgs(await errorReportThread(reportId))
    } catch (e) { setError(e.message) } finally { setClaiming(false) }
  }

  const rows = []
  let prevDay = null
  for (const m of msgs) {
    const dk = dayKey(m.created_at)
    if (dk !== prevDay) { rows.push(<div key={`d-${m.id}`} className="rc-date">{dayLabel(m.created_at)}</div>); prevDay = dk }
    if (m.items && m.items.length > 0) {
      rows.push(
        <div key={m.id} className="rc-reward-row">
          {m.items.length > 1 && m.items.some((it) => !it.claimed) && (
            <button type="button" className="note-gift-all rc-reward-all" onClick={() => claimAll(m)} disabled={claiming}>일괄 수령</button>
          )}
          <ul className="note-gift-list">
            {m.items.map((it) => (
              <li key={it.item_id} className="note-gift-row">
                <span className="note-gift-thumb" style={{ background: bgOf(it.item_id) }}>
                  <StoreItemImage id={it.item_id} emoji="🎁" className="note-gift-img" />
                </span>
                <span className="note-gift-name">{itemName(it.item_id, it.item_name)}{it.qty > 1 && <span className="note-gift-qty">×{it.qty}</span>}</span>
                {it.claimed
                  ? <span className="note-gift-done">수령 완료</span>
                  : <button type="button" className="note-gift-claim" onClick={() => claimOne(m, it)} disabled={claiming}>수령하기</button>}
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
      <div key={m.id} className={`rc-msg ${m.from_system ? 'sys' : 'mine'}`}>
        <div className="rc-bubble">{m.body}</div>
        <span className="rc-time">{hhmm(m.created_at)}</span>
      </div>,
    )
  }

  return (
    <div className="rc">
      <div className="rc-head">
        <SystemAvatar size={40} />
        <div className="rc-who">
          <span className="rc-name">깜냥</span>
          <span className="rc-badge">🔧 SYSTEM</span>
        </div>
        {resolved && (
          <button type="button" className="rc-trash" aria-label="리포트 삭제" title="리포트 삭제" onClick={del}><TrashIcon /></button>
        )}
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="rc-body">
        {loading ? <div className="spinner" /> : (
          <>
            {report && (
              <div className="rc-report">
                <div className="rc-report-title">{report.title}</div>
                <p className="rc-report-body">{report.body}</p>
              </div>
            )}
            {rows}
            <div ref={endRef} />
          </>
        )}
      </div>
      {resolved ? (
        <div className="rc-closed">처리 완료된 리포트입니다</div>
      ) : (
        <form className="rc-input" onSubmit={send}>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="답변을 적어 주세요" maxLength={1000} enterKeyHint="send"
            onFocus={() => setTimeout(() => endRef.current?.scrollIntoView({ block: 'end' }), 300)} />
          <button type="submit" className="rc-send" aria-label="전송" disabled={busy || !input.trim()} onMouseDown={(e) => e.preventDefault()}><SendIcon /></button>
        </form>
      )}
    </div>
  )
}
