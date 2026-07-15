import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import Avatar from './Avatar'
import Modal from './Modal'
import { listMyGroups } from '../lib/api'

// 그룹 → 멤버 선택 모달. "선택" 시 onPick 호출:
//   { groupId, groupName, userId, name, avatar, myName, myAvatar }
// - 그룹 목록: 내가 가입돼 있고 나 이외 멤버가 있는 그룹만
// - 멤버 목록: 아바타 + 닉네임 (탭해서 선택)
// 추가 옵션:
//  - excludeGroupIds: 선택 목록에서 제외할 그룹(예: 이미 커플/우정 링 적용된 그룹)
//  - mode: 'friend' 면 그룹 단위 선택(멤버 선택 없음). onPick 에 groupWide/members 포함
export default function RecipientPicker({ open, onClose, onPick, title = '받는 사람', excludeGroupIds = [], mode = null }) {
  const { user } = useAuth()
  const myId = user?.id
  const [groups, setGroups] = useState([])
  const [groupId, setGroupId] = useState('')
  const [memberId, setMemberId] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // 그룹 목록 로드. 실패해도 이전 목록은 유지(깜빡임 방지)하고, 성공 시에만 교체.
  const loadGroups = useCallback(() => {
    setLoading(true); setError('')
    return listMyGroups()
      .then((gs) => { setGroups(gs); setLoaded(true) })
      .catch((e) => setError(e.message || '그룹을 불러오지 못했어요.'))
      .finally(() => setLoading(false))
  }, [])

  // 열 때마다 최신화(백그라운드 후 재개 시 캐시가 비어 있거나 실패했던 경우 회복).
  useEffect(() => { if (open) loadGroups() }, [open, loadGroups])

  // 앱이 백그라운드에서 돌아오면(재개) 열려 있는 동안 다시 불러온다.
  useEffect(() => {
    if (!open) return
    const onResume = () => { if (document.visibilityState === 'visible') loadGroups() }
    document.addEventListener('visibilitychange', onResume)
    window.addEventListener('focus', onResume)
    return () => {
      document.removeEventListener('visibilitychange', onResume)
      window.removeEventListener('focus', onResume)
    }
  }, [open, loadGroups])

  // 닫으면 선택 초기화 (그룹 목록 캐시는 유지)
  useEffect(() => {
    if (!open) { setGroupId(''); setMemberId(''); setError('') }
  }, [open])

  const memberName = (m) => m.display_nickname || '멤버'   // 아이디는 타인에게 노출 안 함

  // 내가 가입돼 있고, 나 이외 멤버가 존재하는 그룹만. (+ 제외 목록 필터)
  const isFriendMode = mode === 'friend'
  const exclude = useMemo(() => new Set(excludeGroupIds || []), [excludeGroupIds])
  const eligibleGroups = useMemo(() => groups.filter((g) => {
    if (exclude.has(g.id)) return false
    const ms = g.group_members || []
    return ms.some((m) => m.user_id === myId) && ms.some((m) => m.user_id !== myId)
  }), [groups, myId, exclude])

  // 그룹 선택 시: 나 외 멤버가 한 명뿐이면 자동 선택(추가 클릭 없이 '선택'만 누르면 됨),
  // 여러 명이면 초기화해 직접 고르게 한다. (eligibleGroups 정의 이후에 두어 TDZ 방지)
  useEffect(() => {
    const g = eligibleGroups.find((x) => x.id === groupId)
    const others = (g?.group_members || []).filter((m) => m.user_id !== myId)
    setMemberId(others.length === 1 ? others[0].user_id : '')
  }, [groupId, eligibleGroups, myId])

  // 로딩/에러/실제 없음을 구분해 표시 (일시적 실패를 "그룹 없음"으로 오인하지 않게)
  const notReady = loading || !myId
  const groupPlaceholder = eligibleGroups.length ? '그룹 선택'
    : notReady ? '불러오는 중…'
    : error ? '불러오지 못했어요'
    : loaded ? '보낼 수 있는 그룹이 없어요'
    : '불러오는 중…'

  const group = eligibleGroups.find((g) => g.id === groupId)
  const members = group?.group_members || []
  const others = members.filter((m) => m.user_id !== myId)
  const myMember = members.find((m) => m.user_id === myId)

  function confirm() {
    if (!group) return
    const common = {
      groupId: group.id,
      groupName: group.name,
      myName: myMember ? memberName(myMember) : '',
      myAvatar: myMember?.avatar_url || null,
    }
    if (isFriendMode) {
      // 그룹 단위: 멤버 전원(나 제외) 정보 전달
      onPick({
        ...common,
        groupWide: true,
        members: others.map((m) => ({ userId: m.user_id, name: memberName(m), avatar: m.avatar_url || null })),
      })
      return
    }
    const m = others.find((x) => x.user_id === memberId)
    if (!m) return
    onPick({ ...common, userId: m.user_id, name: memberName(m), avatar: m.avatar_url || null })
  }

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="note-pick">
        {error && (
          <div className="alert alert-error">
            {error}
            <button type="button" className="btn btn-sm picker-retry" onClick={loadGroups} disabled={loading}>
              {loading ? '불러오는 중…' : '다시 시도'}
            </button>
          </div>
        )}

        <label className="field">
          <span>그룹</span>
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)} disabled={notReady}>
            <option value="">{groupPlaceholder}</option>
            {eligibleGroups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </label>

        {groupId && isFriendMode && (
          <div className="field">
            <span>받는 사람</span>
            <div className="picker-friend-note">
              그룹 전체({others.length}명)에게 우정 링 쪽지를 보내요.
            </div>
          </div>
        )}

        {groupId && !isFriendMode && (
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
          <button type="button" className="btn btn-primary" onClick={confirm} disabled={!groupId || (!isFriendMode && !memberId)}>
            선택
          </button>
        </div>
      </div>
    </Modal>
  )
}
