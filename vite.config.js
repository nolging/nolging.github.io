import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// nolging.github.io 는 조직/사용자 루트 페이지이므로 base 는 '/'
export default defineConfig({
  plugins: [react()],
  base: '/',
})
