import { supabase } from './supabase'

// 프로필에서 일반 조회 가능한 컬럼(민감정보 contact/birthdate 제외)
const PROFILE_COLS = 'id, nickname, role, status, created_at'

// ---- 그룹 ----------------------------------------------------

export async function listMyGroups() {
  const { data, error } = await supabase
    .from('groups')
    .select('*, group_members!inner(user_id, display_nickname, avatar_url, profiles(nickname))')
    .order('created_at', { ascending: false })
    .order('joined_at', { referencedTable: 'group_members', ascending: true })
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
      theme: theme ?? 'default',
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

// 초대 코드로 그룹 정보 미리보기 (가입 전, 비멤버도 조회). preview_group RPC 필요.
export async function previewGroup(code) {
  const { data, error } = await supabase.rpc('preview_group', { p_code: lowerTrim(code) })
  if (error) {
    if (error.code === 'PGRST202' || /preview_group/.test(error.message || '')) {
      throw new Error('가입 미리보기 기능이 아직 DB에 설정되지 않았습니다. (preview_group 함수를 먼저 적용해 주세요)')
    }
    throw error
  }
  return Array.isArray(data) ? data[0] : data // 유효하지 않으면 undefined
}
const lowerTrim = (s) => String(s).trim().toLowerCase()

// 프로필(사진/닉네임/공개토글) 설정과 함께 가입
export async function joinGroupWithProfile(code, userId, { display_nickname, avatar_url, show_contact, show_birthdate }) {
  const group = await joinGroupByCode(code)
  await updateMyGroupMember(group.id, userId, {
    display_nickname: display_nickname?.trim() || null,
    avatar_url: avatar_url || null,
    show_contact: !!show_contact,
    show_birthdate: !!show_birthdate,
  })
  return group
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

// 내 그룹내 설정 원본 조회 (공개토글 등 실제 저장값 — 카드 RPC엔 없음)
export async function getMyGroupMember(groupId, userId) {
  const { data, error } = await supabase
    .from('group_members')
    .select('display_nickname, avatar_url, show_contact, show_birthdate')
    .eq('group_id', groupId).eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}

// ---- 태스크 --------------------------------------------------

export async function listTasks(groupId) {
  const { data, error } = await supabase
    .from('tasks').select('*').eq('group_id', groupId).order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createTask({ groupId, title, description, category, createdBy }) {
  const row = { group_id: groupId, title, description: description ?? '', created_by: createdBy }
  // category 는 값이 있을 때만 전송 (컬럼 미적용 환경에서 일반 태스크는 정상 동작)
  if (category) row.category = category
  const { data, error } = await supabase.from('tasks').insert(row).select().single()
  if (error) throw error
  return data
}

export async function getTask(taskId) {
  const { data, error } = await supabase.from('tasks').select('*').eq('id', taskId).single()
  if (error) throw error
  return data
}

export async function updateTask(taskId, { title, description, category }) {
  const patch = { title, description: description ?? '' }
  patch.category = category || null // 컬럼 존재 가정(schema-v2 적용됨)
  const { data, error } = await supabase.from('tasks').update(patch).eq('id', taskId).select().single()
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

// ---- 약속 잡기 (놀깅) ----------------------------------------

function scheduleArgs({ taskId, scheduledAt, timeSet, repeat, repeatUntil, remind, participantIds }) {
  const r = remind === '' || remind === null || remind === undefined ? null : Number(remind)
  return {
    p_task_id: taskId,
    p_scheduled_at: scheduledAt ?? null,
    p_time_set: timeSet ?? true,
    p_repeat: repeat || null,
    p_repeat_until: repeatUntil || null,
    p_remind: r,
    p_participants: participantIds ?? [],
  }
}

// 놀기 신청 확정: 일정/시간여부/반복/반복종료/미리알림/참여자 저장 + 상태 accepted
export async function scheduleTask(opts) {
  const { data, error } = await supabase.rpc('schedule_task', scheduleArgs(opts))
  if (error) throw error
  return Array.isArray(data) ? data[0] : data
}

// 이미 잡힌 약속 수정
export async function rescheduleTask(opts) {
  const { data, error } = await supabase.rpc('reschedule_task', scheduleArgs(opts))
  if (error) throw error
  return Array.isArray(data) ? data[0] : data
}

// 약속 취소 → 위시리스트(open) 로 복귀, 일정/참여자 초기화
export async function cancelAppointment(taskId) {
  const { data, error } = await supabase.rpc('cancel_appointment', { p_task_id: taskId })
  if (error) throw error
  return Array.isArray(data) ? data[0] : data
}

export async function listTaskParticipants(taskId) {
  const { data, error } = await supabase
    .from('task_participants').select('user_id').eq('task_id', taskId)
  if (error) throw error
  return (data ?? []).map((r) => r.user_id)
}

// 여러 태스크의 참여자 한번에 조회 → { [taskId]: [userId, ...] }
export async function listParticipantsByTasks(taskIds) {
  if (!taskIds || taskIds.length === 0) return {}
  const { data, error } = await supabase
    .from('task_participants').select('task_id, user_id').in('task_id', taskIds)
  if (error) throw error
  const map = {}
  ;(data ?? []).forEach((r) => { (map[r.task_id] = map[r.task_id] || []).push(r.user_id) })
  return map
}

// ---- 태스크 댓글 --------------------------------------------

export async function listComments(taskId) {
  const { data, error } = await supabase
    .from('task_comments').select('*').eq('task_id', taskId).order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function addComment({ taskId, groupId, body, authorId, parentId }) {
  const { data, error } = await supabase
    .from('task_comments')
    .insert({ task_id: taskId, group_id: groupId, body, author_id: authorId, parent_id: parentId ?? null })
    .select().single()
  if (error) throw error
  return data
}

export async function updateComment(commentId, body) {
  const { data, error } = await supabase
    .from('task_comments').update({ body }).eq('id', commentId).select().single()
  if (error) throw error
  return data
}

export async function deleteComment(commentId) {
  const { error } = await supabase.from('task_comments').delete().eq('id', commentId)
  if (error) throw error
}

// ---- 알림 ----------------------------------------------------

export async function listNotifications(limit = 50) {
  const { data, error } = await supabase
    .from('notifications').select('*')
    .order('created_at', { ascending: false }).limit(limit)
  if (error) throw error
  return data ?? []
}

export async function unreadNotificationCount() {
  const { count, error } = await supabase
    .from('notifications').select('id', { count: 'exact', head: true }).eq('is_read', false)
  if (error) throw error
  return count ?? 0
}

export async function markNotificationRead(id) {
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id)
  if (error) throw error
}

export async function markAllNotificationsRead() {
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('is_read', false)
  if (error) throw error
}

export async function deleteNotification(id) {
  const { error } = await supabase.from('notifications').delete().eq('id', id)
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

// 내 비밀번호 변경 (Supabase Auth)
export async function changeMyPassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw error
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
