import { useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { updateTask } from '../lib/api'
import { taskTerms } from '../lib/constants'
import TaskForm from '../components/TaskForm'

export default function TaskEdit() {
  const { groupId, taskId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const task = location.state?.task
  const groupType = location.state?.groupType
  const terms = taskTerms(groupType)

  // 편집 대상 정보(목록에서 전달)가 없으면 그룹으로 되돌림
  useEffect(() => {
    if (!task) navigate(`/groups/${groupId}`, { replace: true })
  }, [task, groupId, navigate])

  if (!task) return null

  return (
    <div className="page">
      <TaskForm
        groupType={groupType}
        initial={task}
        submitLabel="완료"
        onSubmit={async (values) => {
          await updateTask(taskId, values)
          navigate(`/groups/${groupId}`)
        }}
      />
    </div>
  )
}
