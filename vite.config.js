import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 프로덕션 빌드에만 CSP meta 를 주입(개발 서버는 HMR/eval 이 필요해 제외).
// 균형형: 인라인 스크립트/eval/javascript: 는 차단하되, 앱이 임베드하는
// 유튜브·사운드클라우드 등 외부 https 스크립트/프레임/이미지는 허용해 기능이 깨지지 않게 함.
function cspPlugin() {
  const csp = [
    "default-src 'self'",
    "script-src 'self' https:",              // 인라인/eval/javascript: 차단, 외부 https 스크립트(YT/SC API)는 허용
    "style-src 'self' 'unsafe-inline'",       // style={{...}} 인라인 스타일 다수 사용
    "img-src 'self' data: blob: https:",      // 아바타(data), 업로드 미리보기(blob), 외부 포스터(https)
    "font-src 'self' data:",                  // self-host woff2
    "connect-src 'self' https: wss:",         // Supabase REST(https) + Realtime(wss)
    "frame-src https:",                       // 유튜브/사운드클라우드 iframe
    "media-src 'self' https: data: blob:",
    "worker-src 'self' blob:",                // 서비스워커(same-origin)
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
  return {
    name: 'inject-csp',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (ctx.server) return html // 개발 서버에는 주입하지 않음
        return {
          html,
          tags: [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: csp }, injectTo: 'head-prepend' }],
        }
      },
    },
  }
}

// nolging.github.io 는 조직/사용자 루트 페이지이므로 base 는 '/'
export default defineConfig({
  plugins: [react(), cspPlugin()],
  base: '/',
})
