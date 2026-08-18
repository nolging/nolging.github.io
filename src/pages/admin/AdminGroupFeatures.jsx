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

// 관리자: 그룹별 사용량 제어 — 전체 그룹 목록. 프리미엄(커플/우정) 그룹만 제어 대상이라
// 그 그룹들을 앞에 두고, 일반 그룹은 비활성 스타일로 뒤에 표시(클릭 불가).
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
    <div className="page admin-page">
      {error && <div className="alert alert-error">{error}</div>}
      <div className="card">
        <div className="admin-list-head">
          <h3 className="card-title" style={{ margin: 0 }}>그룹별 사용량 제어 <span className="muted">({groups.length})</span></h3>
        </div>
        {loading ? <div className="spinner" /> : groups.length === 0 ? (
          <p className="muted sm">그룹이 없습니다.</p>
        ) : (
          <ul className="admin-rows">
            {groups.map((g) => {
              const premium = g.is_couple || g.is_friend
              const badge = groupBadge(g)
              const members = g.members || []
              const extra = members.length - 3
              const content = (
                <>
                  <span className="admin-row-main admin-gname-wrap">
                    <span className="admin-gname">{g.name}</span>
                    <span className={`badge ${badge.cls}`}>{badge.label}</span>
                  </span>
                  <span className="admin-row-side">
                    <span className="task-parts multi">
                      {members.slice(0, 3).map((m) => (
                        <Avatar key={m.user_id} src={m.avatar_url} name={m.nickname} size={24} />
                      ))}
                      {extra > 0 && <span className="task-parts-more">+{extra}</span>}
                    </span>
                    {premium && <span className="admin-row-caret" aria-hidden="true">›</span>}
                  </span>
                </>
              )
              return (
                <li key={g.group_id}>
                  {premium ? (
                    <button type="button" className="admin-row" onClick={() => nav(`/admin/misc/groups/${g.group_id}`)}>
                      {content}
                    </button>
                  ) : (
                    <div className="admin-row admin-row-disabled">{content}</div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
