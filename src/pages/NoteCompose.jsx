import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Modal from '../components/Modal'
import { listMyGroups, listMemberCards, sendNote } from '../lib/api'

const MAX = 150

export default function NoteCompose() {
  const navigate = useNavigate()

  // 확정된 수신인 { groupId, groupName, userId, name } / 내 그룹내 닉네임
  const [recipient, setRecipient] = useState(null)
  const [myName, setMyName] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  // 수신인 선택 모달 상태
  const [pickOpen, setPickOpen] = useState(false)
  const [groups, setGroups] = useState([])
  const [groupId, setGroupId] = useState('')
  const [cards, setCards] = useState([])       // 선택 그룹의 멤버 카드
  const [memberId, setMemberId] = useState('')
  const [loadingMembers, setLoadingMembers] = useState(false)

  // 모달 최초 오픈 시 내 그룹 목록 로드
  useEffect(() => {
    if (!pickOpen || groups.length) return
    listMyGroups()
      .then((gs) => setGroups(gs))
      .catch((err) => setError(err.message))
  }, [pickOpen, groups.length])

  // 그룹 선택 시 멤버 카드 로드
  useEffect(() => {
    if (!groupId) { setCards([]); setMemberId(''); return }
    let on = true
    setLoadingMembers(true)
    setMemberId('')
    listMemberCards(groupId)
      .then((rows) => { if (on) setCards(rows) })
      .catch((err) => { if (on) setError(err.message) })
      .finally(() => { if (on) setLoadingMembers(false) })
    return () => { on = false }
  }, [groupId])

  const myCard = cards.find((c) => c.is_self)
  const others = cards.filter((c) => !c.is_self)

  function openPicker() {
    setError('')
    setGroupId(recipient?.groupId || '')
    setMemberId('')
    setPickOpen(true)
  }

  function confirmRecipient() {
    const g = groups.find((x) => x.id === groupId)
    const m = cards.find((c) => c.user_id === memberId)
    if (!g || !m) return
    setRecipient({
      groupId: g.id,
      groupName: g.name,
      userId: m.user_id,
      name: m.display_nickname,
    })
    setMyName(myCard?.display_nickname || '')
    setPickOpen(false)
  }

  async function handleSend() {
    if (!recipient) { setError('받는 사람을 선택해 주세요.'); return }
    if (!body.trim()) { setError('쪽지 내용을 입력해 주세요.'); return }
    setSending(true)
    setError('')
    try {
      await sendNote({ groupId: recipient.groupId, recipientId: recipient.userId, body: body.trim() })
      navigate('/notes', { state: { tab: 'sent' } })
    } catch (err) {
      setError(err.message)
      setSending(false)
    }
  }

  return (
    <div className="page">
      {error && <div className="alert alert-error">{error}</div>}

      <div className="note-compose">
        {/* To. */}
        <button type="button" className="note-field note-to" onClick={openPicker}>
          <span className="note-field-label">To.</span>
          {recipient ? (
            <span className="note-field-value">
              {recipient.name}
              <span className="note-field-sub">{recipient.groupName}</span>
            </span>
          ) : (
            <span className="note-field-placeholder">받는 사람을 선택하세요</span>
          )}
        </button>

        {/* 내용 */}
        <div className="note-field note-body-field">
          <textarea
            className="note-body-input"
            placeholder="쪽지 내용을 적어 보세요 (최대 150자)"
            value={body}
            maxLength={MAX}
            onChange={(e) => setBody(e.target.value)}
            rows={7}
          />
          <span className="note-char-count">{body.length}/{MAX}</span>
        </div>

        {/* From. */}
        <div className="note-field note-from">
          <span className="note-field-label">From.</span>
          <span className={`note-field-value ${myName ? '' : 'is-empty'}`}>
            {myName || '받는 사람을 선택하면 자동으로 채워져요'}
          </span>
        </div>

        <button type="button" className="btn btn-primary btn-block" onClick={handleSend} disabled={sending}>
          {sending ? '보내는 중…' : '쪽지 보내기'}
        </button>
      </div>

      {/* 수신인 선택 모달 */}
      <Modal open={pickOpen} onClose={() => setPickOpen(false)} title="받는 사람">
        <div className="note-pick">
          <label className="field">
            <span>그룹</span>
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">그룹 선택</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>멤버</span>
            <select
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              disabled={!groupId || loadingMembers}
            >
              <option value="">
                {loadingMembers ? '불러오는 중…' : !groupId ? '먼저 그룹을 선택하세요' : others.length ? '멤버 선택' : '보낼 수 있는 멤버가 없어요'}
              </option>
              {others.map((m) => (
                <option key={m.user_id} value={m.user_id}>{m.display_nickname}</option>
              ))}
            </select>
          </label>

          <div className="note-pick-actions">
            <button type="button" className="btn" onClick={() => setPickOpen(false)}>취소</button>
            <button type="button" className="btn btn-primary" onClick={confirmRecipient} disabled={!groupId || !memberId}>
              선택
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
