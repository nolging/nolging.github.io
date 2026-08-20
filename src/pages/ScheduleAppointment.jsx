import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  getGroup, getTask, listMemberCards, listTaskParticipants, listTaskAppointments, scheduleTask, rescheduleTask,
  addAppointment, updateTask, updateTaskMedia,
} from '../lib/api'
import { resolveCategories, catMeta, catChipEmoji, MEDIA_LOOKUP_CATS, workNoun, workSearchHint, formatWhen } from '../lib/constants'
import ScheduleFields, { defaultSchedule, buildSchedulePayload, scheduleFromAppointment, SelectPill } from '../components/ScheduleFields'
import MediaCard from '../components/MediaCard'
import WorkSearchSheet from '../components/WorkSearchSheet'

export default function ScheduleAppointment({ groupId: gidProp, taskId: tidProp, appointmentId: aidProp, embedded = false, onSaved }) {
  const params = useParams()
  const groupId = gidProp ?? params.groupId
  const taskId = tidProp ?? params.taskId
  const { profile } = useAuth()
  const navigate = useNavigate()
  const locState = useLocation().state
  // embedded: GroupDetail 가운데에 임베드 렌더(라우트 이동 없음) → 저장 후 onSaved 콜백.
  // embed(state): 풀페이지 진입이지만 PC 임베드 상세로 복귀해야 하는 경우.
  const embed = locState?.embed
  // 약속이 여러 개인 위시를 수정할 때 처음에 어떤 약속을 열지(TaskDetail 에서 전달). 이후엔
  // 아래 "약속 선택" 셀렉트로 이 안에서 바꿀 수 있다.
  const appointmentIdParam = aidProp ?? locState?.appointmentId ?? null
  const [appointmentId, setAppointmentId] = useState(appointmentIdParam)

  const [group, setGroup] = useState(null)
  const [task, setTask] = useState(null)
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const [sched, setSched] = useState(defaultSchedule)
  const [appointments, setAppointments] = useState([]) // 이 위시의 약속들(2개 이상이면 선택 UI 노출)
  const [participantPool, setParticipantPool] = useState([]) // 위시를 약속으로 넘길 때 정한 참여자 풀(userId[])
  // 위시 정보(작성자=유형·제목·작품, 참여자=작품 카드) 편집
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [comment, setComment] = useState('') // 운동·기타 유형의 코멘트(=description)
  const [mediaInfo, setMediaInfo] = useState(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [wishErr, setWishErr] = useState('')

  // "+ 새 일정 추가" — 이 위시에 일정을 하나 더 붙인다(위 폼은 기존 약속 하나를 고쳐
  // 쓰는 용도라 별개). 참여자 풀은 위에서 이미 로드한 participantPool 을 그대로 쓴다.
  const [addOpen, setAddOpen] = useState(false)
  const [addSched, setAddSched] = useState(defaultSchedule)
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [g, t, m] = await Promise.all([getGroup(groupId), getTask(taskId), listMemberCards(groupId)])
      setGroup(g); setTask(t); setMembers((m || []).filter((x) => !x.is_left))
      setTitle(t.title || ''); setCategory(t.category || ''); setMediaInfo(t.media_info || null)
      setComment(t.category && !MEDIA_LOOKUP_CATS.includes(t.category) ? (t.description || '') : '')

      let schedPatch
      if (t.status !== 'open') {
        // 여러 약속 중 수정할 대상 하나를 정한다: 지정된 appointmentId 가 있으면 그것,
        // 없으면 약속 상세에 표시되는 날짜(가장 가까운 미래 약속, task.scheduled_at 캐시)와
        // 일치하는 약속을 사용. 참여자는 그 약속의 참여자(풀의 부분집합)로 채운다.
        const [appts, pool] = await Promise.all([listTaskAppointments(taskId), listTaskParticipants(taskId)])
        setAppointments(appts)
        setParticipantPool(pool)
        const appt = (appointmentIdParam && appts.find((a) => a.id === appointmentIdParam))
          || appts.find((a) => a.scheduled_at === t.scheduled_at) || appts[0] || null
        setAppointmentId(appt?.id || null)
        schedPatch = scheduleFromAppointment(appt)
      } else {
        // 처음 약속으로 넘길 때: 참여자 풀을 새로 정한다(2인 그룹은 기본으로 둘 다, 그 외엔 위시 작성자·나).
        schedPatch = scheduleFromAppointment(null)
        schedPatch.participants = m.length === 2 ? m.map((x) => x.user_id) : [t.created_by, profile.id].filter(Boolean)
      }
      setSched((s) => ({ ...s, ...schedPatch }))
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [groupId, taskId, profile.id, appointmentIdParam])
  useEffect(() => { load() }, [load])

  // 약속 선택 셀렉트에서 다른 약속으로 바꾸면, 그 약속의 일정·참여자 값으로 폼을 다시 채운다.
  function pickAppointment(id) {
    const appt = appointments.find((a) => a.id === id)
    if (!appt) return
    setAppointmentId(id)
    setSched((s) => ({ ...s, ...scheduleFromAppointment(appt) }))
  }

  const isReschedule = task && task.status !== 'open'
  const isCreator = task?.created_by === profile.id
  const mediaCat = MEDIA_LOOKUP_CATS.includes(category)
  const noun = workNoun(category)
  // 수정 중이면 참여자 풀 안에서만, 처음 약속으로 넘길 때는 그룹 멤버 전체에서 고른다.
  const pickerMembers = isReschedule ? members.filter((mm) => participantPool.includes(mm.user_id)) : members
  // 멤버 2인 이상이면 참여자 선택 노출(혼자 하는 일정도 가능). 1인 그룹만 숨김.
  const needChoose = pickerMembers.length >= 2

  function toggleAdd() {
    if (addOpen) { setAddOpen(false); return }
    setAddError('')
    setAddSched({ ...defaultSchedule(), dateOn: true, participants: participantPool })
    setAddOpen(true)
  }

  async function submitAdd() {
    if (addSaving) return
    setAddSaving(true); setAddError('')
    try {
      const participantIds = pickerMembers.length >= 2 ? addSched.participants : pickerMembers.map((m) => m.user_id)
      await addAppointment(taskId, { ...buildSchedulePayload(addSched), participantIds })
      setAddOpen(false)
      await load()
    } catch (err) { setAddError(err.message) } finally { setAddSaving(false) }
  }

  function pickCategory(c) {
    const next = category === c ? '' : c
    setCategory(next); if (wishErr) setWishErr('')
    if (!MEDIA_LOOKUP_CATS.includes(next)) setMediaInfo(null); else setComment('')
  }

  async function submit(e) {
    e.preventDefault()
    if (saving) return
    if (isCreator) {
      if (!category) { setWishErr('위시 유형을 선택해 주세요.'); return }
      if (!title.trim()) { setWishErr('제목을 입력해 주세요.'); return }
    }
    const ids = needChoose ? sched.participants : pickerMembers.map((m) => m.user_id)
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
      const schedule = buildSchedulePayload(sched)
      if (isReschedule) await rescheduleTask({ appointmentId, participantIds: ids, ...schedule })
      else await scheduleTask({ taskId, participantIds: ids, ...schedule })
      if (embedded) { onSaved?.(); return }
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

        {appointments.length > 1 && (
          <div className="cg-mt-24">
            <SelectPill className="sc-select-full" value={appointmentId} onChange={pickAppointment}
              options={appointments.map((a) => ({
                value: a.id,
                label: a.scheduled_at ? formatWhen(a.scheduled_at, a.scheduled_time_set) : '날짜 미정',
              }))} />
          </div>
        )}

        <ScheduleFields value={sched} onChange={(patch) => setSched((s) => ({ ...s, ...patch }))}
          members={pickerMembers} meId={profile.id} authorId={task.created_by}
          labelExtra={isReschedule && (
            <button type="button" className="cg-add-link" onClick={toggleAdd}>{addOpen ? '취소' : '+ 새 일정 추가'}</button>
          )} />

        {isReschedule && addOpen && (
          <div className="cg-mt-24">
            <ScheduleFields value={addSched} onChange={(patch) => setAddSched((s) => ({ ...s, ...patch }))}
              members={pickerMembers} meId={profile.id} authorId={task.created_by} showTitle={false} />
            {addError && <div className="alert alert-error cg-mt-16">{addError}</div>}
            <button type="button" className="cg-btn-primary cg-mt-16" disabled={addSaving} onClick={submitAdd}>
              {addSaving ? '추가 중…' : '일정 추가'}
            </button>
          </div>
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
