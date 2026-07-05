import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import RequestAccess from './pages/RequestAccess'
import Dashboard from './pages/Dashboard'
import CreateGroup from './pages/CreateGroup'
import GroupDetail from './pages/GroupDetail'
import GroupMembers from './pages/GroupMembers'
import MemberDetail from './pages/MemberDetail'
import CreateTask from './pages/CreateTask'
import TaskEdit from './pages/TaskEdit'
import TaskDetail from './pages/TaskDetail'
import ScheduleAppointment from './pages/ScheduleAppointment'
import GroupSettingsPage from './pages/GroupSettingsPage'
import GroupConfigPage from './pages/GroupConfigPage'
import JoinGroup from './pages/JoinGroup'
import SchedulePage from './pages/SchedulePage'
import MyProfile from './pages/MyProfile'
import Notifications from './pages/Notifications'
import Admin from './pages/Admin'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/request-access" element={<RequestAccess />} />

      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/groups/new" element={<CreateGroup />} />
        <Route path="/groups/:groupId" element={<GroupDetail />} />
        <Route path="/groups/:groupId/members" element={<GroupMembers />} />
        <Route path="/groups/:groupId/members/:userId" element={<MemberDetail />} />
        <Route path="/groups/:groupId/tasks/new" element={<CreateTask />} />
        <Route path="/groups/:groupId/tasks/:taskId/edit" element={<TaskEdit />} />
        <Route path="/groups/:groupId/tasks/:taskId/schedule" element={<ScheduleAppointment />} />
        <Route path="/groups/:groupId/tasks/:taskId" element={<TaskDetail />} />
        <Route path="/groups/:groupId/settings" element={<GroupSettingsPage />} />
        <Route path="/groups/:groupId/settings/group" element={<GroupConfigPage />} />
        <Route path="/join" element={<JoinGroup />} />
        <Route path="/schedule" element={<SchedulePage />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/me" element={<MyProfile />} />
        <Route
          path="/admin"
          element={
            <ProtectedRoute adminOnly>
              <Admin />
            </ProtectedRoute>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
