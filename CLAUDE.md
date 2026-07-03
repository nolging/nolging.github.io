# Nolging — 프로젝트 가이드 (Claude 자동 로드)

그룹별 태스크 관리 웹앱. **React + Vite + Supabase(Auth/Postgres/RLS/Edge Functions)**, GitHub Pages 자동배포.
라이브: https://nolging.github.io

> **먼저 [docs/HANDOFF.md](docs/HANDOFF.md) 를 읽으세요.** 현재 상태·아키텍처·DB 스키마·설정·주의사항·백로그가 모두 정리돼 있습니다.

## 명령
```bash
npm install      # 최초 (클라우드는 SessionStart 훅이 자동 실행)
npm run dev      # 개발 서버
npm run build    # 프로덕션 빌드
```

## 필수 규칙 / 함정 (꼭 지킬 것)
- **`profiles` 를 `select('*')` 하지 말 것.** `contact`/`birthdate` 컬럼은 SELECT 권한이 revoke 되어 있어 `*` 조회가 실패함. 필요한 컬럼만 명시하거나 RPC(`my_profile` 등) 사용.
- 로그인은 **아이디(=profiles.nickname) + 비밀번호** → 내부적으로 `아이디@nolging.app` 합성 이메일. (`src/lib/supabase.js`)
- 사용자 생성/상태변경은 프론트에서 직접 하지 말고 **Edge Function `admin-create-user`**(action: request|create|set-status|delete) 경유. RLS 상 profiles 쓰기는 service_role(함수)만.
- 연락처/생일 노출은 **그룹설정 공개 AND 개인설정 공개 둘 다 Y** 일 때만 (`group_member_cards` RPC).
- 스키마(DDL) 변경은 Supabase SQL Editor 또는 Management API 로 적용하고, `supabase/schema.sql` / `supabase/schema-v2.sql` 에도 반영.
- 배포: `main` 에 push 하면 자동 배포. GitHub Pages 는 **같은 커밋 SHA 재배포 시 활성화 안 됨** → 새 커밋 필요.

## 구조
- 프론트: `src/lib/api.js`(모든 쿼리), `src/context/AuthContext.jsx`, `src/pages/*`, `src/components/*`, `src/lib/constants.js`
- 백엔드: `supabase/schema.sql`, `supabase/schema-v2.sql`, `supabase/functions/admin-create-user/index.ts`

## 환경변수 (VITE_ 접두사)
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`(공개 안전), `VITE_EMAIL_DOMAIN=nolging.app`
클라우드 환경에선 환경변수로 등록 → SessionStart 훅(`scripts/cloud-setup.sh`)이 `.env.local` 생성.
