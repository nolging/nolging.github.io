import { useEffect, useRef, useState, useCallback } from 'react'
import Modal from './Modal'

// 앨범에서 고른 사진을 정방형으로 직접 크롭(이동·확대)해서 Blob 으로 돌려준다.
// 아바타는 원형이라 정방형만 크롭하며, 프레임 안에 원형 가이드를 함께 보여 준다.
const OUT = 768        // 출력 해상도(정방형)
const QUALITY = 0.85

export default function ImageCropModal({ file, onCancel, onCropped, onError }) {
  const open = !!file
  const frameRef = useRef(null)
  const [url, setUrl] = useState('')
  const [img, setImg] = useState(null)      // HTMLImageElement
  const [frame, setFrame] = useState(0)     // 프레임 한 변(px)
  const [minScale, setMinScale] = useState(1)
  const [scale, setScale] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 }) // 이미지 좌상단의 프레임 내 좌표(px)
  const [busy, setBusy] = useState(false)
  const scaleRef = useRef(scale); scaleRef.current = scale
  const ptrs = useRef(new Map())            // pointerId -> {x,y} (드래그·핀치)
  const gestureRef = useRef(null)           // 직전 핀치 상태 {dist, cx, cy}

  // 파일 → 이미지 로드
  useEffect(() => {
    if (!file) { setImg(null); setUrl(''); return }
    setBusy(false); ptrs.current.clear(); gestureRef.current = null
    const u = URL.createObjectURL(file)
    setUrl(u)
    const im = new Image()
    im.onload = () => setImg(im)
    im.onerror = () => { onError?.('이미지를 불러올 수 없습니다.'); onCancel?.() }
    im.src = u
    return () => URL.revokeObjectURL(u)
  }, [file]) // eslint-disable-line react-hooks/exhaustive-deps

  // 프레임 크기 측정(반응형)
  useEffect(() => {
    if (!open) return
    const measure = () => { const el = frameRef.current; if (el) setFrame(el.clientWidth) }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [open, img])

  // 이미지·프레임 준비되면 cover 배율로 초기화(가운데 정렬)
  useEffect(() => {
    if (!img || !frame) return
    const ms = Math.max(frame / img.width, frame / img.height)
    setMinScale(ms); setScale(ms)
    setPos({ x: (frame - img.width * ms) / 2, y: (frame - img.height * ms) / 2 })
  }, [img, frame])

  // 이미지가 항상 프레임을 덮도록 위치 제한
  const clamp = useCallback((p, s) => {
    if (!img || !frame) return p
    const w = img.width * s, h = img.height * s
    return {
      x: Math.min(0, Math.max(frame - w, p.x)),
      y: Math.min(0, Math.max(frame - h, p.y)),
    }
  }, [img, frame])

  const clampScale = useCallback((v) => Math.max(minScale, Math.min(minScale * 6, v)), [minScale])

  // (cx,cy) 프레임 좌표를 기준으로 배율을 ns 로 바꾸고, 추가 이동(panDx,panDy)을 더한다
  const applyZoom = useCallback((ns, cx, cy, panDx = 0, panDy = 0) => {
    setPos((p) => {
      const s = scaleRef.current
      const sx = (cx - p.x) / s, sy = (cy - p.y) / s
      return clamp({ x: cx - sx * ns + panDx, y: cy - sy * ns + panDy }, ns)
    })
    scaleRef.current = ns
    setScale(ns)
  }, [clamp])

  const frameRect = () => frameRef.current?.getBoundingClientRect() || { left: 0, top: 0 }

  // ---- 포인터(드래그 1개 / 핀치 2개) ----
  function onDown(e) {
    e.currentTarget.setPointerCapture?.(e.pointerId)
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    gestureRef.current = null
  }
  function onMove(e) {
    if (!ptrs.current.has(e.pointerId)) return
    const prev = ptrs.current.get(e.pointerId)
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const pts = [...ptrs.current.values()]
    if (pts.length >= 2) {
      const [a, b] = pts
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const r = frameRect()
      const cx = (a.x + b.x) / 2 - r.left, cy = (a.y + b.y) / 2 - r.top
      const g = gestureRef.current
      if (g && g.dist) applyZoom(clampScale(scaleRef.current * (dist / g.dist)), cx, cy, cx - g.cx, cy - g.cy)
      gestureRef.current = { dist, cx, cy }
    } else {
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y
      setPos((p) => clamp({ x: p.x + dx, y: p.y + dy }, scaleRef.current))
    }
  }
  function onUp(e) { ptrs.current.delete(e.pointerId); gestureRef.current = null }

  function onWheel(e) {
    if (!img || !frame) return
    e.preventDefault()
    const r = frameRect()
    const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08
    applyZoom(clampScale(scaleRef.current * factor), e.clientX - r.left, e.clientY - r.top)
  }
  function onZoomSlider(e) { applyZoom(clampScale(Number(e.target.value)), frame / 2, frame / 2) }

  async function confirm() {
    if (!img || !frame || busy) return
    setBusy(true)
    try {
      let sSize = frame / scale
      let sx = -pos.x / scale, sy = -pos.y / scale
      // 부동소수 오차로 이미지 경계를 넘지 않게 보정
      sSize = Math.min(sSize, img.width, img.height)
      sx = Math.max(0, Math.min(sx, img.width - sSize))
      sy = Math.max(0, Math.min(sy, img.height - sSize))
      const canvas = document.createElement('canvas')
      canvas.width = OUT; canvas.height = OUT
      const ctx = canvas.getContext('2d')
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, OUT, OUT)
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', QUALITY))
      if (!blob) throw new Error('이미지 처리에 실패했습니다.')
      await onCropped(blob)
    } catch (err) { onError?.(err.message); setBusy(false) }
  }

  return (
    <Modal open={open} onClose={busy ? undefined : onCancel} cardClassName="crop-modal-card">
      <div className="crop-modal">
        <div className="crop-title">사진 편집</div>
        <div className="crop-hint">드래그로 위치, 확대해서 정방형으로 잘라요</div>
        <div ref={frameRef} className="crop-frame" onWheel={onWheel}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          {img && frame > 0 && (
            <img src={url} alt="" className="crop-img" draggable="false"
              style={{ width: img.width * scale, height: img.height * scale, transform: `translate(${pos.x}px, ${pos.y}px)` }} />
          )}
          <div className="crop-guide" aria-hidden="true" />
          {!img && <div className="crop-loading"><span className="spinner" /></div>}
        </div>
        <input type="range" className="crop-zoom" min={minScale} max={minScale * 6} step="any"
          value={scale} onChange={onZoomSlider} aria-label="확대" />
        <div className="crop-actions">
          <button type="button" className="crop-btn ghost" onClick={onCancel} disabled={busy}>취소</button>
          <button type="button" className="crop-btn primary" onClick={confirm} disabled={busy || !img}>
            {busy ? '적용 중…' : '적용'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
