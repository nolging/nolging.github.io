import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// 하단에서 올라오는 시트. 배경(어둡게) 탭 또는 아래로 드래그하면 닫힘.
export default function BottomSheet({ open, onClose, children }) {
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(false)
  const [dragY, setDragY] = useState(0)
  const startY = useRef(null)
  const sheetEl = useRef(null)

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

  // 내부 스크롤 영역(overflow-y:auto/scroll 이고 더 스크롤할 내용이 있는 요소) 탐색
  function scrollableAncestor(node) {
    let el = node
    while (el && el !== sheetEl.current) {
      if (el.scrollHeight > el.clientHeight + 1) {
        const oy = getComputedStyle(el).overflowY
        if (oy === 'auto' || oy === 'scroll') return el
      }
      el = el.parentElement
    }
    return null
  }
  function onTouchStart(e) { startY.current = e.touches[0].clientY }
  function onTouchMove(e) {
    if (startY.current == null) return
    // 목록을 스크롤 중(맨 위가 아님)이면 시트는 드래그하지 않고 스크롤만
    const sc = scrollableAncestor(e.target)
    if (sc && sc.scrollTop > 0) { startY.current = e.touches[0].clientY; if (dragY) setDragY(0); return }
    const dy = e.touches[0].clientY - startY.current
    setDragY(dy > 0 ? dy : 0)
  }
  function onTouchEnd() {
    if (dragY > 90) onClose()
    else setDragY(0)
    startY.current = null
  }

  if (!mounted) return null

  // document.body 로 포탈 → 스크롤 컨테이너(.content, iOS -webkit-overflow-scrolling)
  // 안에 갇혀 상단바를 못 덮는 문제 방지. 백드롭이 화면 전체(상단바 포함)를 덮어 어디를 눌러도 닫힘.
  return createPortal(
    <div className={`sheet-root ${shown ? 'shown' : ''}`}>
      <div className="sheet-backdrop" onClick={onClose} />
      <div
        ref={sheetEl}
        className={`sheet ${dragY ? 'dragging' : ''}`}
        style={dragY ? { transform: `translateY(${dragY}px)` } : undefined}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="sheet-handle" />
        {children}
      </div>
    </div>,
    document.body,
  )
}
