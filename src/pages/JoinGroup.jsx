import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { joinGroupByCode } from '../lib/api'

export default function JoinGroup() {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    if (!code.trim()) return
    setBusy(true)
    setError('')
    try {
      const group = await joinGroupByCode(code.trim())
      navigate(`/groups/${group.id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>그룹 가입</h1>
      </div>
      <div className="card narrow">
        <p className="muted">그룹 관리자에게 받은 초대 코드를 입력하세요.</p>
        <form onSubmit={handleSubmit} className="form">
          <input
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="초대 코드 (예: a1b2c3d4e5f6)"
            className="mono"
          />
          {error && <div className="alert alert-error">{error}</div>}
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? '가입 중…' : '가입하기'}
          </button>
        </form>
      </div>
    </div>
  )
}
