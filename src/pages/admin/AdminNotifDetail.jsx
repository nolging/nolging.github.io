import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { listNotifTemplates, updateNotifTemplate } from '../../lib/api'

// 푸시 알림 메시지 수정 (/admin/notifs/:key)
export default function AdminNotifDetail() {
  const { key } = useParams()
  const nav = useNavigate()
  const [tpl, setTpl] = useState(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const rows = await listNotifTemplates()
      const t = rows.find((x) => x.key === key)
      if (!t) { setError('알림 템플릿을 찾을 수 없어요.'); return }
      setTpl(t); setTitle(t.title || ''); setBody(t.body || '')
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [key])
  useEffect(() => { load() }, [load])

  async function save(e) {
    e.preventDefault(); setError('')
    if (!title.trim() || !body.trim()) { setError('제목과 본문을 입력해 주세요.'); return }
    setBusy(true)
    try { await updateNotifTemplate(key, title.trim(), body.trim()); nav('/admin/notifs', { replace: true }) }
    catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  if (loading) return <div className="page admin-page"><div className="spinner" /></div>

  return (
    <div className="page admin-page">
      {error && <div className="alert alert-error">{error}</div>}
      {tpl && (
        <div className="card">
          <h3 className="card-title">{tpl.label}</h3>
          {tpl.vars && <p className="muted sm" style={{ margin: '0 0 10px' }}>사용 가능한 치환자 — {tpl.vars}</p>}
          <form onSubmit={save} className="form">
            <label className="field"><span>제목</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="알림 제목" /></label>
            <label className="field"><span>본문</span>
              <textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="알림 본문" style={{ resize: 'vertical' }} /></label>
            <div className="admin-notif-preview">
              <div className="admin-notif-preview-t">{title || '제목'}</div>
              <div className="admin-notif-preview-b">{body || '본문'}</div>
            </div>
            <button className="btn btn-primary btn-block" disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
          </form>
        </div>
      )}
    </div>
  )
}
