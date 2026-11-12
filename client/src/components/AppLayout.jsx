
import { NavLink, Outlet } from 'react-router-dom';

import {
  BarChart3,
  Building2,
  Headphones,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Search,
  Users,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';

const navigation = [
  {
    to: '/',
    label: 'Overview',
    icon: LayoutDashboard,
    end: true,
  },
  {
    to: '/leads',
    label: 'Leads',
    icon: Users,
  },
  {
    to: '/lead-finder',
    label: 'Lead Finder',
    icon: Search,
  },
  {
    to: '/calling',
    label: 'AI calling',
    icon: Headphones,
  },
  {
    to: '/campaigns',
    label: 'Campaigns',
    icon: Megaphone,
  },
  {
    to: '/reports',
    label: 'Reports',
    icon: BarChart3,
  },
];

export default function AppLayout() {
  const { user, organization, logout } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">L</div>

          <div>
            <strong>LeadFlow</strong>
            <span>Sales workspace</span>
          </div>
        </div>

        <div className="workspace-switcher">
          <div className="workspace-icon">
            <Building2 size={17} />
          </div>

          <div className="workspace-copy">
            <span>WORKSPACE</span>
            <strong>
              {organization?.name || 'Your workspace'}
            </strong>
            <small>{organization?.slug || ''}</small>
          </div>
        </div>

        <div className="nav-label">WORKSPACE</div>

        <nav className="main-nav">
          {navigation.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `nav-link ${isActive ? 'active' : ''}`
                }
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-user">
            <div className="avatar">
              {user?.full_name?.slice(0, 1) || 'U'}
            </div>

            <div className="user-copy">
              <strong>{user?.full_name}</strong>
              <span>{user?.role}</span>
            </div>
          </div>

          <button
            className="logout-button"
            onClick={logout}
            title="Sign out"
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-context">
            <span className="status-dot" />
            All systems operational
          </div>

          <div className="topbar-right">
            <span className="topbar-role">
              {user?.role}
            </span>

            <div className="avatar small">
              {user?.full_name?.slice(0, 1) || 'U'}
            </div>
          </div>
        </header>

        <div className="page-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
