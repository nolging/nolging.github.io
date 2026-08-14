import { Routes, Route, Navigate, useParams } from 'react-router-dom'
import { usePushNavigation } from './lib/pushNav'
import { useForegroundHeartbeat } from './lib/focusHeartbeat'
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
import TarotCafe from './pages/TarotCafe'
import SecretBoard, { BoardCompose, BoardPost, BoardComments, BoardSearch, BoardSettings } from './pages/SecretBoard'
import PraiseStickers from './pages/PraiseStickers'
import MemberDetail from './pages/MemberDetail'
import Closet from './pages/Closet'
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
import AdminDailyQuestDetail from './pages/admin/AdminDailyQuestDetail'
import AdminNotifs from './pages/admin/AdminNotifs'
import AdminNotifDetail from './pages/admin/AdminNotifDetail'
import AdminReports from './pages/admin/AdminReports'
import AdminReportDetail from './pages/admin/AdminReportDetail'

// 그룹이 바뀌면 리마운트되게 key 부여 → 그룹별 임베드 상세 상태(sessionStorage 복원 포함)가
// 다른 그룹으로 새지 않도록. (같은 그룹 내에선 리마운트 없음)
function GroupDetailKeyed() {
  const { groupId } = useParams()
  return <GroupDetail key={groupId} />
}

export default function App() {
  usePushNavigation()   // 푸시 알림 클릭 시 서비스워커가 알려 준 경로로 이동
  useForegroundHeartbeat() // 서비스워커에 포그라운드 상태 하트비트(silent 푸시 억제용)
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/request-access" element={<RequestAccess />} />

      {/* 쪽지 쓰기 팝업 창(레이아웃/상단바 없이 폼만) — PC 에서 window.open 으로 열림 */}
      <Route path="/notes/compose" element={<ProtectedRoute><NoteCompose /></ProtectedRoute>} />

      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/groups/new" element={<CreateGroup />} />
        <Route path="/groups/:groupId" element={<GroupDetailKeyed />} />
        <Route path="/groups/:groupId/members" element={<GroupMembers />} />
        <Route path="/groups/:groupId/draw" element={<DrawBoard />} />
        <Route path="/groups/:groupId/touch" element={<TouchKiss />} />
        <Route path="/groups/:groupId/puzzle" element={<Puzzle />} />
        <Route path="/groups/:groupId/catchmind" element={<CatchMind />} />
        <Route path="/groups/:groupId/omok" element={<Omok />} />
        <Route path="/groups/:groupId/davinci" element={<Davinci />} />
        <Route path="/groups/:groupId/rps" element={<Rps />} />
        <Route path="/groups/:groupId/tarot" element={<TarotCafe />} />
        <Route path="/groups/:groupId/board" element={<SecretBoard />} />
        <Route path="/groups/:groupId/board/new" element={<BoardCompose />} />
        <Route path="/groups/:groupId/board/search" element={<BoardSearch />} />
        <Route path="/groups/:groupId/board/settings" element={<BoardSettings />} />
        <Route path="/groups/:groupId/board/:postId" element={<BoardPost />} />
        <Route path="/groups/:groupId/board/:postId/comments" element={<BoardComments />} />
        <Route path="/groups/:groupId/board/:postId/edit" element={<BoardCompose />} />
        <Route path="/groups/:groupId/praise" element={<PraiseStickers />} />
        <Route path="/groups/:groupId/members/:userId" element={<MemberDetail />} />
        <Route path="/groups/:groupId/closet" element={<Closet />} />
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
        <Route path="/admin" element={<Navigate to="/admin/store" replace />} />
        <Route path="/admin/members" element={<ProtectedRoute adminOnly><AdminMembers /></ProtectedRoute>} />
        <Route path="/admin/members/new" element={<ProtectedRoute adminOnly><AdminMemberNew /></ProtectedRoute>} />
        <Route path="/admin/members/:userId" element={<ProtectedRoute adminOnly><AdminMemberDetail /></ProtectedRoute>} />
        <Route path="/admin/store" element={<ProtectedRoute adminOnly><AdminStore /></ProtectedRoute>} />
        <Route path="/admin/store/new" element={<ProtectedRoute adminOnly><AdminStoreItem /></ProtectedRoute>} />
        <Route path="/admin/store/:id" element={<ProtectedRoute adminOnly><AdminStoreItem /></ProtectedRoute>} />
        <Route path="/admin/quests" element={<ProtectedRoute adminOnly><AdminQuests /></ProtectedRoute>} />
        <Route path="/admin/quests/new" element={<ProtectedRoute adminOnly><AdminQuestDetail /></ProtectedRoute>} />
        <Route path="/admin/quests/daily/:key" element={<ProtectedRoute adminOnly><AdminDailyQuestDetail /></ProtectedRoute>} />
        <Route path="/admin/quests/:id" element={<ProtectedRoute adminOnly><AdminQuestDetail /></ProtectedRoute>} />
        <Route path="/admin/notifs" element={<ProtectedRoute adminOnly><AdminNotifs /></ProtectedRoute>} />
        <Route path="/admin/notifs/:key" element={<ProtectedRoute adminOnly><AdminNotifDetail /></ProtectedRoute>} />
        <Route path="/admin/reports" element={<ProtectedRoute adminOnly><AdminReports /></ProtectedRoute>} />
        <Route path="/admin/reports/:id" element={<ProtectedRoute adminOnly><AdminReportDetail /></ProtectedRoute>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
