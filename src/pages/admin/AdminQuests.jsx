import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { adminListQuestDefs, adminListDailyQuestDefs } from '../../lib/api'

// 퀘스트 관리 — 이모지/퀘스트명만. 행 클릭 → 상세/수정.
export default function AdminQuests() {
  const nav = useNavigate()
  const [quests, setQuests] = useState([])
  const [daily, setDaily] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [q, d] = await Promise.all([adminListQuestDefs(), adminListDailyQuestDefs()])
      setQuests(q); setDaily(d)
    }
    catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  return (
    <div className="page admin-page">
      {error && <div className="alert alert-error">{error}</div>}
      {daily.length > 0 && (
        <div className="card">
          <h3 className="card-title" style={{ margin: '0 0 10px' }}>데일리 퀘스트 <span className="muted">({daily.length})</span></h3>
          <ul className="admin-rows">
            {daily.map((q) => (
              <li key={q.key}>
                <button type="button" className="admin-row" onClick={() => nav(`/admin/quests/daily/${q.key}`)}>
                  <span className="admin-row-emoji" aria-hidden="true">{q.emoji || '✦'}</span>
                  <span className="admin-row-main">{q.title}</span>
                  <span className="admin-row-side"><span className="admin-row-caret" aria-hidden="true">›</span></span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="card">
        <div className="admin-list-head">
          <h3 className="card-title" style={{ margin: 0 }}>랜덤 퀘스트 <span className="muted">({quests.length})</span></h3>
          <Link to="/admin/quests/new" className="btn btn-sm btn-primary">퀘스트 추가</Link>
        </div>
        {loading ? <div className="spinner" /> : quests.length === 0 ? (
          <p className="muted sm">등록된 퀘스트가 없습니다.</p>
        ) : (
          <ul className="admin-rows">
            {quests.map((q) => (
              <li key={q.id}>
                <button type="button" className="admin-row" onClick={() => nav(`/admin/quests/${q.id}`)} style={{ opacity: q.active ? 1 : .5 }}>
                  <span className="admin-row-emoji" aria-hidden="true">{q.emoji || '✦'}</span>
                  <span className="admin-row-main">{q.title}{!q.active && <span className="muted sm"> · 비활성</span>}</span>
                  <span className="admin-row-side"><span className="admin-row-caret" aria-hidden="true">›</span></span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
