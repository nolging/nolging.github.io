// Nolging · send-push Edge Function
// notifications 테이블 INSERT 시 Database Webhook 이 이 함수를 호출한다.
// 해당 수신자(user_id)의 모든 웹 푸시 구독으로 알림을 전송한다.
//
// 필요한 시크릿(Function Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
//   (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 는 기본 제공)

import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

webpush.setVapidDetails('mailto:admin@nolging.app', VAPID_PUBLIC, VAPID_PRIVATE)
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json()
    // Database Webhook 은 { type, table, record, old_record } 형태로 보냄
    const record = payload?.record ?? payload
    if (!record?.user_id) return json({ skipped: 'no user_id' })

    // 카테고리별 푸시 설정 확인 — OFF 면 푸시만 생략(알림 행은 이미 생성됨).
    // 댓글 알림(comment) = task_comment + reply
    const TYPE_TO_CAT: Record<string, string> = {
      new_member: 'new_member', new_task: 'new_task', accept: 'accept',
      task_comment: 'comment', reply: 'comment', reminder: 'reminder',
    }
    const cat = TYPE_TO_CAT[record.type as string]
    if (cat) {
      const { data: pref } = await supabase
        .from('notification_prefs')
        .select(cat)
        .eq('user_id', record.user_id)
        .maybeSingle()
      if (pref && (pref as Record<string, boolean>)[cat] === false) {
        return json({ skipped: 'pref off', cat })
      }
    }

    const { data: subs, error } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', record.user_id)
    if (error) throw error
    if (!subs || subs.length === 0) return json({ sent: 0 })

    let url = '/'
    if (record.type === 'touch_call' && record.group_id) {
      url = `/groups/${record.group_id}/touch` // 우심뽀까 알림 → 우심뽀까 페이지
    } else if (record.type === 'praise' && record.group_id) {
      url = `/groups/${record.group_id}/praise` // 스티커판 완성 → 칭찬 스티커 페이지
    } else if (record.task_id && record.group_id) {
      url = `/groups/${record.group_id}/tasks/${record.task_id}`
      if (record.comment_id) url += `?c=${record.comment_id}` // 알림 유발 댓글로 포커스
    } else if (record.group_id) {
      url = `/groups/${record.group_id}`
    }

    const body = JSON.stringify({
      title: record.title,
      body: record.body ?? '',
      url,
      tag: record.type ? `nolging-${record.type}` : undefined,
    })

    let sent = 0
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            body,
          )
          sent++
        } catch (e) {
          // 만료/무효 구독은 정리
          const code = (e as { statusCode?: number })?.statusCode
          if (code === 404 || code === 410) {
            await supabase.from('push_subscriptions').delete().eq('id', s.id)
          }
        }
      }),
    )
    return json({ sent })
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500)
  }
})
