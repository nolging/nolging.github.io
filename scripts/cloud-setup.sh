#!/usr/bin/env bash
# Claude Code 클라우드/로컬 공용 셋업 (SessionStart 훅에서 실행).
# 로컬을 망가뜨리지 않도록 안전하게 동작:
#  - node_modules 없을 때만 의존성 설치
#  - .env.local 은 VITE_SUPABASE_ANON_KEY 환경변수가 있을 때(주로 클라우드)만 생성/갱신, 그 외엔 기존 파일 보존
#
# 클라우드 환경 설정:
#  - Environment Variables: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_EMAIL_DOMAIN
#  - (anon 키/URL 은 공개되어도 안전 — RLS 로 보호됨)
set -euo pipefail

if [ ! -d node_modules ]; then
  echo "▶ 의존성 설치"
  if [ -f package-lock.json ]; then npm ci; else npm install; fi
else
  echo "ℹ node_modules 존재 — 설치 건너뜀 (필요시 'npm ci' 수동 실행)"
fi

if [ -n "${VITE_SUPABASE_ANON_KEY:-}" ]; then
  echo "▶ .env.local 생성 (환경변수)"
  cat > .env.local <<EOF
VITE_SUPABASE_URL=${VITE_SUPABASE_URL:-https://iqtaejiidkpnlfmqipmy.supabase.co}
VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}
VITE_EMAIL_DOMAIN=${VITE_EMAIL_DOMAIN:-nolging.app}
EOF
elif [ -f .env.local ]; then
  echo "ℹ 기존 .env.local 유지"
else
  echo "⚠ .env.local 없음 — 클라우드 환경변수(VITE_SUPABASE_ANON_KEY 등) 등록 또는 'cp .env.example .env.local' 후 값 입력 필요"
fi

echo "✅ 셋업 완료.  개발서버: npm run dev  /  빌드: npm run build"
