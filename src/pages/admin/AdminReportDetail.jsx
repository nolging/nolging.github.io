import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { adminGetErrorReport, adminErrorReportThread, adminSendErrorReport, adminResolveErrorReport } from '../../lib/api'
import { supabase } from '../../lib/supabase'

const SendIcon = () => (
  <svg width="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
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
  const { id } = useParams()
  const [report, setReport] = useState(null)
  const [thread, setThread] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef(null)
  const chanRef = useRef(null)

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
    if (!text || busy) return
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
    const next = !report.resolved
    if (!window.confirm(next ? '이 리포트를 해결 완료로 처리할까요?' : '미해결로 되돌릴까요?')) return
    setBusy(true); setError('')
    try {
      await adminResolveErrorReport(id, next)
      chanRef.current?.send({ type: 'broadcast', event: 'resolved', payload: { resolved: next } })
      await load()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  if (loading) return <div className="page admin-page"><div className="spinner" /></div>
  if (!report) return <div className="page admin-page"><div className="alert alert-error">{error || '리포트를 찾을 수 없어요.'}</div></div>

  const rows = []
  let prevDay = null
  for (const m of thread) {
    const dk = dayKey(m.created_at)
    if (dk !== prevDay) { rows.push(<div key={`d-${m.id}`} className="rc-date">{dayLabel(m.created_at)}</div>); prevDay = dk }
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
        <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="메시지를 입력하세요" maxLength={1000} enterKeyHint="send"
          onFocus={() => setTimeout(() => endRef.current?.scrollIntoView({ block: 'end' }), 300)} />
        <button type="submit" className="rc-send" aria-label="전송" disabled={busy || !msg.trim()} onMouseDown={(e) => e.preventDefault()}><SendIcon /></button>
      </form>
    </div>
  )
}
