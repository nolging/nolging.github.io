import { useEffect, useRef, useState } from 'react'

// 하단에서 올라오는 시트. 배경(어둡게) 탭 또는 아래로 드래그하면 닫힘.
export default function BottomSheet({ open, onClose, children }) {
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(false)
  const [dragY, setDragY] = useState(0)
  const startY = useRef(null)

  useEffect(() => {
    let raf, timer
    if (open) {
      setMounted(true)
      raf = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
    } else {
      setShown(false)
      timer = setTimeout(() => setMounted(false), 280)
    }
    return () => { if (raf) cancelAnimationFrame(raf); if (timer) clearTimeout(timer) }
  }, [open])

  useEffect(() => { if (shown) setDragY(0) }, [shown])

  function onTouchStart(e) { startY.current = e.touches[0].clientY }
  function onTouchMove(e) {
    if (startY.current == null) return
    const dy = e.touches[0].clientY - startY.current
    setDragY(dy > 0 ? dy : 0)
  }
  function onTouchEnd() {
    if (dragY > 90) onClose()
    else setDragY(0)
    startY.current = null
  }

  if (!mounted) return null

  return (
    <div className={`sheet-root ${shown ? 'shown' : ''}`}>
      <div className="sheet-backdrop" onClick={onClose} />
      <div
        className={`sheet ${dragY ? 'dragging' : ''}`}
        style={dragY ? { transform: `translateY(${dragY}px)` } : undefined}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="sheet-handle" />
        {children}
      </div>
    </div>
  )
}
