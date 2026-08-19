import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  adminListSystemNotices, adminCreateSystemNotice, adminUpdateSystemNotice,
  adminListUsers, adminGroupOverview,
} from '../../lib/api'
import { useScrollToTop } from '../../lib/useScrollRestore'
import Modal from '../../components/Modal'
import Avatar from '../../components/Avatar'
import CgToggle from '../../components/CgToggle'

const BG_PRESETS = [
  '#eeebfe', '#e8f4ec', '#fdeee6', '#e6eefd', '#fde8ee',
  '#fff0d6', '#eaf3fb', '#fdecec', '#332c52',
]
const sameColor = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()

const TARGET_TYPES = [
  { key: 'all', label: '전체' },
  { key: 'premium', label: '프리미엄' },
  { key: 'vip', label: 'VIP(우정)' },
  { key: 'vvip', label: 'VVIP(커플)' },
  { key: 'users', label: '회원 선택' },
  { key: 'groups', label: '그룹 선택' },
]

const EMPTY = { title: '', body: '', emoji: '', emojiBg: '', targetType: 'all', targetUserIds: [], targetGroupIds: [], scheduleOn: false, date: '', time: '' }

const pad = (n) => String(n).padStart(2, '0')
function splitDateTime(iso) {
  const d = new Date(iso)
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` }
}

// 회원/그룹 선택 모달 — 검색 + 다중 선택(체크). SchedulePage 필터 시트의 .filter-group-row 재사용.
// renderNameExtra: 이름 바로 오른쪽에 붙는 요소(회원 역할 배지). renderRight: 행 우측 끝, 체크 앞에 붙는 요소(그룹 멤버 아바타).
function PickerModal({ open, onClose, title, rows, selected, onToggle, renderNameExtra, renderRight }) {
  const [q, setQ] = useState('')
  useEffect(() => { if (open) setQ('') }, [open])
  const t = q.trim().toLowerCase()
  const filtered = t ? rows.filter((r) => r.name.toLowerCase().includes(t)) : rows
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <input className="sn-picker-search" placeholder="검색" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div className="filter-groups sn-picker-list">
        {filtered.length === 0 ? <p className="muted sm">결과가 없어요.</p> : filtered.map((r) => {
          const on = selected.includes(r.id)
          return (
            <button key={r.id} type="button" className="filter-group-row" onClick={() => onToggle(r.id)}>
              <span className="filter-group-name-wrap">
                <span className="filter-group-name">{r.name}</span>
                {renderNameExtra && renderNameExtra(r)}
              </span>
              {renderRight && renderRight(r)}
              <span className={`filter-check ${on ? 'on' : ''}`} aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              </span>
            </button>
          )
        })}
      </div>
      <button type="button" className="btn btn-primary btn-block" onClick={onClose}>완료</button>
    </Modal>
  )
}

// 시스템 공지 발송(/admin/misc/notices/new) + 수정(/admin/misc/notices/:id, 예약 대기 중만 가능)
export default function AdminSystemNoticeDetail() {
  useScrollToTop()
  const { id } = useParams()
  const editing = !!id
  const nav = useNavigate()
  const [form, setForm] = useState(EMPTY)
  const bgRef = useRef(null)
  const pickBg = (c) => { setForm((f) => ({ ...f, emojiBg: c })); if (bgRef.current) bgRef.current.value = c }
  const setField = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const [users, setUsers] = useState([])
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [userPickOpen, setUserPickOpen] = useState(false)
  const [groupPickOpen, setGroupPickOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [us, gs, notices] = await Promise.all([
        adminListUsers(), adminGroupOverview(), editing ? adminListSystemNotices() : Promise.resolve(null),
      ])
      setUsers(us); setGroups(gs)
      if (editing) {
        const n = (notices || []).find((x) => x.id === id)
        if (!n) { setError('공지를 찾을 수 없어요.'); return }
        if (n.sent_at) { setError('이미 발송된 공지는 수정할 수 없어요.'); return }
        const dt = n.scheduled_at ? splitDateTime(n.scheduled_at) : { date: '', time: '' }
        setForm({
          title: n.title || '', body: n.body || '', emoji: n.emoji || '', emojiBg: n.emoji_bg || '',
          targetType: n.target_type || 'all', targetUserIds: n.target_user_ids || [], targetGroupIds: n.target_group_ids || [],
          scheduleOn: !!n.scheduled_at, date: dt.date, time: dt.time,
        })
      }
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [editing, id])
  useEffect(() => { load() }, [load])

  const userRows = useMemo(() => users.map((u) => ({ id: u.id, name: u.nickname, role: u.role })), [users])
  const groupRows = useMemo(() => groups.map((g) => ({ id: g.group_id, name: g.name, members: g.members || [] })), [groups])
  const toggleUser = (uid) => setForm((f) => ({ ...f, targetUserIds: f.targetUserIds.includes(uid) ? f.targetUserIds.filter((x) => x !== uid) : [...f.targetUserIds, uid] }))
  const toggleGroup = (gid) => setForm((f) => ({ ...f, targetGroupIds: f.targetGroupIds.includes(gid) ? f.targetGroupIds.filter((x) => x !== gid) : [...f.targetGroupIds, gid] }))

  // 수신 대상을 회원/그룹 선택으로 바꾸면 곧바로 해당 선택 모달을 띄운다.
  function onTargetTypeChange(e) {
    const v = e.target.value
    setForm((f) => ({ ...f, targetType: v }))
    if (v === 'users') setUserPickOpen(true)
    else if (v === 'groups') setGroupPickOpen(true)
  }

  async function save(e) {
    e.preventDefault(); setError('')
    if (!form.title.trim() || !form.body.trim()) { setError('제목과 본문을 입력해 주세요.'); return }
    if (form.targetType === 'users' && form.targetUserIds.length === 0) { setError('대상 회원을 선택해 주세요.'); return }
    if (form.targetType === 'groups' && form.targetGroupIds.length === 0) { setError('대상 그룹을 선택해 주세요.'); return }
    if (form.scheduleOn && (!form.date || !form.time)) { setError('예약 날짜와 시간을 입력해 주세요.'); return }
    const scheduledAt = form.scheduleOn ? new Date(`${form.date}T${form.time}`).toISOString() : null
    if (form.scheduleOn && new Date(scheduledAt) <= new Date()) { setError('예약 시간은 현재 이후로 설정해 주세요.'); return }
    if (!form.scheduleOn && !confirm('시스템 공지가 즉시 발송됩니다. 발송할까요?')) return

    setBusy(true)
    try {
      const payload = {
        title: form.title.trim(), body: form.body.trim(), emoji: form.emoji.trim(), emojiBg: form.emojiBg.trim(),
        targetType: form.targetType, targetUserIds: form.targetUserIds, targetGroupIds: form.targetGroupIds, scheduledAt,
      }
      if (editing) await adminUpdateSystemNotice(id, payload)
      else await adminCreateSystemNotice(payload)
      nav('/admin/misc/notices', { replace: true })
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  if (loading) return <div className="page admin-page"><div className="spinner" /></div>

  return (
    <div className="page admin-page">
      {error && <div className="alert alert-error">{error}</div>}
      <div className="aq-form-wrap">
        <form onSubmit={save} className="aq-form" key={id || 'new'}>
          <div className="aq-frow">
            <label className="aq-flabel" htmlFor="sn-title">제목</label>
            <input id="sn-title" defaultValue={form.title} onChange={setField('title')} placeholder="공지 제목" />
          </div>
          <div className="aq-frow aq-frow-top">
            <label className="aq-flabel" htmlFor="sn-body">본문</label>
            <textarea id="sn-body" rows={3} defaultValue={form.body} onChange={setField('body')} placeholder="공지 본문" />
          </div>
          <div className="aq-frow">
            <label className="aq-flabel" htmlFor="sn-emoji">아이콘</label>
            <div className="aq-icon-row">
              <input id="sn-emoji" className="aq-icon-input" defaultValue={form.emoji} onChange={setField('emoji')}
                placeholder="📢" maxLength={16} autoCapitalize="none"
                style={form.emojiBg ? { background: form.emojiBg } : undefined} />
              <div className="an-bg-row" style={{ margin: 0 }}>
                {BG_PRESETS.map((c) => (
                  <button key={c} type="button" className={`aq-swatch ${sameColor(form.emojiBg, c) ? 'active' : ''}`}
                    style={{ background: c }} onClick={() => pickBg(c)} aria-label={c} title={c} />
                ))}
              </div>
              <input ref={bgRef} className="an-bg-hex aq-hex" defaultValue={form.emojiBg} onChange={setField('emojiBg')}
                placeholder="#RRGGBB (비우면 기본)" maxLength={7} autoCapitalize="none" spellCheck={false} />
            </div>
          </div>

          <div className="aq-frow">
            <label className="aq-flabel" htmlFor="sn-target">수신 대상</label>
            <select id="sn-target" value={form.targetType} onChange={onTargetTypeChange}>
              {TARGET_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>

          {form.targetType === 'users' && (
            <div className="sn-target-pick">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setUserPickOpen(true)}>회원 선택 ({form.targetUserIds.length})</button>
              {form.targetUserIds.length > 0 && (
                <div className="sn-target-chips">
                  {form.targetUserIds.map((uid) => {
                    const u = userRows.find((x) => x.id === uid)
                    if (!u) return null
                    return (
                      <span key={uid} className="sn-chip">
                        <span>{u.name}</span>
                        <button type="button" onClick={() => toggleUser(uid)} aria-label="제거">×</button>
                      </span>
                    )
                  })}
                </div>
              )}
            </div>
          )}
          {form.targetType === 'groups' && (
            <div className="sn-target-pick">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setGroupPickOpen(true)}>그룹 선택 ({form.targetGroupIds.length})</button>
              {form.targetGroupIds.length > 0 && (
                <div className="sn-target-chips">
                  {form.targetGroupIds.map((gid) => {
                    const g = groupRows.find((x) => x.id === gid)
                    if (!g) return null
                    return (
                      <span key={gid} className="sn-chip">
                        <span>{g.name}</span>
                        <button type="button" onClick={() => toggleGroup(gid)} aria-label="제거">×</button>
                      </span>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          <div className="aq-toggle-row">
            <div>
              <div className="aq-toggle-title">예약 발송</div>
              <div className="aq-toggle-sub">{form.scheduleOn ? '지정한 날짜·시간에 발송돼요' : '확인을 누르면 바로 발송돼요'}</div>
            </div>
            <CgToggle on={form.scheduleOn} onClick={() => setForm((f) => ({ ...f, scheduleOn: !f.scheduleOn }))} />
          </div>
          {form.scheduleOn && (
            <div className="sn-schedule-inputs">
              <input type="date" value={form.date} onChange={setField('date')} />
              <input type="time" value={form.time} onChange={setField('time')} />
            </div>
          )}

          <div className="admin-notif-preview sn-preview">
            <span className="admin-notif-preview-ico" style={form.emojiBg ? { background: form.emojiBg } : undefined} aria-hidden="true">{form.emoji || '📢'}</span>
            <div>
              <div className="admin-notif-preview-t">{form.title || '제목'}</div>
              <div className="admin-notif-preview-b">{form.body || '본문'}</div>
            </div>
          </div>

          <button type="submit" className="btn btn-primary btn-block sn-submit" disabled={busy}>{busy ? '처리 중…' : '확인'}</button>
        </form>
      </div>

      <PickerModal open={userPickOpen} onClose={() => setUserPickOpen(false)} title="회원 선택"
        rows={userRows} selected={form.targetUserIds} onToggle={toggleUser}
        renderNameExtra={(r) => <span className={`badge ${r.role === 'admin' ? 'badge-admin' : 'badge'}`}>{r.role === 'admin' ? '관리자' : '멤버'}</span>} />
      <PickerModal open={groupPickOpen} onClose={() => setGroupPickOpen(false)} title="그룹 선택"
        rows={groupRows} selected={form.targetGroupIds} onToggle={toggleGroup}
        renderRight={(r) => {
          const extra = r.members.length - 3
          return r.members.length > 0 ? (
            <span className="filter-group-avs task-parts multi">
              {r.members.slice(0, 3).map((m) => <Avatar key={m.user_id} src={m.avatar_url} name={m.nickname} size={24} />)}
              {extra > 0 && <span className="task-parts-more">+{extra}</span>}
            </span>
          ) : null
        }} />
    </div>
  )
}
