import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { createTask } from '../lib/api'
import { taskTerms } from '../lib/constants'
import TaskForm from '../components/TaskForm'

export default function CreateTask() {
  const { groupId } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const groupType = useLocation().state?.groupType
  const terms = taskTerms(groupType)

  return (
    <TaskForm
      groupType={groupType}
      submitLabel={`${terms.noun} 등록`}
      onSubmit={async (values) => {
        await createTask({ groupId, ...values, createdBy: profile.id })
        navigate(`/groups/${groupId}`)
      }}
    />
  )
}
