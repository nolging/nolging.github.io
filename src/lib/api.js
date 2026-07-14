import { supabase } from './supabase'

// 프로필에서 일반 조회 가능한 컬럼(민감정보 contact/birthdate 제외)
const PROFILE_COLS = 'id, nickname, role, status, created_at'

// ---- 그룹 ----------------------------------------------------

export async function listMyGroups() {
  const { data, error } = await supabase
    .from('groups')
    .select('*, group_members!inner(user_id, display_nickname, avatar_url)')
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

export async function createGroup({ name, description, ownerId, groupType, theme, showContact, showBirthdate, showOtt, emoji, emojiBg }) {
  const row = {
    name,
    description: description ?? '',
    owner_id: ownerId,
    group_type: groupType ?? 'nolging',
    theme: theme ?? 'default',
    show_contact: !!showContact,
    show_birthdate: !!showBirthdate,
    show_ott: !!showOtt,
  }
  const withEmoji = { ...row, emoji: emoji || null, emoji_bg: emojiBg || null }
  // emoji/emoji_bg 컬럼 미배포 환경 폴백
  let res = await supabase.from('groups').insert(withEmoji).select().single()
  if (res.error && /emoji/i.test(res.error.message || '')) {
    res = await supabase.from('groups').insert(row).select().single()
  }
  if (res.error) throw res.error
  return res.data
}

export async function updateGroup(groupId, patch) {
  let res = await supabase.from('groups').update(patch).eq('id', groupId).select().single()
  if (res.error && /emoji/i.test(res.error.message || '') && ('emoji' in patch || 'emoji_bg' in patch)) {
    const { emoji, emoji_bg, ...rest } = patch // eslint-disable-line no-unused-vars
    res = await supabase.from('groups').update(rest).eq('id', groupId).select().single()
  }
  if (res.error) throw res.error
  return res.data
}

export async function deleteGroup(groupId) {
  const { error } = await supabase.from('groups').delete().eq('id', groupId)
  if (error) throw error
}

// ---- 캐치마인드 (프리미엄 그룹 실시간 그림 맞히기) -------------
export async function getCatchWords(groupId) {
  const { data, error } = await supabase.from('group_catch_words').select('words').eq('group_id', groupId).maybeSingle()
  if (error) { if (error.code === '42P01') return []; throw error }
  return Array.isArray(data?.words) ? data.words : []
}
export async function setCatchWords(groupId, words) {
  const { error } = await supabase.from('group_catch_words').upsert({ group_id: groupId, words })
  if (error) {
    if (error.code === '42P01') throw new Error('캐치마인드 기능이 아직 DB에 설정되지 않았습니다.')
    throw error
  }
}
// 우승자에게 30 츄르 지급(하루 1회/그룹). 지급됐으면 true, 이미 지급됐으면 false.
// winnerIds: 공동 우승자 배열 → 30개를 균등 분배(내림), 그룹당 하루 1회.
// 반환: { ok, share, n, reason }
export async function awardCatchmind(groupId, winnerIds) {
  const arr = Array.isArray(winnerIds) ? winnerIds : [winnerIds]
  const { data, error } = await supabase.rpc('award_catchmind', { p_group_id: groupId, p_winners: arr })
  if (error) {
    if (error.code === 'PGRST202' || /award_catchmind/.test(error.message || '')) return { ok: false, reason: 'missing' }
    throw error
  }
  return data || { ok: false }
}

// 가위바위보 베팅 정산: 패자→승자 츄르 이전(게임당 1회, 멱등). 승자 클라이언트가 호출.
export async function settleRps(groupId, gameId, winnerId, loserId, bet) {
  const { data, error } = await supabase.rpc('rps_settle', {
    p_group_id: groupId, p_game_id: gameId, p_winner: winnerId, p_loser: loserId, p_bet: bet,
  })
  if (error) {
    if (error.code === 'PGRST202' || /rps_settle/.test(error.message || '')) return { ok: false, reason: 'missing' }
    throw error
  }
  return data || { ok: false }
}

// 캐치마인드 베팅 정산: 참여자 각자 bet, 1등(들)이 판돈 분배(게임당 1회, 멱등). 우승 클라이언트가 호출.
export async function settleCatchmind(groupId, gameId, participants, winners, bet) {
  const { data, error } = await supabase.rpc('catchmind_settle', {
    p_group_id: groupId, p_game_id: gameId, p_participants: participants, p_winners: winners, p_bet: bet,
  })
  if (error) {
    if (error.code === 'PGRST202' || /catchmind_settle/.test(error.message || '')) return { ok: false, reason: 'missing' }
    throw error
  }
  return data || { ok: false }
}

// 오목 진행 상태 저장/복구 (이어하기). 테이블 없으면(42P01) 조용히 무시 → 브로드캐스트로만 동작.
export async function getOmokState(groupId) {
  const { data, error } = await supabase.from('omok_matches').select('state').eq('group_id', groupId).maybeSingle()
  if (error) { if (error.code === '42P01') return null; throw error }
  return data?.state || null
}
export async function saveOmokState(groupId, state) {
  const { error } = await supabase.from('omok_matches')
    .upsert({ group_id: groupId, state, updated_at: new Date().toISOString() }, { onConflict: 'group_id' })
  if (error && error.code !== '42P01') throw error
}

// 다빈치코드 심판(Edge Function). action 별 payload 를 넘기고 내 시점 view 반환.
export async function davinci(action, payload = {}) {
  const { data, error } = await supabase.functions.invoke('davinci', { body: { action, ...payload } })
  if (error) {
    let msg = error.message
    try { const ctx = await error.context?.json?.(); if (ctx?.error) msg = ctx.error } catch { /* noop */ }
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

// 오목 승자에게 츄르 10개, 그룹당 하루 1회. 반환: { ok, coin?, reason? }
export async function awardOmok(groupId, winnerId) {
  const { data, error } = await supabase.rpc('award_omok', { p_group_id: groupId, p_winner: winnerId })
  if (error) {
    if (error.code === 'PGRST202' || /award_omok/.test(error.message || '')) return { ok: false, reason: 'missing' }
    throw error
  }
  return data || { ok: false }
}

// 오목 베팅 정산: 패자→승자 츄르 이전(게임당 1회, 멱등). 승자 클라이언트가 호출.
// 반환: { ok, bet, already? } / RPC 미배포 시 { ok:false, reason:'missing' }
export async function settleOmok(groupId, gameId, winnerId, loserId, bet) {
  const { data, error } = await supabase.rpc('omok_settle', {
    p_group_id: groupId, p_game_id: gameId, p_winner: winnerId, p_loser: loserId, p_bet: bet,
  })
  if (error) {
    if (error.code === 'PGRST202' || /omok_settle/.test(error.message || '')) return { ok: false, reason: 'missing' }
    throw error
  }
  return data || { ok: false }
}

// ---- 함께 퍼즐 (프리미엄 그룹 실시간 직소) ----------------------
export async function getGroupPuzzle(groupId) {
  const { data, error } = await supabase.from('group_puzzles').select('*').eq('group_id', groupId).maybeSingle()
  if (error) { if (error.code === '42P01') return null; throw error }
  return data
}
export async function saveGroupPuzzle(groupId, p) {
  const row = { group_id: groupId, image: p.image, cols: p.cols, rows: p.rows, seed: p.seed, positions: p.positions || {} }
  const { error } = await supabase.from('group_puzzles').upsert(row)
  if (error) {
    if (error.code === '42P01') throw new Error('퍼즐 기능이 아직 DB에 설정되지 않았습니다. (group_puzzles 테이블을 먼저 적용해 주세요)')
    throw error
  }
}
export async function updatePuzzlePositions(groupId, positions) {
  const { error } = await supabase.from('group_puzzles').update({ positions }).eq('group_id', groupId)
  if (error && error.code !== '42P01') throw error
}
export async function deleteGroupPuzzle(groupId) {
  const { error } = await supabase.from('group_puzzles').delete().eq('group_id', groupId)
  if (error && error.code !== '42P01') throw error
}

// 커플 공간: 기념일 설정 (그룹 멤버 누구나). null 이면 해제.
export async function setGroupAnniversary(groupId, date) {
  const { error } = await supabase.rpc('set_group_anniversary', { p_group_id: groupId, p_date: date || null })
  if (error) {
    if (error.code === 'PGRST202' || /set_group_anniversary/.test(error.message || '')) {
      throw new Error('기념일 기능이 아직 DB에 설정되지 않았습니다. (set_group_anniversary 함수를 먼저 적용해 주세요)')
    }
    throw error
  }
}

// ---- 함께 그리기 (프리미엄 그룹 공용 캔버스) --------------------
// 저장된 스트로크 로드 (재진입 시 이어 그리기). 테이블 미배포면 빈 배열.
export async function listDrawingStrokes(groupId) {
  const { data, error } = await supabase
    .from('group_drawings').select('id, author, stroke')
    .eq('group_id', groupId).order('created_at', { ascending: true })
  if (error) { if (error.code === '42P01') return []; throw error }
  return data ?? []
}
// 완성된 스트로크 1개 저장. id 는 클라이언트 생성(브로드캐스트와 공유).
export async function addDrawingStroke(groupId, id, authorId, stroke) {
  const { error } = await supabase.from('group_drawings').insert({ id, group_id: groupId, author: authorId, stroke })
  if (error && error.code !== '42P01') throw error
}
export async function deleteDrawingStroke(id) {
  const { error } = await supabase.from('group_drawings').delete().eq('id', id)
  if (error && error.code !== '42P01') throw error
}
export async function clearGroupDrawing(groupId) {
  const { error } = await supabase.from('group_drawings').delete().eq('group_id', groupId)
  if (error && error.code !== '42P01') throw error
}

// 초대 코드 새로 발급 (그룹 소유자 전용). 새 코드 문자열 반환.
export async function regenerateInviteCode(groupId) {
  const { data, error } = await supabase.rpc('regenerate_invite_code', { p_group_id: groupId })
  if (error) {
    if (error.code === 'PGRST202' || /regenerate_invite_code/.test(error.message || '')) {
      throw new Error('새 코드 발급 기능이 아직 DB에 설정되지 않았습니다. (regenerate_invite_code 함수를 먼저 적용해 주세요)')
    }
    throw error
  }
  return data
}

export async function joinGroupByCode(code) {
  const { data, error } = await supabase.rpc('join_group', { p_code: code })
  if (error) throw error
  return data
}

// 초대 코드로 그룹 정보 미리보기 (가입 전, 비멤버도 조회). preview_group RPC 필요.
export async function previewGroup(code) {
  const { data, error } = await supabase.rpc('preview_group', { p_code: String(code).trim() })
  if (error) {
    if (error.code === 'PGRST202' || /preview_group/.test(error.message || '')) {
      throw new Error('가입 미리보기 기능이 아직 DB에 설정되지 않았습니다. (preview_group 함수를 먼저 적용해 주세요)')
    }
    throw error
  }
  return Array.isArray(data) ? data[0] : data // 유효하지 않으면 undefined
}

// 프로필(사진/닉네임/공개토글) 설정과 함께 가입
export async function joinGroupWithProfile(code, userId, { display_nickname, avatar_url, show_contact, show_birthdate, show_ott }) {
  // 닉네임까지 담아 한 번에 가입(가입 알림이 아이디 대신 닉네임을 쓰게) → RPC 미적용 시 구 방식 폴백.
  const { data, error } = await supabase.rpc('join_group_with_profile', {
    p_code: String(code).trim(),
    p_display_nickname: display_nickname?.trim() || null,
    p_avatar_url: avatar_url || null,
    p_show_contact: !!show_contact,
    p_show_birthdate: !!show_birthdate,
    p_show_ott: !!show_ott,
  })
  if (!error) return data
  if (error.code !== 'PGRST202' && !/join_group_with_profile/.test(error.message || '')) throw error
  // 폴백: 구 2단계(가입 후 프로필 업데이트)
  const group = await joinGroupByCode(code)
  await updateMyGroupMember(group.id, userId, {
    display_nickname: display_nickname?.trim() || null,
    avatar_url: avatar_url || null,
    show_contact: !!show_contact,
    show_birthdate: !!show_birthdate,
    show_ott: !!show_ott,
  })
  return group
}

export async function leaveGroup(groupId, userId) {
  const { error } = await supabase
    .from('group_members').delete().eq('group_id', groupId).eq('user_id', userId)
  if (error) throw error
}

// ---- 알림 카테고리별 푸시 설정 (없으면 전체 허용) ----------------
export async function getNotifPrefs() {
  const { data, error } = await supabase
    .from('notification_prefs')
    .select('new_member, new_task, accept, comment, reminder')
    .maybeSingle()
  if (error) throw error
  return data // 없으면 null → 프론트에서 전체 true 기본값
}

export async function updateNotifPrefs(prefs, userId) {
  const { error } = await supabase
    .from('notification_prefs')
    .upsert({ user_id: userId, ...prefs }, { onConflict: 'user_id' })
  if (error) throw error
}

// ---- 멤버 (프라이버시 규칙 적용된 카드) ----------------------

export async function listMemberCards(groupId) {
  const { data, error } = await supabase.rpc('group_member_cards', { p_group_id: groupId })
  if (error) throw error
  return data ?? []
}

// 그룹 멤버 uid → { name(표시 닉네임), avatar } 맵. presence 경합 없이 이름을 확정하는 용도.
export async function getGroupMemberMap(groupId) {
  const { data, error } = await supabase
    .from('group_members')
    .select('user_id, display_nickname, avatar_url')
    .eq('group_id', groupId)
  if (error) throw error
  const map = {}
  ;(data ?? []).forEach((m) => {
    map[m.user_id] = { name: m.display_nickname || '멤버', avatar: m.avatar_url || null }
  })
  return map
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
    .select('display_nickname, avatar_url, show_contact, show_birthdate, show_ott')
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

// 그룹 내 태스크별 댓글 수 맵 { task_id: count }
export async function listCommentCounts(groupId) {
  const { data, error } = await supabase
    .from('task_comments').select('task_id').eq('group_id', groupId)
  if (error) throw error
  const map = {}
  for (const r of data ?? []) map[r.task_id] = (map[r.task_id] || 0) + 1
  return map
}

export async function createTask({ groupId, title, description, category, media_info, createdBy }) {
  const row = { group_id: groupId, title, description: description ?? '', created_by: createdBy }
  // category 는 값이 있을 때만 전송 (컬럼 미적용 환경에서 일반 태스크는 정상 동작)
  if (category) row.category = category
  if (media_info) row.media_info = media_info
  const { data, error } = await supabase.from('tasks').insert(row).select().single()
  if (error) throw error
  return data
}

// 위시 유형별 정보 조회 Edge Function (OTT/영화→movie-lookup·TMDB, 독서→book-lookup·알라딘, 게임→game-lookup·RAWG)
const LOOKUP_FN = { OTT: 'movie-lookup', '영화': 'movie-lookup', '독서': 'book-lookup', '게임': 'game-lookup' }

export async function searchMedia(query, category) {
  const fn = LOOKUP_FN[category]
  if (!fn) return []
  const kind = category === '영화' ? 'movie' : category === 'OTT' ? 'multi' : undefined
  const { data, error } = await supabase.functions.invoke(fn, { body: { action: 'search', query, kind } })
  if (error) throw new Error('정보 조회에 실패했어요. 잠시 후 다시 시도해 주세요.')
  if (data?.error) throw new Error(data.error)
  return data?.results ?? []
}
export async function getMediaDetail(id, media, category) {
  const fn = LOOKUP_FN[category]
  if (!fn) throw new Error('지원하지 않는 유형이에요.')
  const { data, error } = await supabase.functions.invoke(fn, { body: { action: 'detail', id, media } })
  if (error) throw new Error('정보 조회에 실패했어요. 잠시 후 다시 시도해 주세요.')
  if (data?.error) throw new Error(data.error)
  return data
}

export async function getTask(taskId) {
  const { data, error } = await supabase.from('tasks').select('*').eq('id', taskId).single()
  if (error) throw error
  return data
}

export async function updateTask(taskId, { title, description, category, media_info }) {
  const patch = { title, description: description ?? '' }
  patch.category = category || null // 컬럼 존재 가정(schema-v2 적용됨)
  if (media_info !== undefined) patch.media_info = media_info ?? null
  const { data, error } = await supabase.from('tasks').update(patch).eq('id', taskId).select().single()
  if (error) throw error
  return data
}

// 상세 정보(media_info)만 수정. 제목/유형은 건드리지 않음(작성자 아닌 사람도 상세 정보는 편집 가능).
export async function updateTaskMedia(taskId, mediaInfo) {
  const { data, error } = await supabase
    .from('tasks').update({ media_info: mediaInfo ?? null }).eq('id', taskId).select().single()
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

// 추억 → 약속(accepted)으로 되돌리기. 리뷰가 있으면 서버에서 거부.
export async function revertToAppointment(taskId) {
  const { data, error } = await supabase.rpc('revert_to_appointment', { p_task_id: taskId })
  if (error) {
    if (error.code === 'PGRST202' || /revert_to_appointment/.test(error.message || '')) {
      throw new Error('되돌리기 기능이 아직 DB에 설정되지 않았습니다. (revert_to_appointment 함수를 먼저 적용해 주세요)')
    }
    throw error
  }
  return data
}

// 그룹 내 리뷰가 있는 태스크 id 집합 (추억 되돌리기 버튼 노출 여부). 미배포 시 빈 Set.
export async function listReviewedTaskIds(groupId) {
  const { data, error } = await supabase.rpc('group_review_counts', { p_group_id: groupId })
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42P01') return new Set()
    throw error
  }
  return new Set((data ?? []).filter((r) => (r.cnt ?? 0) > 0).map((r) => r.task_id))
}

// 추억별 리뷰 개수 맵 { task_id: cnt }
export async function listReviewCounts(groupId) {
  const { data, error } = await supabase.rpc('group_review_counts', { p_group_id: groupId })
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42P01') return {}
    throw error
  }
  const map = {}
  for (const r of data ?? []) map[r.task_id] = r.cnt ?? 0
  return map
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

// 내가 속한 모든 그룹의 약속(accepted + 일정 지정) — 캘린더용
export async function listMyAppointments() {
  // accepted(약속) + done(추억) 모두 — 일정 캘린더에서 지난 추억도 보이도록
  const { data, error } = await supabase
    .from('tasks')
    .select('*, groups(name), task_participants(user_id)')
    .in('status', ['accepted', 'done'])
    .not('scheduled_at', 'is', null)
    .order('scheduled_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

// 여러 그룹의 멤버 표시정보 → { "groupId:userId": { name, avatar } }
export async function listGroupMembersBrief(groupIds) {
  const ids = [...new Set(groupIds || [])]
  if (ids.length === 0) return {}
  const { data, error } = await supabase
    .from('group_members')
    .select('group_id, user_id, display_nickname, avatar_url')
    .in('group_id', ids)
  if (error) throw error
  const map = {}
  ;(data ?? []).forEach((m) => {
    map[`${m.group_id}:${m.user_id}`] = {
      name: m.display_nickname || '멤버',
      avatar: m.avatar_url,
    }
  })
  return map
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

// ---- 태스크 리뷰(추억) ---------------------------------------
// task_reviews_view RPC: { is_participant, has_reviewed, reviews:[{author_id,nickname,avatar_url,rating,comment|null,is_self,created_at}] }
export async function getTaskReviews(taskId) {
  const { data, error } = await supabase.rpc('task_reviews_view', { p_task_id: taskId })
  if (error) {
    if (error.code === 'PGRST202' || /task_reviews_view/.test(error.message || '')) {
      const e = new Error('리뷰 기능이 아직 DB에 설정되지 않았습니다. (task_reviews_view 함수를 먼저 적용해 주세요)')
      e.notReady = true
      throw e
    }
    throw error
  }
  return data || { is_participant: false, has_reviewed: false, revealed: false, reviews: [] }
}

// 천체 망원경 사용: 해당 추억의 남 리뷰 열람 처리. 아이템 1개 소모.
export async function useTelescope(taskId) {
  const { error } = await supabase.rpc('use_telescope', { p_task_id: taskId })
  if (error) {
    if (error.code === 'PGRST202' || /use_telescope/.test(error.message || '')) {
      throw new Error('천체 망원경 기능이 아직 DB에 설정되지 않았습니다. (use_telescope 함수를 먼저 적용해 주세요)')
    }
    throw error
  }
}

// 천체 망원경 보유(미사용) 여부
export async function ownsTelescope(userId) {
  const { data, error } = await supabase
    .from('user_items').select('id')
    .eq('user_id', userId).eq('item_id', 'telescope').eq('status', 'active').limit(1)
  if (error) return false
  return (data?.length || 0) > 0
}

export async function submitReview({ taskId, rating, comment }) {
  const { data, error } = await supabase.rpc('submit_review', {
    p_task_id: taskId, p_rating: rating, p_comment: comment ?? '',
  })
  if (error) {
    if (error.code === 'PGRST202' || /submit_review/.test(error.message || '')) {
      throw new Error('리뷰 기능이 아직 DB에 설정되지 않았습니다. (submit_review 함수를 먼저 적용해 주세요)')
    }
    throw error
  }
  return data
}

export async function deleteReview(reviewId) {
  const { error } = await supabase.rpc('delete_review', { p_review_id: reviewId })
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

// ---- 쪽지 (notes) -------------------------------------------
// notes 테이블/RPC 미배포(42P01/PGRST202) 시 조회는 빈 배열로 폴백.

export async function listReceivedNotes(userId) {
  const { data, error } = await supabase
    .from('notes').select('*')
    .eq('recipient_id', userId)
    .order('created_at', { ascending: false })
  if (error) {
    if (error.code === '42P01') return []
    throw error
  }
  return data ?? []
}

export async function listSentNotes(userId) {
  const { data, error } = await supabase
    .from('notes').select('*')
    .eq('sender_id', userId)
    .order('created_at', { ascending: false })
  if (error) {
    if (error.code === '42P01') return []
    throw error
  }
  return data ?? []
}

export async function sendNote({ groupId, recipientId, body }) {
  const { data, error } = await supabase.rpc('send_note', {
    p_group_id: groupId, p_recipient_id: recipientId, p_body: body,
  })
  if (error) {
    if (error.code === 'PGRST202' || /send_note/.test(error.message || '')) {
      throw new Error('쪽지 기능이 아직 DB에 설정되지 않았습니다. (send_note 함수를 먼저 적용해 주세요)')
    }
    throw error
  }
  return Array.isArray(data) ? data[0] : data
}

// ---- 상점 ----------------------------------------------------
// 판매 중인 아이템 목록. store_items 미배포(42P01) 시 빈 배열.
export async function listStoreItems() {
  const { data, error } = await supabase
    .from('store_items')
    .select('id, name, price, emoji, description, gift_only, premium, tier')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  if (error) {
    // premium/tier 컬럼 미배포(42703) 시 해당 컬럼 없이 재조회
    if (error.code === '42703') {
      const { data: d2, error: e2 } = await supabase
        .from('store_items')
        .select('id, name, price, emoji, description, gift_only')
        .eq('is_active', true).order('sort_order', { ascending: true })
      if (e2) { if (e2.code === '42P01') return []; throw e2 }
      return (d2 ?? []).map((r) => ({ id: r.id, name: r.name, price: r.price, emoji: r.emoji, desc: r.description, giftOnly: r.gift_only, premium: false, tier: null }))
    }
    if (error.code === '42P01') return []
    throw error
  }
  return (data ?? []).map((r) => ({
    id: r.id, name: r.name, price: r.price, emoji: r.emoji,
    desc: r.description, giftOnly: r.gift_only, premium: !!r.premium, tier: r.tier || null,
  }))
}

// 아이템 구매(츄르 차감). 정가/검증은 서버(purchase_item)에서. 반환=새 잔액.
export async function purchaseItem(itemId, qty = 1) {
  const { data, error } = await supabase.rpc('purchase_item', { p_item_id: itemId, p_qty: qty })
  if (error) {
    if (error.code === 'PGRST202' || /purchase_item/.test(error.message || '')) {
      throw new Error('상점 구매 기능이 아직 DB에 설정되지 않았습니다. (purchase_item 함수를 먼저 적용해 주세요)')
    }
    throw error
  }
  return Number(data) || 0
}

// 내 인벤토리. 미사용(active) + 커플 링의 장착(used)/수락 대기(pending)까지. user_items 미배포 시 빈 배열.
export async function listInventory(userId) {
  const { data, error } = await supabase
    .from('user_items')
    .select('id, item_id, item_name, source, from_user_id, from_name, from_avatar, group_id, status, created_at')
    .eq('user_id', userId)
    .or('status.eq.active,and(item_id.eq.couple-ring,status.in.(used,pending)),and(item_id.eq.friend-ring,status.eq.used),and(item_id.like.theme-*,status.eq.used)')
    .order('created_at', { ascending: false })
  if (error) {
    if (error.code === '42P01') return []
    throw error
  }
  return data ?? []
}

// 소원권 사용: 준 사람(fromUserId)에게 소원을 보냄. 소원권 1장 소모.
export async function useWish({ fromUserId, wish }) {
  const { data, error } = await supabase.rpc('use_wish', { p_from_user_id: fromUserId, p_wish: wish })
  if (error) {
    if (error.code === 'PGRST202' || /use_wish/.test(error.message || '')) {
      throw new Error('소원권 기능이 아직 DB에 설정되지 않았습니다. (use_wish 함수를 먼저 적용해 주세요)')
    }
    throw error
  }
  return data
}

// 카세트 테이프: 음악 링크와 메시지를 상대 쪽지함으로. 카세트 1개 소모.
export async function useCassette({ groupId, recipientId, message, url }) {
  const { data, error } = await supabase.rpc('use_cassette', {
    p_group_id: groupId, p_recipient_id: recipientId, p_message: message ?? '', p_url: url,
  })
  if (error) {
    if (error.code === 'PGRST202' || /use_cassette/.test(error.message || '')) {
      throw new Error('카세트 테이프 기능이 아직 DB에 설정되지 않았습니다. (use_cassette 함수를 먼저 적용해 주세요)')
    }
    throw error
  }
  return data
}

// 링크: 클릭 가능한 링크와 메시지를 상대 쪽지함으로. 링크 1개 소모.
export async function useLink({ groupId, recipientId, message, url, label }) {
  const { data, error } = await supabase.rpc('use_link', {
    p_group_id: groupId, p_recipient_id: recipientId, p_message: message ?? '', p_url: url, p_label: label ?? '',
  })
  if (error) {
    if (error.code === 'PGRST202' || /use_link/.test(error.message || '')) {
      throw new Error('링크 기능이 아직 DB에 설정되지 않았습니다. (use_link 함수를 먼저 적용해 주세요)')
    }
    throw error
  }
  return data
}

// 비디오 테이프: 영상 링크와 메시지를 상대 쪽지함으로. 비디오 1개 소모.
export async function useVideo({ groupId, recipientId, message, url }) {
  const { data, error } = await supabase.rpc('use_video', {
    p_group_id: groupId, p_recipient_id: recipientId, p_message: message ?? '', p_url: url,
  })
  if (error) {
    if (error.code === 'PGRST202' || /use_video/.test(error.message || '')) {
      throw new Error('비디오 테이프 기능이 아직 DB에 설정되지 않았습니다. (use_video 함수를 먼저 적용해 주세요)')
    }
    throw error
  }
  return data
}

// 블루레이: 영상 링크와 메시지를 상대 쪽지함으로. 블루레이 1개 소모.
export async function useBluray({ groupId, recipientId, message, url }) {
  const { data, error } = await supabase.rpc('use_bluray', {
    p_group_id: groupId, p_recipient_id: recipientId, p_message: message ?? '', p_url: url,
  })
  if (error) {
    if (error.code === 'PGRST202' || /use_bluray/.test(error.message || '')) {
      throw new Error('블루레이 기능이 아직 DB에 설정되지 않았습니다. (use_bluray 함수를 먼저 적용해 주세요)')
    }
    throw error
  }
  return data
}

// 그룹 꾸미기 테마 적용: 프리미엄 그룹에 테마 아이템 1개 소모 + groups.deco_theme 설정.
export async function applyGroupTheme(groupId, theme) {
  const { error } = await supabase.rpc('apply_group_theme', { p_group_id: groupId, p_theme: theme })
  if (error) {
    if (error.code === 'PGRST202' || /apply_group_theme/.test(error.message || '')) {
      throw new Error('그룹 테마 기능이 아직 DB에 설정되지 않았습니다. (apply_group_theme 함수를 먼저 적용해 주세요)')
    }
    throw error
  }
}

// 그룹 테마 적용 해제: 아이템을 다시 미적용으로 되돌리고 그룹 테마 제거.
export async function unapplyGroupTheme(theme) {
  const { error } = await supabase.rpc('unapply_group_theme', { p_theme: theme })
  if (error) {
    if (error.code === 'PGRST202' || /unapply_group_theme/.test(error.message || '')) {
      throw new Error('그룹 테마 기능이 아직 DB에 설정되지 않았습니다. (unapply_group_theme 함수를 먼저 적용해 주세요)')
    }
    throw error
  }
}

// 냥피또(스크래치 복권): 서버가 당첨을 결정하고 냥피또 1개 소모 + 츄르 적립. 반환=당첨 츄르(0=꽝).
export async function scratchNyangpito() {
  const { data, error } = await supabase.rpc('scratch_nyangpito')
  if (error) {
    if (error.code === 'PGRST202' || /scratch_nyangpito/.test(error.message || '')) {
      throw new Error('냥피또 기능이 아직 DB에 설정되지 않았습니다. (scratch_nyangpito 함수를 먼저 적용해 주세요)')
    }
    throw error
  }
  return Number(data) || 0
}

// 전광판: 문구+색상으로 24시간 배너 게재. 전광판 1개 소모.
export async function useLedboard({ text, color }) {
  const { error } = await supabase.rpc('use_ledboard', { p_text: text, p_color: color })
  if (error) {
    if (error.code === 'PGRST202' || /use_ledboard/.test(error.message || '')) {
      throw new Error('전광판 기능이 아직 DB에 설정되지 않았습니다. (use_ledboard 함수를 먼저 적용해 주세요)')
    }
    throw error
  }
}

// 전광판 문구/색상 수정
export async function editLedBanner({ text, color }) {
  const { error } = await supabase.rpc('edit_led_banner', { p_text: text, p_color: color })
  if (error) throw error
}

// 전광판 게재 중단
export async function stopLedBanner() {
  const { error } = await supabase.rpc('stop_led_banner')
  if (error) throw error
}

// 내(커플)에게 보이는 활성 전광판 1건. 없으면 null.
export async function getMyLedBanner() {
  const { data, error } = await supabase.rpc('my_led_banner')
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42P01') return null
    throw error
  }
  const row = Array.isArray(data) ? data[0] : data
  return row || null
}

// 커플 링 나눠 끼기: 상대 쪽지함에 메시지와 함께 발송(수락 대기). 수락 전엔 그룹 미적용.
export async function useCoupleRing({ groupId, recipientId, message }) {
  const { data, error } = await supabase.rpc('use_couple_ring', {
    p_group_id: groupId, p_recipient_id: recipientId, p_message: message ?? null,
  })
  if (error) {
    if (error.code === 'PGRST202' || /use_couple_ring/.test(error.message || '')) {
      throw new Error('커플 링 기능이 아직 DB에 설정되지 않았습니다. (use_couple_ring 함수를 먼저 적용해 주세요)')
    }
    throw error
  }
  return data
}

// 커플 링 수령(나눠 끼기): 양쪽 인벤토리에 장착 링 생성 + 그룹 프리미엄 적용.
export async function claimCoupleRing(noteId) {
  const { data, error } = await supabase.rpc('claim_couple_ring', { p_note_id: noteId })
  if (error) {
    if (error.code === 'PGRST202' || /claim_couple_ring/.test(error.message || '')) {
      throw new Error('커플 링 기능이 아직 DB에 설정되지 않았습니다. (claim_couple_ring 함수를 먼저 적용해 주세요)')
    }
    throw error
  }
  return data
}

// 커플 링 거절: 보낸 사람 인벤토리에 다시 사용 가능한 상태로 복구.
export async function rejectCoupleRing(noteId) {
  const { data, error } = await supabase.rpc('reject_couple_ring', { p_note_id: noteId })
  if (error) {
    if (error.code === 'PGRST202' || /reject_couple_ring/.test(error.message || '')) {
      throw new Error('커플 링 기능이 아직 DB에 설정되지 않았습니다. (reject_couple_ring 함수를 먼저 적용해 주세요)')
    }
    throw error
  }
  return data
}

// 내가 커플 링을 이미 보유 중인지(상태 무관). 상점 구매 차단용.
export async function ownsCoupleRing(userId) {
  if (!userId) return false
  const { data, error } = await supabase
    .from('user_items').select('id').eq('user_id', userId).eq('item_id', 'couple-ring').limit(1)
  if (error) {
    if (error.code === '42P01') return false
    throw error
  }
  return (data ?? []).length > 0
}

// 커플 링이 장착된(프리미엄) 그룹 id 목록.
export async function listCoupleGroups(userId) {
  const { data, error } = await supabase
    .from('user_items').select('group_id')
    .eq('user_id', userId).eq('item_id', 'couple-ring').eq('status', 'used')
    .not('group_id', 'is', null)
  if (error) {
    if (error.code === '42P01') return []
    throw error
  }
  return [...new Set((data ?? []).map((r) => r.group_id))]
}

// 이 그룹이 커플 그룹(적용된 커플 링 존재)인지. RPC 미배포/실패 시 false.
export async function isCoupleGroup(groupId) {
  const { data, error } = await supabase.rpc('is_couple_group', { p_group_id: groupId })
  if (error) return false
  return !!data
}

// 이 그룹이 우정 그룹(적용된 우정 링 존재)인지. RPC 미배포/실패 시 false.
export async function isFriendGroup(groupId) {
  const { data, error } = await supabase.rpc('is_friend_group', { p_group_id: groupId })
  if (error) return false
  return !!data
}

// 콕 찌르기: 프리미엄 그룹에서 대상 멤버에게 알림 전송.
export async function pokeMember(groupId, targetUserId) {
  const { error } = await supabase.rpc('poke_member', { p_group_id: groupId, p_target: targetUserId })
  if (error) {
    if (error.code === 'PGRST202' || /poke_member/.test(error.message || '')) {
      throw new Error('콕 찌르기 기능이 아직 DB에 설정되지 않았습니다. (poke_member 함수를 먼저 적용해 주세요)')
    }
    throw error
  }
}

// 우정 링 사용: 2명 이상 그룹에 즉시 적용 + 전원에게 쪽지/알림.
export async function useFriendRing({ groupId, message }) {
  const { error } = await supabase.rpc('use_friend_ring', { p_group_id: groupId, p_message: message ?? null })
  if (error) {
    if (error.code === 'PGRST202' || /use_friend_ring/.test(error.message || '')) {
      throw new Error('우정 링 기능이 아직 DB에 설정되지 않았습니다. (use_friend_ring 함수를 먼저 적용해 주세요)')
    }
    throw error
  }
}

// 우정 링 수령: 내 인벤토리에 장착 우정 링 생성. (거절 없음)
export async function claimFriendRing(noteId) {
  const { error } = await supabase.rpc('claim_friend_ring', { p_note_id: noteId })
  if (error) {
    if (error.code === 'PGRST202' || /claim_friend_ring/.test(error.message || '')) {
      throw new Error('우정 링 기능이 아직 DB에 설정되지 않았습니다. (claim_friend_ring 함수를 먼저 적용해 주세요)')
    }
    throw error
  }
}

// 내가 속한 우정 그룹 id 목록(멤버 전원 즉시 인식). RPC 미배포/실패 시 빈 배열.
export async function listFriendGroups() {
  const { data, error } = await supabase.rpc('my_friend_group_ids')
  if (error) return []
  return (data ?? []).map((r) => (typeof r === 'string' ? r : r.my_friend_group_ids)).filter(Boolean)
}

// 아이템 선물(받는 사람 지정, 내 츄르 차감). 반환=내 새 잔액.
export async function giftItem(itemId, groupId, recipientId, qty = 1) {
  const { data, error } = await supabase.rpc('gift_item', {
    p_item_id: itemId, p_group_id: groupId, p_recipient_id: recipientId, p_qty: qty,
  })
  if (error) {
    if (error.code === 'PGRST202' || /gift_item/.test(error.message || '')) {
      throw new Error('선물 기능이 아직 DB에 설정되지 않았습니다. (gift_item 함수를 먼저 적용해 주세요)')
    }
    throw error
  }
  return Number(data) || 0
}

// 쪽지 상태 조회(알림 클릭 시 이동 목적지 결정용). 없으면 null.
export async function getNoteState(noteId) {
  if (!noteId) return null
  const { data, error } = await supabase
    .from('notes').select('id, kind, claimed, rejected, sender_id, recipient_id').eq('id', noteId).maybeSingle()
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST116') return null
    throw error
  }
  return data ?? null
}

// 선물 수령(쪽지함). 내 인벤토리에 아이템 생성.
export async function claimGift(noteId) {
  const { data, error } = await supabase.rpc('claim_gift', { p_note_id: noteId })
  if (error) {
    if (error.code === 'PGRST202' || /claim_gift/.test(error.message || '')) {
      throw new Error('선물 수령 기능이 아직 DB에 설정되지 않았습니다. (claim_gift 함수를 먼저 적용해 주세요)')
    }
    throw error
  }
  return data
}

// ---- 내 프로필 (연락처/생년월일 포함) ------------------------

export async function getMyProfile() {
  const { data, error } = await supabase.rpc('my_profile')
  if (error) throw error
  return Array.isArray(data) ? data[0] : data
}

export async function updateMyProfile({ contact, birthdate, subscribed_ott }) {
  const { data, error } = await supabase.rpc('update_my_profile', {
    p_contact: contact || null,
    p_birthdate: birthdate || null,
    p_ott: subscribed_ott ?? [],
  })
  if (error) throw error
  return Array.isArray(data) ? data[0] : data
}

// 내 잔액(츄르/coin) 조회. 원장이 아직 없거나 RPC 미배포 시 0 으로 폴백.
export async function getMyCoinBalance() {
  const { data, error } = await supabase.rpc('my_coin_balance')
  if (error) return 0
  return Number(data) || 0
}

// 내 츄르(coin) 적립/사용 내역. 최신순.
// 주의: coin_ledger RLS 는 관리자에게 전체 조회를 허용하므로(관리자 패널용),
//       반드시 user_id 를 명시해 본인 것만 가져와야 한다(관리자 계정 오노출 방지).
export async function getMyCoinHistory(limit = 200) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.id) return []
  const { data, error } = await supabase
    .from('coin_ledger')
    .select('id, delta, reason, ref_type, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) {
    if (error.code === '42P01') return [] // 테이블 미생성 시 빈 배열
    throw error
  }
  return data ?? []
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

// 관리자: 사용자별 츄르(coin) 잔액 { user_id: balance } 맵
export async function adminCoinBalances() {
  const { data, error } = await supabase.rpc('admin_coin_balances')
  if (error) {
    if (error.code === 'PGRST202') return {} // RPC 미배포 시 빈 맵
    throw error
  }
  const map = {}
  for (const r of data ?? []) map[r.user_id] = Number(r.balance) || 0
  return map
}

// 관리자: 츄르 수동 지급(+)/차감(-). 반환=대상의 새 잔액.
export async function adminGrantCoin({ userId, amount, reason }) {
  const { data, error } = await supabase.rpc('admin_grant_coin', {
    p_user_id: userId, p_amount: amount, p_reason: reason ?? '',
  })
  if (error) {
    if (error.code === 'PGRST202') throw new Error('츄르 지급 기능이 아직 DB에 설정되지 않았습니다. (admin_grant_coin 함수를 먼저 적용해 주세요)')
    throw error
  }
  return Number(data) || 0
}
