import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { adminListQuestDefs, adminListDailyQuestDefs } from '../../lib/api'
import { QUEST_GRADE_SHORT } from './adminMeta'

// 목록 카드: PC 가로형 / 모바일 세로형은 CSS 로 반응형 전환. 데일리는 설명·배지 없음(랜덤만 표시).
function QuestCard({ emoji, emojiBg, title, desc, reward, target, active, showBadges, onClick }) {
  const badges = (
    <span className="aq-card-badges">
      <span className="aq-badge-target">{target}</span>
      <span className={`aq-badge-status ${active ? 'on' : ''}`}>{active ? '활성' : '비활성'}</span>
    </span>
  )
  return (
    <button type="button" className="aq-card" onClick={onClick}>
      <span className="aq-card-icon" style={emojiBg ? { background: emojiBg } : undefined} aria-hidden="true">{emoji || '✦'}</span>
      <span className="aq-card-body">
        <span className="aq-card-name">{title}</span>
        {showBadges ? <span className="aq-card-badges-mobile">{badges}</span> : desc ? <span className="aq-card-desc">{desc}</span> : null}
      </span>
      <span className="aq-card-reward">{reward} 츄르</span>
      {showBadges && <span className="aq-card-badges-desktop">{badges}</span>}
      <span className="aq-card-chevron" aria-hidden="true">›</span>
    </button>
  )
}

// 퀘스트 관리 — 목록 조회. 카드 클릭 → 상세/수정.
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
    <div className="page admin-page aq-page">
      {error && <div className="alert alert-error">{error}</div>}
      <div className="aq-head">
        <h2 className="aq-title">퀘스트 관리</h2>
        <p className="aq-sub">데일리 퀘스트와 랜덤 퀘스트를 확인하고 수정할 수 있어요.</p>
      </div>
      <section>
        <div className="aq-section-head">
          <span className="aq-section-title">데일리 퀘스트</span>
          <span className="aq-count">{daily.length}</span>
        </div>
        <div className="aq-cards">
          {daily.map((q) => (
            <QuestCard key={q.key} emoji={q.emoji} emojiBg={q.emoji_bg} title={q.title} reward={q.reward}
              onClick={() => nav(`/admin/quests/daily/${q.key}`)} />
          ))}
        </div>
      </section>
      <section>
        <div className="aq-section-head">
          <span className="aq-section-title">랜덤 퀘스트</span>
          <span className="aq-count">{quests.length}</span>
          <Link to="/admin/quests/new" className="aq-add-btn">
            <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            퀘스트 추가
          </Link>
        </div>
        {loading ? <div className="spinner" /> : quests.length === 0 ? (
          <p className="muted sm">등록된 퀘스트가 없습니다.</p>
        ) : (
          <div className="aq-cards">
            {quests.map((q) => (
              <QuestCard key={q.id} emoji={q.emoji} emojiBg={q.emoji_bg} title={q.title} desc={q.body} reward={q.reward}
                target={QUEST_GRADE_SHORT[q.grade] || q.grade} active={q.active} showBadges
                onClick={() => nav(`/admin/quests/${q.id}`)} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
