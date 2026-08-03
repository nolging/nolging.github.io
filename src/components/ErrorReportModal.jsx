import { useEffect, useState } from 'react'
import Modal from './Modal'
import { submitErrorReport } from '../lib/api'

// 오류 리포트 작성 모달 — 마이 페이지 상단바 확성기 버튼에서 연다.
export default function ErrorReportModal({ open, onClose }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (open) { setTitle(''); setBody(''); setError(''); setBusy(false); setDone(false) }
  }, [open])

  async function send() {
    if (!title.trim()) { setError('제목을 입력해 주세요.'); return }
    if (!body.trim()) { setError('내용을 입력해 주세요.'); return }
    setBusy(true); setError('')
    try { await submitErrorReport(title.trim(), body.trim()); setDone(true) }
    catch (e) { setError(e.message); setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} cardClassName="nc-link-modal">
      <div className="err-report">
        <div className="err-report-head">
          <span className="err-report-ico" aria-hidden="true">📣</span>
          <div>
            <div className="err-report-title">오류 리포트</div>
            <div className="err-report-sub">의미 있는 리포트에는 소정의 보상이 제공됩니다</div>
          </div>
        </div>

        {done ? (
          <div className="err-report-done">
            <div className="err-report-done-ico" aria-hidden="true">
              <svg width="30" viewBox="0 0 24 24" fill="none" stroke="#4a9d6a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <div className="err-report-done-t">접수 완료!</div>
            <div className="err-report-done-s">리포트를 확인 후 필요하면 SYSTEM 쪽지로 연락드릴게요.</div>
            <button type="button" className="btn btn-primary btn-block" onClick={onClose}>닫기</button>
          </div>
        ) : (
          <>
            {error && <div className="alert alert-error">{error}</div>}
            <input className="err-report-input" value={title} maxLength={100} placeholder="제목"
              onChange={(e) => { setTitle(e.target.value); if (error) setError('') }} />
            <textarea className="err-report-body" value={body} maxLength={2000} rows={6}
              placeholder="어떤 상황에서 어떤 오류가 났는지 자세히 적어 주세요." style={{ resize: 'vertical' }}
              onChange={(e) => { setBody(e.target.value); if (error) setError('') }} />
            <button type="button" className="btn btn-primary btn-block" disabled={busy || !title.trim() || !body.trim()} onClick={send}>
              {busy ? '보내는 중…' : '보내기'}
            </button>
          </>
        )}
      </div>
    </Modal>
  )
}
