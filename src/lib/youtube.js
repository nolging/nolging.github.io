// 유튜브 IFrame API 싱글턴 로더 (MiniPlayer/VideoPlayer/BlurayPlayer 공용)
let ytApiPromise = null
export function loadYT() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT)
  if (ytApiPromise) return ytApiPromise
  ytApiPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => { prev && prev(); resolve(window.YT) }
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const s = document.createElement('script')
      s.src = 'https://www.youtube.com/iframe_api'
      document.head.appendChild(s)
    }
  })
  return ytApiPromise
}

// 유튜브 URL → { kind:'youtube', id } (11자리 영상 ID)
export function parseVideoUrl(url) {
  if (!url) return null
  const yt = String(url).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/|live\/))([\w-]{11})/)
  if (yt) return { kind: 'youtube', id: yt[1] }
  return null
}
