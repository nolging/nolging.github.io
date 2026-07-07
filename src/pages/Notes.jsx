import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Avatar from '../components/Avatar'
import Modal from '../components/Modal'
import { listReceivedNotes, listSentNotes } from '../lib/api'

function NoteFabIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  )
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('ko-KR', { year: '2-digit', month: 'long', day: 'numeric' })
  } catch { return '' }
}

export default function Notes() {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [tab, setTab] = useState(location.state?.tab === 'sent' ? 'sent' : 'received')
  const [received, setReceived] = useState([])
  const [sent, setSent] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(null) // 열려 있는 쪽지

  useEffect(() => {
    if (!user?.id) return
    let on = true
    ;(async () => {
      try {
        const [r, s] = await Promise.all([listReceivedNotes(user.id), listSentNotes(user.id)])
        if (!on) return
        setReceived(r)
        setSent(s)
      } catch (err) {
        if (on) setError(err.message)
      } finally {
        if (on) setLoading(false)
      }
    })()
    return () => { on = false }
  }, [user?.id])

  const list = tab === 'received' ? received : sent

  // 받은 쪽지에 답장: 원래 보낸이를 To, 그 그룹의 내 정보를 From 으로 자동 채워 작성 화면 이동
  function replyTo(n) {
    navigate('/notes/new', {
      state: {
        reply: {
          recipient: { groupId: n.group_id, groupName: '', userId: n.sender_id, name: n.sender_name, avatar: n.sender_avatar },
          me: { name: n.recipient_name, avatar: n.recipient_avatar },
        },
      },
    })
  }

  // 쪽지의 상대(카드/모달에 표시할 사람) 정보
  const peer = (n) => tab === 'received'
    ? { name: n.sender_name, avatar: n.sender_avatar, label: '님이 보냄' }
    : { name: n.recipient_name, avatar: n.recipient_avatar, label: '님에게' }

  return (
    <div className="page">
      {error && <div className="alert alert-error">{error}</div>}

      <div className="tabs">
        <button type="button" className={`tab ${tab === 'received' ? 'active' : ''}`} onClick={() => setTab('received')}>
          받은 쪽지함
        </button>
        <button type="button" className={`tab ${tab === 'sent' ? 'active' : ''}`} onClick={() => setTab('sent')}>
          보낸 쪽지함
        </button>
        <span className="tab-underline" style={{ width: '50%', transform: `translateX(${tab === 'received' ? '0' : '100%'})` }} />
      </div>

      {loading ? (
        <div className="spinner" />
      ) : list.length === 0 ? (
        <div className="empty">{tab === 'received' ? '받은 쪽지가 없어요.' : '보낸 쪽지가 없어요.'}</div>
      ) : (
        <ul className="note-list">
          {list.map((n) => {
            const p = peer(n)
            return (
              <li key={n.id}>
                <button type="button" className="note-card" onClick={() => setOpen(n)}>
                  <Avatar src={p.avatar} name={p.name} size={40} />
                  <div className="note-card-main">
                    <div className="note-card-head">
                      <span className="note-card-peer">{p.name} <span className="note-card-rel">{p.label}</span></span>
                      <span className="note-card-date">{formatDate(n.created_at)}</span>
                    </div>
                    <p className="note-card-body">{n.body}</p>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <Modal open={!!open} onClose={() => setOpen(null)}>
        {open && (() => {
          const p = peer(open)
          return (
            <div className="note-view">
              <div className="note-view-head">
                <Avatar src={p.avatar} name={p.name} size={44} />
                <div className="note-view-who">
                  <span className="note-view-peer">{p.name} <span className="note-card-rel">{p.label}</span></span>
                  <span className="note-view-date">{formatDate(open.created_at)}</span>
                </div>
              </div>
              <p className="note-view-body">{open.body}</p>
              {open.recipient_id === user?.id && (
                <button type="button" className="btn btn-primary btn-block" onClick={() => replyTo(open)}>
                  답장하기
                </button>
              )}
            </div>
          )
        })()}
      </Modal>

      <Link to="/notes/new" className="fab fab-above-nav" aria-label="쪽지 쓰기" title="쪽지 쓰기">
        <NoteFabIcon />
      </Link>
    </div>
  )
}
