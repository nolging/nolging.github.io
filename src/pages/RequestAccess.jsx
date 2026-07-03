import { useState } from 'react'
import { Link } from 'react-router-dom'
import { submitAccessRequest } from '../lib/api'

export default function RequestAccess() {
  const [nickname, setNickname] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!/^[a-z0-9._-]{2,32}$/.test(nickname.trim().toLowerCase())) {
      setError('닉네임은 영문 소문자/숫자/._- 2~32자여야 합니다.')
      return
    }
    setBusy(true)
    try {
      await submitAccessRequest({ nickname, note })
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo">가입 요청</div>
        {done ? (
          <>
            <div className="alert alert-success">
              요청이 접수되었습니다. 관리자가 승인하면 계정이 생성됩니다.
            </div>
            <p className="auth-foot"><Link to="/login">로그인으로 돌아가기</Link></p>
          </>
        ) : (
          <>
            <p className="auth-sub">관리자 승인 후 계정이 생성됩니다.</p>
            <form onSubmit={handleSubmit} className="form">
              <label className="field">
                <span>원하는 닉네임</span>
                <input
                  autoFocus
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="영문 소문자/숫자/._-"
                />
              </label>
              <label className="field">
                <span>메모 (선택)</span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="본인 소개나 요청 사유를 남겨주세요"
                  rows={3}
                />
              </label>
              {error && <div className="alert alert-error">{error}</div>}
              <button className="btn btn-primary btn-block" disabled={busy}>
                {busy ? '전송 중…' : '가입 요청 보내기'}
              </button>
            </form>
            <p className="auth-foot"><Link to="/login">로그인으로 돌아가기</Link></p>
          </>
        )}
      </div>
    </div>
  )
}
