import { useEffect, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { updateTask, getGroup } from '../lib/api'
import { resolveCategories } from '../lib/constants'
import TaskForm from '../components/TaskForm'

export default function TaskEdit() {
  const { groupId, taskId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const task = location.state?.task
  const groupType = location.state?.groupType
  const [categories, setCategories] = useState(null)

  // 편집 대상 정보(목록에서 전달)가 없으면 그룹으로 되돌림
  useEffect(() => {
    if (!task) navigate(`/groups/${groupId}`, { replace: true })
  }, [task, groupId, navigate])
  // 그룹별 위시 유형 로드
  useEffect(() => { getGroup(groupId).then((g) => setCategories(resolveCategories(g))).catch(() => {}) }, [groupId])

  if (!task) return null

  return (
    <TaskForm
      groupType={groupType}
      initial={task}
      categories={categories}
      submitLabel="저장"
      onSubmit={async (values) => {
        await updateTask(taskId, values)
        navigate(`/groups/${groupId}/tasks/${taskId}`, { state: { groupType } })
      }}
    />
  )
}
