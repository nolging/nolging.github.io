// Supabase Edge Function: admin-create-user
// 관리자가 닉네임/비밀번호로 새 사용자를 생성(승인)합니다.
// service_role 키는 이 서버 함수 안에서만 사용되어 프론트엔드에 노출되지 않습니다.
//
// 배포:  supabase functions deploy admin-create-user
// 첫 관리자: profiles 에 admin 이 하나도 없으면 인증 없이 최초 1명(admin) 생성 허용(부트스트랩).

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

  let payload: { nickname?: string; password?: string; role?: string; requestId?: string }
  try {
    payload = await req.json()
  } catch {
    return json({ error: '잘못된 요청 본문입니다.' }, 400)
  }

  const nickname = (payload.nickname ?? '').trim().toLowerCase()
  const password = payload.password ?? ''
  const role = payload.role === 'admin' ? 'admin' : 'member'

  if (!NICK_RE.test(nickname)) {
    return json({ error: '닉네임은 영문 소문자/숫자/._- 2~32자여야 합니다.' }, 400)
  }
  if (password.length < 6) {
    return json({ error: '비밀번호는 6자 이상이어야 합니다.' }, 400)
  }

  // 부트스트랩: 관리자가 한 명도 없으면 최초 1명(admin) 생성을 인증 없이 허용
  const { count: adminCount, error: countErr } = await admin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin')
  if (countErr) return json({ error: countErr.message }, 500)

  const bootstrap = (adminCount ?? 0) === 0

  if (!bootstrap) {
    // 호출자가 관리자인지 검증
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace('Bearer ', '')
    if (!token) return json({ error: '인증이 필요합니다.' }, 401)

    const { data: userData, error: userErr } = await admin.auth.getUser(token)
    if (userErr || !userData.user) return json({ error: '유효하지 않은 세션입니다.' }, 401)

    const { data: caller } = await admin
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .single()
    if (!caller || caller.role !== 'admin') {
      return json({ error: '관리자만 사용자를 생성할 수 있습니다.' }, 403)
    }
  }

  const email = `${nickname}@${EMAIL_DOMAIN}`

  // 1) auth 사용자 생성
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nickname },
  })
  if (createErr || !created.user) {
    const msg = createErr?.message ?? '사용자 생성 실패'
    const dup = /already|registered|exists/i.test(msg)
    return json({ error: dup ? '이미 존재하는 닉네임입니다.' : msg }, dup ? 409 : 500)
  }

  // 2) 프로필 생성
  const { error: profErr } = await admin.from('profiles').insert({
    id: created.user.id,
    nickname,
    role: bootstrap ? 'admin' : role,
    status: 'active',
  })
  if (profErr) {
    // 롤백: 프로필 생성 실패 시 auth 사용자 제거
    await admin.auth.admin.deleteUser(created.user.id)
    const dup = /duplicate|unique/i.test(profErr.message)
    return json({ error: dup ? '이미 존재하는 닉네임입니다.' : profErr.message }, dup ? 409 : 500)
  }

  // 3) 가입 요청과 연결된 경우 승인 처리
  if (payload.requestId) {
    await admin.from('access_requests').update({ status: 'approved' }).eq('id', payload.requestId)
  }

  return json({
    ok: true,
    bootstrap,
    user: { id: created.user.id, nickname, role: bootstrap ? 'admin' : role },
  })
})
