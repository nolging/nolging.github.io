import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import Avatar from './Avatar'
import { openMember } from '../lib/memberModal'

// 겹쳐진 참여자 아바타 묶음 → 클릭 시 멤버 목록 드롭다운(아바타+닉네임). 한 명 고르면 그 멤버 상세로.
// 참여자가 1명이면 드롭다운 없이 바로 그 멤버 상세로 이동. 카드/링크 안에서도 동작(전파 차단).
export default function MemberStack({ groupId, userIds = [], nameOf, avatarOf, decoOf, size = 24, max = 3, singleName = false }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const triggerRef = useRef(null)
  const ids = userIds.filter(Boolean)
  const extra = ids.length - max

  const place = useCallback(() => {
    const el = triggerRef.current; if (!el) return
    const r = el.getBoundingClientRect()
    const W = 210
    const h = Math.min(ids.length, 6) * 44 + 12
    let left = Math.max(8, Math.min(r.right - W, window.innerWidth - W - 8))
    let top = r.bottom + 6
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - 6 - h) // 아래 공간 부족 시 위로
    setPos({ top, left, width: W })
  }, [ids.length])

  useEffect(() => {
    if (!open) return
    place()
    const close = () => setOpen(false)
    const onDoc = (e) => { if (!triggerRef.current?.contains(e.target) && !e.target.closest?.('.mstack-menu')) setOpen(false) }
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    document.addEventListener('pointerdown', onDoc)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      document.removeEventListener('pointerdown', onDoc)
    }
  }, [open, place])

  const toggle = (e) => {
    e.preventDefault(); e.stopPropagation()
    if (ids.length <= 1) { if (ids[0]) openMember(navigate, groupId, ids[0]); return }
    setOpen((v) => !v)
  }
  const goMember = (uid) => (e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); openMember(navigate, groupId, uid) }

  return (
    <>
      <span ref={triggerRef} className={`task-parts mstack-trigger ${ids.length > 1 ? 'multi' : ''}`}
        role="button" tabIndex={0} aria-label="참여자 보기"
        onClick={toggle} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggle(e) }}>
        {ids.slice(0, max).map((uid) => <Avatar key={uid} src={avatarOf(uid)} name={nameOf(uid)} size={size} deco={decoOf?.(uid)} />)}
        {extra > 0 && <span className="task-parts-more">+{extra}</span>}
        {singleName && ids.length === 1 && <span className="task-author-name">{nameOf(ids[0])}</span>}
      </span>
      {open && pos && createPortal(
        <div className="mstack-menu" role="menu" style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width }}
          onClick={(e) => e.stopPropagation()}>
          {ids.map((uid) => (
            <button type="button" key={uid} className="mstack-item" role="menuitem" onClick={goMember(uid)}>
              <Avatar src={avatarOf(uid)} name={nameOf(uid)} size={26} />
              <span className="mstack-name">{nameOf(uid)}</span>
            </button>
          ))}
        </div>, document.body)}
    </>
  )
}
