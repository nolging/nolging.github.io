// @ts-nocheck  (Deno 런타임 전용 파일 — VSCode TS 서버는 Deno 전역/URL import 를 모름)
// Supabase Edge Function: admin-create-user
// 사용자 계정 관리 (service_role 키는 이 함수 안에서만 사용 → 프론트에 노출 안 됨)
//
// action:
//   'request'    (공개)   : 가입 요청 → status='pending' 사용자 생성 (관리자 승인 대기)
//   'create'     (관리자) : status='active' 사용자 즉시 생성
//   'set-status' (관리자) : 사용자 status 변경 (active/disabled)
//   'set-role'   (관리자) : 사용자 role 변경 (member/admin)
//   'delete'     (관리자) : 사용자 삭제 (가입요청 거절 등)
//
// 첫 관리자: profiles 에 admin 이 0명이면 최초 1명(admin) 을 인증 없이 생성 허용(부트스트랩).
//
// 배포(CLI):        supabase functions deploy admin-create-user --no-verify-jwt
// 배포(대시보드):    Edge Functions → admin-create-user → 이 코드로 교체 → Deploy.
//   ※ 이 함수는 자체적으로 권한을 검사하고 'request'(가입 요청)는 공개라서,
//     "Verify JWT" 옵션은 반드시 OFF 로 둬야 함(기존 배포 설정 유지됨).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const EMAIL_DOMAIN = Deno.env.get('EMAIL_DOMAIN') ?? 'nolging.app'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const NICK_RE = /^[a-z0-9._-]{2,32}$/

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  let p: {
    action?: string
    nickname?: string
    password?: string
    role?: string
    contact?: string
    birthdate?: string
    userId?: string
    status?: string
  }
  try {
    p = await req.json()
  } catch {
    return json({ error: '잘못된 요청 본문입니다.' }, 400)
  }

  const action = p.action ?? 'create'

  // 호출자 판별
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  async function callerIsAdmin(): Promise<boolean> {
    if (!token) return false
    const { data, error } = await admin.auth.getUser(token)
    if (error || !data.user) return false
    const { data: prof } = await admin.from('profiles').select('role').eq('id', data.user.id).single()
    return prof?.role === 'admin'
  }

  // 관리자 부트스트랩 여부
  const { count: adminCount } = await admin
    .from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin')
  const bootstrap = (adminCount ?? 0) === 0

  // ---- 상태 변경 / 삭제 / 비밀번호 초기화 (관리자 전용) ----
  if (action === 'set-status' || action === 'delete' || action === 'set-role' || action === 'set-password') {
    if (!(await callerIsAdmin())) return json({ error: '관리자 권한이 필요합니다.' }, 403)
    if (!p.userId) return json({ error: 'userId 가 필요합니다.' }, 400)

    if (action === 'set-password') {
      const pw = p.password ?? ''
      if (pw.length < 6) return json({ error: '비밀번호는 6자 이상이어야 합니다.' }, 400)
      const { error } = await admin.auth.admin.updateUserById(p.userId, { password: pw })
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }
    if (action === 'delete') {
      // 1) 그룹/쪽지 정리 먼저: 소유 그룹은 다음 가입자에게 소유권 이전(없으면 삭제),
      //    모든 그룹에서 탈퇴 → 이후 이 사용자에게 쪽지 발송·답장이 자동 차단된다.
      //    (프로필 삭제가 콘텐츠 FK 로 실패해도 그룹/쪽지 정리는 확실히 이뤄지도록 먼저 실행)
      const { error: purgeErr } = await admin.rpc('admin_purge_user_memberships', { p_user: p.userId })
      if (purgeErr) {
        return json({ error: `그룹/쪽지 정리 실패: ${purgeErr.message} (user-delete-cleanup.sql 을 적용했는지 확인해 주세요)` }, 500)
      }
      // 2) 프로필/계정 삭제(작성한 콘텐츠 FK 가 있으면 프로필 행은 남을 수 있으나,
      //    그룹/쪽지는 위에서 이미 정리됨)
      await admin.from('profiles').delete().eq('id', p.userId)
      await admin.auth.admin.deleteUser(p.userId).catch(() => {})
      return json({ ok: true })
    }
    if (action === 'set-role') {
      const role = p.role === 'admin' ? 'admin' : 'member'
      const { error } = await admin.from('profiles').update({ role }).eq('id', p.userId)
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true, role })
    }
    const status = p.status === 'active' ? 'active' : 'disabled'
    const { error } = await admin.from('profiles').update({ status }).eq('id', p.userId)
    if (error) return json({ error: error.message }, 500)
    return json({ ok: true, status })
  }

  // ---- 사용자 생성 (create / request) ----
  const nickname = (p.nickname ?? '').trim().toLowerCase()
  const password = p.password ?? ''
  const contact = (p.contact ?? '').trim() || null
  const birthdate = (p.birthdate ?? '').trim() || null

  if (!NICK_RE.test(nickname)) return json({ error: '아이디는 영문 소문자/숫자/._- 2~32자여야 합니다.' }, 400)
  if (password.length < 6) return json({ error: '비밀번호는 6자 이상이어야 합니다.' }, 400)

  let role = 'member'
  let status = 'active'

  if (action === 'request') {
    status = 'pending' // 관리자 승인 대기
  } else {
    // create: 관리자 또는 부트스트랩만
    if (!bootstrap && !(await callerIsAdmin())) {
      return json({ error: '관리자만 사용자를 생성할 수 있습니다.' }, 403)
    }
    role = bootstrap ? 'admin' : (p.role === 'admin' ? 'admin' : 'member')
    status = 'active'
  }

  const email = `${nickname}@${EMAIL_DOMAIN}`

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nickname },
  })
  if (createErr || !created.user) {
    const msg = createErr?.message ?? '사용자 생성 실패'
    const dup = /already|registered|exists/i.test(msg)
    return json({ error: dup ? '이미 존재하는 아이디입니다.' : msg }, dup ? 409 : 500)
  }

  const { error: profErr } = await admin.from('profiles').insert({
    id: created.user.id,
    nickname,
    role,
    status,
    contact,
    birthdate,
  })
  if (profErr) {
    await admin.auth.admin.deleteUser(created.user.id)
    const dup = /duplicate|unique/i.test(profErr.message)
    return json({ error: dup ? '이미 존재하는 아이디입니다.' : profErr.message }, dup ? 409 : 500)
  }

  return json({ ok: true, bootstrap, user: { id: created.user.id, nickname, role, status } })
})
