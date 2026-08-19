import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminGroupOverview } from '../../lib/api'
import Avatar from '../../components/Avatar'
import useScrollRestore from '../../lib/useScrollRestore'

// 그룹 배지: 커플/우정/일반
function groupBadge(g) {
  if (g.is_couple) return { label: '커플', cls: 'badge-couple' }
  if (g.is_friend) return { label: '우정', cls: 'badge-friend' }
  return { label: '일반', cls: 'badge-normal' }
}

// 관리자: 그룹별 사용량 제어 — 전체 그룹 목록(퀘스트 관리와 동일한 카드 스타일). 프리미엄(커플/우정)
// 그룹만 제어 대상이라 그 그룹들을 앞에 두고, 일반 그룹은 비활성 카드로 뒤에 표시(클릭 불가).
export default function AdminGroupFeatures() {
  const nav = useNavigate()
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const rows = await adminGroupOverview()
      const sorted = [...rows].sort((a, b) => {
        const pa = a.is_couple || a.is_friend ? 1 : 0
        const pb = b.is_couple || b.is_friend ? 1 : 0
        return pb - pa
      })
      setGroups(sorted)
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])
  useScrollRestore(!loading)

  return (
    <div className="page admin-page aq-page">
      {error && <div className="alert alert-error">{error}</div>}
      <section>
        <div className="aq-section-head">
          <span className="aq-section-title">그룹</span>
          <span className="aq-count">{groups.length}</span>
        </div>
        {loading ? <div className="spinner" /> : groups.length === 0 ? (
          <p className="muted sm">그룹이 없습니다.</p>
        ) : (
          <div className="aq-cards">
          {groups.map((g) => {
            const premium = g.is_couple || g.is_friend
            const badge = groupBadge(g)
            const members = g.members || []
            const extra = members.length - 3
            return (
              <button
                key={g.group_id}
                type="button"
                className={`aq-card${premium ? '' : ' inactive'}${g.has_blocked_features ? ' agf-controlled' : ''}`}
                disabled={!premium}
                onClick={premium ? () => nav(`/admin/misc/groups/${g.group_id}`) : undefined}
              >
                <span className="aq-card-body">
                  <span className="aq-card-title-row">
                    <span className="aq-card-name">{g.name}</span>
                    <span className={`badge ${badge.cls}`}>{badge.label}</span>
                  </span>
                </span>
                <span className="task-parts multi">
                  {members.slice(0, 3).map((m) => (
                    <Avatar key={m.user_id} src={m.avatar_url} name={m.nickname} size={24} />
                  ))}
                  {extra > 0 && <span className="task-parts-more">+{extra}</span>}
                </span>
              </button>
            )
          })}
          </div>
        )}
      </section>
    </div>
  )
}
