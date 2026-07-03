#!/usr/bin/env bash
# Claude Code on the web / 클라우드 개발환경용 셋업 스크립트.
# 클라우드 환경의 "setup script" 필드에 아래 한 줄을 넣으면 됩니다:
#     bash scripts/cloud-setup.sh
#
# 필요한 환경변수(클라우드 환경 설정의 Environment Variables 에 등록):
#   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_EMAIL_DOMAIN
# (anon 키/URL 은 공개되어도 안전 — RLS 로 보호됨)
set -euo pipefail

echo "▶ 의존성 설치 (npm ci)"
if [ -f package-lock.json ]; then npm ci; else npm install; fi

echo "▶ .env.local 생성 (환경변수에서)"
cat > .env.local <<EOF
VITE_SUPABASE_URL=${VITE_SUPABASE_URL:-https://iqtaejiidkpnlfmqipmy.supabase.co}
VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY:-}
VITE_EMAIL_DOMAIN=${VITE_EMAIL_DOMAIN:-nolging.app}
EOF

if [ -z "${VITE_SUPABASE_ANON_KEY:-}" ]; then
  echo "⚠  VITE_SUPABASE_ANON_KEY 가 비어 있습니다. Supabase 대시보드 > Settings > API 의 anon public 키를 환경변수에 넣으세요."
fi

echo "✅ 셋업 완료. 개발서버:  npm run dev   /   빌드:  npm run build"
