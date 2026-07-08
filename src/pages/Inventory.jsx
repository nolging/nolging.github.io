import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/Modal'
import Avatar from '../components/Avatar'
import StoreItemImage from '../components/StoreItemImage'
import { listStoreItems, listInventory, useWish } from '../lib/api'

const MAX_WISH = 300

export default function Inventory() {
  const { user } = useAuth()
  const [items, setItems] = useState([])   // 원본 인벤토리 행
  const [meta, setMeta] = useState({})     // itemId → { emoji, name }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [wishOpen, setWishOpen] = useState(false)
  const [notice, setNotice] = useState('') // 준비 중 안내(기타 아이템)

  async function reload() {
    if (!user?.id) return
    const [storeItems, inv] = await Promise.all([listStoreItems(), listInventory(user.id)])
    const m = {}
    for (const s of storeItems) m[s.id] = { emoji: s.emoji, name: s.name }
    setMeta(m)
    setItems(inv)
  }

  useEffect(() => {
    let on = true
    ;(async () => {
      try { await reload() } catch (err) { if (on) setError(err.message) } finally { if (on) setLoading(false) }
    })()
    return () => { on = false }
  }, [user?.id])

  // 아이템 종류별로 묶기 (개수 + 원본 행들)
  const groups = useMemo(() => {
    const map = new Map()
    for (const r of items) {
      if (!map.has(r.item_id)) map.set(r.item_id, { id: r.item_id, name: meta[r.item_id]?.name || r.item_name, emoji: meta[r.item_id]?.emoji || '🎁', count: 0, rows: [] })
      const g = map.get(r.item_id)
      g.count++
      g.rows.push(r)
    }
    return [...map.values()]
  }, [items, meta])

  const wishRows = useMemo(() => items.filter((r) => r.item_id === 'wish'), [items])

  function useItem(g) {
    setNotice('')
    if (g.id === 'wish') setWishOpen(true)
    else setNotice(`${g.name}은(는) 아직 사용 준비 중이에요 🐾`)
  }

  return (
    <div className="page">
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      {loading ? (
        <div className="spinner" />
      ) : groups.length === 0 ? (
        <div className="empty">보유한 아이템이 없어요.<br />상점에서 구매하거나 선물받아 보세요.</div>
      ) : (
        <div className="store-grid">
          {groups.map((g) => (
            <div key={g.id} className="store-card inv-card">
              {g.count > 1 && <span className="inv-count">{g.count}</span>}
              <StoreItemImage id={g.id} emoji={g.emoji} className="store-card-img" />
              <span className="store-card-name">{g.name}</span>
              <button type="button" className="btn btn-primary btn-sm inv-use-btn" onClick={() => useItem(g)}>
                사용하기
              </button>
            </div>
          ))}
        </div>
      )}

      <WishModal
        open={wishOpen}
        onClose={() => setWishOpen(false)}
        wishRows={wishRows}
        onUsed={reload}
      />
    </div>
  )
}

// ---- 소원권 사용 모달 ----
function WishModal({ open, onClose, wishRows, onUsed }) {
  const [fromId, setFromId] = useState('')
  const [wish, setWish] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  // 소원권을 준 사람들(중복 제거 + 장수)
  const gifters = useMemo(() => {
    const map = new Map()
    for (const r of wishRows) {
      if (!r.from_user_id) continue
      if (!map.has(r.from_user_id)) map.set(r.from_user_id, { userId: r.from_user_id, name: r.from_name || '?', avatar: r.from_avatar, count: 0 })
      map.get(r.from_user_id).count++
    }
    return [...map.values()]
  }, [wishRows])

  // 열릴 때 초기화: 준 사람이 한 명뿐이면 자동 선택
  useEffect(() => {
    if (open) {
      setWish(''); setError('')
      setFromId(gifters.length === 1 ? gifters[0].userId : '')
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const selected = gifters.find((g) => g.userId === fromId)

  async function grant() {
    if (!fromId) { setError('소원권을 준 사람을 선택해 주세요.'); return }
    if (!wish.trim()) { setError('소원을 입력해 주세요.'); return }
    setSending(true); setError('')
    try {
      await useWish({ fromUserId: fromId, wish: wish.trim() })
      await onUsed()
      onClose()
    } catch (err) { setError(err.message); setSending(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="소원권 사용">
      <div className="wish-modal">
        {error && <div className="alert alert-error">{error}</div>}

        {/* To. — 준 사람 */}
        <div className="wish-to">
          <span className="wish-to-label">To.</span>
          {gifters.length <= 1 ? (
            selected ? (
              <span className="wish-to-value"><Avatar src={selected.avatar} name={selected.name} size={28} />{selected.name}</span>
            ) : (
              <span className="wish-to-empty">받은 소원권이 없어요</span>
            )
          ) : (
            <span className="wish-to-value">{selected ? <><Avatar src={selected.avatar} name={selected.name} size={28} />{selected.name}</> : <span className="wish-to-empty">아래에서 선택</span>}</span>
          )}
        </div>

        {gifters.length > 1 && (
          <div className="picker-members wish-gifters">
            {gifters.map((g) => (
              <button type="button" key={g.userId}
                className={`picker-member ${fromId === g.userId ? 'active' : ''}`}
                onClick={() => setFromId(g.userId)}>
                <Avatar src={g.avatar} name={g.name} size={32} />
                <span className="picker-member-name">{g.name}</span>
                {g.count > 1 && <span className="wish-gifter-count">{g.count}장</span>}
              </button>
            ))}
          </div>
        )}

        <div className="wish-body">
          <textarea
            className="wish-input"
            placeholder="이루고 싶은 소원을 적어 보세요"
            value={wish}
            maxLength={MAX_WISH}
            onChange={(e) => setWish(e.target.value)}
            rows={4}
          />
        </div>

        <button type="button" className="btn btn-primary btn-block" onClick={grant} disabled={sending}>
          {sending ? '비는 중…' : '소원 빌기'}
        </button>
      </div>
    </Modal>
  )
}
