// 계정 전환(관리자용) — 이 기기에 여러 계정의 "세션(토큰)"만 저장해 두고 빠르게 전환한다.
// 비밀번호는 저장하지 않는다. 저장 토큰이 만료되면 해당 계정만 비밀번호를 한 번 다시 입력한다.
// 일반 사용자에겐 노출되지 않도록, 스위처 UI 는 (현재 관리자) 또는 (이 기기에 저장된 관리자 계정이
// 있을 때)만 보이게 한다 → 저장 계정은 관리자가 직접 추가해야만 생기므로 일반 기기엔 아무 것도 안 뜬다.
import { supabase } from './supabase'

const KEY = 'nolging.accounts'

export function getSavedAccounts() {
  try { const a = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(a) ? a : [] } catch { return [] }
}
function write(list) { try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* noop */ } }

function toEntry(session, profile) {
  return {
    id: profile.id,
    login_id: profile.login_id || profile.nickname || '',
    nickname: profile.nickname || profile.login_id || '',
    role: profile.role || 'user',
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    savedAt: Date.now(),
  }
}

// 계정 명시적 추가/갱신(목록 맨 앞으로).
export function upsertAccount(session, profile) {
  if (!session?.user?.id || !profile?.id) return
  const list = getSavedAccounts().filter((a) => a.id !== profile.id)
  list.unshift(toEntry(session, profile))
  write(list)
}

// 이미 목록에 있는 계정만 토큰(+표시정보) 최신화. 목록에 없으면 자동 추가하지 않는다.
export function refreshStoredAccount(session, profile) {
  const uid = session?.user?.id
  if (!uid) return
  const list = getSavedAccounts()
  const cur = list.find((a) => a.id === uid)
  if (!cur) return
  cur.access_token = session.access_token
  cur.refresh_token = session.refresh_token
  if (profile) {
    cur.role = profile.role || cur.role
    cur.login_id = profile.login_id || cur.login_id
    cur.nickname = profile.nickname || cur.nickname
  }
  cur.savedAt = Date.now()
  write(list)
}

export function removeAccount(id) { write(getSavedAccounts().filter((a) => a.id !== id)) }
export function hasAdminSaved() { return getSavedAccounts().some((a) => a.role === 'admin') }

// 저장된 계정으로 전환. 저장 토큰이 무효면 { needPassword:true, login_id } 반환.
export async function switchToAccount(id) {
  const target = getSavedAccounts().find((a) => a.id === id)
  if (!target) throw new Error('저장된 계정이 아니에요.')
  // 떠나기 전, 현재 활성 세션 토큰을 최신값으로 보관
  try {
    const { data: cur } = await supabase.auth.getSession()
    if (cur.session?.user?.id) refreshStoredAccount(cur.session)
  } catch { /* noop */ }
  const { data, error } = await supabase.auth.setSession({
    access_token: target.access_token, refresh_token: target.refresh_token,
  })
  if (error || !data.session) return { needPassword: true, login_id: target.login_id }
  // 전환 성공 → 대상 계정 토큰도 최신화(리프레시 회전 반영)
  refreshStoredAccount(data.session)
  return { ok: true }
}
