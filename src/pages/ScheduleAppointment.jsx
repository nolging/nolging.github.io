import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  getGroup, getTask, listMemberCards, listTaskParticipants, scheduleTask, rescheduleTask,
  updateTask, updateTaskMedia,
} from '../lib/api'
import { REPEAT_OPTIONS, REMIND_OPTIONS, CUSTOM_FREQ, WEEKDAYS, resolveCategories, catMeta, catChipEmoji, MEDIA_LOOKUP_CATS, workNoun, workSearchHint } from '../lib/constants'
import Avatar from '../components/Avatar'
import MediaCard from '../components/MediaCard'
import WorkSearchSheet from '../components/WorkSearchSheet'
import CgToggle from '../components/CgToggle'

const pad = (n) => String(n).padStart(2, '0')
const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const timeStr = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
function defaultDate() { return dateStr(new Date()) }
function defaultTime() { const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0); return timeStr(d) }

const WD = ['일', '월', '화', '수', '목', '금', '토']
function fmtDate(s) {
  if (!s) return ''
  const [y, m, d] = s.split('-').map(Number)
  const wd = new Date(y, m - 1, d).getDay()
  return `${y}년 ${m}월 ${d}일 (${WD[wd]})`
}
function fmtTime(s) {
  if (!s) return ''
  const [h, mi] = s.split(':').map(Number)
  const ap = h < 12 ? '오전' : '오후'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${ap} ${h12}:${pad(mi)}`
}

function Chevron() {
  return <svg width="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
}

// 포맷된 값(보라 텍스트) 위에 투명 네이티브 입력을 겹쳐, 탭하면 피커가 열리게
function PickField({ type, value, onChange, format }) {
  return (
    <label className="sc-pick">
      <span className="sc-pick-text">{format(value)}<Chevron /></span>
      <input type={type} className="sc-pick-input" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} />
    </label>
  )
}

function SelectPill({ value, onChange, options }) {
  return (
    <span className="sc-select">
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <Chevron />
    </span>
  )
}

export default function ScheduleAppointment() {
  const { groupId, taskId } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const embed = useLocation().state?.embed // PC 임베드 상세에서 진입 → 저장 후 그룹 가운데로 복귀

  const [group, setGroup] = useState(null)
  const [task, setTask] = useState(null)
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const [dateOn, setDateOn] = useState(false)
  const [timeOn, setTimeOn] = useState(false)
  const [date, setDate] = useState(defaultDate())
  const [time, setTime] = useState(defaultTime())
  const [repeat, setRepeat] = useState('none')
  const [cFreq, setCFreq] = useState('weekly')
  const [cInterval, setCInterval] = useState(1)
  const [cWeekdays, setCWeekdays] = useState(() => new Set())
  const [untilOn, setUntilOn] = useState(false)
  const [until, setUntil] = useState(defaultDate())
  const [remind, setRemind] = useState('')
  const [participants, setParticipants] = useState(() => new Set())
  // 위시 정보(작성자=유형·제목·작품, 참여자=작품 카드) 편집
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [comment, setComment] = useState('') // 운동·기타 유형의 코멘트(=description)
  const [mediaInfo, setMediaInfo] = useState(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [wishErr, setWishErr] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [g, t, m] = await Promise.all([getGroup(groupId), getTask(taskId), listMemberCards(groupId)])
      setGroup(g); setTask(t); setMembers((m || []).filter((x) => !x.is_left))
      setTitle(t.title || ''); setCategory(t.category || ''); setMediaInfo(t.media_info || null)
      setComment(t.category && !MEDIA_LOOKUP_CATS.includes(t.category) ? (t.description || '') : '')

      if (t.scheduled_at) {
        const d = new Date(t.scheduled_at)
        setDateOn(true); setDate(dateStr(d))
        setTimeOn(t.scheduled_time_set !== false); setTime(timeStr(d))
      } else if (t.status !== 'open') {
        // 날짜 없이 올린 약속·추억 → 날짜 토글 꺼진 상태로 진입
        setDateOn(false)
      }
      if (t.repeat_rule) {
        if (t.repeat_rule[0] === '{') {
          try {
            const c = JSON.parse(t.repeat_rule)
            setRepeat('custom'); setCFreq(c.freq || 'weekly'); setCInterval(c.interval || 1)
            setCWeekdays(new Set(c.weekdays || []))
          } catch { setRepeat('none') }
        } else setRepeat(t.repeat_rule)
      }
      if (t.repeat_until) { setUntilOn(true); setUntil(t.repeat_until) }
      if (t.remind_min !== null && t.remind_min !== undefined) setRemind(String(t.remind_min))

      const existing = t.status !== 'open' ? await listTaskParticipants(taskId) : []
      // 2인 그룹은 기본으로 두 명 다 체크. 그 외엔 위시 작성자·나 + 기존 참여자.
      const base = m.length === 2 ? m.map((x) => x.user_id) : [t.created_by, profile.id]
      setParticipants(new Set([...base, ...existing].filter(Boolean)))
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [groupId, taskId, profile.id])
  useEffect(() => { load() }, [load])

  const isReschedule = task && task.status !== 'open'
  const isCreator = task?.created_by === profile.id
  const mediaCat = MEDIA_LOOKUP_CATS.includes(category)
  const noun = workNoun(category)
  // 멤버 2인 이상이면 참여자 선택 노출(혼자 하는 일정도 가능). 1인 그룹만 숨김.
  const needChoose = members.length >= 2

  function pickCategory(c) {
    const next = category === c ? '' : c
    setCategory(next); if (wishErr) setWishErr('')
    if (!MEDIA_LOOKUP_CATS.includes(next)) setMediaInfo(null); else setComment('')
  }

  function toggleMember(uid) {
    // 위시 작성자·약속 잡는 멤버도 필수 아님(기본 체크, 해제 가능)
    setParticipants((p) => { const n = new Set(p); n.has(uid) ? n.delete(uid) : n.add(uid); return n })
  }
  function toggleWeekday(i) {
    setCWeekdays((p) => { const n = new Set(p); n.has(i) ? n.delete(i) : n.add(i); return n })
  }

  function buildRepeat() {
    if (!dateOn || repeat === 'none') return null
    if (repeat !== 'custom') return repeat
    const obj = { type: 'custom', freq: cFreq, interval: Math.max(1, Number(cInterval) || 1) }
    if (cFreq === 'weekly') obj.weekdays = [...cWeekdays].sort((a, b) => a - b)
    return JSON.stringify(obj)
  }

  async function submit(e) {
    e.preventDefault()
    if (saving) return
    if (isCreator) {
      if (!category) { setWishErr('위시 유형을 선택해 주세요.'); return }
      if (!title.trim()) { setWishErr('제목을 입력해 주세요.'); return }
    }
    const ids = needChoose ? [...participants] : members.map((m) => m.user_id)
    if (needChoose && ids.length === 0) { setError('참여자를 한 명 이상 선택해 주세요.'); return }
    setSaving(true); setError('')
    try {
      // 작성자: 유형·제목·작품 정보 저장 / 그 외 참여자: 작품 정보만 저장
      if (isCreator) {
        await updateTask(taskId, {
          title: title.trim(),
          description: mediaCat ? '' : comment.trim(),
          category: category || null,
          media_info: mediaCat ? mediaInfo : null,
        })
      } else if (mediaCat) {
        await updateTaskMedia(taskId, mediaInfo)
      }
      let scheduledAt = null, timeSet = false
      // 날짜를 체크하지 않으면 일정 없이 저장(약속/추억 등록 가능)
      if (dateOn && date) {
        scheduledAt = new Date(`${date}T${timeOn ? time : '00:00'}`).toISOString()
        timeSet = timeOn
      }
      const rule = buildRepeat()
      const payload = {
        taskId, scheduledAt, timeSet, repeat: rule,
        repeatUntil: (dateOn && rule && untilOn) ? until : null,
        remind: dateOn ? remind : '',
        participantIds: ids,
      }
      if (isReschedule) await rescheduleTask(payload)
      else await scheduleTask(payload)
      if (embed) navigate(`/groups/${groupId}`, { state: { openTaskId: taskId } })
      else navigate(`/groups/${groupId}/tasks/${taskId}`, { state: { groupType: group.group_type } })
    } catch (err) { setError(err.message); setSaving(false) }
  }

  if (loading) return <div className="page"><div className="spinner" /></div>
  if (error && !task) return <div className="page"><div className="alert alert-error">{error}</div></div>
  if (!task) return null

  const cats = resolveCategories(group)
  const col = catMeta(cats, category)

  return (
    <div className="page cg-page">
      <form onSubmit={submit} className="cg-form">
        {/* 위시 정보 — 작성자는 유형·제목 편집, 그 외엔 요약 표시 */}
        {isCreator ? (
          <>
            <div className="cg-field">
              <div className="cg-label">위시 유형 <span className="cg-req">*</span></div>
              <div className="ts-chips" style={{ marginTop: 10 }}>
                {cats.map((c) => {
                  const sel = category === c.name
                  return (
                    <button type="button" key={c.name} className={`ts-chip ${sel ? 'sel' : ''}`}
                      style={sel ? { background: c.bg, color: c.fg, boxShadow: `inset 0 0 0 1.5px ${c.fg}` } : undefined}
                      onClick={() => pickCategory(c.name)}>
                      {sel && <span className="ts-chip-emoji" aria-hidden="true">{c.emoji}</span>}{c.name}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="cg-field cg-mt-22">
              <div className="cg-label">제목 <span className="cg-req">*</span></div>
              <div className="cg-input-wrap">
                <input className="cg-input" value={title} maxLength={50}
                  onChange={(e) => { setTitle(e.target.value); if (wishErr) setWishErr('') }}
                  placeholder="위시 제목을 입력하세요" />
              </div>
              {wishErr && <span className="field-error">{wishErr}</span>}
            </div>
          </>
        ) : (
          <div className="sc-wish">
            {category && (
              <span className="sc-wish-chip" style={{ background: col.bg, color: col.fg }}>
                <span aria-hidden="true">{catChipEmoji(col)}</span>{category}
              </span>
            )}
            <span className="sc-wish-title">{title}</span>
          </div>
        )}

        {/* 작품 정보 — 미디어 유형이면 참여자 누구나 편집 */}
        {mediaCat && (
          <div className="cg-section cg-mt-24">
            <div className="cg-label">{noun} 정보 <span className="cg-opt">선택</span></div>
            {!mediaInfo && <div className="cg-section-sub" style={{ marginTop: 4 }}>{workSearchHint(category)}</div>}
            <div className="cg-mt-12">
              {mediaInfo ? (
                <MediaCard category={category} info={mediaInfo} onClear={() => setMediaInfo(null)} />
              ) : (
                <button type="button" className="ts-search-card" onClick={() => setSheetOpen(true)}>
                  <span className="ts-search-icon"><svg width="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg></span>
                  <span className="ts-search-label">{noun} 검색</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* 코멘트 — 운동·기타 등 비미디어 유형은 작성자가 편집 */}
        {isCreator && category && !mediaCat && (
          <div className="cg-field cg-mt-24">
            <div className="cg-label">코멘트 <span className="cg-opt">선택</span></div>
            <div className="cg-input-wrap">
              <textarea className="cg-input cg-textarea" rows={3} value={comment}
                onChange={(e) => setComment(e.target.value)} placeholder="어떤 위시인지 자유롭게 적어 주세요" />
            </div>
          </div>
        )}

        {/* 일정 */}
        <div className="cg-section-title cg-mt-24">일정</div>
        <div className="cg-list cg-mt-12">
          <div className="cg-row">
            <span className="cg-row-icon" style={{ background: '#e6eefd' }}>📅</span>
            <div className="cg-row-main">
              <div className="cg-row-title">날짜</div>
              {dateOn && <PickField type="date" value={date} onChange={setDate} format={fmtDate} />}
            </div>
            <CgToggle on={dateOn} onClick={() => setDateOn((v) => !v)} />
          </div>

          {dateOn && (
            <div className="cg-row">
              <span className="cg-row-icon" style={{ background: '#eeebfe' }}>🕗</span>
              <div className="cg-row-main">
                <div className="cg-row-title">시간</div>
                {timeOn && <PickField type="time" value={time} onChange={setTime} format={fmtTime} />}
              </div>
              <CgToggle on={timeOn} onClick={() => setTimeOn((v) => !v)} />
            </div>
          )}

          {dateOn && (
            <div className="cg-row">
              <span className="cg-row-icon" style={{ background: '#e8f4ec' }}>🔁</span>
              <div className="cg-row-main"><div className="cg-row-title">반복</div></div>
              <SelectPill value={repeat} onChange={setRepeat} options={REPEAT_OPTIONS} />
            </div>
          )}

          {dateOn && repeat === 'custom' && (
            <div className="sc-custom">
              <div className="sc-custom-freq">
                <input type="number" min="1" className="sc-num" value={cInterval} onChange={(e) => setCInterval(e.target.value)} />
                <SelectPill value={cFreq} onChange={setCFreq} options={CUSTOM_FREQ} />
              </div>
              {cFreq === 'weekly' && (
                <div className="weekday-row">
                  {WEEKDAYS.map((w, i) => (
                    <button type="button" key={i} className={`weekday ${cWeekdays.has(i) ? 'on' : ''}`}
                      onClick={() => toggleWeekday(i)}>{w}</button>
                  ))}
                </div>
              )}
            </div>
          )}

          {dateOn && repeat !== 'none' && (
            <div className="cg-row">
              <span className="cg-row-icon" style={{ background: '#fde8ee' }}>🗓️</span>
              <div className="cg-row-main">
                <div className="cg-row-title">반복 종료</div>
                {untilOn && <PickField type="date" value={until} onChange={setUntil} format={fmtDate} />}
              </div>
              <CgToggle on={untilOn} onClick={() => setUntilOn((v) => !v)} />
            </div>
          )}

          {dateOn && (
            <div className="cg-row">
              <span className="cg-row-icon" style={{ background: '#fdeee6' }}>🔔</span>
              <div className="cg-row-main"><div className="cg-row-title">알림</div></div>
              <SelectPill value={remind} onChange={setRemind} options={REMIND_OPTIONS} />
            </div>
          )}
        </div>

        {needChoose && (
          <>
            <div className="cg-section-title cg-mt-24">참여자</div>
            <div className="cg-list cg-mt-12">
              <ul className="member-pick">
                {members.map((m) => {
                  const checked = participants.has(m.user_id)
                  return (
                    <li key={m.user_id} className="member-pick-item" onClick={() => toggleMember(m.user_id)}>
                      <Avatar src={m.avatar_url} name={m.display_nickname} size={32} />
                      <span className="member-pick-name">
                        {m.display_nickname}
                        {m.user_id === profile.id && <span className="mp-badge scp-me">나</span>}
                        {m.user_id === task.created_by && <span className="mp-badge scp-author">위시 작성자</span>}
                      </span>
                      <span className={`pick-check ${checked ? 'on' : ''}`} aria-hidden="true">✓</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          </>
        )}

        {error && <div className="alert alert-error cg-mt-16">{error}</div>}
        <div className="cg-footer">
          <button type="submit" className="cg-btn-primary" disabled={saving}>
            {saving ? '저장 중…' : isReschedule ? '저장' : (
              <><svg width="17" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><circle cx="7" cy="7" r="2.4" /><circle cx="12" cy="5.4" r="2.4" /><circle cx="17" cy="7" r="2.4" /><path d="M12 10c3.4 0 6 2.4 6 5.2 0 2-1.7 3.3-3.4 2.7-1-.4-1.7-.6-2.6-.6s-1.6.2-2.6.6C7.7 18.5 6 17.2 6 15.2 6 12.4 8.6 10 12 10Z" /></svg> 놀기 신청</>
            )}
          </button>
        </div>

        <WorkSearchSheet open={sheetOpen} onClose={() => setSheetOpen(false)}
          category={category} cats={cats} initialQuery={title} onPick={setMediaInfo} />
      </form>
    </div>
  )
}
