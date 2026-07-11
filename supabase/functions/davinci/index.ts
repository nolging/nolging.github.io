// @ts-nocheck  (Deno 런타임 전용 — VSCode TS 서버는 Deno 전역/URL import 를 모름)
// Supabase Edge Function: davinci  (다빈치코드 심판)
//
// 숨은 정보 게임이라 비밀 상태(각자 타일 숫자, 더미)는 이 함수(service_role)만 접근.
// 클라이언트는 자기 것 + 공개된 것만 view 로 받음. 츄르 베팅 정산도 여기서 처리.
//
// ── 배포 (둘 중 하나) ──────────────────────────────────────────
// A) 대시보드 에디터(권장, CLI 불필요):
//    Supabase 대시보드 → Edge Functions → "Deploy a new function" →
//    이름 davinci → 이 파일 전체를 붙여넣기 → Deploy.
//    (Verify JWT 는 켠 채로 두면 됨. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
//     시크릿은 런타임에 자동 주입되므로 따로 등록 안 해도 됨.)
// B) CLI:  supabase functions deploy davinci
//
// 단일 파일 + 외부 의존성은 아래 esm.sh import 하나뿐 → 에디터 붙여넣기로 충분.
//
// action:
//  open        {groupId}            현재/신규 로비 반환
//  view        {matchId}            내 시점 상태 재조회
//  stake       {matchId, stake}     로비에서 판돈 설정(ready 초기화)
//  ready       {matchId, ready}     준비 토글(판돈보다 보유가 적으면 준비 불가)
//  start       {matchId}            둘 다 준비 시 대국 시작(딜)
//  place       {matchId, slot}      조커를 내 줄 slot 위치에 배치
//  guess       {matchId, pos, val}  상대 pos 타일을 val(0~11 | 'joker')로 추리
//  decide      {matchId, cont}      정답 후 계속(true)/멈춤(false)
//  selfreveal  {matchId, pos}       더미 없음+오답 시 내 타일 공개
//  resign      {matchId}            기권(상대 승리)
//  reset       {matchId}            대국 종료 후 새 로비로

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

// ---- 게임 규칙 헬퍼 --------------------------------------------
const tileKey = (t) => t.n * 2 + (t.c === 'w' ? 1 : 0)     // 흑<백 정렬키
function makeDeck() {
  const d = []
  for (const c of ['b', 'w']) for (let n = 0; n <= 11; n++) d.push({ c, n, j: false, up: false })
  d.push({ c: 'b', n: null, j: true, up: false })
  d.push({ c: 'w', n: null, j: true, up: false })
  return d
}
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]] } return a }
// 숫자 타일을 오름차순 유지되도록 삽입(조커는 투명 취급). 삽입 인덱스 반환.
function insertNumbered(hand, tile) {
  const k = tileKey(tile)
  let i = 0
  for (; i < hand.length; i++) { const t = hand[i]; if (t.j) continue; if (tileKey(t) > k) break }
  hand.splice(i, 0, tile)
  return i
}
const other = (s, uid) => s.players.find((p) => p.uid !== uid).uid
const nameOf = (s, uid) => (s.players.find((p) => p.uid === uid) || {}).name || '?'
function eliminated(s, uid) {
  if ((s.toPlace[uid] || []).length) return false
  const h = s.hands[uid] || []
  return h.length > 0 && h.every((t) => t.up)
}
function beginTurn(s) {
  s.drawn = s.deck.length ? { uid: s.turn, tile: s.deck.shift() } : null
  s.phase = 'guess'
}
function trySetupDone(s) {
  const pending = s.players.some((p) => (s.toPlace[p.uid] || []).length)
  if (!pending) { s.turn = s.first; beginTurn(s) }
}
function log(s, t) { s.log.push({ t }); if (s.log.length > 40) s.log.shift() }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  let p: any
  try { p = await req.json() } catch { return json({ error: '잘못된 요청' }, 400) }
  const action = p.action

  // 호출자 식별
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  const { data: u } = token ? await admin.auth.getUser(token) : { data: null }
  const caller = u?.user?.id
  if (!caller) return json({ error: '로그인이 필요합니다.' }, 401)

  const balanceOf = async (uid) => {
    const { data } = await admin.from('coin_ledger').select('delta').eq('user_id', uid)
    return (data || []).reduce((a, r) => a + (r.delta || 0), 0)
  }
  const membersOf = async (groupId) => {
    const { data } = await admin.from('group_members')
      .select('user_id, display_nickname, avatar_url, profiles(nickname)').eq('group_id', groupId)
    return (data || []).map((m) => ({ uid: m.user_id, name: m.display_nickname || m.profiles?.nickname || '?', avatar: m.avatar_url || null }))
  }
  const isPremium = async (groupId) => {
    const [{ data: cp }, { data: fr }] = await Promise.all([
      admin.rpc('is_couple_group', { p_group_id: groupId }),
      admin.rpc('is_friend_group', { p_group_id: groupId }),
    ])
    return !!cp || !!fr
  }

  async function viewOf(row, me) {
    const s = row.state || {}
    const opp = s.players ? other(s, me) : null
    const myBal = await balanceOf(me)
    const stakeOk = {}
    if (s.players) for (const pl of s.players) stakeOk[pl.uid] = (pl.uid === me ? myBal : await balanceOf(pl.uid)) >= (row.stake || 0)
    const reveal = row.status === 'ended'   // 종료 시 상대 패까지 공개
    const hideTile = (t) => (t.up || reveal) ? { ...t, up: t.up } : { c: t.c, n: null, j: false, up: false }
    return {
      matchId: row.id, status: row.status, stake: row.stake, winner: row.winner,
      phase: s.phase || 'lobby', turn: s.turn || null, first: s.first || null,
      players: s.players || [], ready: s.ready || {},
      meUid: me, oppUid: opp,
      myHand: s.hands?.[me] || [],
      oppHand: opp ? (s.hands?.[opp] || []).map(hideTile) : [],
      deckCount: s.deck?.length || 0,
      drawn: s.drawn ? (s.drawn.uid === me ? { ...s.drawn.tile } : { hidden: true, uid: s.drawn.uid }) : null,
      myToPlace: (s.toPlace?.[me] || []).map((x) => ({ ...x })),
      oppPlacing: opp ? (s.toPlace?.[opp] || []).length > 0 : false,
      log: s.log || [],
      lastGuess: s.lastGuess || null,
      myBalance: myBal, stakeOk,
      settledAmount: s.settledAmount ?? null,
    }
  }

  async function settle(row, s, winnerUid) {
    s.winner = winnerUid; s.phase = 'ended'
    row.status = 'ended'; row.winner = winnerUid
    log(s, `🏆 ${nameOf(s, winnerUid)} 님 승리!`)
    if ((row.stake || 0) > 0 && !s.settled) {
      const loser = other(s, winnerUid)
      const { data: exist } = await admin.from('coin_ledger').select('id').eq('ref_type', 'davinci').eq('ref_id', row.id).limit(1)
      if (!exist?.length) {
        const bal = await balanceOf(loser)
        const amt = Math.max(0, Math.min(row.stake, bal))
        if (amt > 0) {
          await admin.from('coin_ledger').insert([
            { user_id: winnerUid, delta: amt, reason: '다빈치코드 승리', ref_type: 'davinci', ref_id: row.id },
            { user_id: loser, delta: -amt, reason: '다빈치코드 패배', ref_type: 'davinci', ref_id: row.id },
          ])
        }
        s.settledAmount = amt
      }
      s.settled = true
    }
  }

  // 낙관적 잠금(updated_at 비교) + 재시도
  async function withMatch(matchId, fn) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data: row, error } = await admin.from('davinci_matches').select('*').eq('id', matchId).maybeSingle()
      if (error || !row) throw new Error('경기를 찾을 수 없어요.')
      await fn(row.state, row)   // fn 이 row.state / row.status / row.stake / row.winner 를 직접 변경
      const { data: upd } = await admin.from('davinci_matches')
        .update({ state: row.state, status: row.status, stake: row.stake, winner: row.winner, updated_at: new Date().toISOString() })
        .eq('id', matchId).eq('updated_at', row.updated_at).select('id')
      if (upd && upd.length) return row
      await new Promise((r) => setTimeout(r, 40 * (attempt + 1)))
    }
    throw new Error('동시 업데이트 충돌 — 다시 시도해 주세요.')
  }

  try {
    // ---- open ----
    if (action === 'open') {
      const groupId = p.groupId
      const mem = await membersOf(groupId)
      if (!mem.find((x) => x.uid === caller)) return json({ error: '이 그룹의 멤버가 아니에요.' }, 403)
      if (mem.length !== 2) return json({ error: '2인 그룹에서만 플레이할 수 있어요.' }, 400)
      if (!(await isPremium(groupId))) return json({ error: '프리미엄 그룹 전용 기능이에요.' }, 403)
      const { data: rows } = await admin.from('davinci_matches').select('*')
        .eq('group_id', groupId).neq('status', 'cancelled').order('created_at', { ascending: false }).limit(1)
      let row = rows?.[0]
      if (!row) {
        const s0 = { players: mem, ready: {}, phase: 'lobby', log: [], hands: {}, deck: [], toPlace: {}, drawn: null, turn: null, first: null, winner: null }
        const { data: ins, error: ie } = await admin.from('davinci_matches')
          .insert({ group_id: groupId, status: 'lobby', stake: 5, state: s0 }).select('*').single()
        if (ie) return json({ error: ie.message }, 500)
        row = ins
      } else if (row.state?.players?.length !== 2) {
        // 멤버 정보 최신화
        row.state.players = mem
        await admin.from('davinci_matches').update({ state: row.state }).eq('id', row.id)
      }
      return json(await viewOf(row, caller))
    }

    const matchId = p.matchId
    if (!matchId) return json({ error: 'matchId 가 필요합니다.' }, 400)

    if (action === 'view') {
      const { data: row } = await admin.from('davinci_matches').select('*').eq('id', matchId).maybeSingle()
      if (!row) return json({ error: '경기를 찾을 수 없어요.' }, 404)
      if (!row.state?.players?.find((x) => x.uid === caller)) return json({ error: '참가자가 아니에요.' }, 403)
      return json(await viewOf(row, caller))
    }

    const isPlayer = (s) => s.players?.find((x) => x.uid === caller)

    if (action === 'reset') {
      const { data: cur } = await admin.from('davinci_matches').select('*').eq('id', matchId).single()
      if (!cur) return json({ error: '경기를 찾을 수 없어요.' }, 404)
      if (!cur.state?.players?.find((x) => x.uid === caller)) return json({ error: '참가자가 아니에요.' }, 403)
      const mem = cur.state?.players?.length === 2 ? cur.state.players : await membersOf(cur.group_id)
      const s0 = { players: mem, ready: {}, phase: 'lobby', log: [], hands: {}, deck: [], toPlace: {}, drawn: null, turn: null, first: null, winner: null }
      const { data: row2 } = await admin.from('davinci_matches')
        .update({ status: 'lobby', winner: null, state: s0, updated_at: new Date().toISOString() })
        .eq('id', matchId).select('*').single()
      return json(await viewOf(row2, caller))
    }

    const row = await withMatch(matchId, async (s, m) => {
      if (!isPlayer(s)) throw new Error('참가자가 아니에요.')

      if (action === 'stake') {
        if (m.status !== 'lobby') throw new Error('로비에서만 판돈을 바꿀 수 있어요.')
        const v = Math.max(0, Math.min(1000, Math.floor(Number(p.stake) || 0)))
        m.stake = v; s.ready = {}
        return
      }
      if (action === 'ready') {
        if (m.status !== 'lobby') throw new Error('로비에서만 준비할 수 있어요.')
        if (p.ready) { if ((await balanceOf(caller)) < m.stake) throw new Error('보유 츄르가 판돈보다 적어요.') ; s.ready[caller] = true }
        else delete s.ready[caller]
        return
      }
      if (action === 'start') {
        if (m.status !== 'lobby') throw new Error('이미 시작됐어요.')
        if (!s.players.every((pl) => s.ready[pl.uid])) throw new Error('두 명 모두 준비해야 시작할 수 있어요.')
        for (const pl of s.players) if ((await balanceOf(pl.uid)) < m.stake) throw new Error(`${pl.name} 님의 보유 츄르가 부족해요.`)
        const deck = shuffle(makeDeck())
        s.hands = {}; s.toPlace = {}
        for (const pl of s.players) {
          const drawn = deck.splice(0, 4)
          const nums = drawn.filter((t) => !t.j).sort((a, b) => tileKey(a) - tileKey(b))
          const jok = drawn.filter((t) => t.j)
          s.hands[pl.uid] = nums
          s.toPlace[pl.uid] = jok.map((t) => ({ tile: t, up: false, reason: 'setup' }))
        }
        s.deck = deck
        s.first = s.players[Math.floor(Math.random() * 2)].uid
        s.turn = s.first
        s.drawn = null; s.lastGuess = null; s.settled = false; s.settledAmount = undefined
        s.log = [{ t: `대국 시작! ${nameOf(s, s.first)} 님 선공` }]
        m.status = 'playing'
        s.phase = s.players.some((pl) => s.toPlace[pl.uid].length) ? 'setup' : 'guess'
        if (s.phase === 'guess') beginTurn(s)
        return
      }

      if (m.status !== 'playing') throw new Error('진행 중인 대국이 아니에요.')

      if (action === 'place') {
        const q = s.toPlace[caller] || []
        if (!q.length) throw new Error('배치할 조커가 없어요.')
        const hand = s.hands[caller]
        const slot = Math.max(0, Math.min(hand.length, Math.floor(Number(p.slot))))
        const item = q.shift()
        hand.splice(slot, 0, { ...item.tile, up: item.up })
        log(s, `${nameOf(s, caller)} 님이 조커를 배치`)
        if (s.phase === 'setup') { trySetupDone(s) }
        else { // 대국 중 뽑은 조커 배치 완료 → 턴 종료
          s.turn = other(s, caller); beginTurn(s)
        }
        return
      }

      // 이하 액션은 내 차례에서만
      if (s.turn !== caller) throw new Error('내 차례가 아니에요.')

      if (action === 'guess') {
        if (s.phase !== 'guess') throw new Error('지금은 추리할 수 없어요.')
        const opp = other(s, caller)
        const oh = s.hands[opp]
        const pos = Math.floor(Number(p.pos))
        const target = oh[pos]
        if (!target || target.up) throw new Error('공개되지 않은 타일을 골라 주세요.')
        const val = String(p.val)
        const correct = val === 'joker' ? !!target.j : (!target.j && target.n === Number(val))
        const label = val === 'joker' ? '조커' : val
        s.lastGuess = { by: caller, pos, val, correct }
        if (correct) {
          target.up = true
          log(s, `✅ ${nameOf(s, caller)}: ${nameOf(s, opp)}의 ${pos + 1}번 = ${label} 정답!`)
          if (eliminated(s, opp)) { await settle(m, s, caller); return }
          s.phase = 'decide'
        } else {
          log(s, `❌ ${nameOf(s, caller)}: ${pos + 1}번 = ${label} 오답`)
          if (s.drawn) {
            const t = { ...s.drawn.tile, up: true }
            s.drawn = null
            if (t.j) { s.toPlace[caller] = [{ tile: t, up: true, reason: 'draw' }]; s.phase = 'place' }
            else { insertNumbered(s.hands[caller], t); s.turn = opp; beginTurn(s) }
          } else {
            s.phase = 'selfreveal'   // 더미 없음 → 내 타일 공개
          }
        }
        return
      }

      if (action === 'decide') {
        if (s.phase !== 'decide') throw new Error('결정할 상황이 아니에요.')
        if (p.cont) { s.phase = 'guess' }
        else {
          const t = s.drawn ? { ...s.drawn.tile, up: false } : null
          s.drawn = null
          if (t) {
            if (t.j) { s.toPlace[caller] = [{ tile: t, up: false, reason: 'draw' }]; s.phase = 'place'; return }
            insertNumbered(s.hands[caller], t)
          }
          log(s, `${nameOf(s, caller)} 님이 멈춤`)
          s.turn = other(s, caller); beginTurn(s)
        }
        return
      }

      if (action === 'selfreveal') {
        if (s.phase !== 'selfreveal') throw new Error('공개할 상황이 아니에요.')
        const hand = s.hands[caller]
        const pos = Math.floor(Number(p.pos))
        const t = hand[pos]
        if (!t || t.up) throw new Error('공개되지 않은 내 타일을 골라 주세요.')
        t.up = true
        log(s, `${nameOf(s, caller)} 님이 자기 타일 공개`)
        if (eliminated(s, caller)) { await settle(m, s, other(s, caller)); return }
        s.turn = other(s, caller); beginTurn(s)
        return
      }

      if (action === 'resign') {
        await settle(m, s, other(s, caller))
        log(s, `${nameOf(s, caller)} 님 기권`)
        return
      }

      throw new Error('알 수 없는 동작')
    })

    return json(await viewOf(row, caller))
  } catch (e) {
    return json({ error: e?.message || '오류가 발생했어요.' }, 400)
  }
})
