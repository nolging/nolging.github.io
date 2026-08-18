import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { adminGroupOverview, listBlockedFeatures, adminSetGroupFeature } from '../../lib/api'
import { GROUP_FEATURES, GROUP_GAMES, BLOCKED_DESC } from './adminMeta'
import CgToggle from '../../components/CgToggle'

// 관리자: 그룹 하나의 사용량 제어 — 우심뽀까/낙서장/미니게임을 그룹별로 토글 차단.
// 기본은 모두 On. Off 로 바꾸면 그 그룹에서는 해당 기능 진입 버튼이 비활성화된다.
export default function AdminGroupFeatureDetail() {
  const { groupId } = useParams()
  const [groupName, setGroupName] = useState('')
  const [blocked, setBlocked] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [overview, features] = await Promise.all([adminGroupOverview(), listBlockedFeatures(groupId)])
      setGroupName(overview.find((g) => g.group_id === groupId)?.name || '')
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

  return (
    <div className="page admin-page">
      {error && <div className="alert alert-error">{error}</div>}
      <div className="card">
        <div className="admin-list-head">
          <h3 className="card-title" style={{ margin: 0 }}>{groupName}</h3>
        </div>

        <div className="cg-list cg-mt-12">
          {GROUP_FEATURES.map((f) => (
            <div className="cg-row" key={f.key}>
              <div className="cg-row-main">
                <div className="cg-row-title">{f.label}</div>
                <div className="cg-row-sub">{blocked.has(f.key) ? BLOCKED_DESC : f.desc}</div>
              </div>
              <CgToggle on={!blocked.has(f.key)} onClick={() => toggle(f.key)} />
            </div>
          ))}
        </div>

        <div className="cg-label-row cg-mt-24">
          <span className="cg-label">게임</span>
          <CgToggle on={allGamesOn} onClick={toggleAllGames} />
        </div>
        <div className="cg-list cg-mt-12">
          {GROUP_GAMES.map((g) => (
            <div className="cg-row" key={g.key}>
              <div className="cg-row-main">
                <div className="cg-row-title">{g.label}</div>
                <div className="cg-row-sub">{blocked.has(g.key) ? BLOCKED_DESC : '미니 게임'}</div>
              </div>
              <CgToggle on={!blocked.has(g.key)} onClick={() => toggle(g.key)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
