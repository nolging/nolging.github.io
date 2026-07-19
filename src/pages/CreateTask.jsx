import { useEffect, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { createTask, createTaskScheduled, listMemberCards } from '../lib/api'
import TaskForm from '../components/TaskForm'

export default function CreateTask() {
  const { groupId } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const groupType = useLocation().state?.groupType
  const [members, setMembers] = useState([])

  // 약속/추억으로 바로 등록할 때 참여자 선택에 쓸 멤버 목록
  useEffect(() => { listMemberCards(groupId).then((cs) => setMembers((cs || []).filter((m) => !m.is_left))).catch(() => {}) }, [groupId])

  return (
    <TaskForm
      groupType={groupType}
      submitLabel="저장"
      allowStatus
      members={members}
      meId={profile.id}
      onSubmit={async ({ status, schedule, ...values }) => {
        let task
        if (status === 'open') {
          // 위시로 올림 → 상대에게 새 항목 알림 발송(기존 트리거)
          task = await createTask({ groupId, ...values, createdBy: profile.id })
        } else {
          // 약속·추억으로 바로 올림 → 알림 없이 생성 + 일정/참여자 저장(한 번에)
          task = await createTaskScheduled({ groupId, ...values, done: status === 'done', schedule })
        }
        // 작성 후 해당 항목 상세로 이동. 상세의 '<' 는 상태에 맞는 그룹 탭으로 되돌아감
        // (from 미지정 → /groups/:id?tab=<status>).
        navigate(`/groups/${groupId}/tasks/${task.id}`, { state: { groupType } })
      }}
    />
  )
}
