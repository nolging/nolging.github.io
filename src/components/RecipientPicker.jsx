import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import Avatar from './Avatar'
import Modal from './Modal'
import { listMyGroups } from '../lib/api'

// 그룹 → 멤버 선택 모달. "선택" 시 onPick 호출:
//   { groupId, groupName, userId, name, avatar, myName, myAvatar }
// - 그룹 목록: 내가 가입돼 있고 나 이외 멤버가 있는 그룹만
// - 멤버 목록: 아바타 + 닉네임 (탭해서 선택)
export default function RecipientPicker({ open, onClose, onPick, title = '받는 사람' }) {
  const { user } = useAuth()
  const myId = user?.id
  const [groups, setGroups] = useState([])
  const [groupId, setGroupId] = useState('')
  const [memberId, setMemberId] = useState('')
  const [error, setError] = useState('')

  // 최초 오픈 시 내 그룹 목록 로드 (각 그룹의 전체 멤버 포함)
  useEffect(() => {
    if (!open || groups.length) return
    listMyGroups().then(setGroups).catch((e) => setError(e.message))
  }, [open, groups.length])

  // 닫으면 선택 초기화 (그룹 목록 캐시는 유지)
  useEffect(() => {
    if (!open) { setGroupId(''); setMemberId(''); setError('') }
  }, [open])

  useEffect(() => { setMemberId('') }, [groupId])

  const memberName = (m) => m.display_nickname || m.profiles?.nickname || '?'

  // 내가 가입돼 있고, 나 이외 멤버가 존재하는 그룹만
  const eligibleGroups = useMemo(() => groups.filter((g) => {
    const ms = g.group_members || []
    return ms.some((m) => m.user_id === myId) && ms.some((m) => m.user_id !== myId)
  }), [groups, myId])

  const group = eligibleGroups.find((g) => g.id === groupId)
  const members = group?.group_members || []
  const others = members.filter((m) => m.user_id !== myId)
  const myMember = members.find((m) => m.user_id === myId)

  function confirm() {
    const m = others.find((x) => x.user_id === memberId)
    if (!group || !m) return
    onPick({
      groupId: group.id,
      groupName: group.name,
      userId: m.user_id,
      name: memberName(m),
      avatar: m.avatar_url || null,
      myName: myMember ? memberName(myMember) : '',
      myAvatar: myMember?.avatar_url || null,
    })
  }

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="note-pick">
        {error && <div className="alert alert-error">{error}</div>}

        <label className="field">
          <span>그룹</span>
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">
              {eligibleGroups.length ? '그룹 선택' : '보낼 수 있는 그룹이 없어요'}
            </option>
            {eligibleGroups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </label>

        {groupId && (
          <div className="field">
            <span>멤버</span>
            <div className="picker-members">
              {others.map((m) => (
                <button
                  type="button"
                  key={m.user_id}
                  className={`picker-member ${memberId === m.user_id ? 'active' : ''}`}
                  onClick={() => setMemberId(m.user_id)}
                >
                  <Avatar src={m.avatar_url} name={memberName(m)} size={36} />
                  <span className="picker-member-name">{memberName(m)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

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
