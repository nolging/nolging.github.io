# Nolging 인수인계 (다른 기기/세션에서 이어가기용)

> 이 문서는 새 Claude Code 세션(웹/모바일/다른 PC)이 맥락 없이도 작업을 이어갈 수 있도록 현재 상태를 정리한 것입니다.

## 한 줄 요약
그룹별 태스크 관리 웹앱. **React+Vite + Supabase(Auth/Postgres/RLS/Edge Functions)**, GitHub Pages 자동배포. 라이브: https://nolging.github.io

## 라이브/인프라
- 사이트: https://nolging.github.io (repo `nolging/nolging.github.io`, `main` push 시 `.github/workflows/deploy.yml` 로 자동배포)
- Supabase 프로젝트 ref: `iqtaejiidkpnlfmqipmy` · URL `https://iqtaejiidkpnlfmqipmy.supabase.co`
- GitHub Actions Secrets 설정됨: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_EMAIL_DOMAIN`
- 관리자 계정 존재: 아이디 `admin` (비밀번호는 소유자 보관)

## 인증 모델 (특이)
- 오픈 가입 없음. 사용자는 **아이디 + 비밀번호**로 로그인 → 내부적으로 `아이디@nolging.app` 합성 이메일로 Supabase Auth 처리 (`src/lib/supabase.js` 의 `nicknameToEmail`, `VITE_EMAIL_DOMAIN`).
- `profiles.nickname` = 로그인 아이디(구조상 컬럼명은 nickname 유지, UI 라벨만 "아이디").
- 가입요청 → `admin-create-user` Edge Function `action:'request'`(공개)로 `status='pending'` 사용자 생성 → 관리자 승인(`set-status active`)/거절(`delete`). 관리자 직접 생성은 `action:'create'`.
- 프라이버시: `profiles.contact/birthdate` 는 anon/authenticated 에서 **SELECT 권한 revoke** → RPC(`my_profile`,`update_my_profile`,`group_member_cards`,`admin_list_users`)로만 조건부 노출. **프론트에서 profiles 를 `select('*')` 하면 깨짐 → 컬럼 명시 필수.**

## 데이터 모델
- `profiles`(id, nickname=아이디, role admin/member, status active/disabled/pending, contact, birthdate)
- `groups`(name, description, invite_code, owner_id, group_type nolging/ilhaging, theme solo/friend/couple/together, show_contact, show_birthdate)
- `group_members`(group_id, user_id, role owner/member, display_nickname=그룹내닉네임, avatar_url=data URI, show_contact, show_birthdate)
- `tasks`(group_id, title, description, status open/accepted/done, created_by, assignee_id, *_at)
- 테마 규칙: 놀깅→혼자/친구/연인, 일하깅→혼자/같이 (`src/lib/constants.js`)
- 연락처/생일은 **그룹설정 공개 AND 개인설정 공개 둘 다 Y** 일 때만 타인에게 노출.

## 핵심 파일
- 프론트: `src/lib/api.js`(모든 쿼리), `src/context/AuthContext.jsx`, `src/pages/*`, `src/components/*`
- 백엔드: `supabase/schema.sql`(v1), `supabase/schema-v2.sql`(v2 마이그레이션), `supabase/functions/admin-create-user/index.ts`

## 로컬 실행 (새 환경)
```bash
npm install
cp .env.example .env.local   # 아래 값 입력 (anon 키/URL 은 공개 안전)
npm run dev
```
`.env.local`:
```
VITE_SUPABASE_URL=https://iqtaejiidkpnlfmqipmy.supabase.co
VITE_SUPABASE_ANON_KEY=<Supabase 대시보드 > Settings > API 의 anon public 키>
VITE_EMAIL_DOMAIN=nolging.app
```
> Node 20 필요. 이 프로젝트를 처음 만든 맥은 brew/Node 부재로 `~/.local` 에 수동 설치했음. 표준 환경(웹/클라우드)에선 그냥 `npm install` 이면 됨.

## DB/함수 변경 방법
- **스키마 변경(DDL)**: Supabase SQL Editor 에 `schema.sql`→`schema-v2.sql` 순서로 실행. (또는 Supabase Personal Access Token 으로 Management API `POST /v1/projects/iqtaejiidkpnlfmqipmy/database/query` 에 SQL 전송 — idempotent)
- **Edge Function 배포**: `SUPABASE_ACCESS_TOKEN=<PAT> supabase functions deploy admin-create-user --project-ref iqtaejiidkpnlfmqipmy --no-verify-jwt` (Docker 불필요)

## 알아둘 함정(이미 해결/주의)
- 비관리자 그룹 생성 시 RETURNING 이 `groups_select`(USING)로도 평가되는데 `is_group_member()` 가 STABLE 이라 같은 문장 트리거의 소유자 멤버십을 못 봄 → `groups_select` 에 `owner_id = auth.uid()` 추가로 해결(적용됨).
- GitHub Pages 는 **같은 커밋 SHA 로 재배포하면 활성화 안 됨** → 재배포 시 새 커밋 필요.
- 딥링크(`/admin` 등) 직접 접속은 HTTP 404 로 뜨지만 `404.html`(index 복사본)로 앱이 로드됨(SPA 표준 동작).

## 다음 후보(백로그)
- 태스크 마감일/정렬/필터, 실시간 업데이트(Supabase Realtime), 담당자 지정/내 태스크 대시보드, 댓글/활동로그, 알림.
- 아바타를 data URI 대신 Supabase Storage 로 이전(대용량/성능).
- 브랜드 "놀기ㅇ" 스타일 확정(현재 마지막 ㅇ만 강조색).
