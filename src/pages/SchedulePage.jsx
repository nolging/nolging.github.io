import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams, useOutletContext } from 'react-router-dom'
import { listMyAppointments, listGroupMembersBrief, listMyGroups, getGroupDecoMap, touchQuest } from '../lib/api'
import { repeatLabel, resolveCategories, catMeta, catChipStyle, DEFAULT_WISH_CATEGORIES } from '../lib/constants'
import CategoryChip from '../components/CategoryChip'
import Avatar from '../components/Avatar'
import BottomSheet from '../components/BottomSheet'

const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const WD = ['일', '월', '화', '수', '목', '금', '토']
const DAY = 86400000
const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const minutesOf = (iso) => { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes() }

// 반복 규칙 파싱 → { freq, interval, weekdays }
function parseRule(rule) {
  if (rule && rule[0] === '{') {
    try {
      const c = JSON.parse(rule)
      return { freq: c.freq, interval: c.interval || 1, weekdays: c.weekdays?.length ? c.weekdays : null }
    } catch { return null }
  }
  switch (rule) {
    case 'hourly':
    case 'daily': return { freq: 'daily', interval: 1 }
    case 'weekday': return { freq: 'weekdaySet', weekdays: [1, 2, 3, 4, 5] }
    case 'weekend': return { freq: 'weekdaySet', weekdays: [0, 6] }
    case 'weekly': return { freq: 'weekly', interval: 1 }
    case 'biweekly': return { freq: 'weekly', interval: 2 }
    case 'monthly': return { freq: 'monthly', interval: 1 }
    case 'quarterly': return { freq: 'monthly', interval: 3 }
    case 'semiannually': return { freq: 'monthly', interval: 6 }
    case 'yearly': return { freq: 'yearly', interval: 1 }
    default: return null
  }
}

// 약속(appt) 이 특정 날짜(date)에 발생하는가? (반복 규칙 전개)
function occursOn(appt, date) {
  const baseDay = midnight(new Date(appt.scheduled_at))
  const target = midnight(date)
  // 추억(done)은 지난 일회성 기록이므로 반복 전개하지 않고 실제 날짜에만 표시
  if (appt.status === 'done') return +target === +baseDay
  if (target < baseDay) return false
  if (appt.repeat_until && ymd(target) > appt.repeat_until) return false

  const rule = appt.repeat_rule
  if (!rule || rule === 'none') return +target === +baseDay
  const p = parseRule(rule)
  if (!p) return +target === +baseDay

  const interval = p.interval || 1
  const days = Math.round((target - baseDay) / DAY)
  switch (p.freq) {
    case 'daily':
      return days % interval === 0
    case 'weekdaySet':
      return p.weekdays.includes(target.getDay())
    case 'weekly': {
      const wds = p.weekdays || [baseDay.getDay()]
      if (!wds.includes(target.getDay())) return false
      const weekStart = new Date(baseDay)
      weekStart.setDate(baseDay.getDate() - baseDay.getDay())
      const wi = Math.floor((target - weekStart) / (7 * DAY))
      return wi >= 0 && wi % interval === 0
    }
    case 'monthly': {
      if (target.getDate() !== baseDay.getDate()) return false
      const md = (target.getFullYear() - baseDay.getFullYear()) * 12 + (target.getMonth() - baseDay.getMonth())
      return md >= 0 && md % interval === 0
    }
    case 'yearly': {
      if (target.getMonth() !== baseDay.getMonth() || target.getDate() !== baseDay.getDate()) return false
      const yd = target.getFullYear() - baseDay.getFullYear()
      return yd >= 0 && yd % interval === 0
    }
    default:
      return false
  }
}

export default function SchedulePage() {
  const navigate = useNavigate()
  const [appts, setAppts] = useState([])
  const [memberMap, setMemberMap] = useState({})
  const [decosByGroup, setDecosByGroup] = useState({}) // { groupId: {userId:{head,face}} }
  const [myGroups, setMyGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 일정 페이지 방문 → 랜덤 퀘스트 '일정 확인하기'
  useEffect(() => { touchQuest('r_schedule') }, [])

  const today = useMemo(() => new Date(), [])
  // 선택 날짜를 URL(?date=)에 보존 → 상세로 갔다가 뒤로 오면 그 날짜로 복원.
  // ?date 가 있으면 사용자가 특정 날짜를 고른 상태(datePicked). 없으면 기본(오늘 이후 이번 달) 표시.
  const [searchParams, setSearchParams] = useSearchParams()
  const paramDate = searchParams.get('date')
  const hasParamDate = /^\d{4}-\d{2}-\d{2}$/.test(paramDate || '')
  const initDate = hasParamDate ? paramDate : ymd(today)
  const initD = new Date(`${initDate}T00:00:00`)
  const [view, setView] = useState({ y: initD.getFullYear(), m: initD.getMonth() })
  const [selected, setSelected] = useState(initDate)
  const [datePicked, setDatePicked] = useState(hasParamDate)
  const [monthAll, setMonthAll] = useState(false) // true=보고 있는 달 전체, false=오늘 이후만

  function selectDay(key) {
    setSelected(key); setDatePicked(true)
    setSearchParams({ date: key }, { replace: true })
  }
  // 보고 있는 달 전체 일정 보기 (화살표 이동/제목 클릭)
  function showMonth() {
    setDatePicked(false); setMonthAll(true)
    setSearchParams({}, { replace: true })
  }
  function goToday() {
    // 오늘 날짜 셀을 클릭한 것과 동일: 오늘로 포커싱 + 그 날짜만 표시
    setMonthAll(false)
    setView({ y: today.getFullYear(), m: today.getMonth() })
    selectDay(ymd(today))
  }

  // 필터(상단바 버튼 → 하단 시트): 유형 + 그룹(기본=전체 체크), 제목 검색(본문 돋보기)
  const [catOff, setCatOff] = useState([]) // 해제(제외)된 유형. 기본=전체 표시(빈 배열)
  const [groupFilter, setGroupFilter] = useState([]) // 그룹 로드 후 전체로 채움
  const [filterOpen, setFilterOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [q, setQ] = useState('')
  const inputRef = useRef(null)
  const scrollRef = useRef(null)
  const toggleCat = (c) => setCatOff((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]))
  const toggleGroup = (id) => setGroupFilter((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  // 그룹별 유형 목록(스타일 조회용) + 보이는 유형 합집합(그룹마다 유형이 달라 union 으로 구성)
  const groupCatsMap = useMemo(() => Object.fromEntries(myGroups.map((g) => [g.id, resolveCategories(g)])), [myGroups])
  const allCats = useMemo(() => Object.values(groupCatsMap).flat(), [groupCatsMap])
  const catNames = useMemo(() => {
    const order = DEFAULT_WISH_CATEGORIES.map((c) => c.name)
    const seen = []
    appts.forEach((a) => { if (a.category && !seen.includes(a.category)) seen.push(a.category) })
    return seen.sort((x, y) => {
      const ix = order.indexOf(x), iy = order.indexOf(y)
      return (ix < 0 ? 99 : ix) - (iy < 0 ? 99 : iy)
    })
  }, [appts])

  // 전체 체크가 기본 상태 → 하나라도 해제되면 "적용 중"(점 표시)
  const catActive = catOff.length > 0
  const groupActive = groupFilter.length < myGroups.length
  const filterActive = catActive || groupActive

  // 상단바 필터 버튼 동작/적용여부(점) 등록
  const { setHeaderFilter } = useOutletContext()
  useEffect(() => {
    setHeaderFilter?.({ onClick: () => setFilterOpen(true), active: filterActive })
    return () => setHeaderFilter?.(null)
  }, [filterActive, setHeaderFilter])

  useEffect(() => { if (searchOpen) inputRef.current?.focus() }, [searchOpen])
  function openSearch() { setSearchOpen(true) }
  function closeSearch() {
    if (document.activeElement === inputRef.current) return
    setSearchOpen(false); setQ('')
  }
  function onSearchBlur() { setTimeout(closeSearch, 120) }
  function clearSearch() { setQ(''); inputRef.current?.focus() }

  useEffect(() => {
    (async () => {
      setLoading(true); setError('')
      try {
        const [a, gs] = await Promise.all([listMyAppointments(), listMyGroups()])
        setAppts(a); setMyGroups(gs); setGroupFilter(gs.map((g) => g.id)) // 기본=전체 그룹 체크
        setMemberMap(await listGroupMembersBrief(a.map((x) => x.group_id)))
        const gids = [...new Set(a.map((x) => x.group_id).filter(Boolean))]
        Promise.all(gids.map((id) => getGroupDecoMap(id).then((m) => [id, m]).catch(() => [id, {}])))
          .then((pairs) => setDecosByGroup(Object.fromEntries(pairs))).catch(() => {})
      } catch (err) { setError(err.message) }
      finally { setLoading(false) }
    })()
  }, [])

  // 약속의 참여자 표시정보 (그룹 내 아바타/닉네임)
  const partsOf = (a) => (a.task_participants || [])
    .map((p) => {
      const m = memberMap[`${a.group_id}:${p.user_id}`]
      return m ? { ...m, user_id: p.user_id, group_id: a.group_id } : null
    }).filter(Boolean)

  // 유형 필터 + 제목 검색 적용 (달력 점·목록에 공통)
  const query = q.trim().toLowerCase()
  const myGroupIds = useMemo(() => new Set(myGroups.map((g) => g.id)), [myGroups])
  const shown = useMemo(() => appts.filter((a) =>
    !catOff.includes(a.category) &&
    (!myGroupIds.has(a.group_id) || groupFilter.includes(a.group_id)) &&
    (!query || (a.title || '').toLowerCase().includes(query))
  ), [appts, catOff, groupFilter, myGroupIds, query])

  // 이번 달에 약속이 있는 날짜 집합 (반복 전개 포함)
  const daysWithAppt = useMemo(() => {
    const set = new Set()
    const daysIn = new Date(view.y, view.m + 1, 0).getDate()
    for (let day = 1; day <= daysIn; day++) {
      const d = new Date(view.y, view.m, day)
      if (shown.some((a) => occursOn(a, d))) set.add(ymd(d))
    }
    return set
  }, [shown, view])

  // 달력 셀 (앞뒤 빈칸 포함)
  const cells = useMemo(() => {
    const start = new Date(view.y, view.m, 1).getDay()
    const daysIn = new Date(view.y, view.m + 1, 0).getDate()
    const arr = []
    for (let i = 0; i < start; i++) arr.push(null)
    for (let d = 1; d <= daysIn; d++) arr.push(new Date(view.y, view.m, d))
    while (arr.length % 7 !== 0) arr.push(null)
    return arr
  }, [view])

  function move(delta) {
    showMonth() // 다른 달로 이동하면 그 달 전체 일정 표시
    setView((v) => {
      const total = v.y * 12 + v.m + delta
      return { y: Math.floor(total / 12), m: ((total % 12) + 12) % 12 }
    })
  }

  const fmtDay = (d) => `${d.getMonth() + 1} 월 ${d.getDate()} 일 ${WD[d.getDay()]}요일`
  const dayAppts = (d) => shown.filter((a) => occursOn(a, d)).sort((x, y) => minutesOf(x.scheduled_at) - minutesOf(y.scheduled_at))

  // 날짜를 고른 상태: 그 날짜 하나만. 기본 상태: 보고 있는 달에서 오늘 이후, 일정 있는 날짜별로 모두.
  const dayGroups = useMemo(() => {
    if (datePicked) {
      const d = new Date(`${selected}T00:00:00`)
      return [{ key: selected, label: fmtDay(d), appts: dayAppts(d) }]
    }
    const t0 = midnight(today)
    const daysIn = new Date(view.y, view.m + 1, 0).getDate()
    const out = []
    for (let day = 1; day <= daysIn; day++) {
      const d = new Date(view.y, view.m, day)
      if (!monthAll && midnight(d) < t0) continue // 기본(월 미이동)은 오늘 이후만
      const items = dayAppts(d)
      if (items.length) out.push({ key: ymd(d), label: fmtDay(d), appts: items })
    }
    return out
  }, [shown, selected, datePicked, monthAll, view, today])

  // 카드가 sticky 날짜 헤더 아래로 (거의) 가려지면 그림자까지 완전히 숨김
  // (그림자는 카드 박스 밖 투명 간격으로 번져 CSS만으론 헤더가 다 못 가림)
  useEffect(() => {
    const sc = scrollRef.current
    if (!sc) return
    let raf = 0
    const update = () => {
      raf = 0
      const top = sc.getBoundingClientRect().top
      const h = sc.querySelector('.cal-list-title')?.offsetHeight || 32
      const line = top + h
      sc.querySelectorAll('.cal-appt').forEach((el) => {
        el.classList.toggle('under-header', el.getBoundingClientRect().bottom <= line + 14)
      })
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update) }
    sc.addEventListener('scroll', onScroll, { passive: true })
    update()
    return () => { sc.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [dayGroups])

  const timeOf = (a) => {
    const d = new Date(a.scheduled_at)
    return a.scheduled_time_set === false ? '종일' : `${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  const todayKey = ymd(today)

  const renderAppt = (a) => {
    const parts = partsOf(a)
    const extra = parts.length - 3
    return (
      <button key={a.id} type="button" className={`cal-appt ${a.status === 'done' ? 'done' : ''}`}
        onClick={() => navigate(`/groups/${a.group_id}/tasks/${a.id}`, { state: { from: 'schedule' } })}>
        <span className="cal-appt-time">{timeOf(a)}</span>
        <span className="cal-appt-body">
          <span className="cal-appt-head">
            <CategoryChip category={a.category} cats={groupCatsMap[a.group_id]} />
            <span className="task-name">{a.title}</span>
          </span>
          {a.repeat_rule && (
            <span className="cal-appt-meta"><span className="cal-appt-rep">{repeatLabel(a.repeat_rule)}</span></span>
          )}
        </span>
        {parts.length > 0 && (
          <span className={`cal-appt-avs task-parts ${parts.length > 1 ? 'multi' : ''}`}>
            {parts.slice(0, 3).map((m, i) => <Avatar key={i} src={m.avatar} name={m.name} size={26} deco={decosByGroup[m.group_id]?.[m.user_id]} />)}
            {extra > 0 && <span className="task-parts-more">+{extra}</span>}
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="page sched-page">
      {/* 캘린더 위 툴바: 좌측 검색(돋보기, 내 그룹과 동일), 우측 "오늘" */}
      <div className={`group-search sched-toolbar ${searchOpen ? 'open' : ''}`}>
        <button type="button" className="gs-btn"
          onMouseDown={(e) => e.preventDefault()} onClick={openSearch}
          aria-label="검색" aria-expanded={searchOpen}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
        <span className="gs-spacer" aria-hidden="true" />
        <div className="gs-actions">
          <button type="button" className="sched-today" onClick={goToday}>오늘</button>
        </div>
        <input ref={inputRef} className="gs-input" type="text" value={q}
          onChange={(e) => setQ(e.target.value)} placeholder={searchOpen ? '제목 검색' : ''}
          aria-label="약속 검색" enterKeyHint="search"
          autoComplete="off" autoCorrect="off" autoCapitalize="none"
          tabIndex={searchOpen ? 0 : -1}
          onBlur={onSearchBlur}
          onKeyDown={(e) => e.key === 'Escape' && inputRef.current?.blur()} />
        {searchOpen && q && (
          <button type="button" className="gs-clear"
            onMouseDown={(e) => e.preventDefault()} onClick={clearSearch}
            aria-label="검색어 지우기">×</button>
        )}
      </div>

      <div className="cal">
        <div className="cal-head">
          <button className="btn btn-ghost btn-sm icon-btn" onClick={() => move(-1)} aria-label="이전 달">‹</button>
          <button type="button" className="cal-title cal-title-btn" onClick={showMonth} title="이 달 전체 일정 보기">{view.y} 년 {view.m + 1} 월</button>
          <button className="btn btn-ghost btn-sm icon-btn" onClick={() => move(1)} aria-label="다음 달">›</button>
        </div>
        <div className="cal-grid cal-wd">
          {WD.map((w, i) => (
            <div key={w} className={`cal-wdc ${i === 0 ? 'sun' : ''} ${i === 6 ? 'sat' : ''}`}>{w}</div>
          ))}
        </div>
        <div className="cal-grid">
          {cells.map((d, i) => {
            if (!d) return <div key={i} className="cal-cell empty" />
            const key = ymd(d)
            const dow = d.getDay()
            return (
              <button key={i} type="button"
                className={`cal-cell ${key === selected ? 'sel' : ''} ${key === todayKey ? 'today' : ''}`}
                onClick={() => selectDay(key)}>
                <span className={`cal-day ${dow === 0 ? 'sun' : ''} ${dow === 6 ? 'sat' : ''}`}>{d.getDate()}</span>
                <span className={`cal-dot ${daysWithAppt.has(key) ? 'on' : ''}`} />
              </button>
            )
          })}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* 캘린더 아래 영역만 스크롤. 날짜 헤더는 다음 날짜 전까지 상단 고정(sticky) */}
      <div className="cal-scroll" ref={scrollRef}>
        {loading ? (
          <div className="spinner" />
        ) : datePicked ? (
          <div className="cal-list">
            <div className="cal-day-group">
              <div className="cal-list-title">{dayGroups[0].label}</div>
              {dayGroups[0].appts.length === 0 ? (
                <p className="muted sm cal-empty">약속이 없는 날이에요.</p>
              ) : dayGroups[0].appts.map(renderAppt)}
            </div>
          </div>
        ) : (
          <div className="cal-list">
            {dayGroups.length === 0 ? (
              <p className="muted sm cal-empty">{monthAll ? '이 달 일정이 없어요.' : '이번 달 남은 일정이 없어요.'}</p>
            ) : dayGroups.map((g) => (
              <div key={g.key} className="cal-day-group">
                <div className="cal-list-title">{g.label}</div>
                {g.appts.map(renderAppt)}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 필터 설정 시트: 유형(알약) + 그룹(체크) — 중복 선택·즉시 적용 */}
      <BottomSheet open={filterOpen} onClose={() => setFilterOpen(false)}>
        <div className="filter-head">
          <h3 className="sheet-title filter-title">필터 설정</h3>
          <button type="button" className="btn btn-ghost btn-sm"
            onClick={() => {
              if (filterActive) { setCatOff([]); setGroupFilter(myGroups.map((g) => g.id)) }
              else { setCatOff([...catNames]); setGroupFilter([]) }
            }}>전체</button>
        </div>

        <div className="filter-section-label">유형</div>
        <div className="chip-row filter-chips">
          {catNames.map((c) => {
            const on = !catOff.includes(c)
            return (
              <button key={c} type="button" className={`chip ${on ? 'active' : ''}`}
                style={on ? catChipStyle(catMeta(allCats, c)) : undefined} onClick={() => toggleCat(c)}>{c}</button>
            )
          })}
        </div>

        <div className="filter-section-label">그룹</div>
        <div className="filter-groups">
          {myGroups.length === 0 ? (
            <p className="muted sm">가입된 그룹이 없어요.</p>
          ) : myGroups.map((g) => {
            const on = groupFilter.includes(g.id)
            return (
              <button key={g.id} type="button" className="filter-group-row" onClick={() => toggleGroup(g.id)}>
                <span className="filter-group-name">{g.name}</span>
                <span className={`filter-check ${on ? 'on' : ''}`} aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                </span>
              </button>
            )
          })}
        </div>
      </BottomSheet>
    </div>
  )
}
