import React from 'react';
import {
  Award,
  BarChart3,
  Briefcase,
  FileCheck,
  FileText,
  GraduationCap,
  Kanban,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Settings,
  Users
} from 'lucide-react';

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['visitor', 'intern', 'supervisor', 'admin'] },
  { id: 'internships', label: 'Internships', icon: Briefcase, roles: ['visitor', 'intern', 'supervisor', 'admin'] },
  { id: 'applications', label: 'Applications', icon: FileCheck, roles: ['intern', 'supervisor', 'admin'] },
  { id: 'tasks', label: 'Task Kanban', icon: Kanban, roles: ['intern', 'supervisor', 'admin'] },
  { id: 'reports', label: 'Reports & AI Review', icon: FileText, roles: ['intern', 'supervisor', 'admin'] },
  { id: 'evaluations', label: 'Intern Evaluations', icon: Award, roles: ['supervisor', 'admin', 'intern'] },
  { id: 'feedbacks', label: 'Feedbacks', icon: MessageSquare, roles: ['supervisor'] },
  { id: 'analytics', label: 'System Analytics', icon: BarChart3, roles: ['admin'] },
  { id: 'users', label: 'User Management', icon: Users, roles: ['admin'] },
  { id: 'settings', label: 'Settings', icon: Settings, roles: ['visitor', 'intern', 'supervisor', 'admin'] }
];

function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('') || 'U';
}

export default function Sidebar({ user, activeTab, setActiveTab, onLogout }) {
  const role = user?.role || 'visitor';
  const filteredItems = navItems.filter((item) => item.roles.includes(role));

  return (
    <aside className="sidebar">
      <div>
        <div className="sidebar-brand">
          <div className="sidebar-brand-mark" aria-hidden="true">
            <GraduationCap size={22} />
          </div>
          <span className="sidebar-brand-name">IMS</span>
        </div>

        <nav className="sidebar-nav" aria-label="Main navigation">
          {filteredItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`sidebar-nav-item${activeTab === id ? ' is-active' : ''}`}
              aria-current={activeTab === id ? 'page' : undefined}
              aria-label={label}
              title={label}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="sidebar-profile">
        {user ? (
          <>
            <div className="sidebar-profile-avatar" aria-hidden="true">{initials(user.name)}</div>
            <div style={{ minWidth: 0 }}>
              <div className="sidebar-profile-name">{user.name}</div>
              <div className="sidebar-profile-role">{user.role}</div>
            </div>
            <button type="button" onClick={onLogout} className="sidebar-logout" title="Sign out" aria-label="Sign out">
              <LogOut size={17} />
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setActiveTab('login')} className="btn-primary" style={{ width: '100%' }}>
            Sign in / Register
          </button>
        )}
      </div>
    </aside>
  );
}
