import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getQuests, claimQuest, claimSlotQuest, rerollSlotQuest, getMyCoinBalance } from '../lib/api'

const GRADE_LABEL = { vvip: 'VVIP', vip: 'VIP', normal: '일반' }

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

function CoinCat() {
  return (
    <svg className="mp-coin-cat" width="96" viewBox="0 0 64 34" aria-hidden="true">
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

function DailyRow({ q, busy, onClaim }) {
  return (
    <div className={`quest-row ${q.claimed ? 'is-done' : ''}`}>
      <div className="quest-info">
        <span className="quest-label">{q.label}</span>
        <span className="quest-reward">+{q.reward} 츄르</span>
      </div>
      {q.claimed ? (
        <span className="quest-badge is-done">완료</span>
      ) : q.done ? (
        <button type="button" className="quest-claim" disabled={!!busy} onClick={onClaim}>받기</button>
      ) : (
        <span className="quest-badge">진행 중</span>
      )}
    </div>
  )
}

function SlotRow({ s, now, busy, onClaim, onReroll }) {
  const cdMs = s.cooldown_until ? new Date(s.cooldown_until).getTime() - now : 0
  const cooling = cdMs > 0
  return (
    <div className={`quest-row quest-slot ${cooling ? 'is-cooling' : ''}`}>
      {cooling ? (
        <div className="quest-info">
          <span className="quest-label muted">다음 퀘스트 준비 중</span>
          <span className="quest-reward quest-cd">{fmtLeft(cdMs)} 후 공개</span>
        </div>
      ) : (
        <>
          <div className="quest-info">
            <span className="quest-label">{s.title}</span>
            {s.body && <span className="quest-body">{s.body}</span>}
            <span className="quest-reward">+{s.reward} 츄르</span>
          </div>
          <div className="quest-slot-actions">
            {s.done ? (
              <button type="button" className="quest-claim" disabled={!!busy} onClick={onClaim}>받기</button>
            ) : (
              <span className="quest-badge">진행 중</span>
            )}
            <button type="button" className="quest-slot-reroll" disabled={!!busy} onClick={onReroll} title="1츄르로 교체">🔄</button>
          </div>
        </>
      )}
    </div>
  )
}

export default function MyProfile() {
  const { profile, logout, isAdmin } = useAuth()
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
    setBusy(`r${slot}`); setError('')
    try { setQuests(await rerollSlotQuest(slot)) }
    catch (err) { setError(err.message) } finally { setBusy('') }
  }
  async function handleLogout() { await logout(); navigate('/login') }

  const grade = quests?.grade || 'normal'
  const balance = quests?.balance

  return (
    <div className="page">
      {loading ? (
        <div className="spinner" />
      ) : (
        <>
          {error && <div className="alert alert-error">{error}</div>}

          {/* 회원 헤더: 아이디 + 등급 + 상세/수정 이동 */}
          <Link to="/me/edit" className="mp-head" aria-label="회원 정보 보기·수정">
            <span className="mp-head-main">
              <span className="mp-head-id">{profile?.login_id || '—'}</span>
              <span className={`mp-grade mp-grade-${grade}`}>{GRADE_LABEL[grade]}</span>
            </span>
            <Chevron className="mp-head-chev" />
          </Link>

          {/* 츄르 잔액 카드 */}
          <Link to="/me/coins" className="mp-coin" aria-label="적립·사용 내역">
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
          {quests?.daily?.length > 0 && (
            <div className="quests">
              <div className="quest-title">데일리 퀘스트</div>
              {(quests.daily || []).map((q) => (
                <DailyRow key={q.key} q={q} busy={busy} onClaim={() => claimDaily(q.key)} />
              ))}

              <div className="quest-title">랜덤 퀘스트</div>
              {(quests.slots || []).map((s) => (
                <SlotRow key={s.slot} s={s} now={now} busy={busy}
                  onClaim={() => claimSlot(s.slot)} onReroll={() => rerollSlot(s.slot)} />
              ))}
            </div>
          )}

          {isAdmin && (
            <Link to="/admin" className="btn btn-block admin-entry">관리자 페이지</Link>
          )}

          <div className="mp-logout">
            <button type="button" className="mp-logout-link" onClick={handleLogout}>로그아웃</button>
          </div>
        </>
      )}
    </div>
  )
}
