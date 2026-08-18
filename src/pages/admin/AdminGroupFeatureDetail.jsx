import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { adminGroupOverview, listBlockedFeatures, adminSetGroupFeature } from '../../lib/api'
import { COUPLE_FEATURES, FRIEND_FEATURES, GROUP_GAMES, BLOCKED_DESC } from './adminMeta'
import Avatar from '../../components/Avatar'
import CgToggle from '../../components/CgToggle'

// 그룹 배지: 커플/우정/일반
function groupBadge(g) {
  if (!g) return { label: '일반', cls: 'badge-normal' }
  if (g.is_couple) return { label: '커플', cls: 'badge-couple' }
  if (g.is_friend) return { label: '우정', cls: 'badge-friend' }
  return { label: '일반', cls: 'badge-normal' }
}

// 관리자: 그룹 하나의 사용량 제어 — 우심뽀까/낙서장/미니게임을 그룹별로 토글 차단.
// 기본은 모두 On. Off 로 바꾸면 그 그룹에서는 해당 기능 진입 버튼이 비활성화된다.
export default function AdminGroupFeatureDetail() {
  const { groupId } = useParams()
  const [group, setGroup] = useState(null)
  const [blocked, setBlocked] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [overview, features] = await Promise.all([adminGroupOverview(), listBlockedFeatures(groupId)])
      setGroup(overview.find((g) => g.group_id === groupId) || null)
      setBlocked(new Set(features))
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [groupId])
  useEffect(() => { load() }, [load])

  // 낙관적 업데이트 + 실패 시 롤백
  async function toggle(key) {
    if (busy) return
    const nextBlocked = !blocked.has(key)
    setBusy(true); setError('')
    setBlocked((s) => { const n = new Set(s); nextBlocked ? n.add(key) : n.delete(key); return n })
    try { await adminSetGroupFeature(groupId, key, nextBlocked) }
    catch (err) {
      setError(err.message)
      setBlocked((s) => { const n = new Set(s); nextBlocked ? n.delete(key) : n.add(key); return n })
    } finally { setBusy(false) }
  }

  const gameKeys = GROUP_GAMES.map((g) => g.key)
  const allGamesOn = gameKeys.every((k) => !blocked.has(k))
  async function toggleAllGames() {
    if (busy) return
    const nextBlocked = allGamesOn // 전부 켜져 있으면 → 전부 끄기, 아니면 전부 켜기
    setBusy(true); setError('')
    setBlocked((s) => { const n = new Set(s); gameKeys.forEach((k) => (nextBlocked ? n.add(k) : n.delete(k))); return n })
    try { await Promise.all(gameKeys.map((k) => adminSetGroupFeature(groupId, k, nextBlocked))) }
    catch (err) { setError(err.message); await load() }
    finally { setBusy(false) }
  }

  if (loading) return <div className="page admin-page"><div className="spinner" /></div>

  const badge = groupBadge(group)
  const members = group?.members || []
  const extra = members.length - 3
  // 커플 그룹은 "멍냥꽁냥", 우정 그룹은 "커뮤니티" 구역 — 각 구역에 표시되는 기능이 다름
  const zoneLabel = group?.is_couple ? '멍냥꽁냥' : '커뮤니티'
  const zoneFeatures = group?.is_couple ? COUPLE_FEATURES : FRIEND_FEATURES

  return (
    <div className="page admin-page">
      {error && <div className="alert alert-error">{error}</div>}

      <div className="card agf-head-card">
        <span className="agf-head-name">{group?.name}</span>
        <span className={`badge ${badge.cls}`}>{badge.label}</span>
        <span className="task-parts multi agf-head-avatars">
          {members.slice(0, 3).map((m) => (
            <Avatar key={m.user_id} src={m.avatar_url} name={m.nickname} size={28} />
          ))}
          {extra > 0 && <span className="task-parts-more">+{extra}</span>}
        </span>
      </div>

      <div className="cg-label cg-mb-0">{zoneLabel}</div>
      <div className="cg-list">
        {zoneFeatures.map((f) => (
          <div className="cg-row" key={f.key}>
            <span className="cg-row-icon" style={{ background: f.emojiBg }} aria-hidden="true">{f.emoji}</span>
            <div className="cg-row-main">
              <div className="cg-row-title">{f.label}</div>
              <div className="cg-row-sub">{blocked.has(f.key) ? BLOCKED_DESC : f.desc}</div>
            </div>
            <CgToggle on={!blocked.has(f.key)} onClick={() => toggle(f.key)} />
          </div>
        ))}
      </div>

      <div className="cg-label-row cg-mb-0">
        <span className="cg-label">미니 게임</span>
        <CgToggle on={allGamesOn} onClick={toggleAllGames} />
      </div>
      <div className="cg-list">
        {GROUP_GAMES.map((g) => (
          <div className="cg-row" key={g.key}>
            <span className="cg-row-icon" style={{ background: g.emojiBg }} aria-hidden="true">{g.emoji}</span>
            <div className="cg-row-main">
              <div className="cg-row-title">{g.label}</div>
              <div className="cg-row-sub">{blocked.has(g.key) ? BLOCKED_DESC : '미니 게임'}</div>
            </div>
            <CgToggle on={!blocked.has(g.key)} onClick={() => toggle(g.key)} />
          </div>
        ))}
      </div>
    </div>
  )
}
