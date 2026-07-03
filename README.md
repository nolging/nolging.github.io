# Nolging · 그룹 태스크 관리

그룹별로 태스크를 만들고, 멤버가 **수락 → 완료**하는 협업 웹 앱입니다.

- **인증**: 오픈 가입 없음. 관리자가 계정을 생성/승인하고, 사용자는 **닉네임 + 비밀번호**로 로그인.
- **그룹**: 생성 · 초대코드 공유 · 코드로 가입
- **태스크**: 작성(open) → 수락(accepted) → 완료(done)
- **스택**: React + Vite · Supabase(Postgres/Auth/RLS/Edge Functions) · GitHub Pages 배포

---

## 로컬 실행

```bash
npm install
cp .env.example .env.local   # 값 채우기 (아래 Supabase 설정 참고)
npm run dev
```

`http://localhost:5173` 접속.

---

## Supabase 설정 (최초 1회)

### 1) 프로젝트 생성
[supabase.com](https://supabase.com) 에서 프로젝트를 만들고, **Project Settings → API** 에서
`Project URL` 과 `anon public` 키를 복사합니다. `.env.local` 에 넣습니다:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
VITE_EMAIL_DOMAIN=nolging.app
```

> anon 키는 공개되어도 안전합니다(RLS 로 보호). `service_role` 키는 절대 프론트엔드에 넣지 마세요.

### 2) 데이터베이스 스키마 적용
**SQL Editor** 에서 [`supabase/schema.sql`](supabase/schema.sql) 전체를 붙여넣어 실행합니다.
(테이블 · RLS 정책 · `join_group()` 함수 · 트리거가 생성됩니다.)

### 3) Edge Function 배포 (관리자 사용자 생성)
관리자가 앱에서 사용자를 생성하려면 `service_role` 키가 필요한데, 이 키가 노출되지 않도록
Edge Function 안에서만 사용합니다.

```bash
# Supabase CLI 설치 후
supabase login
supabase link --project-ref <프로젝트-ref>
supabase functions deploy admin-create-user

# 함수에 시크릿 주입 (SUPABASE_URL/SERVICE_ROLE_KEY 는 대개 자동 제공됨)
supabase secrets set EMAIL_DOMAIN=nolging.app
```

### 4) 첫 관리자 만들기 (부트스트랩)
`profiles` 에 관리자가 한 명도 없으면, **최초 1회에 한해** 인증 없이 관리자 계정 생성이 허용됩니다.
앱 실행 후 `/admin` 이 아니라, 아래처럼 함수를 직접 호출하거나 잠깐 로그인 없이 만들 수 있습니다.

가장 간단한 방법 — 터미널에서:

```bash
curl -X POST "https://<프로젝트-ref>.functions.supabase.co/admin-create-user" \
  -H "Content-Type: application/json" \
  -d '{"nickname":"admin","password":"바꾸세요123","role":"admin"}'
```

이후에는 `admin` 닉네임/비밀번호로 로그인 → `/admin` 에서 다른 사용자들을 생성/승인합니다.

---

## GitHub Pages 배포

`main` 브랜치에 push 하면 [.github/workflows/deploy.yml](.github/workflows/deploy.yml) 이
빌드 후 `nolging.github.io` 로 자동 배포합니다.

1. GitHub 저장소 → **Settings → Pages → Build and deployment → Source = GitHub Actions**
2. GitHub 저장소 → **Settings → Secrets and variables → Actions** 에 아래 시크릿 추가:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_EMAIL_DOMAIN` (예: `nolging.app`)
3. push 하면 Actions 탭에서 배포 진행 상황 확인.

---

## 데이터 모델

| 테이블 | 설명 |
|--------|------|
| `profiles` | 사용자(닉네임, 역할 admin/member, 상태) |
| `groups` | 그룹(이름, 초대코드, 소유자) |
| `group_members` | 그룹 멤버십 |
| `tasks` | 태스크(제목, 담당자, 상태 open/accepted/done) |
| `access_requests` | 가입 요청(관리자 승인 대상) |

RLS 로 "내가 속한 그룹의 데이터만" 접근 가능하도록 보호됩니다.

## 화면

- `/login` 로그인 · `/request-access` 가입 요청
- `/` 내 그룹(목록·생성) · `/groups/:id` 그룹 상세(초대·멤버·태스크)
- `/join` 초대코드로 가입 · `/admin` 관리자(사용자 생성/승인)
