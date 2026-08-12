import { supabase } from './supabase'
import { itemName } from './storeMeta'
import { invalidateNotesCache } from './notesCache'

// 프로필에서 일반 조회 가능한 컬럼(민감정보 contact/birthdate 제외)
const PROFILE_COLS = 'id, nickname, role, status, created_at'

// ---- 그룹 ----------------------------------------------------

export async function listMyGroups() {
  // 관리자 계정은 RLS(gm_select) 상 모든 그룹의 멤버를 볼 수 있어 group_members!inner 가
  // 모든 그룹을 반환한다. "내 그룹" 은 실제 내가 멤버인 그룹만이어야 하므로 uid 로 후필터.
  const { data: sess } = await supabase.auth.getSession().catch(() => ({ data: null }))
  const uid = sess?.session?.user?.id || null
  const q = (cols) => supabase.from('groups').select(`*, group_members!inner(${cols})`)
    .order('created_at', { ascending: false })
    .order('joined_at', { referencedTable: 'group_members', ascending: true })
  let { data, error } = await q('user_id, display_nickname, avatar_url, left_at')
  if (error) { ({ data, error } = await q('user_id, display_nickname, avatar_url')) } // left_at 미배포 폴백
  if (error) throw error
  let rows = (data ?? []).map((g) => ({ ...g, group_members: (g.group_members || []).filter((m) => !m.left_at) }))
  // 탈퇴 안 한 실제 멤버인 그룹만(관리자여도 내가 가입한 그룹만)
  if (uid) rows = rows.filter((g) => (g.group_members || []).some((m) => m.user_id === uid))
  return rows
}

// 관리자 전용: 내가 가입하지 않은 그룹까지 모든 그룹을 반환(멤버십 후필터 없음).
// RLS 상 관리자는 모든 group_members 를 볼 수 있어 groups + inner 조인이 전체 그룹을 준다.
// (그룹 카드의 '미가입' 반투명 처리는 Dashboard 가 멤버십으로 판단)
export async function listAllGroups() {
  const q = (cols) => supabase.from('groups').select(`*, group_members!inner(${cols})`)
    .order('created_at', { ascending: false })
    .order('joined_at', { referencedTable: 'group_members', ascending: true })
  let { data, error } = await q('user_id, display_nickname, avatar_url, left_at')
  if (error) { ({ data, error } = await q('user_id, display_nickname, avatar_url')) } // left_at 미배포 폴백
  if (error) throw error
  return (data ?? []).map((g) => ({ ...g, group_members: (g.group_members || []).filter((m) => !m.left_at) }))
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
  const attempt = (p) => supabase.from('groups').update(p).eq('id', groupId).select().single()
  let cur = patch
  let res = await attempt(cur)
  // 미배포(신규) 선택 컬럼 폴백: 오류 메시지에 컬럼명이 있으면 그 컬럼을 빼고 재시도(누적)
  if (res.error && /wish_categories/i.test(res.error.message || '') && 'wish_categories' in cur) {
    const { wish_categories, ...rest } = cur // eslint-disable-line no-unused-vars
    cur = rest; res = await attempt(cur)
  }
  if (res.error && /emoji/i.test(res.error.message || '') && ('emoji' in cur || 'emoji_bg' in cur)) {
    const { emoji, emoji_bg, ...rest } = cur // eslint-disable-line no-unused-vars
    cur = rest; res = await attempt(cur)
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
  const row = { group_id: groupId, image: p.image, cols: p.cols, rows: p.rows, seed: p.seed, positions: p.positions || {}, elapsed_ms: 0 }
  let { error } = await supabase.from('group_puzzles').upsert(row)
  if (error && /elapsed_ms/i.test(error.message || '')) {   // 컬럼 미배포 폴백
    const { elapsed_ms, ...rest } = row // eslint-disable-line no-unused-vars
    ;({ error } = await supabase.from('group_puzzles').upsert(rest))
  }
  if (error) {
    if (error.code === '42P01') throw new Error('퍼즐 기능이 아직 DB에 설정되지 않았습니다. (group_puzzles 테이블을 먼저 적용해 주세요)')
    throw error
  }
}
export async function updatePuzzlePositions(groupId, positions) {
  const { error } = await supabase.from('group_puzzles').update({ positions }).eq('group_id', groupId)
  if (error && error.code !== '42P01') throw error
}
// 퍼즐 진행 시간(누적 ms) 저장 — 퍼즐판 접속자 중 대표 1명이 주기적으로 호출.
// 모두 나가면 아무도 호출하지 않아 시간이 자연히 멈춘다. (컬럼 미배포면 조용히 무시)
export async function updatePuzzleElapsed(groupId, elapsedMs) {
  const { error } = await supabase.from('group_puzzles')
    .update({ elapsed_ms: Math.max(0, Math.round(elapsedMs)) }).eq('group_id', groupId)
  if (error && error.code !== '42P01' && !/elapsed_ms/i.test(error.message || '')) throw error
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

// 커플 공간: 기념일 미입력 시 기본값(커플 링 수령일). 미배포/실패 시 null.
export async function coupleRingClaimedAt(groupId) {
  const { data, error } = await supabase.rpc('couple_ring_claimed_at', { p_group_id: groupId })
  if (error) return null
  return data || null
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
  // 소프트 탈퇴(left_at 기록) → 작성한 글/댓글/쪽지 보존. RPC 미배포 시 구 방식(하드 삭제) 폴백.
  const { error } = await supabase.rpc('leave_group', { p_group_id: groupId, p_user_id: userId || null })
  if (error) {
    if (error.code === 'PGRST202' || /leave_group/.test(error.message || '')) {
      const { error: e2 } = await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId)
      if (e2) throw e2
      return
    }
    throw error
  }
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
  let { data, error } = await supabase
    .from('group_members')
    .select('user_id, display_nickname, avatar_url')
    .eq('group_id', groupId)
    .is('left_at', null)
  if (error) { // left_at 미배포 폴백
    ({ data, error } = await supabase.from('group_members').select('user_id, display_nickname, avatar_url').eq('group_id', groupId))
  }
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
  const base = 'display_nickname, avatar_url, show_contact, show_birthdate, show_ott, nick_locked_until'
  const q = (sel) => supabase.from('group_members').select(sel).eq('group_id', groupId).eq('user_id', userId).maybeSingle()
  let { data, error } = await q(`${base}, graffiti_locked_until`)
  if (error?.code === '42703') ({ data, error } = await q(base)) // graffiti_locked_until 미배포 폴백
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

// 약속/추억으로 "바로" 등록: 상대에게 알림 없이 조용히 생성(위시로 올릴 때만 알림).
export async function createTaskScheduled({ groupId, title, description, category, media_info, done, schedule }) {
  const s = schedule || {}
  const remind = s.remind === '' || s.remind === null || s.remind === undefined ? null : Number(s.remind)
  const { data, error } = await supabase.rpc('create_task_scheduled', {
    p_group_id: groupId,
    p_title: title,
    p_description: description ?? '',
    p_category: category ?? null,
    p_media_info: media_info ?? null,
    p_done: !!done,
    p_scheduled_at: s.scheduledAt ?? null,
    p_time_set: s.timeSet ?? true,
    p_repeat: s.repeat || null,
    p_repeat_until: s.repeatUntil || null,
    p_remind: remind,
    p_participants: s.participantIds ?? [],
  })
  if (error) {
    if (error.code === 'PGRST202' || /create_task_scheduled/.test(error.message || '')) {
      throw new Error('약속/추억 바로 등록 기능이 아직 DB에 설정되지 않았습니다. (create_task_scheduled 함수를 먼저 적용해 주세요)')
    }
    throw error
  }
  return Array.isArray(data) ? data[0] : data
}

// 위시 유형별 정보 조회 Edge Function (OTT/영화→movie-lookup·TMDB, 독서→book-lookup·알라딘, 게임→game-lookup·RAWG, 공연→kopis-lookup·KOPIS)
const LOOKUP_FN = { OTT: 'movie-lookup', '영화': 'movie-lookup', '독서': 'book-lookup', '게임': 'game-lookup', '공연': 'kopis-lookup' }

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
    .from('task_comments').select('id, task_id, group_id, author_id, parent_id, body, created_at')
    .eq('task_id', taskId).order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function addComment({ taskId, groupId, body, authorId, parentId, mentionedIds }) {
  const row = { task_id: taskId, group_id: groupId, body, author_id: authorId, parent_id: parentId ?? null }
  if (mentionedIds && mentionedIds.length) row.mentioned_ids = mentionedIds
  let { data, error } = await supabase.from('task_comments').insert(row).select().single()
  // mentioned_ids 컬럼 미배포 환경에서도 댓글은 정상 등록되도록 폴백
  if (error && (error.code === '42703' || /mentioned_ids/.test(error.message || ''))) {
    delete row.mentioned_ids
    ;({ data, error } = await supabase.from('task_comments').insert(row).select().single())
  }
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
  // silent=true 는 '푸시 전용' 알림(오류 리포트 채팅 등) → 알림센터엔 표시하지 않음.
  let { data, error } = await supabase
    .from('notifications').select('*').eq('silent', false)
    .order('created_at', { ascending: false }).limit(limit)
  if (error && isMissingColumn(error)) { // silent 컬럼 미배포 폴백
    ({ data, error } = await supabase
      .from('notifications').select('*')
      .order('created_at', { ascending: false }).limit(limit))
  }
  if (error) throw error
  return data ?? []
}

export async function unreadNotificationCount() {
  let { count, error } = await supabase
    .from('notifications').select('id', { count: 'exact', head: true })
    .eq('is_read', false).eq('silent', false)
  if (error && isMissingColumn(error)) { // silent 컬럼 미배포 폴백
    ({ count, error } = await supabase
      .from('notifications').select('id', { count: 'exact', head: true }).eq('is_read', false))
  }
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

// 페이지네이션 지원 여부(paged=false 면 구버전 RPC → 1회 전량, 이후 페이지 없음)
let recvPaged = null // null=미확인, true=지원, false=미지원(구버전)
// 받은 쪽지: 최근 limit 개(offset 부터). 반환 { rows, hasMore }.
// 익명 쪽지는 발신자 정보를 가려 주는 전용 RPC 로 조회(완전 익명).
export async function listReceivedNotes(userId, limit = 15, offset = 0) {
  if (recvPaged !== false) {
    const { data, error } = await supabase.rpc('list_received_notes', { p_limit: limit, p_offset: offset })
    if (!error) { recvPaged = true; return { rows: data ?? [], hasMore: (data?.length ?? 0) >= limit } }
    if (error.code === '42P01') return { rows: [], hasMore: false }
    if (!(error.code === 'PGRST202' || /list_received_notes/.test(error.message || ''))) throw error
    recvPaged = false // 페이지네이션 파라미터 미배포(구버전) → 아래 폴백
  }
  // 폴백: 구버전은 전량 반환 → offset>0 이면 추가 페이지 없음
  if (offset > 0) return { rows: [], hasMore: false }
  const { data, error } = await supabase.rpc('list_received_notes')
  if (!error) return { rows: data ?? [], hasMore: false }
  // 아주 구버전(RPC 자체 없음) → 직접 조회
  if (error.code === 'PGRST202' || /list_received_notes/.test(error.message || '')) {
    const { data: d2, error: e2 } = await supabase
      .from('notes').select('*').eq('recipient_id', userId).order('created_at', { ascending: false })
    if (e2) { if (e2.code === '42P01') return { rows: [], hasMore: false }; throw e2 }
    return { rows: d2 ?? [], hasMore: false }
  }
  if (error.code === '42P01') return { rows: [], hasMore: false }
  throw error
}

// 받은 쪽지 중 아직 확인 안 한(is_read=false) 개수.
// 익명 쪽지는 notes_select RLS 상 수신자가 직접 조회할 수 없어 select count 에서 빠진다.
// → SECURITY DEFINER RPC(unread_note_count) 로 익명 포함 카운트. 미배포 시 직접 조회로 폴백.
export async function unreadNoteCount(userId) {
  if (!userId) return 0
  const { data, error } = await supabase.rpc('unread_note_count')
  if (!error) return data || 0
  const { count } = await supabase
    .from('notes').select('id', { count: 'exact', head: true })
    .eq('recipient_id', userId).eq('is_read', false)
  return count || 0
}

// 쪽지 읽음 처리(받은 사람만 — RLS: recipient_id = auth.uid())
export async function markNoteRead(noteId) {
  // 익명 쪽지는 notes_select 정책상 수신자가 직접 볼 수 없어 update .eq(id) 가 0행이 됨.
  // → SECURITY DEFINER RPC(수신자 본인 것만) 로 읽음 처리. 미배포 시 직접 update 로 폴백.
  const { error } = await supabase.rpc('mark_note_read', { p_id: noteId })
  if (error) {
    if (error.code === 'PGRST202' || /mark_note_read/.test(error.message || '')) {
      const { error: e2 } = await supabase.from('notes').update({ is_read: true }).eq('id', noteId)
      if (e2) throw e2
      return
    }
    throw error
  }
}

// UI 가 실제로 쓰는 컬럼만 조회(select('*') 대비 egress 절감)
const SENT_NOTE_COLS = 'id, group_id, sender_id, recipient_id, sender_name, recipient_name, sender_avatar, recipient_avatar, body, kind, is_read, created_at, item_id, item_name, claimed, rejected, media_url, anonymous, qty, timer_seconds, opened_at'
// 보낸 쪽지: 최근 limit 개(offset 부터). 반환 { rows, hasMore }.
export async function listSentNotes(userId, limit = 15, offset = 0) {
  const { data, error } = await supabase
    .from('notes').select(SENT_NOTE_COLS)
    .eq('sender_id', userId)
    .is('report_id', null)   // 오류 리포트(SYSTEM) 답장은 보낸함에 안 보이게
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) {
    if (error.code === '42P01') return { rows: [], hasMore: false }
    throw error
  }
  return { rows: data ?? [], hasMore: (data?.length ?? 0) >= limit }
}

// ---- 오류 리포트 ------------------------------------------------
const REPORT_NOT_READY = '오류 리포트 기능이 아직 설정되지 않았어요. (error-reports.sql 을 먼저 적용해 주세요)'
function reportErr(error) {
  if (error.code === 'PGRST202' || /error_report|submit_error_report/.test(error.message || '')) return new Error(REPORT_NOT_READY)
  return error
}

// 유저: 오류 리포트 제출
export async function submitErrorReport(title, body) {
  const { data, error } = await supabase.rpc('submit_error_report', { p_title: title, p_body: body })
  if (error) throw reportErr(error)
  return data
}
// 유저: SYSTEM 쪽지에 답장(해결 완료 전까지)
export async function replyErrorReport(reportId, body) {
  const { error } = await supabase.rpc('reply_error_report', { p_report_id: reportId, p_body: body })
  if (error) throw reportErr(error)
  invalidateNotesCache()
}
// 관리자: 리포트 목록
export async function adminListErrorReports() {
  const { data, error } = await supabase.rpc('admin_list_error_reports')
  if (error) throw reportErr(error)
  return data ?? []
}
// 관리자: 리포트 상세
export async function adminGetErrorReport(id) {
  const { data, error } = await supabase.rpc('admin_get_error_report', { p_id: id })
  if (error) throw reportErr(error)
  return (data && data[0]) || null
}
// 관리자: 상세 스레드(주고받은 SYSTEM 쪽지)
export async function adminErrorReportThread(id) {
  const { data, error } = await supabase.rpc('admin_error_report_thread', { p_id: id })
  if (error) throw reportErr(error)
  return data ?? []
}
// 유저: 내 리포트 채팅 스레드
export async function errorReportThread(reportId) {
  const { data, error } = await supabase.rpc('error_report_thread', { p_report_id: reportId })
  if (error) throw reportErr(error)
  return data ?? []
}
// 유저: 내 리포트 원문(채팅창 상단)
export async function errorReportInfo(reportId) {
  const { data, error } = await supabase.rpc('error_report_info', { p_report_id: reportId })
  if (error) throw reportErr(error)
  return (data && data[0]) || null
}
// 유저: 리포트 채팅 카드 삭제(받은함에서만 숨김)
export async function deleteErrorReportForUser(reportId) {
  const { error } = await supabase.rpc('delete_error_report_for_user', { p_report_id: reportId })
  if (error) throw reportErr(error)
  invalidateNotesCache()
}
// 유저: 깜냥 명의 보상 쪽지(채팅 없이 지급된 경우) 삭제 — 아이템을 전부 수령해야 가능
export async function deleteReportGiftNote(noteId) {
  const { error } = await supabase.rpc('delete_report_gift_note', { p_note_id: noteId })
  if (error) throw reportErr(error)
  invalidateNotesCache()
}
// 유저: 리포트 채팅 카드(앵커) 읽음 처리
export async function markReportRead(reportId) {
  const { data: sess } = await supabase.auth.getSession().catch(() => ({ data: null }))
  const uid = sess?.session?.user?.id
  if (!uid) return
  await supabase.from('notes').update({ is_read: true })
    .eq('report_id', reportId).eq('recipient_id', uid).eq('is_anchor', true)
}
// 관리자: SYSTEM 쪽지 보내기(추가 질문)
export async function adminSendErrorReport(reportId, body) {
  const { error } = await supabase.rpc('admin_send_error_report', { p_report_id: reportId, p_body: body })
  if (error) throw reportErr(error)
}
// 관리자: 해결 완료 토글
export async function adminResolveErrorReport(id, resolved) {
  const { error } = await supabase.rpc('admin_resolve_error_report', { p_id: id, p_resolved: resolved })
  if (error) throw reportErr(error)
}
// 관리자: 리포트 해결 처리 시 보상 지급용 — 리포터 기준 아이템별 지급 가능 여부/보유 수량
export async function adminReportRewardContext(reportId) {
  const { data, error } = await supabase.rpc('admin_report_reward_context', { p_report_id: reportId })
  if (error) throw reportErr(error)
  return data ?? []
}
// 관리자: 리포트 보상 지급(아이템 여러 개+수량 및/또는 츄르). items 없거나 빈 배열, coin 없거나 0이면 아무것도 지급하지 않음.
// 보상은 즉시 지급되지 않고(아이템) 리포트 채팅의 새 메시지로 전달된다 — 유저가 채팅에서 수령.
export async function adminGrantReportReward(reportId, { items, coin, reason } = {}) {
  const { data, error } = await supabase.rpc('admin_grant_report_reward', {
    p_report_id: reportId,
    p_items: items && items.length ? items.map((g) => ({ item_id: g.id, qty: g.qty })) : null,
    p_coin: coin || null,
    p_reason: reason || null,
  })
  if (error) throw reportErr(error)
  return data || {}
}

export async function sendNote({ groupId, recipientId, body, anonymous = false, timerSeconds = null }) {
  // p_anonymous 는 익명일 때만 전달(구버전 RPC 와 호환 유지)
  const params = { p_group_id: groupId, p_recipient_id: recipientId, p_body: body }
  if (anonymous) params.p_anonymous = true
  if (timerSeconds) params.p_timer_seconds = timerSeconds
  const { data, error } = await supabase.rpc('send_note', params)
  if (error) {
    if (error.code === 'PGRST202' || /send_note/.test(error.message || '')) {
      throw new Error('쪽지 기능이 아직 DB에 설정되지 않았습니다. (send_note 함수를 먼저 적용해 주세요)')
    }
    throw error
  }
  invalidateNotesCache()
  return Array.isArray(data) ? data[0] : data
}

// 물풍선 쪽지: 받는 사람이 처음 열 때 opened_at 을 서버에 최초 1회 기록(멱등).
export async function openWaterNote(noteId) {
  const { error } = await supabase.rpc('open_water_note', { p_note_id: noteId })
  if (error) throw error
}

// ---- 상점 ----------------------------------------------------
// 컬럼 미배포 감지: Postgres(42703) + PostgREST 스키마 캐시(PGRST204) + 메시지 매칭
const isMissingColumn = (err) => !!err && (
  err.code === '42703' || err.code === 'PGRST204' ||
  /schema cache|could not find .* column|column .* does not exist/i.test(err.message || '')
)
// 판매 중인 아이템 목록. store_items 미배포(42P01) 시 빈 배열.
export async function listStoreItems() {
  const { data, error } = await supabase
    .from('store_items')
    .select('id, name, price, emoji, description, gift_only, premium, tier, admin_only, image_svg, image_bg, category, deco_slot, sort_order, public_since')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  if (error) {
    // admin_only 컬럼 미배포(42703) 시 → premium/tier 는 유지하고 admin_only 만 빼고 재조회
    if (isMissingColumn(error)) {
      const { data: d1, error: e1 } = await supabase
        .from('store_items')
        .select('id, name, price, emoji, description, gift_only, premium, tier, sort_order')
        .eq('is_active', true).order('sort_order', { ascending: true })
      if (!e1) {
        return (d1 ?? []).map((r) => ({
          id: r.id, name: itemName(r.id, r.name), price: r.price, emoji: r.emoji,
          desc: r.description, giftOnly: r.gift_only, premium: !!r.premium, tier: r.tier || null,
          adminOnly: false, sortOrder: r.sort_order ?? 0,
        }))
      }
      // premium/tier 까지 미배포 시 최소 컬럼으로 재조회
      if (isMissingColumn(e1)) {
        const { data: d2, error: e2 } = await supabase
          .from('store_items')
          .select('id, name, price, emoji, description, gift_only')
          .eq('is_active', true).order('sort_order', { ascending: true })
        if (e2) { if (e2.code === '42P01') return []; throw e2 }
        return (d2 ?? []).map((r, i) => ({ id: r.id, name: itemName(r.id, r.name), price: r.price, emoji: r.emoji, desc: r.description, giftOnly: r.gift_only, premium: false, tier: null, adminOnly: false, sortOrder: i }))
      }
      if (e1.code === '42P01') return []
      throw e1
    }
    if (error.code === '42P01') return []
    throw error
  }
  return (data ?? []).map((r) => ({
    id: r.id, name: itemName(r.id, r.name), price: r.price, emoji: r.emoji,
    desc: r.description, giftOnly: r.gift_only, premium: !!r.premium, tier: r.tier || null,
    adminOnly: !!r.admin_only, imageSvg: r.image_svg || '', imageBg: r.image_bg || '',
    category: r.category || '', decoSlot: r.deco_slot || '', sortOrder: r.sort_order ?? 0,
    publicSince: r.public_since || null,
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
  const cols = 'id, item_id, item_name, source, from_user_id, from_name, from_avatar, group_id, status, created_at, used_at'
  const q = (sel) => supabase
    .from('user_items')
    .select(sel)
    .eq('user_id', userId)
    .or('status.eq.active,and(item_id.eq.couple-ring,status.in.(used,pending)),and(item_id.eq.friend-ring,status.eq.used),and(item_id.eq.name-tag,status.eq.used),and(item_id.eq.purin-mic,status.eq.used),and(item_id.like.theme-*,status.eq.used,group_id.not.is.null),and(item_id.like.deco-*,status.eq.used,group_id.not.is.null)')
    .order('created_at', { ascending: false })
  let { data, error } = await q(`${cols}, deco_tf`)
  if (error?.code === '42703') ({ data, error } = await q(cols)) // deco_tf 미배포 폴백
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
export async function useCassette({ groupId, recipientId, message, url, anonymous = false }) {
  const params = { p_group_id: groupId, p_recipient_id: recipientId, p_message: message ?? '', p_url: url }
  if (anonymous) params.p_anonymous = true
  const { data, error } = await supabase.rpc('use_cassette', params)
  if (error) {
    if (error.code === 'PGRST202' || /use_cassette/.test(error.message || '')) {
      throw new Error('카세트 테이프 기능이 아직 DB에 설정되지 않았습니다. (use_cassette 함수를 먼저 적용해 주세요)')
    }
    throw error
  }
  invalidateNotesCache()
  return data
}

// 링크: 클릭 가능한 링크와 메시지를 상대 쪽지함으로. 링크 1개 소모.
export async function useLink({ groupId, recipientId, message, url, label, anonymous = false }) {
  const params = { p_group_id: groupId, p_recipient_id: recipientId, p_message: message ?? '', p_url: url, p_label: label ?? '' }
  if (anonymous) params.p_anonymous = true
  const { data, error } = await supabase.rpc('use_link', params)
  if (error) {
    if (error.code === 'PGRST202' || /use_link/.test(error.message || '')) {
      throw new Error('링크 기능이 아직 DB에 설정되지 않았습니다. (use_link 함수를 먼저 적용해 주세요)')
    }
    throw error
  }
  invalidateNotesCache()
  return data
}

// 비디오 테이프: 영상 링크와 메시지를 상대 쪽지함으로. 비디오 1개 소모.
export async function useVideo({ groupId, recipientId, message, url, anonymous = false }) {
  const params = { p_group_id: groupId, p_recipient_id: recipientId, p_message: message ?? '', p_url: url }
  if (anonymous) params.p_anonymous = true
  const { data, error } = await supabase.rpc('use_video', params)
  if (error) {
    if (error.code === 'PGRST202' || /use_video/.test(error.message || '')) {
      throw new Error('비디오 테이프 기능이 아직 DB에 설정되지 않았습니다. (use_video 함수를 먼저 적용해 주세요)')
    }
    throw error
  }
  invalidateNotesCache()
  return data
}

// 블루레이: 영상 링크와 메시지를 상대 쪽지함으로. 블루레이 1개 소모.
export async function useBluray({ groupId, recipientId, message, url, anonymous = false }) {
  const params = { p_group_id: groupId, p_recipient_id: recipientId, p_message: message ?? '', p_url: url }
  if (anonymous) params.p_anonymous = true
  const { data, error } = await supabase.rpc('use_bluray', params)
  if (error) {
    if (error.code === 'PGRST202' || /use_bluray/.test(error.message || '')) {
      throw new Error('블루레이 기능이 아직 DB에 설정되지 않았습니다. (use_bluray 함수를 먼저 적용해 주세요)')
    }
    throw error
  }
  invalidateNotesCache()
  return data
}

// 폴라로이드 필름: 사진(urls, 최대 5장)을 상대 쪽지함으로. 장당 필름 1개씩 소모.
export async function usePolaroidFilm({ groupId, recipientId, message, urls, anonymous = false }) {
  const params = { p_group_id: groupId, p_recipient_id: recipientId, p_message: message ?? '', p_urls: urls || [] }
  if (anonymous) params.p_anonymous = true
  const { data, error } = await supabase.rpc('use_polaroid_film', params)
  if (error) {
    if (error.code === 'PGRST202' || /use_polaroid_film/.test(error.message || '')) {
      throw new Error('폴라로이드 필름 기능이 아직 DB에 설정되지 않았습니다. (use_polaroid_film 함수를 먼저 적용해 주세요)')
    }
    throw error
  }
  invalidateNotesCache()
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

// ---- 아바타 꾸미기(deco) 적용/해제/조회 ----
export async function applyAvatarDeco(itemId, groupId) {
  const { error } = await supabase.rpc('apply_avatar_deco', { p_item_id: itemId, p_group_id: groupId })
  if (error) {
    if (error.code === 'PGRST202' || /apply_avatar_deco/.test(error.message || '')) {
      throw new Error('아바타 꾸미기 기능이 아직 DB에 설정되지 않았습니다. (apply_avatar_deco 함수를 먼저 적용해 주세요)')
    }
    throw error
  }
}
export async function unapplyAvatarDeco(itemId, groupId) {
  const { error } = await supabase.rpc('unapply_avatar_deco', { p_item_id: itemId, p_group_id: groupId ?? null })
  if (error) {
    if (error.code === 'PGRST202' || /unapply_avatar_deco/.test(error.message || '')) {
      throw new Error('아바타 꾸미기 기능이 아직 DB에 설정되지 않았습니다. (unapply_avatar_deco 함수를 먼저 적용해 주세요)')
    }
    throw error
  }
}
// 그룹 멤버들의 장착 데코 → { [userId]: [{ id, tf }] }. 미배포/실패 시 빈 객체.
// 슬롯(유형)은 백엔드가 배타 처리하므로, 프론트는 장착된 아이템을 그대로 모두 렌더한다.
// tf 는 그룹 프로필 사진에 맞춘 위치·크기·각도 조정값({s,x,y,r}) — 없으면 null.
// 푸린 마이크 낙서도 같은 맵에 합쳐서 반환한다(id: '__graffiti', url) — 이렇게 하면 데코가
// 보이는 모든 화면(deco={decosByGroup...}를 Avatar 에 넘기는 곳)에서 별도 배선 없이 낙서도
// 같이 나온다. Avatar/MemberAvatar 가 이 특수 id 를 꺼내 사진 위 오버레이로 렌더한다.
export async function getGroupDecoMap(groupId) {
  if (!groupId) return {}
  const [decoRes, graffitiRes] = await Promise.all([
    supabase.rpc('list_group_avatar_decos', { p_group_id: groupId }),
    supabase.rpc('list_group_graffiti', { p_group_id: groupId }),
  ])
  if (decoRes.error) return {}
  const map = {}
  for (const r of decoRes.data ?? []) {
    (map[r.user_id] = map[r.user_id] || []).push({ id: r.item_id, tf: r.tf || null, usedAt: r.used_at || null })
  }
  // list_group_graffiti 는 아직 미배포 환경(PGRST202)일 수 있으므로 실패는 조용히 무시
  if (!graffitiRes.error) {
    for (const r of graffitiRes.data ?? []) {
      (map[r.target_user_id] = map[r.target_user_id] || []).push({ id: '__graffiti', url: r.image_url })
    }
  }
  return map
}

// 데코 조정값 저장. tf=null 이면 기본 위치로 초기화. 미배포 시 안내 메시지.
export async function setAvatarDecoTf(itemId, groupId, tf) {
  const { error } = await supabase.rpc('set_avatar_deco_tf', { p_item_id: itemId, p_group_id: groupId, p_tf: tf ?? null })
  if (error) {
    if (error.code === 'PGRST202' || /set_avatar_deco_tf/.test(error.message || '')) {
      throw new Error('꾸미기 조정 기능이 아직 DB에 설정되지 않았습니다. (deco-transform.sql 을 먼저 적용해 주세요)')
    }
    throw error
  }
}

// 타로 카드 목록(tarot_cards). sort_order 순서 그대로 → 덱 인덱스가 양쪽 기기에서 일치.
// tarot.js 의 MAJOR 모양으로 매핑. 미배포(42P01)/실패 시 빈 배열 → 프론트가 하드코딩 폴백 사용.
export async function listTarotCards() {
  const { data, error } = await supabase
    .from('tarot_cards')
    .select('rank, name, name_en, emoji, image_url, element, love, meaning_up, meaning_rev, is_active')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  if (error) return []
  return (data ?? []).map((c) => ({
    r: c.rank, ko: c.name, en: c.name_en, emoji: c.emoji, image: c.image_url || null,
    el: c.element, love: c.love, up: c.meaning_up, rev: c.meaning_rev,
  }))
}

// ---- 비밀 게시판 (secret board) ----
// 모든 접근은 security definer RPC 로만(익명: author_id 는 서버 밖으로 안 나감).
// 미배포(PGRST202/42883) 시 안내 메시지.
const boardNotReady = (error, fn) =>
  error && (error.code === 'PGRST202' || error.code === '42883' || new RegExp(fn).test(error.message || ''))

export async function listBoardPrefixes(groupId) {
  const { data, error } = await supabase.rpc('board_prefixes', { p_group: groupId })
  if (error) { if (boardNotReady(error, 'board_prefixes')) return []; throw error }
  return data ?? []
}
export async function addBoardPrefix(groupId, label) {
  const { data, error } = await supabase.rpc('board_add_prefix', { p_group: groupId, p_label: label })
  if (error) { if (boardNotReady(error, 'board_add_prefix')) throw new Error('비밀 게시판이 아직 DB에 설정되지 않았습니다. (secret-board.sql 을 먼저 적용해 주세요)'); throw error }
  return data
}
export async function updateBoardPrefix(id, label) {
  const { error } = await supabase.rpc('board_update_prefix', { p_id: id, p_label: label })
  if (error) throw error
}
export async function deleteBoardPrefix(id) {
  const { error } = await supabase.rpc('board_delete_prefix', { p_id: id })
  if (error) throw error
}

export async function listBoardPosts(groupId) {
  const { data, error } = await supabase.rpc('board_posts', { p_group: groupId })
  if (error) { if (boardNotReady(error, 'board_posts')) return []; throw error }
  return data ?? []
}

// ---- 익명 게시판 아이템(개설) ----
// 이 그룹에 개설된 게시판 이름(없으면 null). 멤버 목록/데이트 페이지에서 노출 여부 판단.
export async function getGroupBoard(groupId) {
  const { data, error } = await supabase.rpc('group_board', { p_group: groupId })
  if (error) return null   // 미배포/권한없음 → 미개설로 간주
  return data || null
}
// 게시판을 개설할 수 있는 내 그룹(프리미엄 + 미개설)
export async function boardEligibleGroups() {
  const { data, error } = await supabase.rpc('board_eligible_groups')
  if (error) {
    if (error.code === 'PGRST202' || /board_eligible_groups/.test(error.message || '')) return []
    throw error
  }
  return data ?? []
}
// 게시판 이름 변경(방장/관리자). 설정 페이지에서 사용.
export async function renameBoard(groupId, name) {
  const { data, error } = await supabase.rpc('board_rename', { p_group: groupId, p_name: name })
  if (error) {
    if (error.code === 'PGRST202' || /board_rename/.test(error.message || '')) {
      throw new Error('게시판 이름 변경 기능이 아직 DB에 설정되지 않았습니다. (board-rename.sql 을 먼저 적용해 주세요)')
    }
    throw error
  }
  return data
}
// 게시판 개설(아이템 1개 소모)
export async function setupSecretBoard(groupId, name) {
  const { data, error } = await supabase.rpc('board_setup', { p_group: groupId, p_name: name })
  if (error) {
    if (error.code === 'PGRST202' || /board_setup/.test(error.message || '')) {
      throw new Error('익명 게시판 기능이 아직 DB에 설정되지 않았습니다. (board-item.sql 을 먼저 적용해 주세요)')
    }
    throw error
  }
  return data
}

// ---- 확성기(그룹 전체 알림) ----
export async function sendMegaphone(groupId, body) {
  const { data, error } = await supabase.rpc('megaphone_send', { p_group: groupId, p_body: body })
  if (error) {
    if (error.code === 'PGRST202' || /megaphone_send/.test(error.message || '')) {
      throw new Error('확성기 기능이 아직 DB에 설정되지 않았습니다. (megaphone.sql 을 먼저 적용해 주세요)')
    }
    throw error
  }
  return data
}
export async function createBoardPost(groupId, prefixId, title, body) {
  const { data, error } = await supabase.rpc('board_create_post', { p_group: groupId, p_prefix: prefixId || null, p_title: title, p_body: body ?? '' })
  if (error) { if (boardNotReady(error, 'board_create_post')) throw new Error('비밀 게시판이 아직 DB에 설정되지 않았습니다. (secret-board.sql 을 먼저 적용해 주세요)'); throw error }
  return data
}
export async function updateBoardPost(id, prefixId, title, body) {
  const { error } = await supabase.rpc('board_update_post', { p_id: id, p_prefix: prefixId || null, p_title: title, p_body: body ?? '' })
  if (error) throw error
}
export async function deleteBoardPost(id) {
  const { error } = await supabase.rpc('board_delete_post', { p_id: id })
  if (error) throw error
}

export async function listBoardComments(postId) {
  const { data, error } = await supabase.rpc('board_comments', { p_post: postId })
  if (error) { if (boardNotReady(error, 'board_comments')) return []; throw error }
  return data ?? []
}
export async function addBoardComment(postId, parentId, body) {
  const { data, error } = await supabase.rpc('board_add_comment', { p_post: postId, p_parent: parentId || null, p_body: body })
  if (error) throw error
  return data
}
export async function updateBoardComment(id, body) {
  const { error } = await supabase.rpc('board_update_comment', { p_id: id, p_body: body })
  if (error) throw error
}
export async function deleteBoardComment(id) {
  const { error } = await supabase.rpc('board_delete_comment', { p_id: id })
  if (error) throw error
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

// 전광판 게재 권한 가져오기(상대 배너 내림 + 배상 + 내 전광판 게재). 반환=차감된 츄르.
export async function takeoverLedboard({ text, color }) {
  const { data, error } = await supabase.rpc('takeover_ledboard', { p_text: text, p_color: color })
  if (error) {
    if (error.code === 'PGRST202' || /takeover_ledboard/.test(error.message || '')) {
      throw new Error('전광판 권한 가져오기 기능이 아직 DB에 설정되지 않았습니다. (takeover_ledboard 함수를 먼저 적용해 주세요)')
    }
    throw error
  }
  return Number(data) || 0
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
  invalidateNotesCache()
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

// 우심뽀까 부르기: 상대에게 "입술 내밀고 기다려요" 푸시 알림 전송.
export async function summonToTouch(groupId, targetUserId) {
  const { error } = await supabase.rpc('summon_to_touch', { p_group_id: groupId, p_target: targetUserId })
  if (error) {
    if (error.code === 'PGRST202' || /summon_to_touch/.test(error.message || '')) {
      throw new Error('부르기 기능이 아직 DB에 설정되지 않았습니다. (summon_to_touch 함수를 먼저 적용해 주세요)')
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
  invalidateNotesCache()
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
export async function giftItem(itemId, groupId, recipientId, qty = 1, message = null) {
  const params = { p_item_id: itemId, p_group_id: groupId, p_recipient_id: recipientId, p_qty: qty, p_message: message }
  let { data, error } = await supabase.rpc('gift_item', params)
  // p_message 미배포(구버전 4-인자) 시 → 메시지 없이 재시도
  if (error && error.code === 'PGRST202') {
    const { p_message, ...rest } = params // eslint-disable-line no-unused-vars
    ;({ data, error } = await supabase.rpc('gift_item', rest))
  }
  if (error) {
    if (error.code === 'PGRST202' || /gift_item/.test(error.message || '')) {
      throw new Error('선물 기능이 아직 DB에 설정되지 않았습니다. (gift_item 함수를 먼저 적용해 주세요)')
    }
    throw error
  }
  invalidateNotesCache()
  return Number(data) || 0
}

// 쪽지에서 아이템 선물: 내 인벤토리에서 아이템을 꺼내 상대 쪽지함으로(수령 시 상대 인벤토리로).
// gift_item(츄르로 구매해 선물)과 달리 보유 아이템을 소모한다.
export async function giftOwnedItem(itemId, groupId, recipientId, qty = 1, { message = null, anonymous = false } = {}) {
  const { error } = await supabase.rpc('gift_owned_item', {
    p_item_id: itemId, p_group_id: groupId, p_recipient_id: recipientId, p_qty: qty, p_message: message, p_anonymous: anonymous,
  })
  if (error) {
    if (error.code === 'PGRST202' || /gift_owned_item/.test(error.message || '')) {
      throw new Error('아이템 선물 기능이 아직 DB에 설정되지 않았습니다. (gift_owned_item 함수를 먼저 적용해 주세요)')
    }
    throw error
  }
  invalidateNotesCache()
}

// 쪽지 작성: 사용 아이템/선물/사진/익명을 한 번에 처리하는 오케스트레이터.
//  useItem: null | { id, url }  (id: couple-ring|friend-ring|cassette|video|bluray|link)
//  gifts:   [{ id, qty }]       (내 보유 아이템)
//  photos:  [{ url }]           (폴라로이드 필름으로 첨부한 사진, 최대 5장)
//  anonymous: 지우개(익명). 커플/우정 링은 익명 불가.
export async function sendComposedNote({ groupId, recipientId, body, anonymous = false, useItem = null, gifts = [], photos = [] }) {
  const msg = (body || '').trim()
  if (useItem) {
    const { id, url, timer } = useItem
    if (id === 'couple-ring') return useCoupleRing({ groupId, recipientId, message: msg })
    if (id === 'friend-ring') return useFriendRing({ groupId, message: msg })
    if (id === 'cassette') return useCassette({ groupId, recipientId, message: msg, url, anonymous })
    if (id === 'video') return useVideo({ groupId, recipientId, message: msg, url, anonymous })
    if (id === 'bluray') return useBluray({ groupId, recipientId, message: msg, url, anonymous })
    if (id === 'link') return useLink({ groupId, recipientId, message: msg, url, anonymous })
    if (id === 'waterbomb') return sendNote({ groupId, recipientId, body: msg, anonymous, timerSeconds: timer })
    throw new Error('사용할 수 없는 아이템이에요.')
  }
  if (photos && photos.length > 0) {
    return usePolaroidFilm({ groupId, recipientId, message: msg, urls: photos.map((p) => p.url), anonymous })
  }
  if (gifts && gifts.length > 0) {
    // 여러 종류의 아이템을 쪽지 하나로 동봉해 전송
    return sendGiftNote({ groupId, recipientId, message: msg, anonymous, gifts })
  }
  return sendNote({ groupId, recipientId, body: msg, anonymous })
}

// 여러 아이템을 쪽지 하나로 선물(동봉). gifts=[{id, qty}]
export async function sendGiftNote({ groupId, recipientId, message = '', anonymous = false, gifts = [] }) {
  const p_gifts = (gifts || []).map((g) => ({ item_id: g.id, qty: g.qty || 1 }))
  const { data, error } = await supabase.rpc('send_gift_note', {
    p_group_id: groupId, p_recipient_id: recipientId, p_message: message || null, p_anonymous: !!anonymous, p_gifts,
  })
  if (error) {
    if (error.code === 'PGRST202' || /send_gift_note/.test(error.message || '')) {
      throw new Error('아이템 동봉 기능이 아직 DB에 설정되지 않았습니다. (send_gift_note 함수를 먼저 적용해 주세요)')
    }
    throw error
  }
  invalidateNotesCache()
  return data
}

// 쪽지 동봉 아이템 목록 조회 → { [noteId]: [{item_id, item_name, qty, claimed}] }
export async function listNoteItems(noteIds) {
  const ids = [...new Set((noteIds || []).filter(Boolean))]
  if (ids.length === 0) return {}
  const { data, error } = await supabase
    .from('note_items').select('note_id, item_id, item_name, qty, claimed').in('note_id', ids)
    .order('created_at', { ascending: true })
  if (error) { if (error.code === '42P01') return {}; throw error }
  const map = {}
  for (const r of data ?? []) (map[r.note_id] = map[r.note_id] || []).push(r)
  return map
}

// 개별/일괄 수령
export async function claimGiftItem(noteId, itemId) {
  const { error } = await supabase.rpc('claim_gift_item', { p_note_id: noteId, p_item_id: itemId })
  if (error) {
    if (error.code === 'PGRST202' || /claim_gift_item/.test(error.message || '')) {
      throw new Error('선물 수령 기능이 아직 DB에 설정되지 않았습니다. (claim_gift_item 함수를 먼저 적용해 주세요)')
    }
    throw error
  }
}
export async function claimGiftNoteAll(noteId) {
  const { error } = await supabase.rpc('claim_gift_note', { p_note_id: noteId })
  if (error) {
    if (error.code === 'PGRST202' || /claim_gift_note/.test(error.message || '')) {
      throw new Error('선물 수령 기능이 아직 DB에 설정되지 않았습니다. (claim_gift_note 함수를 먼저 적용해 주세요)')
    }
    throw error
  }
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

// 폴라로이드 사진 목록 조회 → { [noteId]: [{id, url, sort_order}] }.
// 인화(develop) 전에는 RLS 상 recipient 에게 아무 행도 안 보인다(sender 는 항상 보임).
export async function listNotePhotos(noteIds) {
  const ids = [...new Set((noteIds || []).filter(Boolean))]
  if (ids.length === 0) return {}
  const { data, error } = await supabase
    .from('note_photos').select('id, note_id, url, sort_order').in('note_id', ids)
    .order('sort_order', { ascending: true })
  if (error) { if (error.code === '42P01') return {}; throw error }
  const map = {}
  for (const r of data ?? []) (map[r.note_id] = map[r.note_id] || []).push(r)
  return map
}
// 인화하기: 받은 폴라로이드 쪽지를 열람 가능 상태로(사진 공개)
export async function developPolaroidNote(noteId) {
  const { error } = await supabase.rpc('develop_polaroid_note', { p_note_id: noteId })
  if (error) {
    if (error.code === 'PGRST202' || /develop_polaroid_note/.test(error.message || '')) {
      throw new Error('인화 기능이 아직 DB에 설정되지 않았습니다. (develop_polaroid_note 함수를 먼저 적용해 주세요)')
    }
    throw error
  }
  invalidateNotesCache()
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

// 내 회원 등급: 커플 링(장착)=vvip, 우정 링(장착)=vip, 그 외 normal.
export async function getMyGrade() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.id) return 'normal'
  const { data, error } = await supabase
    .from('user_items')
    .select('item_id')
    .eq('user_id', user.id)
    .eq('status', 'used')
    .in('item_id', ['couple-ring', 'friend-ring'])
  if (error) return 'normal'
  const ids = new Set((data || []).map((r) => r.item_id))
  return ids.has('couple-ring') ? 'vvip' : ids.has('friend-ring') ? 'vip' : 'normal'
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

// ---- 퀘스트 (마이 페이지) ----
// 퀘스트 상태 조회 { balance, grade, daily:[...], random:{...} }. RPC 미배포 시 null.
export async function getQuests() {
  const { data, error } = await supabase.rpc('get_quests')
  if (error) {
    if (error.code === 'PGRST202' || /get_quests/.test(error.message || '')) return null
    throw error
  }
  return data
}
// 완료돼서 "받기" 가능한 퀘스트가 하나라도 있는지(하단 탭 배지용, 가벼운 조회). RPC 미배포 시 false.
export async function hasClaimableQuest() {
  const { data, error } = await supabase.rpc('has_claimable_quest')
  if (error) {
    if (error.code === 'PGRST202' || /has_claimable_quest/.test(error.message || '')) return false
    throw error
  }
  return !!data
}
// 퀘스트 보상 수령 → 새 잔액 반환
export async function claimQuest(key) {
  const { data, error } = await supabase.rpc('claim_quest', { p_key: key })
  if (error) throw error
  return Number(data) || 0
}
// 랜덤 슬롯 보상 수령 → 새 잔액. 30분 후 다음 퀘스트.
export async function claimSlotQuest(slot) {
  const { data, error } = await supabase.rpc('claim_slot_quest', { p_slot: slot })
  if (error) throw error
  return Number(data) || 0
}
// 랜덤 슬롯 교체(1츄르) → 갱신된 퀘스트 상태 반환
export async function rerollSlotQuest(slot) {
  const { data, error } = await supabase.rpc('reroll_slot_quest', { p_slot: slot })
  if (error) throw error
  return data
}

// ---- 관리자: 랜덤 퀘스트 정의(quest_defs) CRUD (RLS 상 쓰기는 관리자만) ----
export async function adminListQuestDefs() {
  const { data, error } = await supabase.from('quest_defs')
    .select('id, title, body, emoji, emoji_bg, reward, grade, active, sort_order').order('sort_order', { ascending: true })
  if (error) {
    if (error.code === '42P01') return []
    // emoji/emoji_bg 컬럼 미배포(42703) 시 → 해당 컬럼 없이 재조회
    if (isMissingColumn(error)) {
      const { data: d1, error: e1 } = await supabase.from('quest_defs')
        .select('id, title, body, reward, grade, active, sort_order').order('sort_order', { ascending: true })
      if (e1) throw e1
      return d1 ?? []
    }
    throw error
  }
  return data ?? []
}
export async function adminUpsertQuestDef(def) {
  const row = {
    id: def.id, title: def.title, body: def.body ?? '', emoji: def.emoji ?? '', emoji_bg: def.emoji_bg ?? '',
    reward: Number(def.reward) || 0, grade: def.grade || 'all', active: !!def.active,
  }
  let { error } = await supabase.from('quest_defs').upsert(row)
  // emoji/emoji_bg 컬럼 미배포 시 → 해당 컬럼 제외하고 재시도
  if (error && error.code === '42703') {
    const { emoji, emoji_bg, ...rest } = row // eslint-disable-line no-unused-vars
    ;({ error } = await supabase.from('quest_defs').upsert(rest))
  }
  if (error) throw error
}
export async function adminDeleteQuestDef(id) {
  const { error } = await supabase.from('quest_defs').delete().eq('id', id)
  if (error) throw error
}

// ---- 관리자: 데일리 퀘스트 정의(quest_daily_defs) — key 는 고정(attend/visit/note),
// 이모지·배경색·명칭·보상만 수정. RLS 상 쓰기는 관리자만 ----
export async function adminListDailyQuestDefs() {
  const { data, error } = await supabase.from('quest_daily_defs')
    .select('key, title, emoji, emoji_bg, reward, sort_order, active').order('sort_order', { ascending: true })
  if (error) { if (error.code === '42P01') return []; throw error }
  return data ?? []
}
export async function adminUpsertDailyQuestDef(def) {
  const row = {
    key: def.key, title: def.title, emoji: def.emoji ?? '',
    emoji_bg: def.emoji_bg ?? '', reward: Number(def.reward) || 0,
  }
  const { error } = await supabase.from('quest_daily_defs').update(row).eq('key', def.key)
  if (error) throw error
}
// 그룹 방문 기록(데일리 '그룹 방문' 퀘스트). 실패는 조용히 무시.
export async function touchGroupVisit() {
  try { await supabase.rpc('touch_group_visit') } catch { /* noop */ }
}

// 랜덤 퀘스트 방문/행동 이벤트 기록(데이트/뽀뽀/프리미엄상점/일정 등). 실패는 조용히 무시.
export async function touchQuest(key) {
  try { await supabase.rpc('touch_quest', { p_key: key }) } catch { /* noop */ }
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
// 관리자: 역할 변경(member ↔ admin)
export async function adminSetRole(userId, role) {
  return invokeAdmin({ action: 'set-role', userId, role })
}
// 관리자: 비밀번호 초기화
export async function adminSetPassword(userId, password) {
  return invokeAdmin({ action: 'set-password', userId, password })
}

// ---- 칭찬 스티커 (커플 전용) ----
// 스티커판 아이템 사용 → 색을 골라 내 칭찬판 활성(소모)
export async function useStickerBoard(itemId, color) {
  const { error } = await supabase.rpc('use_sticker_board', { p_item_id: itemId, p_color: color })
  if (error) {
    if (error.code === 'PGRST202' || /use_sticker_board/.test(error.message || '')) {
      throw new Error('칭찬 스티커 기능이 아직 DB에 설정되지 않았습니다. (praise-stickers.sql 을 먼저 적용해 주세요)')
    }
    throw error
  }
}
// 칭찬판 조회 → { viewer, members:[{user_id,name,variant}], stickers:[{owner_id,slot,reason,from_id,id,created_at}] }
export async function praiseGet(groupId) {
  const { data, error } = await supabase.rpc('praise_get', { p_group_id: groupId })
  if (error) {
    if (error.code === 'PGRST202' || /praise_get/.test(error.message || '')) return null // 미배포
    throw error
  }
  return data
}
// 상대 판 빈 칸에 스티커 붙이기
export async function praisePlace(groupId, ownerId, slot, reason) {
  const { error } = await supabase.rpc('praise_place', { p_group_id: groupId, p_owner_id: ownerId, p_slot: slot, p_reason: reason })
  if (error) throw error
}
// 내가 붙인 스티커 내용 수정
export async function praiseEdit(stickerId, reason) {
  const { error } = await supabase.rpc('praise_edit', { p_sticker_id: stickerId, p_reason: reason })
  if (error) throw error
}
// 완성한 내 판에서 소원권 수령 → 인벤토리에 소원권 지급
export async function praiseClaim(boardId) {
  const { error } = await supabase.rpc('praise_claim', { p_board_id: boardId })
  if (error) throw error
}
// 특정(과거 완성) 판 조회 → { board_id, owner_id, variant, color, started_at, completed_at, stickers }
export async function praiseBoardGet(boardId) {
  const { data, error } = await supabase.rpc('praise_board_get', { p_board_id: boardId })
  if (error) throw error
  return data
}

// ---- 명찰(24h 닉네임 변경) / 타임머신 ----
export async function useNameTag(groupId, nickname) {
  const { data, error } = await supabase.rpc('use_name_tag', { p_group_id: groupId, p_nickname: nickname })
  if (error) throw error
  return data // { target_id, nickname, until }
}
export async function nametagState(groupId) {
  const { data, error } = await supabase.rpc('nametag_state', { p_group_id: groupId })
  if (error) { if (error.code === 'PGRST202') return null; throw error }
  return data // { active:{target_id,nickname,until}|null, mine:{until}|null }
}

// ---- 푸린 마이크(24h 짝꿍 프로필 낙서) ----
// imageUrl: 낙서를 그려 업로드한 PNG(투명 배경) URL. 처음 사용 시 아이템 1개 소모 + 24시간 시작,
// 이미 활성 중(내가 그 짝꿍에게 건 것)이면 추가 소모 없이 그림만 갱신(만료 시각은 그대로).
export async function usePurinMic(groupId, imageUrl) {
  const { data, error } = await supabase.rpc('use_purin_mic', { p_group_id: groupId, p_image_url: imageUrl })
  if (error) {
    if (error.code === 'PGRST202' || /use_purin_mic/.test(error.message || '')) {
      throw new Error('푸린 마이크 기능이 아직 DB에 설정되지 않았습니다. (use_purin_mic 함수를 먼저 적용해 주세요)')
    }
    throw error
  }
  return data // { target_id, image_url, until }
}
export async function purinMicState(groupId) {
  const { data, error } = await supabase.rpc('purin_mic_state', { p_group_id: groupId })
  if (error) { if (error.code === 'PGRST202') return null; throw error }
  return data // { active:{target_id,image_url,until}|null }
}
export async function useTimeMachine(noteId) {
  const { data, error } = await supabase.rpc('use_time_machine', { p_note_id: noteId })
  if (error) throw error
  return data // 새 opened_at(timestamptz)
}

// ---- 관리자: 푸시 알림 메시지 템플릿 ----
export async function listNotifTemplates() {
  const { data, error } = await supabase.rpc('admin_list_notifs')
  if (error) { if (error.code === 'PGRST202') return [] ; throw error }
  return data ?? []
}
export async function updateNotifTemplate(key, title, body, emoji, emojiBg) {
  const args = { p_key: key, p_title: title, p_body: body, p_emoji: emoji ?? '' }
  const { error } = await supabase.rpc('admin_set_notif', { ...args, p_emoji_bg: emojiBg ?? '' })
  if (!error) return
  // emoji_bg 인자 미배포(구버전 함수) → 배경색 없이 저장
  if (error.code === 'PGRST202') {
    const { error: e2 } = await supabase.rpc('admin_set_notif', args)
    if (e2) throw e2
    return
  }
  throw error
}
// 알림센터 아이콘 맵 (type/key → { emoji, bg }). 미배포 시 emoji 만 있는 구버전으로 폴백.
export async function getNotifStyles() {
  const { data, error } = await supabase.rpc('notif_styles')
  if (!error) return data || {}
  if (error.code !== 'PGRST202') throw error
  const { data: em, error: e2 } = await supabase.rpc('notif_emojis')
  if (e2) { if (e2.code === 'PGRST202') return {}; throw e2 }
  const out = {}
  for (const k in (em || {})) out[k] = { emoji: em[k] }
  return out
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

// ---- 관리자: 상점 아이템 관리 (RLS 상 store_items 쓰기는 관리자만 허용) ----
// 비활성 포함 전체 목록 (sort_order 순).
export async function adminListStoreItems() {
  const cols = 'id, name, price, emoji, description, gift_only, sort_order, is_active, premium, tier, admin_only, image_svg, image_bg, category, deco_slot'
  let res = await supabase.from('store_items').select(cols).order('sort_order', { ascending: true })
  if (isMissingColumn(res.error)) {
    // premium/tier/admin_only/image_*/category 미배포 환경 폴백
    res = await supabase.from('store_items')
      .select('id, name, price, emoji, description, gift_only, sort_order, is_active')
      .order('sort_order', { ascending: true })
  }
  if (res.error) throw res.error
  return (res.data ?? []).map((r) => ({
    id: r.id, name: r.name, price: r.price, emoji: r.emoji, description: r.description ?? '',
    giftOnly: !!r.gift_only, sortOrder: r.sort_order ?? 0, isActive: r.is_active !== false,
    premium: !!r.premium, tier: r.tier || '', adminOnly: !!r.admin_only,
    imageSvg: r.image_svg || '', imageBg: r.image_bg || '', category: r.category || '', decoSlot: r.deco_slot || '',
  }))
}

// 추가/수정 (id 기준 upsert). item: { id, name, price, emoji, description, giftOnly, sortOrder, isActive, premium, tier }
export async function adminUpsertStoreItem(item) {
  const row = {
    id: String(item.id || '').trim(),
    name: String(item.name || '').trim(),
    price: Math.max(0, parseInt(item.price, 10) || 0),
    emoji: item.emoji ?? '',
    description: item.description ?? '',
    gift_only: !!item.giftOnly,
    sort_order: parseInt(item.sortOrder, 10) || 0,
    is_active: item.isActive !== false,
    premium: !!item.premium,
    tier: item.tier ? String(item.tier) : null,
    admin_only: !!item.adminOnly,
    image_svg: item.imageSvg ? String(item.imageSvg) : null,
    image_bg: item.imageBg ? String(item.imageBg) : null,
    category: item.category ? String(item.category) : null,
    deco_slot: item.decoSlot ? String(item.decoSlot).trim() : null,
  }
  if (!row.id) throw new Error('아이템 ID를 입력해 주세요.')
  if (!row.name) throw new Error('아이템 이름을 입력해 주세요.')
  let res = await supabase.from('store_items').upsert(row).select().single()
  if (isMissingColumn(res.error)) {
    // premium/tier/admin_only/image_*/category/deco_slot 미배포 환경 폴백
    const { premium, tier, admin_only, image_svg, image_bg, category, deco_slot, ...rest } = row // eslint-disable-line no-unused-vars
    res = await supabase.from('store_items').upsert(rest).select().single()
  }
  if (res.error) throw res.error
  return res.data
}

// 정렬 순서 일괄 갱신(관리자 목록 ▲▼ 재정렬용). items: [{ id, sortOrder }]
export async function adminReorderStoreItems(items) {
  for (const { id, sortOrder } of items) {
    const { error } = await supabase.from('store_items').update({ sort_order: sortOrder }).eq('id', id)
    if (error) throw error
  }
}

export async function adminSetStoreItemActive(id, active) {
  const { error } = await supabase.from('store_items').update({ is_active: !!active }).eq('id', id)
  if (error) throw error
}

export async function adminDeleteStoreItem(id) {
  const { error } = await supabase.from('store_items').delete().eq('id', id)
  if (error) throw error
}
