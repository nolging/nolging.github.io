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
      setMounted(true); setDragY(0)
      raf = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
    } else {
      // 드래그 위치를 0으로 되돌려 항상 base(translateY 100%)까지 쭉 슬라이드다운.
      // 언마운트는 슬라이드(.28s)가 끝난 뒤에(버퍼 포함) → 도중에 끊겨 사라지지 않게.
      setShown(false); setDragY(0)
      timer = setTimeout(() => setMounted(false), 340)
    }
    return () => { if (raf) cancelAnimationFrame(raf); if (timer) clearTimeout(timer) }
  }, [open])

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
