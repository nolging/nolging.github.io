import { useNavigate } from 'react-router-dom'
import Avatar from './Avatar'
import { openMember } from '../lib/memberModal'

// 단일(겹치지 않은) 멤버 아바타 → 클릭 시 그 멤버 상세로 이동.
// 카드/링크 안에 있어도 동작하도록 이벤트 전파를 막는다. userId/groupId 없으면 일반 아바타.
export default function MemberAvatarBtn({ groupId, userId, src, name, size, deco }) {
  const navigate = useNavigate()
  if (!userId || !groupId) return <Avatar src={src} name={name} size={size} deco={deco} />
  const go = (e) => { e.preventDefault(); e.stopPropagation(); openMember(navigate, groupId, userId) }
  return (
    <span className="mavatar-btn" role="button" tabIndex={0} aria-label={`${name || '멤버'} 정보`}
      onClick={go} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(e) } }}>
      <Avatar src={src} name={name} size={size} deco={deco} />
    </span>
  )
}
