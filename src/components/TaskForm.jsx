import { useState } from 'react'
import { WISH_CATEGORIES } from '../lib/constants'

// 태스크 작성/편집 공용 폼. onSubmit(values) 는 저장(생성/수정)을 처리하고
// 성공 시 페이지 이동을 담당한다. (실패 시 throw)
export default function TaskForm({ groupType, initial = {}, submitLabel, onSubmit }) {
  const isNolging = groupType === 'nolging'
  const [title, setTitle] = useState(initial.title || '')
  const [desc, setDesc] = useState(initial.description || '')
  const [category, setCategory] = useState(initial.category || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    if (!title.trim()) return
    setBusy(true); setError('')
    try {
      await onSubmit({
        title: title.trim(),
        description: isNolging ? '' : desc.trim(),
        category: isNolging ? (category || null) : null,
      })
    } catch (err) { setError(err.message); setBusy(false) }
  }

  return (
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
      <button className="btn btn-primary btn-block" disabled={busy}>{busy ? '저장 중…' : submitLabel}</button>
    </form>
  )
}
