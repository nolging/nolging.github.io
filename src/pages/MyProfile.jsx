import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getQuests, claimQuest, claimSlotQuest, rerollSlotQuest, getMyCoinBalance } from '../lib/api'
import { GRADE_LABEL } from '../lib/membership'

// 퀘스트별 '도전' 이동 경로 (수행할 수 있는 페이지). 없는 키는 홈으로.
const QUEST_TARGET = {
  visit: '/', note: '/notes/new',
  r_wish: '/', r_item_note: '/notes/new', r_nyangpito: '/inventory',
  r_buy: '/store', r_spend10: '/store', r_game_win: '/', r_poke: '/',
}

// 퀘스트 키 → 아이콘/파스텔 (데일리 + 랜덤 시드). 미지정 키는 기본값.
const QUEST_ICON = {
  attend: { emoji: '🗓️', bg: '#eef1fb' },
  visit: { emoji: '🚪', bg: '#e8f4ec' },
  note: { emoji: '💌', bg: '#fde8ee' },
  r_wish: { emoji: '⭐', bg: '#fbf1d3' },
  r_item_note: { emoji: '💌', bg: '#fde8ee' },
  r_nyangpito: { emoji: '🐾', bg: '#e8f4ec' },
  r_buy: { emoji: '🛍️', bg: '#fdeee2' },
  r_spend10: { emoji: '🪙', bg: '#fbf1d3' },
  r_game_win: { emoji: '🎮', bg: '#e6eefd' },
  r_poke: { emoji: '👉', bg: '#eeebfe' },
}
const questIcon = (key) => QUEST_ICON[key] || { emoji: '✨', bg: '#eef0f2' }

// 쿨다운 남은시간 M:SS
function fmtLeft(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function Chevron({ className }) {
  return (
    <svg className={className} width="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18" /></svg>
  )
}

// 츄르(발바닥) 아이콘
function Paw({ size = 13, color = 'currentColor' }) {
  return (
    <svg width={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <circle cx="7" cy="7" r="2.4" /><circle cx="12" cy="5.4" r="2.4" /><circle cx="17" cy="7" r="2.4" />
      <path d="M12 10c3.4 0 6 2.4 6 5.2 0 2-1.7 3.3-3.4 2.7-1-.4-1.7-.6-2.6-.6s-1.6.2-2.6.6C7.7 18.5 6 17.2 6 15.2 6 12.4 8.6 10 12 10Z" />
    </svg>
  )
}

function CoinCat() {
  return (
    <svg className="mp-coin-cat" width="88" viewBox="0 0 64 34" aria-hidden="true">
      <path d="M8 27 L11.3 10 Q11.5 5.5 16 7.8 L30 17 Z" fill="#191722" />
      <path d="M56 27 L52.7 10 Q52.5 5.5 48 7.8 L34 17 Z" fill="#191722" />
      <path d="M6 34 A26 22 0 0 1 58 34 Z" fill="#191722" />
      <g className="login-cat-eye" style={{ transformOrigin: '23px 26px' }}>
        <circle cx="23" cy="26" r="6.5" fill="#ffd43b" /><circle cx="23.6" cy="26.6" r="4.6" fill="#191722" /><circle cx="20.6" cy="23.8" r="1.3" fill="#fff" />
      </g>
      <g className="login-cat-eye" style={{ transformOrigin: '41px 26px' }}>
        <circle cx="41" cy="26" r="6.5" fill="#ffd43b" /><circle cx="41.6" cy="26.6" r="4.6" fill="#191722" /><circle cx="38.6" cy="23.8" r="1.3" fill="#fff" />
      </g>
    </svg>
  )
}

function DailyRow({ q, last, busy, onClaim, onChallenge }) {
  const ic = questIcon(q.key)
  return (
    <div className={`quest-row ${last ? 'is-last' : ''}`}>
      <span className="quest-ic" style={{ background: ic.bg }}>{ic.emoji}</span>
      <div className="quest-info">
        <span className="quest-label">{q.label}</span>
        <span className="quest-reward"><Paw />{q.reward}</span>
      </div>
      {q.claimed ? (
        <span className="quest-badge is-done">✓ 완료</span>
      ) : q.done ? (
        <button type="button" className="quest-claim" disabled={!!busy} onClick={onClaim}>받기</button>
      ) : onChallenge ? (
        <button type="button" className="quest-challenge" onClick={onChallenge}>도전</button>
      ) : (
        <span className="quest-badge">진행 중</span>
      )}
    </div>
  )
}

function SlotCard({ s, now, busy, onClaim, onChallenge, onReroll }) {
  const cdMs = s.cooldown_until ? new Date(s.cooldown_until).getTime() - now : 0
  const cooling = cdMs > 0
  const ic = questIcon(s.key)
  const emoji = s.emoji || ic.emoji
  return (
    <div className={`quest-slot-card ${cooling ? 'is-cooling' : ''} ${s.done ? 'is-ready' : ''}`}>
      {!cooling && !s.done && (
        <button type="button" className="quest-slot-reroll" disabled={!!busy} onClick={onReroll} title="다른 퀘스트로 교체 (츄르 1)">
          <svg width="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
        </button>
      )}
      <div className="quest-slot-body">
        <span className="quest-label">{s.title || '다음 퀘스트'}</span>
        {s.body && <span className="quest-body">{s.body}</span>}
      </div>
      <div className="quest-slot-foot">
        <div className="quest-slot-meta">
          <span className="quest-ic sm" style={{ background: ic.bg }}>{emoji}</span>
          <span className="quest-reward"><Paw size={15} />{s.reward ?? 0}</span>
        </div>
        {cooling ? (
          <span className="quest-slot-timer">
            <svg width="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></svg>
            {fmtLeft(cdMs)}
          </span>
        ) : s.done ? (
          <button type="button" className="quest-claim" disabled={!!busy} onClick={onClaim}>받기</button>
        ) : (
          <button type="button" className="quest-challenge" onClick={onChallenge}>도전</button>
        )}
      </div>
    </div>
  )
}

export default function MyProfile() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [quests, setQuests] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => Date.now())

  // 쿨다운 표시용 1초 틱
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(iv)
  }, [])

  // 쿨다운이 끝나는 시점에 새 퀘스트를 받아오도록 자동 새로고침
  useEffect(() => {
    const times = (quests?.slots || [])
      .map((s) => (s.cooldown_until ? new Date(s.cooldown_until).getTime() : 0))
      .filter((t) => t > Date.now())
    if (!times.length) return
    const t = setTimeout(() => { load() }, Math.min(...times) - Date.now() + 600)
    return () => clearTimeout(t)
  }, [quests]) // eslint-disable-line react-hooks/exhaustive-deps

  const load = async () => {
    try {
      const q = await getQuests()
      // 퀘스트 RPC 미배포 시엔 잔액만이라도 표시(카드 정상 동작)
      if (q) setQuests(q)
      else setQuests({ balance: await getMyCoinBalance(), grade: 'normal', daily: [], slots: [] })
      setError('')
    } catch (err) { setError(err.message) }
  }
  useEffect(() => { load().finally(() => setLoading(false)) }, [])

  async function claimDaily(key) {
    if (busy) return
    setBusy(key); setError('')
    try { await claimQuest(key); await load() }
    catch (err) { setError(err.message) } finally { setBusy('') }
  }
  async function claimSlot(slot) {
    if (busy) return
    setBusy(`c${slot}`); setError('')
    try { await claimSlotQuest(slot); await load() }
    catch (err) { setError(err.message) } finally { setBusy('') }
  }
  async function rerollSlot(slot) {
    if (busy) return
    if (!window.confirm('1 츄르를 사용해서 다른 퀘스트로 변경할까요?')) return
    setBusy(`r${slot}`); setError('')
    try { setQuests(await rerollSlotQuest(slot)) }
    catch (err) { setError(err.message) } finally { setBusy('') }
  }
  const challenge = (key) => navigate(QUEST_TARGET[key] || '/', { state: { from: '/me' } })

  const grade = quests?.grade || 'normal'
  const balance = quests?.balance
  const daily = quests?.daily || []
  // 랜덤 슬롯 정렬: ①완료(받기) → ②미완료(도전) → ③대기(타이머)
  //  · 완료·미완료 그룹은 먼저 주어진(assigned_at 이른) 순, 대기 그룹은 남은 시간 적은(cooldown_until 이른) 순
  const slotTime = (v, fallback) => (v ? new Date(v).getTime() : fallback)
  const slotRank = (s) => {
    if (s.done) return 0
    if (!(s.cooldown_until && new Date(s.cooldown_until).getTime() > now)) return 1
    return 2
  }
  const slots = [...(quests?.slots || [])].sort((a, b) => {
    const ra = slotRank(a), rb = slotRank(b)
    if (ra !== rb) return ra - rb
    if (ra === 2) return slotTime(a.cooldown_until, 0) - slotTime(b.cooldown_until, 0)
    return slotTime(a.assigned_at, a.slot) - slotTime(b.assigned_at, b.slot)
  })
  const dailyDone = daily.filter((q) => q.claimed).length
  const readyCount = slots.filter((s) => s.done).length

  return (
    <div className="page mp-page">
      {loading ? (
        <div className="spinner" />
      ) : (
        <>
          {error && <div className="alert alert-error">{error}</div>}

          {/* 회원 헤더: 아이디 + 등급 + 상세 이동 */}
          <Link to="/me/info" state={{ grade }} className="mp-head" aria-label="회원 정보 보기">
            <span className="mp-head-main">
              <span className="mp-head-id">{profile?.login_id || '—'}</span>
              <span className={`grade-badge grade-${grade}`}>{GRADE_LABEL[grade]}</span>
            </span>
            <Chevron className="mp-head-chev" />
          </Link>

          {/* 츄르 잔액 카드 */}
          <Link to="/me/coins" className="mp-coin" aria-label="적립·사용 내역">
            <div className="mp-coin-title">잔여 츄르</div>
            <div className="mp-coin-amount">
              <span className="mp-coin-num">{balance == null ? '—' : balance.toLocaleString('ko-KR')}</span>
              <span className="mp-coin-unit">츄르</span>
            </div>
            <span className="mp-coin-history">
              적립·사용 내역
              <svg width="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18" /></svg>
            </span>
            <CoinCat />
          </Link>

          {/* 퀘스트 (RPC 배포 후 노출) */}
          {daily.length > 0 && (
            <div className="quests">
              <div className="quest-head">
                <span className="quest-title">데일리 퀘스트</span>
                <span className="quest-count">{dailyDone}/{daily.length} 완료</span>
              </div>
              <div className="quest-list">
                {daily.map((q, i) => (
                  <DailyRow key={q.key} q={q} last={i === daily.length - 1} busy={busy}
                    onClaim={() => claimDaily(q.key)}
                    onChallenge={QUEST_TARGET[q.key] ? () => challenge(q.key) : null} />
                ))}
              </div>

              {slots.length > 0 && (
                <>
                  <div className="quest-head">
                    <span className="quest-title">랜덤 퀘스트 <span className="quest-star">✦</span></span>
                    {readyCount > 0 && <span className="quest-count">받기 {readyCount}개</span>}
                  </div>
                  <div className="quest-slots" data-hscroll>
                    {slots.map((s) => (
                      <SlotCard key={s.slot} s={s} now={now} busy={busy}
                        onClaim={() => claimSlot(s.slot)} onChallenge={() => challenge(s.key)} onReroll={() => rerollSlot(s.slot)} />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
