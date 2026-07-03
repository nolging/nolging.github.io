import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Layout() {
  const { profile, isAdmin, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand">놀징<span>Nolging</span></Link>
        <nav className="topnav">
          <NavLink to="/" end>내 그룹</NavLink>
          <NavLink to="/join">그룹 가입</NavLink>
          {isAdmin && <NavLink to="/admin">관리자</NavLink>}
        </nav>
        <div className="topbar-right">
          <span className="me">
            {profile?.nickname}
            {isAdmin && <span className="badge badge-admin">관리자</span>}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={handleLogout}>로그아웃</button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
