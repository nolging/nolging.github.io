import { supabase } from './supabase'

// ---- 그룹 ----------------------------------------------------

export async function listMyGroups() {
  // 내가 속한 그룹만 (RLS 로 자동 필터되지만 멤버십 join 으로 명시)
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

export async function createGroup({ name, description, ownerId }) {
  const { data, error } = await supabase
    .from('groups')
    .insert({ name, description: description ?? '', owner_id: ownerId })
    .select()
    .single()
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
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId)
  if (error) throw error
}

// ---- 멤버 ----------------------------------------------------

export async function listMembers(groupId) {
  const { data, error } = await supabase
    .from('group_members')
    .select('role, joined_at, user:profiles(id, nickname, role)')
    .eq('group_id', groupId)
    .order('joined_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

// ---- 태스크 --------------------------------------------------

export async function listTasks(groupId) {
  const { data, error } = await supabase
    .from('tasks')
    .select(
      '*, creator:profiles!tasks_created_by_fkey(nickname), assignee:profiles!tasks_assignee_id_fkey(nickname)'
    )
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createTask({ groupId, title, description, createdBy }) {
  const { data, error } = await supabase
    .from('tasks')
    .insert({ group_id: groupId, title, description: description ?? '', created_by: createdBy })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function acceptTask(taskId, userId) {
  const { data, error } = await supabase
    .from('tasks')
    .update({ status: 'accepted', assignee_id: userId, accepted_at: new Date().toISOString() })
    .eq('id', taskId)
    .eq('status', 'open') // 이미 수락된 태스크 재수락 방지
    .select()
    .single()
  if (error) throw error
  return data
}

export async function completeTask(taskId) {
  const { data, error } = await supabase
    .from('tasks')
    .update({ status: 'done', completed_at: new Date().toISOString() })
    .eq('id', taskId)
    .eq('status', 'accepted')
    .select()
    .single()
  if (error) throw error
  return data
}

export async function reopenTask(taskId) {
  const { data, error } = await supabase
    .from('tasks')
    .update({ status: 'open', assignee_id: null, accepted_at: null, completed_at: null })
    .eq('id', taskId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteTask(taskId) {
  const { error } = await supabase.from('tasks').delete().eq('id', taskId)
  if (error) throw error
}

// ---- 관리자 --------------------------------------------------

export async function adminCreateUser({ nickname, password, role, requestId }) {
  const { data, error } = await supabase.functions.invoke('admin-create-user', {
    body: { nickname, password, role, requestId },
  })
  if (error) {
    // Edge Function 이 반환한 JSON 에러 메시지 추출
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

export async function listUsers() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function setUserStatus(userId, status) {
  const { error } = await supabase.from('profiles').update({ status }).eq('id', userId)
  if (error) throw error
}

// ---- 가입 요청 -----------------------------------------------

export async function submitAccessRequest({ nickname, note }) {
  const { error } = await supabase
    .from('access_requests')
    .insert({ nickname: nickname.trim().toLowerCase(), note: note ?? '' })
  if (error) throw error
}

export async function listAccessRequests() {
  const { data, error } = await supabase
    .from('access_requests')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function setAccessRequestStatus(id, status) {
  const { error } = await supabase.from('access_requests').update({ status }).eq('id', id)
  if (error) throw error
}
