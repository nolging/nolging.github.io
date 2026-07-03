import { supabase } from './supabase'

// 프로필에서 일반 조회 가능한 컬럼(민감정보 contact/birthdate 제외)
const PROFILE_COLS = 'id, nickname, role, status, created_at'

// ---- 그룹 ----------------------------------------------------

export async function listMyGroups() {
  const { data, error } = await supabase
    .from('groups')
    .select('*, group_members!inner(user_id)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function getGroup(groupId) {
  const { data, error } = await supabase.from('groups').select('*').eq('id', groupId).single()
  if (error) throw error
  return data
}

export async function createGroup({ name, description, ownerId, groupType, theme, showContact, showBirthdate }) {
  const { data, error } = await supabase
    .from('groups')
    .insert({
      name,
      description: description ?? '',
      owner_id: ownerId,
      group_type: groupType ?? 'nolging',
      theme: theme ?? 'solo',
      show_contact: !!showContact,
      show_birthdate: !!showBirthdate,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateGroup(groupId, patch) {
  const { data, error } = await supabase.from('groups').update(patch).eq('id', groupId).select().single()
  if (error) throw error
  return data
}

export async function deleteGroup(groupId) {
  const { error } = await supabase.from('groups').delete().eq('id', groupId)
  if (error) throw error
}

export async function joinGroupByCode(code) {
  const { data, error } = await supabase.rpc('join_group', { p_code: code })
  if (error) throw error
  return data
}

export async function leaveGroup(groupId, userId) {
  const { error } = await supabase
    .from('group_members').delete().eq('group_id', groupId).eq('user_id', userId)
  if (error) throw error
}

// ---- 멤버 (프라이버시 규칙 적용된 카드) ----------------------

export async function listMemberCards(groupId) {
  const { data, error } = await supabase.rpc('group_member_cards', { p_group_id: groupId })
  if (error) throw error
  return data ?? []
}

// 내 그룹내 설정 수정 (닉네임/프로필사진/공개토글)
export async function updateMyGroupMember(groupId, userId, patch) {
  const { error } = await supabase
    .from('group_members').update(patch).eq('group_id', groupId).eq('user_id', userId)
  if (error) throw error
}

// ---- 태스크 --------------------------------------------------

export async function listTasks(groupId) {
  const { data, error } = await supabase
    .from('tasks').select('*').eq('group_id', groupId).order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createTask({ groupId, title, description, createdBy }) {
  const { data, error } = await supabase
    .from('tasks')
    .insert({ group_id: groupId, title, description: description ?? '', created_by: createdBy })
    .select().single()
  if (error) throw error
  return data
}

export async function acceptTask(taskId, userId) {
  const { data, error } = await supabase
    .from('tasks')
    .update({ status: 'accepted', assignee_id: userId, accepted_at: new Date().toISOString() })
    .eq('id', taskId).eq('status', 'open').select().single()
  if (error) throw error
  return data
}

export async function completeTask(taskId) {
  const { data, error } = await supabase
    .from('tasks')
    .update({ status: 'done', completed_at: new Date().toISOString() })
    .eq('id', taskId).eq('status', 'accepted').select().single()
  if (error) throw error
  return data
}

export async function reopenTask(taskId) {
  const { data, error } = await supabase
    .from('tasks')
    .update({ status: 'open', assignee_id: null, accepted_at: null, completed_at: null })
    .eq('id', taskId).select().single()
  if (error) throw error
  return data
}

export async function deleteTask(taskId) {
  const { error } = await supabase.from('tasks').delete().eq('id', taskId)
  if (error) throw error
}

// ---- 내 프로필 (연락처/생년월일 포함) ------------------------

export async function getMyProfile() {
  const { data, error } = await supabase.rpc('my_profile')
  if (error) throw error
  return Array.isArray(data) ? data[0] : data
}

export async function updateMyProfile({ contact, birthdate }) {
  const { data, error } = await supabase.rpc('update_my_profile', {
    p_contact: contact || null,
    p_birthdate: birthdate || null,
  })
  if (error) throw error
  return Array.isArray(data) ? data[0] : data
}

// ---- 가입 요청 / 관리자 사용자 관리 (Edge Function) ----------

async function invokeAdmin(body) {
  const { data, error } = await supabase.functions.invoke('admin-create-user', { body })
  if (error) {
    let msg = error.message
    try {
      const ctx = await error.context?.json?.()
      if (ctx?.error) msg = ctx.error
    } catch { /* noop */ }
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

// 공개: 가입 요청 (pending 사용자 생성)
export async function requestAccess({ nickname, password, contact, birthdate }) {
  return invokeAdmin({ action: 'request', nickname, password, contact, birthdate })
}

// 관리자: 사용자 즉시 생성
export async function adminCreateUser({ nickname, password, role, contact, birthdate }) {
  return invokeAdmin({ action: 'create', nickname, password, role, contact, birthdate })
}

// 관리자: 상태 변경 / 삭제
export async function adminSetStatus(userId, status) {
  return invokeAdmin({ action: 'set-status', userId, status })
}
export async function adminDeleteUser(userId) {
  return invokeAdmin({ action: 'delete', userId })
}

// 관리자: 전체 사용자(연락처/생년월일 포함)
export async function adminListUsers() {
  const { data, error } = await supabase.rpc('admin_list_users')
  if (error) throw error
  return data ?? []
}
