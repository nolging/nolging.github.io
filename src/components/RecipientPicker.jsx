import { useEffect, useState } from 'react'
import Modal from './Modal'
import { listMyGroups, listMemberCards } from '../lib/api'

// 그룹 → 멤버 선택 모달. "선택" 시 onPick 호출:
//   { groupId, groupName, userId, name, myName }
// myName = 그 그룹에서의 내 표시 닉네임 (쪽지 From. 자동 채움용)
export default function RecipientPicker({ open, onClose, onPick, title = '받는 사람' }) {
  const [groups, setGroups] = useState([])
  const [groupId, setGroupId] = useState('')
  const [cards, setCards] = useState([])
  const [memberId, setMemberId] = useState('')
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [error, setError] = useState('')

  // 최초 오픈 시 내 그룹 목록 로드
  useEffect(() => {
    if (!open || groups.length) return
    listMyGroups().then(setGroups).catch((e) => setError(e.message))
  }, [open, groups.length])

  // 모달을 닫으면 멤버 선택 초기화 (그룹 목록은 캐시 유지)
  useEffect(() => {
    if (!open) { setGroupId(''); setMemberId(''); setCards([]); setError('') }
  }, [open])

  // 그룹 선택 시 멤버 카드 로드
  useEffect(() => {
    if (!groupId) { setCards([]); setMemberId(''); return }
    let on = true
    setLoadingMembers(true)
    setMemberId('')
    listMemberCards(groupId)
      .then((rows) => { if (on) setCards(rows) })
      .catch((e) => { if (on) setError(e.message) })
      .finally(() => { if (on) setLoadingMembers(false) })
    return () => { on = false }
  }, [groupId])

  const myCard = cards.find((c) => c.is_self)
  const others = cards.filter((c) => !c.is_self)

  function confirm() {
    const g = groups.find((x) => x.id === groupId)
    const m = cards.find((c) => c.user_id === memberId)
    if (!g || !m) return
    onPick({
      groupId: g.id,
      groupName: g.name,
      userId: m.user_id,
      name: m.display_nickname,
      myName: myCard?.display_nickname || '',
    })
  }

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="note-pick">
        {error && <div className="alert alert-error">{error}</div>}

        <label className="field">
          <span>그룹</span>
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">그룹 선택</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>멤버</span>
          <select
            value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
            disabled={!groupId || loadingMembers}
          >
            <option value="">
              {loadingMembers ? '불러오는 중…' : !groupId ? '먼저 그룹을 선택하세요' : others.length ? '멤버 선택' : '보낼 수 있는 멤버가 없어요'}
            </option>
            {others.map((m) => (
              <option key={m.user_id} value={m.user_id}>{m.display_nickname}</option>
            ))}
          </select>
        </label>

        <div className="note-pick-actions">
          <button type="button" className="btn" onClick={onClose}>취소</button>
          <button type="button" className="btn btn-primary" onClick={confirm} disabled={!groupId || !memberId}>
            선택
          </button>
        </div>
      </div>
    </Modal>
  )
}
