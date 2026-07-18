import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, useOutletContext } from 'react-router-dom'
import { listMemberCards, getGroup, isCoupleGroup, isFriendGroup, regenerateInviteCode, setGroupAnniversary, coupleRingClaimedAt, getGroupDecoMap, touchQuest } from '../lib/api'
import MemberAvatar from '../components/MemberAvatar'
import BottomSheet from '../components/BottomSheet'
import Modal from '../components/Modal'
import Fireworks from '../components/Fireworks'
import NightSky from '../components/NightSky'
import { isAnnivToday } from '../lib/anniv'
import { useAuth } from '../context/AuthContext'

function parseYMD(s) {
  const [y, mo, d] = String(s).split('-').map(Number)
  if (!y || !mo || !d) return null
  return new Date(y, mo - 1, d)
}
// 기념일부터 오늘까지 "며칠째" (기념일이 1일차)
function daysSince(dateStr) {
  const start = parseYMD(dateStr)
  if (!start) return null
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.floor((today - start) / 86400000) + 1
}
function annivLabel(s) {
  const [y, mo, d] = String(s).split('-')
  return `${y}.${Number(mo)}.${Number(d)}`
}

// 멍냥꽁냥 / 미니 게임 존의 가로 스크롤 카드
function PlayCard({ emoji, bg, title, sub, onClick }) {
  return (
    <button type="button" className={`csx-card ${onClick ? '' : 'csx-card-soft'}`}
      onClick={onClick} aria-disabled={!onClick}>
      <span className="csx-card-ico" style={{ background: bg }}>{emoji}</span>
      <span className="csx-card-t">{title}</span>
      <span className="csx-card-s">{sub}</span>
    </button>
  )
}

function OwnerBadge() {
  return (
    <span className="mlist-owner" title="방장" aria-label="방장">
      <svg width="12" height="11" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 17.5V8l4.4 3.4L12 5.5l4.6 5.9L21 8v9.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" fill="#7363e8" />
      </svg>
    </span>
  )
}
function Chevron() {
  return (
    <svg className="mlist-chev" width="18" viewBox="0 0 24 24" fill="none" stroke="#c9c6d6"
      strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18" /></svg>
  )
}

function birthLabel(s) {
  if (!s) return null
  const [y, mo, d] = String(s).split('-')
  return `${y}.${Number(mo)}.${Number(d)}`
}

export default function GroupMembers() {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const { setHeaderTitle } = useOutletContext()
  const { isAdmin } = useAuth()
  const [members, setMembers] = useState([])
  const [decoMap, setDecoMap] = useState({})
  const [group, setGroup] = useState(null)
  const [couple, setCouple] = useState(false)
  const [friend, setFriend] = useState(false)
  const [query, setQuery] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [regenBusy, setRegenBusy] = useState(false)
  const [anniv, setAnniv] = useState('')       // 명시적으로 설정한 기념일 (YYYY-MM-DD)
  const [claimDate, setClaimDate] = useState('') // 기념일 미설정 시 기본값 = 커플 링 수령일
  const [annivOpen, setAnnivOpen] = useState(false) // 기념일 수정 모달
  const [annivDraft, setAnnivDraft] = useState('')
  const [annivBusy, setAnnivBusy] = useState(false)
  const [burst, setBurst] = useState(false)    // 하트 콕! 애니메이션
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [cards, g, c, f, d] = await Promise.all([
        listMemberCards(groupId),
        getGroup(groupId).catch(() => null),
        isCoupleGroup(groupId).catch(() => false),
        isFriendGroup(groupId).catch(() => false),
        getGroupDecoMap(groupId).catch(() => ({})),
      ])
      setMembers(cards); setDecoMap(d || {}); setGroup(g); setCouple(c); setFriend(f); setAnniv(g?.anniversary || '')
      if (c) coupleRingClaimedAt(groupId).then((d) => setClaimDate(d || '')).catch(() => {})
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [groupId])
  useEffect(() => { load() }, [load])

  // 커플 그룹이면 상단바 제목을 "데이트"로 (그 외엔 기본 "멤버")
  useEffect(() => {
    setHeaderTitle?.(couple ? '데이트' : null)
    return () => setHeaderTitle?.(null)
  }, [couple, setHeaderTitle])

  // 커플 그룹 데이트 페이지 방문 → 랜덤 퀘스트 '데이트하러 가기'
  useEffect(() => { if (couple) touchQuest('r_date') }, [couple])

  // 커플 기념일 당일: 데이트 페이지를 다크 모드로 (상단바·콘텐츠 배경까지)
  const annivDark = couple && isAnnivToday(anniv || claimDate)
  useEffect(() => {
    document.querySelector('.app-shell')?.classList.toggle('csx-anniv-dark', annivDark)
    return () => document.querySelector('.app-shell')?.classList.remove('csx-anniv-dark')
  }, [annivDark])

  function popHeart() {
    setBurst(true); clearTimeout(popHeart._t)
    popHeart._t = setTimeout(() => setBurst(false), 1000)
  }
  function openAnnivEdit(effAnniv) {
    setAnnivDraft(effAnniv || '')
    setAnnivOpen(true)
  }
  async function saveAnnivModal() {
    setAnnivBusy(true); setError('')
    try {
      await setGroupAnniversary(groupId, annivDraft || null)
      setAnniv(annivDraft || '')
      setAnnivOpen(false)
    } catch (err) { setError(err.message) } finally { setAnnivBusy(false) }
  }
  async function resetAnnivToClaim() {
    setAnnivBusy(true); setError('')
    try {
      await setGroupAnniversary(groupId, null)
      setAnniv(''); setAnnivOpen(false)
    } catch (err) { setError(err.message) } finally { setAnnivBusy(false) }
  }

  function copyCode() {
    if (!group?.invite_code) return
    try { navigator.clipboard?.writeText(group.invite_code) } catch { /* noop */ }
    setCopied(true); setTimeout(() => setCopied(false), 1600)
  }
  async function shareCode() {
    if (!group?.invite_code) return
    const text = `${group.name} 그룹 초대 코드: ${group.invite_code}`
    try {
      if (navigator.share) { await navigator.share({ title: '그룹 초대', text }); return }
    } catch { return /* 사용자가 취소 */ }
    copyCode()
  }
  async function regenCode() {
    if (regenBusy) return
    if (!confirm('새 코드를 만들면 기존 코드는 더 이상 사용할 수 없어요. 계속할까요?')) return
    setRegenBusy(true); setError('')
    try {
      const next = await regenerateInviteCode(groupId)
      setGroup((g) => ({ ...g, invite_code: next })); setCopied(false)
    } catch (err) { setError(err.message) } finally { setRegenBusy(false) }
  }

  if (loading) return <div className="page"><div className="spinner" /></div>

  // ---- 커플 그룹: 데이트(커플 공간) ----
  if (couple) {
    const meC = members.find((m) => m.is_self) || members[0]
    const partner = members.find((m) => !m.is_self) || members[1] || null
    const today = new Date()
    const maxDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    // 명시적 기념일 없으면 커플 링 수령일을 기본값으로
    const effAnniv = anniv || claimDate || ''
    const days = daysSince(effAnniv)
    const start = parseYMD(effAnniv)
    // 다음 100일 단위 기념일
    let mile = null, mileLeft = null, mileDateLabel = null, pct = 0
    if (days != null && start) {
      mile = (Math.floor(days / 100) + 1) * 100
      mileLeft = mile - days
      const mileD = new Date(start.getTime() + (mile - 1) * 86400000)
      mileDateLabel = `${mileD.getMonth() + 1} 월 ${mileD.getDate()} 일`
      pct = Math.max(3, Math.min(100, Math.round(((days - (mile - 100)) / 100) * 100)))
    }
    const go = (path) => navigate(`/groups/${groupId}/${path}`, { state: { from: 'members' } })
    const face = (m, sub) => (
      <button type="button" className="csx-face"
        onClick={() => m && navigate(`/groups/${groupId}/members/${m.user_id}`)} disabled={!m}>
        <MemberAvatar src={m?.avatar_url} name={m?.display_nickname || '?'} seed={m?.user_id || sub} size={104} deco={m ? decoMap[m.user_id] : undefined} />
        <span className="csx-face-name">{m?.display_nickname || (sub === 'partner' ? '상대 없음' : '')}</span>
      </button>
    )

    return (
      <div className={`page csx-page${annivDark ? ' csx-dark' : ''}`}>
        {annivDark && <NightSky />}
        {annivDark && <Fireworks className="fw-over" />}
        {error && <div className="alert alert-error">{error}</div>}

        {/* 커플 히어로 + 하트(콕!) */}
        <div className="csx-hero">
          {face(meC, 'me')}
          <button type="button" className="csx-heart" onClick={popHeart} aria-label="콕!" title="콕!">
            <svg width="38" viewBox="0 0 24 24" fill="#ec6a8f" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
            {burst && (
              <>
                <span className="csx-heart-p csx-hp1">💗</span>
                <span className="csx-heart-p csx-hp2">💘</span>
                <span className="csx-heart-p csx-hp3">💖</span>
              </>
            )}
          </button>
          {face(partner, 'partner')}
        </div>

        {/* D-day + 기념일 알약(클릭 시 수정) */}
        <div className="csx-dday">
          <div className="csx-days">{days != null ? days.toLocaleString('ko-KR') : '—'}<span>&nbsp;일</span></div>
          <button type="button" className="csx-anniv-pill" onClick={() => openAnnivEdit(effAnniv)}>
            {effAnniv ? `${annivLabel(effAnniv)} ~ing` : '기념일 설정하기'}
          </button>
        </div>

        {/* 다음 기념일 카드 */}
        {mile != null && (
          <div className="csx-mile">
            <div className="csx-mile-top">
              <div className="csx-mile-label">다음 기념일 <b>{mile} 일</b></div>
              <span className="csx-mile-d">D-{mileLeft}</span>
            </div>
            <div className="csx-mile-bar"><div className="csx-mile-fill" style={{ width: `${pct}%` }} /></div>
            <div className="csx-mile-date">{mileDateLabel}에 {mile} 일이 돼요</div>
          </div>
        )}

        {/* 멍냥꽁냥 */}
        <div className="csx-zone">
          <div className="csx-zone-title">멍냥꽁냥</div>
          <div className="csx-scroll">
            <PlayCard emoji="💘" bg="#fde8ee" title="우심뽀까" sub="뽀뽀나 함 하까" onClick={() => go('touch')} />
            <PlayCard emoji="✏️" bg="#fbf1d3" title="낙서장" sub="같이 그리기" onClick={() => go('draw')} />
            <PlayCard emoji="⭐" bg="#eeebfe" title="칭찬 스티커" sub={isAdmin ? '착한 애인 챌린지' : '메뉴 준비 중'} onClick={isAdmin ? () => go('praise') : undefined} />
            <PlayCard emoji="💬" bg="#e8f4ec" title="질문팩" sub="메뉴 준비 중" />
          </div>
        </div>

        {/* 미니 게임 */}
        <div className="csx-zone">
          <div className="csx-zone-title">미니 게임</div>
          <div className="csx-scroll">
            <PlayCard emoji="🎨" bg="#e6eefd" title="캐치 마인드" sub="내가그린기린그림" onClick={() => go('catchmind')} />
            <PlayCard emoji="🃏" bg="#fbf1d3" title="다빈치 코드" sub="힝거 거믕거" onClick={() => go('davinci')} />
            <PlayCard emoji="🧩" bg="#e8f4ec" title="퍼즐" sub="한 조각 두 조각" onClick={() => go('puzzle')} />
            <PlayCard emoji="✌️" bg="#fde8ee" title="가위바위보" sub="안 내면 진 거" onClick={() => go('rps')} />
            <PlayCard emoji="⚫" bg="#f3f2f7" title="오목" sub="쪼로로로록" onClick={() => go('omok')} />
          </div>
        </div>

        {/* 기념일 수정 모달 */}
        <Modal open={annivOpen} onClose={() => setAnnivOpen(false)} title="기념일">
          <div className="csx-anniv-modal">
            <p className="csx-anniv-hint">
              사귀기 시작한 날을 골라 주세요. 설정하지 않으면 커플 링을 수령한 날부터 세어요.
            </p>
            <input type="date" className="csx-anniv-input" value={annivDraft || ''} max={maxDate}
              onChange={(e) => setAnnivDraft(e.target.value)} />
            <button type="button" className="btn btn-primary btn-block" onClick={saveAnnivModal}
              disabled={annivBusy || !annivDraft}>
              {annivBusy ? '저장 중…' : '저장'}
            </button>
            {anniv && (
              <button type="button" className="btn btn-block csx-anniv-reset" onClick={resetAnnivToClaim} disabled={annivBusy}>
                커플 링 수령일로 되돌리기
              </button>
            )}
          </div>
        </Modal>
      </div>
    )
  }

  const q = query.trim().toLowerCase()
  const shown = q ? members.filter((m) => (m.display_nickname || '').toLowerCase().includes(q)) : members

  return (
    <div className="page mlist-page">
      {error && <div className="alert alert-error">{error}</div>}

      {/* 검색 */}
      <div className="mlist-search">
        <svg width="17" viewBox="0 0 24 24" fill="none" stroke="#9a96a8" strokeWidth="2.2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="멤버 검색" />
      </div>

      {/* 멤버 초대 (커플 그룹 제외) */}
      {!couple && group?.invite_code && (
        <button type="button" className="mlist-invite" onClick={() => setInviteOpen(true)}>
          <svg width="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" /></svg>
          멤버 초대
        </button>
      )}

      {/* 목록 */}
      <div className="mlist">
        {shown.map((m, i) => {
          const contact = m.contact || null
          const birth = birthLabel(m.birthdate)
          return (
            <div key={m.user_id}>
              {i > 0 && <div className="mlist-div" />}
              <button type="button" className="mlist-row"
                onClick={() => navigate(`/groups/${groupId}/members/${m.user_id}`)}>
                <MemberAvatar src={m.avatar_url} name={m.display_nickname} seed={m.user_id} size={46} deco={decoMap[m.user_id]} />
                <div className="mlist-main">
                  <div className="mlist-name">
                    <span className="mlist-nick">{m.display_nickname}</span>
                    {m.is_self && <span className="mlist-me">나</span>}
                    {m.role === 'owner' && <OwnerBadge />}
                  </div>
                  <div className="mlist-meta">
                    <span className={contact ? '' : 'hidden-v'}>{contact || '비공개'}</span>
                    <span className="mlist-dot" />
                    <span className={birth ? '' : 'hidden-v'}>{birth || '비공개'}</span>
                  </div>
                </div>
                <Chevron />
              </button>
            </div>
          )
        })}
        {shown.length === 0 && <p className="comment-empty">멤버를 찾을 수 없어요.</p>}
      </div>

      {/* 우정 그룹: 함께 놀기(게임) — 예전엔 그룹 상세 헤더에 있던 것 */}
      {friend && (
        <div className="mlist-games">
          <div className="mlist-games-title">함께 놀기</div>
          <div className="cs-actions">
            <button type="button" className="cs-act" onClick={() => navigate(`/groups/${groupId}/draw`, { state: { from: 'members' } })}>
              <span className="cs-act-ico" style={{ background: '#eeebfe', color: '#7363e8' }}>
                <svg width="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="13.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" /><circle cx="17.5" cy="10.5" r="1.2" fill="currentColor" stroke="none" /><circle cx="8.5" cy="7.5" r="1.2" fill="currentColor" stroke="none" /><circle cx="6.5" cy="12.5" r="1.2" fill="currentColor" stroke="none" /><path d="M12 2a10 10 0 1 0 0 20c1.7 0 2-1.4 1.2-2.3-.8-.9-.5-2.2.7-2.4l1.3-.2A4.8 4.8 0 0 0 21 12 9.7 9.7 0 0 0 12 2Z" /></svg>
              </span>
              <span className="cs-act-t">낙서장</span>
            </button>
            <button type="button" className="cs-act" onClick={() => navigate(`/groups/${groupId}/puzzle`, { state: { from: 'members' } })}>
              <span className="cs-act-ico" style={{ background: '#e6eefd' }}>🧩</span>
              <span className="cs-act-t">퍼즐</span>
            </button>
            <button type="button" className="cs-act" onClick={() => navigate(`/groups/${groupId}/catchmind`, { state: { from: 'members' } })}>
              <span className="cs-act-ico" style={{ background: '#fdeee6' }}>🎨</span>
              <span className="cs-act-t">캐치마인드</span>
            </button>
            <button type="button" className="cs-act" onClick={() => navigate(`/groups/${groupId}/omok`, { state: { from: 'members' } })}>
              <span className="cs-act-ico" style={{ background: '#efe7d8' }}>⚫</span>
              <span className="cs-act-t">오목</span>
            </button>
            <button type="button" className="cs-act" onClick={() => navigate(`/groups/${groupId}/davinci`, { state: { from: 'members' } })}>
              <span className="cs-act-ico" style={{ background: '#e6e9f2' }}>🔢</span>
              <span className="cs-act-t">다빈치코드</span>
            </button>
            <button type="button" className="cs-act cs-act-wide" onClick={() => navigate(`/groups/${groupId}/rps`, { state: { from: 'members' } })}>
              <span className="cs-act-ico" style={{ background: '#e9e4f7' }}>✊</span>
              <span className="cs-act-t">가위바위보</span>
            </button>
          </div>
        </div>
      )}

      <BottomSheet open={inviteOpen} onClose={() => setInviteOpen(false)}>
        <div className="iv-head">
          <span className="iv-ico" aria-hidden="true">
            <svg width="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" /></svg>
          </span>
          <div className="iv-htext">
            <div className="iv-tt">멤버 초대</div>
            <div className="iv-sub">함께할 멤버를 초대해 보세요</div>
          </div>
          <button type="button" className="iv-x" onClick={() => setInviteOpen(false)} aria-label="닫기" title="닫기">
            <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div className="iv-codecard">
          <div className="iv-codelabel">초대 코드</div>
          <div className="iv-codeval">{group?.invite_code}</div>
          <button type="button" className={`iv-copy ${copied ? 'copied' : ''}`} onClick={copyCode}>
            {copied ? (
              <><svg width="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>복사됨</>
            ) : (
              <><svg width="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>코드 복사</>
            )}
          </button>
        </div>

        <button type="button" className="iv-share" onClick={shareCode}>
          <svg width="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.6" y1="13.5" x2="15.4" y2="17.5" /><line x1="15.4" y1="6.5" x2="8.6" y2="10.5" /></svg>
          공유하기
        </button>
        <button type="button" className="iv-regen" onClick={regenCode} disabled={regenBusy}>
          {regenBusy ? <span className="iv-regen-spin" aria-hidden="true" /> : (
            <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36" /><polyline points="21 3 21 9 15 9" /></svg>
          )}
          {regenBusy ? '만드는 중…' : '새 코드 만들기'}
        </button>
      </BottomSheet>
    </div>
  )
}
