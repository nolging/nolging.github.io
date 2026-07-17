import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import RequestAccess from './pages/RequestAccess'
import Dashboard from './pages/Dashboard'
import CreateGroup from './pages/CreateGroup'
import GroupDetail from './pages/GroupDetail'
import GroupMembers from './pages/GroupMembers'
import DrawBoard from './pages/DrawBoard'
import TouchKiss from './pages/TouchKiss'
import Puzzle from './pages/Puzzle'
import CatchMind from './pages/CatchMind'
import Omok from './pages/Omok'
import Davinci from './pages/Davinci'
import Rps from './pages/Rps'
import PraiseStickers from './pages/PraiseStickers'
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
import MemberInfo from './pages/MemberInfo'
import ProfileEdit from './pages/ProfileEdit'
import CoinHistory from './pages/CoinHistory'
import Notifications from './pages/Notifications'
import NotificationSettings from './pages/NotificationSettings'
import Store from './pages/Store'
import Inventory from './pages/Inventory'
import Notes from './pages/Notes'
import NoteCompose from './pages/NoteCompose'
import AdminMembers from './pages/admin/AdminMembers'
import AdminMemberNew from './pages/admin/AdminMemberNew'
import AdminMemberDetail from './pages/admin/AdminMemberDetail'
import AdminStore from './pages/admin/AdminStore'
import AdminStoreItem from './pages/admin/AdminStoreItem'
import AdminQuests from './pages/admin/AdminQuests'
import AdminQuestDetail from './pages/admin/AdminQuestDetail'

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
        <Route path="/groups/:groupId/draw" element={<DrawBoard />} />
        <Route path="/groups/:groupId/touch" element={<TouchKiss />} />
        <Route path="/groups/:groupId/puzzle" element={<Puzzle />} />
        <Route path="/groups/:groupId/catchmind" element={<CatchMind />} />
        <Route path="/groups/:groupId/omok" element={<Omok />} />
        <Route path="/groups/:groupId/davinci" element={<Davinci />} />
        <Route path="/groups/:groupId/rps" element={<Rps />} />
        <Route path="/groups/:groupId/praise" element={<PraiseStickers />} />
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
        <Route path="/notifications/settings" element={<NotificationSettings />} />
        <Route path="/me" element={<MyProfile />} />
        <Route path="/me/info" element={<MemberInfo />} />
        <Route path="/me/edit" element={<ProfileEdit />} />
        <Route path="/me/coins" element={<CoinHistory />} />
        {/* 상점·쪽지: 모든 로그인 사용자 접근 가능 */}
        <Route path="/store" element={<ProtectedRoute><Store /></ProtectedRoute>} />
        <Route path="/inventory" element={<ProtectedRoute><Inventory /></ProtectedRoute>} />
        <Route path="/notes" element={<ProtectedRoute><Notes /></ProtectedRoute>} />
        <Route path="/notes/new" element={<ProtectedRoute><NoteCompose /></ProtectedRoute>} />
        <Route path="/admin" element={<Navigate to="/admin/members" replace />} />
        <Route path="/admin/members" element={<ProtectedRoute adminOnly><AdminMembers /></ProtectedRoute>} />
        <Route path="/admin/members/new" element={<ProtectedRoute adminOnly><AdminMemberNew /></ProtectedRoute>} />
        <Route path="/admin/members/:userId" element={<ProtectedRoute adminOnly><AdminMemberDetail /></ProtectedRoute>} />
        <Route path="/admin/store" element={<ProtectedRoute adminOnly><AdminStore /></ProtectedRoute>} />
        <Route path="/admin/store/new" element={<ProtectedRoute adminOnly><AdminStoreItem /></ProtectedRoute>} />
        <Route path="/admin/store/:id" element={<ProtectedRoute adminOnly><AdminStoreItem /></ProtectedRoute>} />
        <Route path="/admin/quests" element={<ProtectedRoute adminOnly><AdminQuests /></ProtectedRoute>} />
        <Route path="/admin/quests/new" element={<ProtectedRoute adminOnly><AdminQuestDetail /></ProtectedRoute>} />
        <Route path="/admin/quests/:id" element={<ProtectedRoute adminOnly><AdminQuestDetail /></ProtectedRoute>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
