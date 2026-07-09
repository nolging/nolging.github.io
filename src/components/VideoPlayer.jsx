// 비디오 테이프: 유튜브 영상을 그대로(화면에) 재생
export function parseVideoUrl(url) {
  if (!url) return null
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/|live\/))([\w-]{11})/)
  if (yt) return { kind: 'youtube', id: yt[1] }
  return null
}

export default function VideoPlayer({ url }) {
  const parsed = parseVideoUrl(url)
  if (!parsed) {
    return <a className="music-fallback" href={url} target="_blank" rel="noreferrer noopener">🔗 링크 열기</a>
  }
  const src = `https://www.youtube.com/embed/${parsed.id}?rel=0&modestbranding=1&playsinline=1`
  return (
    <div className="video-player">
      <iframe title="영상" src={src} frameBorder="0" allowFullScreen
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" />
    </div>
  )
}
