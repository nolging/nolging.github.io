import { useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { createTask } from '../lib/api'
import { taskTerms, WISH_CATEGORIES } from '../lib/constants'

export default function CreateTask() {
  const { groupId } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const groupType = location.state?.groupType
  const terms = taskTerms(groupType)
  const isNolging = groupType === 'nolging'

  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [category, setCategory] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    if (!title.trim()) return
    setBusy(true); setError('')
    try {
      await createTask({
        groupId,
        title: title.trim(),
        description: isNolging ? '' : desc.trim(),
        category: isNolging ? (category || null) : null,
        createdBy: profile.id,
      })
      navigate(`/groups/${groupId}`)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <div className="page">
      <form onSubmit={submit} className="form">
        {isNolging && (
          <div className="chip-row">
            {WISH_CATEGORIES.map((c) => (
              <button type="button" key={c} className={`chip ${category === c ? 'active' : ''}`}
                onClick={() => setCategory(category === c ? '' : c)}>{c}</button>
            ))}
          </div>
        )}

        {isNolging ? (
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목" />
        ) : (
          <>
            <label className="field"><span>제목</span>
              <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="할 일 제목" /></label>
            <label className="field"><span>설명 (선택)</span>
              <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="설명" rows={4} /></label>
          </>
        )}

        {error && <div className="alert alert-error">{error}</div>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? '추가 중…' : `${terms.noun} 추가`}</button>
      </form>
    </div>
  )
}
