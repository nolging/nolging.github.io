import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import RecipientPicker from '../components/RecipientPicker'
import Avatar from '../components/Avatar'
import { sendNote } from '../lib/api'

const MAX = 150

export default function NoteCompose() {
  const navigate = useNavigate()
  const location = useLocation()
  // 답장으로 진입한 경우 To/From 자동 채움
  const reply = location.state?.reply

  // 확정된 수신인 { groupId, groupName, userId, name, avatar } / 내 그룹내 닉네임·아바타
  const [recipient, setRecipient] = useState(reply?.recipient || null)
  const [me, setMe] = useState(reply?.me || { name: '', avatar: null })
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [pickOpen, setPickOpen] = useState(false)

  function handlePick(r) {
    setRecipient({ groupId: r.groupId, groupName: r.groupName, userId: r.userId, name: r.name, avatar: r.avatar })
    setMe({ name: r.myName, avatar: r.myAvatar })
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
        <button type="button" className="note-field note-to" onClick={() => { setError(''); setPickOpen(true) }}>
          <span className="note-field-label">To.</span>
          {recipient ? (
            <span className="note-field-value">
              <Avatar src={recipient.avatar} name={recipient.name} size={28} />
              {recipient.name}
            </span>
          ) : (
            <span className="note-field-placeholder">받는 사람을 선택하세요</span>
          )}
        </button>

        {/* 내용 */}
        <div className="note-field note-body-field">
          <textarea
            className="note-body-input"
            placeholder="내용을 채워 주세요"
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
          {me.name ? (
            <span className="note-field-value">
              <Avatar src={me.avatar} name={me.name} size={28} />
              {me.name}
            </span>
          ) : (
            <span className="note-field-value is-empty">받는 사람을 선택하면 자동으로 채워져요</span>
          )}
        </div>

        <button type="button" className="btn btn-primary btn-block" onClick={handleSend} disabled={sending}>
          {sending ? '보내는 중…' : '쪽지 보내기'}
        </button>
      </div>

      <RecipientPicker open={pickOpen} onClose={() => setPickOpen(false)} onPick={handlePick} />
    </div>
  )
}
