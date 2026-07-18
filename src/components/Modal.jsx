import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// 화면 가운데 뜨는 모달. 배경(어둡게) 탭 또는 Esc 로 닫힘.
export default function Modal({ open, onClose, children, title, cardClassName = '', below = null }) {
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    let raf, timer
    if (open) {
      setMounted(true)
      raf = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
    } else {
      setShown(false)
      timer = setTimeout(() => setMounted(false), 220)
    }
    return () => { if (raf) cancelAnimationFrame(raf); if (timer) clearTimeout(timer) }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // 키보드가 올라오면(visualViewport 축소) 모달 크기는 그대로 두고,
  // 남은 가시 영역의 가운데로 카드만 이동(--kb-shift)시킨다.
  useEffect(() => {
    if (!open || !mounted) return
    const vv = window.visualViewport
    if (!vv) return
    const apply = () => {
      const el = rootRef.current
      if (!el) return
      const shift = (vv.offsetTop + vv.height / 2) - (el.clientHeight / 2)
      el.style.setProperty('--kb-shift', `${shift}px`)
    }
    apply()
    vv.addEventListener('resize', apply)
    vv.addEventListener('scroll', apply)
    return () => {
      vv.removeEventListener('resize', apply)
      vv.removeEventListener('scroll', apply)
      rootRef.current?.style.removeProperty('--kb-shift')
    }
  }, [open, mounted])

  if (!mounted) return null

  const card = (
    <div className={`modal-card ${cardClassName}`} role="dialog" aria-modal="true">
      {title && <h3 className="modal-title">{title}</h3>}
      {children}
    </div>
  )

  return createPortal(
    <div ref={rootRef} className={`modal-root ${shown ? 'shown' : ''}`}>
      <div className="modal-backdrop" onClick={onClose} />
      {below ? (
        <div className="modal-stack">
          {card}
          <div className="modal-below">{below}</div>
        </div>
      ) : card}
    </div>,
    document.body,
  )
}
