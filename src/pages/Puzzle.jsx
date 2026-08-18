import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Avatar from '../components/Avatar'
import { supabase } from '../lib/supabase'
import { buildEdges, piecePath, normalizeGroups, arrangeLoosePieces } from '../lib/jigsaw'
import { uploadPuzzleImage, deletePuzzleImageByUrl } from '../lib/storage'
import { getGroupPuzzle, saveGroupPuzzle, updatePuzzlePositions, deleteGroupPuzzle, updatePuzzleElapsed, getGroupMemberMap } from '../lib/api'

// 조각 수 옵션 (시안): 25~81
const GRIDS = [{ n: 5, l: '25' }, { n: 6, l: '36' }, { n: 7, l: '49' }, { n: 8, l: '64' }, { n: 9, l: '81' }]
const uuid = () => (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.round(Math.random() * 1e9)}`)
// 진행 시간 표기: 03:51, 한 시간을 넘기면 01:03:51
const mmss = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  const mm = String(m).padStart(2, '0'), ss = String(sec).padStart(2, '0')
  return h > 0 ? `${String(h).padStart(2, '0')}:${mm}:${ss}` : `${mm}:${ss}`
}

const BackIcon = () => <svg width="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 6 9 12 15 18" /></svg>
const TrashIcon = () => <svg width="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
const GridIcon = () => <svg width="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="3" y="3" width="7.5" height="7.5" rx="1.6" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6" /></svg>
const ClockIcon = () => <svg width="14" viewBox="0 0 24 24" fill="none" stroke="#8b8798" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15.5 14" /></svg>
const ExpandIcon = () => <svg width="9" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M4 4h7v2.4H6.4V11H4zM20 20h-7v-2.4h4.6V13H20z" /></svg>
const SendIcon = () => <svg width="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>

// 좌표는 놀이영역 너비 기준 정규화(등방). 두 기기 동일 배치. 보드 없이 조각끼리 연결.
function layout(cols, rows, aspect) {
  const picW = 0.9, wN = picW / cols
  const picH = picW / (aspect || 1), hN = picH / rows
  const tbN = Math.min(wN, hN) * 0.2
  const offN = tbN + 0.004
  const playHN = Math.max(1.0, picH) + 0.7
  return { wN, hN, tbN, offN, playHN }
}
function mul(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
function scatter(seed, cols, rows, L) {
  const rand = mul((seed >>> 0) + 12345), out = {}, wtot = L.wN + 2 * L.offN, htot = L.hN + 2 * L.offN
  let i = 0
  // m: 누군가 옮긴 조각 표시(0=아직 아무도 안 건드림) → 정렬은 m=0 조각만 대상
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out[`${r}-${c}`] = { x: rand() * Math.max(0.02, 1 - wtot), y: rand() * Math.max(0.02, L.playHN - htot), g: i++, m: 0 }
  return out
}

export default function Puzzle() {
  const { groupId } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const uid = profile?.id

  const rootRef = useRef(null)
  const inputRef = useRef(null)
  const wrapRef = useRef(null)
  const chanRef = useRef(null)
  const chatScrollRef = useRef(null)
  const [playW, setPlayW] = useState(0)
  const [puzzle, setPuzzle] = useState(null)     // {image, cols, rows, seed}
  const [pos, setPos] = useState({})              // id -> {x,y,g,m}
  const posRef = useRef(pos); posRef.current = pos
  const [aspect, setAspect] = useState(0)
  const [peers, setPeers] = useState({})          // uid -> {name}
  const [activeG, setActiveG] = useState(null)
  const [photoOpen, setPhotoOpen] = useState(false)
  const [exitOpen, setExitOpen] = useState(false)
  const [doneOpen, setDoneOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [snapTips, setSnapTips] = useState([])   // 맞춘 사람 라벨 [{id,x,y,name}]
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState('')
  const [grid, setGrid] = useState(6)
  const [busy, setBusy] = useState(false)

  // 대기실 채팅
  const [chat, setChat] = useState([])
  const [draft, setDraft] = useState('')
  const [members, setMembers] = useState({})
  const myName = useRef(profile?.login_id || '나')
  const isMemberRef = useRef(false) // 이 그룹 멤버일 때만 presence track(관리자 미가입 미리보기는 접속표시 X)

  // 진행 시간: 저장된 누적(base) + 내가 보고 있는 동안의 경과. 사람이 있을 때만 흐른다.
  const [elapsed, setElapsed] = useState(0)
  const baseRef = useRef(0)       // DB/브로드캐스트로 받은 누적 ms
  const sinceRef = useRef(0)      // base 를 받은 시점(로컬 clock)
  const doneRef = useRef(false)
  const finalMsRef = useRef(0)    // 완성 시점의 최종 시간

  const seenRef = useRef(new Set())   // 입장 알림 중복 방지
  const drag = useRef(null)
  const saveT = useRef(0)
  const moveRaf = useRef(0)
  const movePend = useRef(null)
  const toastT = useRef(0)
  const tipTimers = useRef({})
  // 다른 사람이 잡고 있는 조각(그룹) 잠금: uid -> { g, name, at }
  // 렌더에 쓰지 않으므로(잡는 순간에만 조회) state 가 아니라 ref — 남의 드래그로 리렌더되지 않는다.
  const locks = useRef({})
  const grabKeep = useRef(0)
  const LOCK_TTL = 12000   // grab/이동 신호가 이 시간 넘게 없으면 잠금 해제(탭 종료·끊김 대비)

  const showToast = useCallback((m) => {
    setToast(m); clearTimeout(toastT.current)
    toastT.current = setTimeout(() => setToast(''), 1800)
  }, [])

  // 조각이 맞물린 자리에 '누가 맞췄는지' 작은 라벨을 잠깐 띄운다(본인·상대 모두에게)
  const showSnapTip = useCallback((tip) => {
    if (!tip || typeof tip.x !== 'number') return
    const id = uuid()
    setSnapTips((t) => [...t.slice(-4), { ...tip, id }])
    tipTimers.current[id] = setTimeout(() => {
      setSnapTips((t) => t.filter((x) => x.id !== id))
      delete tipTimers.current[id]
    }, 2600)
  }, [])

  useEffect(() => {
    const el = wrapRef.current; if (!el) return
    const ro = new ResizeObserver(() => setPlayW(el.clientWidth))
    ro.observe(el); setPlayW(el.clientWidth)
    return () => ro.disconnect()
  }, [puzzle])

  const edges = useMemo(() => puzzle ? buildEdges(puzzle.cols, puzzle.rows, puzzle.seed) : null, [puzzle])
  const L = useMemo(() => puzzle && aspect ? layout(puzzle.cols, puzzle.rows, aspect) : null, [puzzle, aspect])

  // 레이아웃이 준비되면 저장/수신된 좌표의 그룹 내부 어긋남을 한 번 교정(예전 판 호환)
  useEffect(() => {
    if (!L) return
    const cur = posRef.current
    if (!Object.keys(cur).length) return
    const np = normalizeGroups(cur, L)
    for (const k in np) {
      if (Math.abs(np[k].x - cur[k].x) > 1e-9 || Math.abs(np[k].y - cur[k].y) > 1e-9) { setPos(np); return }
    }
  }, [L, pos])

  const setBase = useCallback((ms) => { baseRef.current = Math.max(0, ms || 0); sinceRef.current = Date.now(); setElapsed(baseRef.current) }, [])

  // 채널에 나 혼자면(접속자 1명=나뿐) 브로드캐스트를 보내도 받을 사람이 없으니 생략
  const bsend = useCallback((event, payload) => {
    if (peerCountRef.current <= 1) return undefined
    try {
      const p = chanRef.current?.send({ type: 'broadcast', event, payload })
      if (p && typeof p.catch === 'function') p.catch(() => {})
      return p
    } catch { return undefined }
  }, [])

  useEffect(() => {
    if (!groupId || !uid) return
    let alive = true
    getGroupMemberMap(groupId).then((mm) => {
      if (!alive) return
      setMembers(mm)
      isMemberRef.current = !!mm[uid]
      if (mm[uid]?.name) myName.current = mm[uid].name
      // 멤버로 확인되면(구독이 먼저 끝났을 수 있으니) 지금 track. 미가입(관리자)은 track 안 함.
      if (isMemberRef.current && chanRef.current?.state === 'joined') chanRef.current.track({ uid, name: myName.current }).catch(() => {})
      // 내 입장도 채팅에 표시(캐치마인드와 동일) — 혼자 들어와도 알림이 보인다
      if (!seenRef.current.has(uid)) {
        seenRef.current.add(uid)
        setChat((c) => [...c.slice(-80), { id: uuid(), sys: true, text: `${myName.current} 님 등장! 🐾` }])
      }
    }).catch(() => {})
    getGroupPuzzle(groupId).then((row) => {
      if (!alive) return
      if (row) {
        setPuzzle({ image: row.image, cols: row.cols, rows: row.rows, seed: row.seed })
        setPos(row.positions || {})
        setBase(Number(row.elapsed_ms) || 0)
      }
    }).catch((e) => setError(e.message)).finally(() => alive && setLoading(false))

    const ch = supabase.channel(`puzzle:${groupId}`, { config: { broadcast: { self: false }, presence: { key: uid } } })
    chanRef.current = ch
    ch.on('broadcast', { event: 'start' }, ({ payload }) => {
      setPuzzle({ image: payload.image, cols: payload.cols, rows: payload.rows, seed: payload.seed })
      setPos(payload.positions || {}); setAspect(0); setBase(0); doneRef.current = false; setDoneOpen(false); locks.current = {}
    })
    ch.on('broadcast', { event: 'upd' }, ({ payload }) => {
      // 드래그 중 이동 신호에는 by/g 가 실려 온다 → 잠금 갱신(별도 keepalive 없이도 유지)
      if (payload?.by && payload.by !== uid) locks.current[payload.by] = { g: payload.g, name: payload.name || '멤버', at: Date.now() }
      setPos((p) => { const n = { ...p }; for (const q of payload.pieces) n[q.id] = { x: q.x, y: q.y, g: q.g, m: q.m, t: q.t || 0 }; return n })
    })
    ch.on('broadcast', { event: 'grab' }, ({ payload }) => {
      if (!payload?.uid || payload.uid === uid) return
      locks.current[payload.uid] = { g: payload.g, name: payload.name || '멤버', at: Date.now() }
    })
    ch.on('broadcast', { event: 'drop' }, ({ payload }) => { if (payload?.uid) delete locks.current[payload.uid] })
    ch.on('broadcast', { event: 'reset' }, () => { setPuzzle(null); setPos({}); setAspect(0); setBase(0); doneRef.current = false; setDoneOpen(false); locks.current = {} })
    ch.on('broadcast', { event: 'time' }, ({ payload }) => { if (typeof payload?.ms === 'number') setBase(payload.ms) })
    ch.on('broadcast', { event: 'chat' }, ({ payload }) => setChat((c) => [...c.slice(-80), payload]))
    ch.on('broadcast', { event: 'snap' }, ({ payload }) => showSnapTip(payload))
    ch.on('presence', { event: 'sync' }, () => {
      const st = ch.presenceState(), m = {}
      for (const k of Object.keys(st)) m[k] = { name: st[k][0]?.name || '멤버' }
      setPeers(m)
    })
    ch.on('presence', { event: 'join' }, ({ key, newPresences }) => {
      if (key === uid || seenRef.current.has(key)) return
      seenRef.current.add(key)
      const nm = newPresences?.[0]?.name || '멤버'
      setChat((c) => [...c.slice(-80), { id: uuid(), sys: true, text: `${nm} 님 등장! 🐾` }])
    })
    ch.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
      if (key === uid) return
      seenRef.current.delete(key)
      delete locks.current[key]   // 나간 사람이 잡고 있던 조각은 즉시 풀어 준다
      const nm = leftPresences?.[0]?.name || '멤버'
      setChat((c) => [...c.slice(-80), { id: uuid(), sys: true, text: `${nm} 님 퇴장 👋` }])
    })
    ch.subscribe(async (s) => { if (s === 'SUBSCRIBED' && isMemberRef.current) { try { await ch.track({ uid, name: myName.current }) } catch { /* noop */ } } })
    return () => {
      alive = false; clearTimeout(toastT.current)
      Object.values(tipTimers.current).forEach(clearTimeout); tipTimers.current = {}
      clearInterval(grabKeep.current); grabKeep.current = 0
      if (drag.current && peerCountRef.current > 1) ch.send({ type: 'broadcast', event: 'drop', payload: { uid } })   // 잡은 채로 나가도 풀어 준다
      locks.current = {}
      supabase.removeChannel(ch); chanRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, uid, setBase, showSnapTip])

  // 채팅 자동 스크롤: scrollIntoView 는 조상(대기실·화면)까지 스크롤해 fixed 레이아웃에서
  // 채팅 영역이 화면 밖으로 밀릴 수 있다 → 채팅 컨테이너의 scrollTop 만 직접 조정.
  useEffect(() => {
    const el = chatScrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [chat])

  // 키보드가 올라오면 화면(fixed)이 키보드에 가려지지 않게 실제 보이는 높이에 맞춘다.
  // 키보드 여부는 focus/blur 가 아니라 '보이는 높이'로 판정 — blur 시점에 레이아웃이
  // 급변하면 전송 버튼 탭이 취소될 수 있어서(모바일), 실제 키보드가 내려갈 때만 복원한다.
  useEffect(() => {
    const vv = window.visualViewport; if (!vv) return
    const fit = () => {
      const el = rootRef.current; if (!el) return
      el.style.height = `${vv.height}px`; el.style.top = `${vv.offsetTop || 0}px`
      el.classList.toggle('pz-kbd', vv.height < window.innerHeight * 0.75)
    }
    fit(); vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit)
    const t = setTimeout(fit, 300)
    return () => { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit); clearTimeout(t) }
  }, [puzzle])

  const peerUids = useMemo(() => {
    const s = new Set(Object.keys(peers)); if (uid) s.add(uid)
    return [...s]
  }, [peers, uid])
  const peerCount = peerUids.length
  const peerCountRef = useRef(peerCount); peerCountRef.current = peerCount
  const peerNames = peerUids.map((u) => (u === uid ? `${myName.current}(나)` : (peers[u]?.name || members[u]?.name || '멤버'))).join(' · ')
  // 저장 담당(대표): 접속자 중 uid 사전순 첫 번째 — 중복 저장 방지
  const isLeader = peerUids.length > 0 && [...peerUids].sort()[0] === uid

  const groupsN = new Set(Object.values(pos).map((p) => p.g)).size
  const total = puzzle ? puzzle.cols * puzzle.rows : 0
  const done = total > 0 && Object.keys(pos).length === total && groupsN === 1

  // 진행 시간: 퍼즐판에 사람이 있을 때만 흐른다. 완성되면 멈춘다.
  // 표시는 로컬에서 1초마다, 저장은 대표가 5초마다(모두 나가면 저장이 멈춰 시간도 멈춤).
  useEffect(() => {
    if (!puzzle || done || peerCount < 1) return
    const iv = setInterval(() => {
      setElapsed(baseRef.current + (Date.now() - sinceRef.current))
    }, 1000)
    return () => clearInterval(iv)
  }, [puzzle, done, peerCount])

  useEffect(() => {
    if (!puzzle || done || !isLeader || peerCount < 1) return
    const iv = setInterval(() => {
      const ms = baseRef.current + (Date.now() - sinceRef.current)
      updatePuzzleElapsed(groupId, ms).catch(() => {})
      bsend('time', { ms })
    }, 5000)
    return () => clearInterval(iv)
  }, [puzzle, done, isLeader, peerCount, groupId])

  // 완성: 최종 시간 확정 + 저장 + 축하 모달
  useEffect(() => {
    if (!done || doneRef.current) return
    doneRef.current = true
    finalMsRef.current = baseRef.current + (Date.now() - sinceRef.current)
    setElapsed(finalMsRef.current)
    updatePuzzleElapsed(groupId, finalMsRef.current).catch(() => {})
    const t = setTimeout(() => setDoneOpen(true), 480)
    return () => clearTimeout(t)
  }, [done, groupId])

  function persistSoon() {
    clearTimeout(saveT.current)
    saveT.current = setTimeout(() => { updatePuzzlePositions(groupId, posRef.current).catch(() => {}) }, 700)
  }

  async function start() {
    if (!file) return
    setBusy(true); setError('')
    try {
      const r = await resizeToJpeg(file, 1200)
      const url = await uploadPuzzleImage(r.blob, groupId, uid)
      const asp = r.w / r.h, seed = Math.floor(Math.random() * 1e9), cols = grid, rows = grid
      const positions = scatter(seed, cols, rows, layout(cols, rows, asp))
      const pz = { image: url, cols, rows, seed }
      await saveGroupPuzzle(groupId, { ...pz, positions })
      setAspect(asp); setPuzzle(pz); setPos(positions); setBase(0); doneRef.current = false
      bsend('start', { ...pz, positions })
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  async function resetPuzzle() {
    setExitOpen(false); setDoneOpen(false)
    const oldImage = puzzle?.image
    try { await deleteGroupPuzzle(groupId) } catch { /* noop */ }
    if (oldImage) deletePuzzleImageByUrl(oldImage)
    setPuzzle(null); setPos({}); setAspect(0); setFile(null); setPreview(''); setBase(0); doneRef.current = false
    bsend('reset')
  }

  function sendChat(e) {
    e?.preventDefault?.()
    const text = draft.trim(); if (!text) return
    const m = { id: uuid(), uid, name: myName.current, text }
    // 내 화면에는 먼저 반영하고(전송 실패와 무관하게 보이도록), 전송은 실패해도 삼킨다.
    setChat((c) => [...c.slice(-80), m]); setDraft('')
    bsend('chat', m)
  }

  // ---- 조각 정렬: '아무도 옮기지 않은' 조각만 빈 공간에 겹치지 않게 정리 ----
  function arrangeLoose() {
    if (!L) return
    // 다른 사람이 지금 잡고 있는 조각도 '건드린 조각'으로 보고 정렬 대상에서 뺀다
    let src = posRef.current
    const now = Date.now(), held = new Set()
    for (const k in locks.current) { const l = locks.current[k]; if (k !== uid && now - l.at < LOCK_TTL) held.add(l.g) }
    if (held.size) { src = { ...src }; for (const id in src) if (held.has(src[id].g)) src[id] = { ...src[id], m: 1 } }
    const { pos: p, placed, loose } = arrangeLoosePieces(src, L)
    if (!loose) { showToast('정리할 조각이 없어요'); return }
    setPos(p)
    bsend('upd', { pieces: Object.keys(p).map((id) => ({ id, ...p[id] })) })
    persistSoon()
    showToast(placed < loose ? `조각 ${placed}개를 정렬했어요` : '조각을 정렬했어요')
  }

  // ---- 드래그(그룹 단위) ----
  function members_(g, p = posRef.current) { return Object.keys(p).filter((id) => p[id].g === g) }
  // 그 그룹을 지금 잡고 있는 '다른 사람' (없으면 null)
  function holderOf(g) {
    const now = Date.now()
    for (const k in locks.current) {
      const l = locks.current[k]
      if (k === uid) continue
      if (now - l.at >= LOCK_TTL) { delete locks.current[k]; continue }
      if (l.g === g) return l
    }
    return null
  }
  function sendGrab(g) { bsend('grab', { uid, name: myName.current, g }) }
  function onPointerDown(e, id) {
    if (done) return
    const g = pos[id].g
    const h = holderOf(g)
    if (h) { showToast(`${h.name} 님이 움직이고 있어요`); return }   // 남이 잡고 있는 조각은 못 움직임
    try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch { /* 이미 놓인 포인터 — 캡처 없이 진행 */ }
    const start = {}; for (const m of members_(g)) start[m] = { x: pos[m].x, y: pos[m].y }
    // 건드린 순서(t): 기존 최대값+1 — 시계가 아니라 공유된 좌표에서 계산하므로 두 기기가 같은 순서를 본다
    let t = 0; for (const k in pos) if ((pos[k].t || 0) > t) t = pos[k].t || 0
    t += 1
    drag.current = { g, ox: e.clientX, oy: e.clientY, start, t }
    setActiveG(g)
    // 움직이지 않고 탭만 해도 z-order 가 올라가도록 즉시 반영 + 상대에게도 알림
    setPos((p) => { const n = { ...p }; for (const m in start) n[m] = { ...n[m], t }; return n })
    bsend('upd', { pieces: Object.keys(start).map((m) => ({ id: m, ...pos[m], t })), by: uid, name: myName.current, g })
    sendGrab(g)   // 움직이지 않고 잡고만 있어도 다른 사람 화면에서 잠기도록
    clearInterval(grabKeep.current)
    grabKeep.current = setInterval(() => { if (drag.current) sendGrab(drag.current.g); else { clearInterval(grabKeep.current); grabKeep.current = 0 } }, 5000)
  }
  function onPointerMove(e) {
    const d = drag.current; if (!d || !playW) return
    const dx = (e.clientX - d.ox) / playW, dy = (e.clientY - d.oy) / playW
    setPos((p) => { const n = { ...p }; for (const m in d.start) n[m] = { ...n[m], x: d.start[m].x + dx, y: d.start[m].y + dy, m: 1 }; return n })
    movePend.current = Object.keys(d.start).map((m) => ({ id: m, x: d.start[m].x + dx, y: d.start[m].y + dy, g: d.g, m: 1, t: d.t }))
    if (!moveRaf.current) moveRaf.current = requestAnimationFrame(() => { moveRaf.current = 0; const m = movePend.current; if (m) bsend('upd', { pieces: m, by: uid, name: myName.current, g: d.g }) })
  }
  function onPointerUp() {
    const d = drag.current; drag.current = null; setActiveG(null)
    clearInterval(grabKeep.current); grabKeep.current = 0
    if (d) bsend('drop', { uid })   // 잠금 해제
    if (!d || !L || !puzzle) return
    const { cols, rows } = puzzle
    const p = { ...posRef.current }
    const tol = Math.min(L.wN, L.hN) * 0.35
    const NB = [[0, 1], [0, -1], [1, 0], [-1, 0]]
    // 잡은 그룹이 다른 그룹과 올바른 위치로 인접하면 스냅(정렬)
    let snapped = false, snapAt = null   // snapAt: 실제로 맞물린 조각 id(라벨을 띄울 자리)
    const mem = members_(d.g, p)
    for (const id of mem) {
      const [pr, pc] = id.split('-').map(Number)
      for (const [dr, dc] of NB) {
        const nr = pr + dr, nc = pc + dc
        if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue
        const nb = p[`${nr}-${nc}`]; if (!nb || nb.g === d.g) continue
        const relx = (pc - nc) * L.wN, rely = (pr - nr) * L.hN
        const ex = (p[id].x - nb.x) - relx, ey = (p[id].y - nb.y) - rely
        if (Math.hypot(ex, ey) < tol) { for (const m of mem) p[m] = { ...p[m], x: p[m].x - ex, y: p[m].y - ey }; snapped = true; snapAt = id; break }
      }
      if (snapped) break
    }
    if (snapped) {
      // 인접·근접한 서로 다른 그룹을 합칠 때, 위치까지 '정확히' 맞춘 뒤 합친다.
      let changed = true
      while (changed) {
        changed = false
        for (const id of Object.keys(p)) {
          const [pr, pc] = id.split('-').map(Number)
          for (const [dr, dc] of [[0, 1], [1, 0]]) {
            const nr = pr + dr, nc = pc + dc; if (nr >= rows || nc >= cols) continue
            const a = p[id], b = p[`${nr}-${nc}`]; if (!b || a.g === b.g) continue
            const ex = (a.x - b.x) - (pc - nc) * L.wN, ey = (a.y - b.y) - (pr - nr) * L.hN
            if (Math.hypot(ex, ey) >= tol) continue
            // 방금 드래그한 그룹(d.g)은 사용자가 놓은 자리에 그대로 두고 상대 그룹을 끌어당긴다
            const ag = a.g, bg = b.g
            if (bg === d.g) {   // b 가 앵커 → a 그룹을 b 에 맞춤
              for (const k in p) if (p[k].g === ag) p[k] = { ...p[k], x: p[k].x - ex, y: p[k].y - ey, g: bg, m: 1 }
            } else {            // a 가 앵커 → b 그룹을 a 에 맞춤
              for (const k in p) if (p[k].g === bg) p[k] = { ...p[k], x: p[k].x + ex, y: p[k].y + ey, g: ag, m: 1 }
            }
            changed = true
          }
        }
      }
    }
    const np = normalizeGroups(p, L)   // 합쳐진 그룹 내부 좌표를 격자 정위치로 확정(유격 0)
    setPos(np)
    bsend('upd', { pieces: Object.keys(np).map((id) => ({ id, ...np[id] })) })
    // 맞물렸으면 '누가 맞췄는지' 라벨을 그 자리에 잠깐 띄우고 상대에게도 알린다
    if (snapped) {
      const anchor = np[snapAt || mem[0]]
      if (anchor) {
        const tip = { x: anchor.x, y: anchor.y, name: myName.current }
        showSnapTip(tip)
        bsend('snap', tip)
      }
    }
    persistSoon()
  }

  const pieces = useMemo(() => {
    if (!puzzle || !edges || !L || !playW) return []
    const W = playW, wpx = L.wN * W, hpx = L.hN * W, tbpx = L.tbN * W, arr = []
    for (let r = 0; r < puzzle.rows; r++) for (let c = 0; c < puzzle.cols; c++)
      arr.push({ id: `${r}-${c}`, r, c, pp: piecePath(r, c, puzzle.cols, puzzle.rows, wpx, hpx, tbpx, edges) })
    return arr
  }, [puzzle, edges, L, playW])

  // 그룹별 z-order: 큰 덩어리가 항상 뒤(작은 조각이 큰 덩어리에 가려지지 않게).
  // 크기가 같으면 나중에 건드린 그룹(t 가 큰 쪽)이 앞으로.
  const zOf = useMemo(() => {
    const size = {}, touch = {}
    for (const id in pos) {
      const g = pos[id].g
      size[g] = (size[g] || 0) + 1
      touch[g] = Math.max(touch[g] || 0, pos[id].t || 0)
    }
    const gs = Object.keys(size).sort((a, b) =>
      (size[b] - size[a]) || ((touch[a] || 0) - (touch[b] || 0)) || (Number(a) - Number(b)))
    const z = {}
    gs.forEach((g, i) => { z[g] = 10 + i })   // 앞쪽일수록 큰 값
    return z
  }, [pos])

  const liveBadge = (
    <span className="pz-live" title={peerNames}><span className="pz-live-dot" />{peerCount}명 접속 중</span>
  )
  const head = (withExit) => (
    <div className="pz-head">
      <button type="button" className="pz-hbtn" aria-label="뒤로" title="뒤로" onClick={() => navigate(-1)}><BackIcon /></button>
      <div className="pz-title">퍼즐</div>
      {liveBadge}
      {withExit && (
        <button type="button" className="pz-hbtn" aria-label="퍼즐 종료" title="퍼즐 종료" onClick={() => setExitOpen(true)}><TrashIcon /></button>
      )}
    </div>
  )

  if (loading) return <div className="page"><div className="spinner" /></div>

  // ===== 대기실 =====
  if (!puzzle) {
    return (
      <div className="pz-root" ref={rootRef}>
        {head(false)}
        <div className="pz-lobby">
          <div className="pz-chat">
            <div className="pz-chat-scroll" ref={chatScrollRef}>
              {chat.map((m) => (
                m.sys ? (
                  <div key={m.id} className="pz-chat-sys">{m.text}</div>
                ) : m.uid === uid ? (
                  <div key={m.id} className="pz-chat-row pz-me"><span className="pz-bubble pz-me">{m.text}</span></div>
                ) : (
                  <div key={m.id} className="pz-chat-row">
                    <Avatar src={members[m.uid]?.avatar} name={m.name} size={26} />
                    <div className="pz-chat-msg"><span className="pz-chat-nm">{m.name}</span><span className="pz-bubble">{m.text}</span></div>
                  </div>
                )
              ))}
            </div>
            <form className="pz-chat-input" onSubmit={sendChat}>
              <input ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)}
                placeholder="메시지 보내기" maxLength={100} enterKeyHint="send" />
              {/* type=button + onClick: submit 합성이나 mousedown preventDefault 로 탭이 삼켜지지 않게 */}
              <button type="button" className="pz-send" aria-label="전송"
                onClick={() => { sendChat(); inputRef.current?.focus() }}><SendIcon /></button>
            </form>
          </div>

          <div className="pz-sec">
            <div className="pz-sec-t">퍼즐 사진</div>
            {preview ? (
              <div className="pz-photo" style={{ backgroundImage: `url(${preview})` }}>
                <label className="pz-photo-change">사진 변경
                  <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; setFile(f); setPreview(URL.createObjectURL(f)) }} />
                </label>
              </div>
            ) : (
              <label className="pz-drop">
                <span className="pz-drop-plus">+</span>
                <span className="pz-drop-t">사진 추가</span>
                <span className="pz-drop-s">갤러리에서 퍼즐로 만들 사진을 골라요</span>
                <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; setFile(f); setPreview(URL.createObjectURL(f)) }} />
              </label>
            )}
          </div>

          <div className="pz-sec">
            <div className="pz-sec-hd"><span className="pz-sec-t">조각 수</span><span className="pz-sec-sub">{grid}×{grid}</span></div>
            <div className="pz-grid-opts">
              {GRIDS.map((g) => (
                <button key={g.n} type="button" className={`pz-grid-btn ${grid === g.n ? 'on' : ''}`} onClick={() => setGrid(g.n)}>
                  <span className="pz-grid-n">{g.l}</span>
                  <span className="pz-grid-s">{g.n}×{g.n}</span>
                </button>
              ))}
            </div>
          </div>

          {error && <div className="alert alert-error pz-err">{error}</div>}

          <div className="pz-foot">
            <button type="button" className={`pz-cta ${file ? '' : 'off'}`} disabled={!file || busy} onClick={start}>
              {busy ? '만드는 중…' : file ? '퍼즐 만들기' : '사진을 먼저 추가해 주세요'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ===== 퍼즐판 =====
  return (
    <div className="pz-root" ref={rootRef}>
      {head(true)}
      <div className="pz-tools">
        <button type="button" className="pz-thumb" style={{ backgroundImage: `url(${puzzle.image})` }}
          onClick={() => setPhotoOpen(true)} aria-label="원본 크게 보기" title="원본 크게 보기">
          <span className="pz-thumb-ex"><ExpandIcon /></span>
        </button>
        <button type="button" className="pz-tool" onClick={arrangeLoose} aria-label="조각 정렬" title="조각 정렬"><GridIcon /></button>
        <div className="pz-timer"><ClockIcon /><span>{mmss(elapsed)}</span></div>
      </div>

      {error && <div className="alert alert-error pz-err">{error}</div>}

      <div className="pz-board-scroll">
      <div className="pz-wrap" ref={wrapRef} style={{ height: L && playW ? L.playHN * playW : undefined }}
        onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        {!aspect && <img src={puzzle.image} alt="" style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} onLoad={(e) => setAspect(e.target.naturalWidth / e.target.naturalHeight)} />}
        {L && playW > 0 && pieces.map((pc) => {
          const p = pos[pc.id]; if (!p) return null
          const { d, off, sw } = pc.pp
          return (
            // 위치는 transform(translate3d) 으로 — left/top 재배치는 iOS 에서 잔상(repaint 누락)이 남는다
            <svg key={pc.id} className="pz-piece" width={sw} height={pc.pp.sh}
              style={{ transform: `translate3d(${p.x * playW}px, ${p.y * playW}px, 0)`, zIndex: activeG === p.g ? 1000 : (zOf[p.g] ?? 10) }}
              onPointerDown={(e) => onPointerDown(e, pc.id)}>
              <defs><clipPath id={`clip-${groupId}-${pc.id}`}><path d={d} /></clipPath></defs>
              <image href={puzzle.image} x={off - pc.c * L.wN * playW} y={off - pc.r * L.hN * playW}
                width={puzzle.cols * L.wN * playW} height={puzzle.rows * L.hN * playW} clipPath={`url(#clip-${groupId}-${pc.id})`} preserveAspectRatio="none" />
              <path d={d} fill="none" stroke="rgba(255,255,255,.5)" strokeWidth="1" />
            </svg>
          )
        })}
        {/* 방금 맞물린 자리에 '누가 맞췄는지' 라벨(2.6초). 조각 몸통 위쪽에 붙이고,
            위쪽 공간이 부족하면(판 최상단 조각) 몸통 아래로 뒤집어 표시한다. */}
        {L && playW > 0 && snapTips.map((t) => {
          const top = t.y + L.offN, cx = t.x + L.offN + L.wN / 2
          const below = top < L.hN * 0.5
          return (
            <span key={t.id} className={`pz-snaptip${below ? ' below' : ''}`}
              style={{ left: cx * playW, top: (below ? top + L.hN : top) * playW }}>{t.name}</span>
          )
        })}
      </div>
      </div>

      {/* 원본 크게 보기 */}
      {photoOpen && (
        <div className="pz-modal-back" onClick={() => setPhotoOpen(false)}>
          <div className="pz-photo-big" style={{ backgroundImage: `url(${puzzle.image})` }} />
          <button type="button" className="pz-modal-close" onClick={() => setPhotoOpen(false)}>닫기</button>
        </div>
      )}

      {/* 종료 확인 */}
      {exitOpen && (
        <div className="pz-modal-back dim" onClick={() => setExitOpen(false)}>
          <div className="pz-card" onClick={(e) => e.stopPropagation()}>
            <div className="pz-card-t">퍼즐을 종료할까요?</div>
            <div className="pz-card-s">지금까지 맞춘 퍼즐이 사라져요.</div>
            <div className="pz-card-btns">
              <button type="button" className="pz-btn ghost" onClick={() => setExitOpen(false)}>계속하기</button>
              <button type="button" className="pz-btn dark" onClick={resetPuzzle}>종료</button>
            </div>
          </div>
        </div>
      )}

      {/* 완성 축하 */}
      {doneOpen && (
        <div className="pz-modal-back dim">
          <div className="pz-card done">
            <div className="pz-done-emoji">🎉</div>
            <div className="pz-done-t">퍼즐 완성!</div>
            <div className="pz-done-s">{total}조각을 모두 맞췄어요</div>
            <div className="pz-done-img" style={{ backgroundImage: `url(${puzzle.image})` }} />
            <div className="pz-done-stats">
              <div><div className="pz-stat-k">걸린 시간</div><div className="pz-stat-v">{mmss(finalMsRef.current || elapsed)}</div></div>
              <div className="pz-stat-div" />
              <div><div className="pz-stat-k">함께한 멤버</div><div className="pz-stat-v">{peerCount}명</div></div>
            </div>
            <div className="pz-card-btns">
              <button type="button" className="pz-btn ghost" onClick={() => setDoneOpen(false)}>확인</button>
              <button type="button" className="pz-btn dark wide" onClick={resetPuzzle}>대기실로</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="pz-toast">{toast}</div>}
    </div>
  )
}

function resizeToJpeg(file, max) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      let { width: w, height: h } = img
      if (Math.max(w, h) > max) { const k = max / Math.max(w, h); w = Math.round(w * k); h = Math.round(h * k) }
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h
      cv.getContext('2d').drawImage(img, 0, 0, w, h)
      cv.toBlob((blob) => { URL.revokeObjectURL(url); blob ? resolve({ blob, w, h }) : reject(new Error('이미지 변환 실패')) }, 'image/jpeg', 0.86)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지를 읽을 수 없어요')) }
    img.src = url
  })
}
