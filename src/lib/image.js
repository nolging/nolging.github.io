// 업로드 이미지를 정방형으로 크롭 + 축소해 캔버스로 렌더 후 콜백 실행.
function drawSquare(file, size, cb, reject) {
  if (!file.type.startsWith('image/')) return reject(new Error('이미지 파일만 업로드할 수 있습니다.'))
  const img = new Image()
  const url = URL.createObjectURL(file)
  img.onload = () => {
    URL.revokeObjectURL(url)
    const side = Math.min(img.width, img.height)
    const sx = (img.width - side) / 2
    const sy = (img.height - side) / 2
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size)
    cb(canvas)
  }
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지를 불러올 수 없습니다.')) }
  img.src = url
}

// 정방형 크롭 + 축소된 JPEG data URI (레거시/미리보기용)
export function fileToSquareDataURL(file, size = 512, quality = 0.85) {
  return new Promise((resolve, reject) => {
    drawSquare(file, size, (canvas) => resolve(canvas.toDataURL('image/jpeg', quality)), reject)
  })
}

// 정방형 크롭 + 축소된 JPEG Blob (스토리지 업로드용). 스토리지엔 base64 오버헤드가
// 없으므로 상세 화면 선명도를 위해 기본 해상도를 넉넉히 잡는다.
export function fileToSquareBlob(file, size = 768, quality = 0.85) {
  return new Promise((resolve, reject) => {
    drawSquare(file, size, (canvas) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('이미지 처리에 실패했습니다.'))),
        'image/jpeg', quality,
      )
    }, reject)
  })
}
