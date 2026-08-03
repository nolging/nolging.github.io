import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { adminGetErrorReport, adminErrorReportThread, adminSendErrorReport, adminResolveErrorReport } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import SystemAvatar from '../../components/SystemAvatar'

function fmt(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// 관리자: 오류 리포트 상세 — 제목/내용/회원/시각 + SYSTEM 쪽지 스레드 + 해결 완료
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
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }) }, [thread])

  // 실시간: 유저 답변이 도착하면 아래에 이어 붙이고, 내 문의/해결은 유저 화면에 브로드캐스트
  useEffect(() => {
    const ch = supabase.channel(`report:${id}`, { config: { broadcast: { self: false } } })
    chanRef.current = ch
    ch.on('broadcast', { event: 'msg' }, ({ payload }) => {
      setThread((t) => (t.some((x) => x.id === payload.id) ? t
        : [...t, { id: payload.id, from_system: payload.from_system, body: payload.body, created_at: payload.at }]))
    })
    ch.subscribe()
    return () => { supabase.removeChannel(ch); chanRef.current = null }
  }, [id])

  async function send() {
    const text = msg.trim()
    if (!text || busy) return
    setBusy(true); setError('')
    try {
      await adminSendErrorReport(id, text)
      const mid = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `sys-${Date.now()}`
      const at = new Date().toISOString()
      setThread((t) => [...t, { id: mid, from_system: true, body: text, created_at: at }])
      chanRef.current?.send({ type: 'broadcast', event: 'msg', payload: { id: mid, from_system: true, body: text, at } })
      setMsg('')
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  async function toggleResolved() {
    if (busy || !report) return
    const next = !report.resolved
    setBusy(true); setError('')
    try {
      await adminResolveErrorReport(id, next)
      chanRef.current?.send({ type: 'broadcast', event: 'resolved', payload: { resolved: next } })
      await load()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  if (loading) return <div className="page admin-page"><div className="spinner" /></div>
  if (!report) return <div className="page admin-page"><div className="alert alert-error">{error || '리포트를 찾을 수 없어요.'}</div></div>

  return (
    <div className="page admin-page">
      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div className="admin-list-head">
          <h3 className="card-title" style={{ margin: 0 }}>{report.title}</h3>
          <span className={`badge ${report.resolved ? 'badge-done' : 'badge-open'}`}>{report.resolved ? '해결 완료' : '미해결'}</span>
        </div>
        <p className="rep-body">{report.body}</p>
        <dl className="admin-detail">
          <div className="admin-detail-row"><dt>회원 아이디</dt><dd>{report.reporter_login}</dd></div>
          <div className="admin-detail-row"><dt>리포트 시각</dt><dd>{fmt(report.created_at)}</dd></div>
          {report.resolved && <div className="admin-detail-row"><dt>해결 시각</dt><dd>{fmt(report.resolved_at)}</dd></div>}
        </dl>
      </div>

      <div className="card">
        <h3 className="card-title">SYSTEM 쪽지</h3>
        <div className="rep-thread">
          {thread.length === 0 ? (
            <p className="muted sm">아직 주고받은 쪽지가 없어요. 추가 질문을 보내 보세요.</p>
          ) : thread.map((m) => (
            <div key={m.id} className={`rep-msg ${m.from_system ? 'sys' : 'user'}`}>
              {m.from_system && <span className="rep-msg-ava"><SystemAvatar size={28} /></span>}
              <div className="rep-msg-bubble">
                <div className="rep-msg-who">{m.from_system ? 'SYSTEM' : report.reporter_login}</div>
                <div className="rep-msg-text">{m.body}</div>
                <div className="rep-msg-time">{fmt(m.created_at)}</div>
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
        <div className="rep-compose">
          <textarea value={msg} rows={2} maxLength={1000} placeholder="추가 질문을 SYSTEM 쪽지로 보내요"
            style={{ resize: 'vertical' }} onChange={(e) => setMsg(e.target.value)} />
          <button type="button" className="btn btn-primary" disabled={busy || !msg.trim()} onClick={send}>
            {busy ? '…' : '보내기'}
          </button>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">처리</h3>
        <button type="button" className={`btn btn-block ${report.resolved ? 'btn-ghost' : 'btn-primary'}`} disabled={busy} onClick={toggleResolved}>
          {report.resolved ? '미해결로 되돌리기' : '해결 완료로 처리'}
        </button>
        {!report.resolved && <p className="muted sm" style={{ marginTop: 8 }}>해결 완료하면 유저는 이 리포트에 더 이상 답장할 수 없어요.</p>}
      </div>
    </div>
  )
}
