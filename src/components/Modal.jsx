import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

// 화면 가운데 뜨는 모달. 배경(어둡게) 탭 또는 Esc 로 닫힘.
export default function Modal({ open, onClose, children, title, cardClassName = '', below = null }) {
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(false)

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

  if (!mounted) return null

  const card = (
    <div className={`modal-card ${cardClassName}`} role="dialog" aria-modal="true">
      {title && <h3 className="modal-title">{title}</h3>}
      {children}
    </div>
  )

  return createPortal(
    <div className={`modal-root ${shown ? 'shown' : ''}`}>
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
