import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Activity,
  Bot,
  CalendarClock,
  ChevronRight,
  Command,
  Plus,
  Radio,
} from 'lucide-react';

const primaryLinks = [
  { to: '/new', label: 'New Agent', icon: Plus, accent: true },
  { to: '/agents', label: 'Agents', icon: Bot },
  { to: '/runs', label: 'Runs', icon: Activity },
];

const operationsLinks = [
  { to: '/automations', label: 'Automations', icon: CalendarClock },
];

function SidebarLink({ item }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) => `nav-link ${isActive ? 'active' : ''} ${item.accent ? 'accent' : ''}`}
    >
      <Icon size={16} strokeWidth={1.9} />
      <span>{item.label}</span>
      {item.accent && <span className="nav-key">N</span>}
    </NavLink>
  );
}

export default function Shell() {
  const location = useLocation();
  const current = [...primaryLinks, ...operationsLinks]
    .find((item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <NavLink to="/agents" className="brand">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </span>
          <span className="brand-copy">
            <span className="brand-word">CloudAgents</span>
            <span className="brand-context">Local workspace</span>
          </span>
        </NavLink>

        <nav className="nav-stack">
          <p className="nav-label">Workspace</p>
          {primaryLinks.map((item) => <SidebarLink key={item.to} item={item} />)}
          <p className="nav-label nav-label-spaced">Operate</p>
          {operationsLinks.map((item) => <SidebarLink key={item.to} item={item} />)}
        </nav>

        <div className="sidebar-spacer" />
        <div className="runtime-card">
          <div className="runtime-heading">
            <span className="live-dot" />
            <span>Local runtime · codex executes on this host</span>
            <Radio size={13} />
          </div>
          <div className="runtime-meta">
            <span>node v24</span>
            <span>sqlite</span>
          </div>
        </div>
        <div className="sidebar-footer">
          <Command size={14} />
          <span>CloudAgents</span>
          <span className="version">v1.0</span>
        </div>
      </aside>

      <div className="workspace">
        <header className="mobile-header">
          <NavLink to="/agents" className="brand compact">
            <span className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></span>
            <span className="brand-copy">
              <span className="brand-word">CloudAgents</span>
              <span className="brand-context">Local workspace</span>
            </span>
          </NavLink>
          <div className="mobile-context">
            <ChevronRight size={14} />
            <span>{current?.label || 'Workspace'}</span>
          </div>
          <NavLink className="icon-button mobile-new" to="/new" aria-label="New agent">
            <Plus size={18} />
          </NavLink>
        </header>
        <main className="main-canvas">
          <div className="ambient ambient-one" />
          <div className="ambient ambient-two" />
          <div className="page-stage">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
