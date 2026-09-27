import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from '../../router';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield,
  LayoutDashboard,
  ScanLine,
  ClipboardList,
  Database,
  Users,
  Activity,
  Info,
  LogOut,
  Bell,
  Search,
  ExternalLink,
  ChevronRight,
  Menu,
  X,
  Radio,
  Server,
  Terminal,
} from 'lucide-react';
import { getStoredUser, logout, getAnalytics, getAdminSystemHealth } from '../../api/client';
import type { User, AnalyticsData, SystemHealthData } from '../../types';
import CommandPalette from '../ui/CommandPalette';
import { pulseVariants } from '../../animations/motion';

interface NavGroup {
  group: string;
  items: {
    id: string;
    label: string;
    to: string;
    icon: React.ComponentType<any>;
    badge?: string;
  }[];
}

const ADMIN_NAV_GROUPS: NavGroup[] = [
  {
    group: 'COMMAND CENTER',
    items: [
      {
        id: 'overview',
        label: 'Platform Overview',
        to: '/admin',
        icon: LayoutDashboard,
      },
    ],
  },
  {
    group: 'VERIFICATION',
    items: [
      {
        id: 'scanner',
        label: 'Forensic Scanner',
        to: '/admin/scanner',
        icon: ScanLine,
      },
      {
        id: 'audit',
        label: 'Global Audit Trail',
        to: '/admin/audit',
        icon: ClipboardList,
      },
    ],
  },
  {
    group: 'REGISTRY',
    items: [
      {
        id: 'registry',
        label: 'Product Catalog',
        to: '/admin/registry',
        icon: Database,
      },
    ],
  },
  {
    group: 'OPERATIONS',
    items: [
      {
        id: 'users',
        label: 'User Management',
        to: '/admin/users',
        icon: Users,
      },
      {
        id: 'system',
        label: 'System Health',
        to: '/admin/system',
        icon: Activity,
      },
    ],
  },
  {
    group: 'ARCHITECTURE',
    items: [
      {
        id: 'specs',
        label: 'Engine Specs',
        to: '/admin/specs',
        icon: Info,
      },
    ],
  },
];

export const AdminShell: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [health, setHealth] = useState<SystemHealthData | null>(null);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setUser(getStoredUser());
    Promise.all([getAnalytics(), getAdminSystemHealth()])
      .then(([a, h]) => {
        setAnalytics(a);
        setHealth(h);
      })
      .catch((e) => console.error('Admin shell initial telemetry fetch failed:', e));
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (to: string) => {
    if (to === '/admin') {
      return location.pathname === '/admin' || location.pathname === '/admin/';
    }
    return location.pathname.startsWith(to);
  };

  return (
    <div className="admin-shell-root">
      {/* Sidebar Navigation Rail */}
      <aside className={`admin-shell-sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="admin-shell-sidebar-header">
          <NavLink to="/admin" className="admin-shell-brand">
            <div className="admin-shell-brand-icon">
              <Shield size={18} />
            </div>
            <div className="admin-shell-brand-text">
              <span className="admin-shell-brand-title">MEDVERIFY</span>
              <span className="admin-shell-brand-role">COMMAND CONSOLE</span>
            </div>
          </NavLink>

          <button
            onClick={() => setMobileMenuOpen(false)}
            className="admin-shell-sidebar-close"
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>

        {/* Live Engine Status Mini-Badge */}
        <div className="admin-shell-engine-status-card">
          <div className="admin-shell-status-indicator">
            <span className="admin-shell-status-dot pulse" />
            <span className="admin-shell-status-label">ENGINE ONLINE</span>
          </div>
          <div className="admin-shell-status-sub">
            <span>Latency: {health?.components?.database?.latency_ms ?? 20}ms</span>
            <span>·</span>
            <span>{analytics?.active_medicines ?? 10} Active Meds</span>
          </div>
        </div>

        {/* Navigation Groups */}
        <nav className="admin-shell-nav-scroll" aria-label="Admin Navigation Groups">
          {ADMIN_NAV_GROUPS.map((grp) => (
            <div key={grp.group} className="admin-shell-nav-group">
              <div className="admin-shell-nav-group-title">{grp.group}</div>
              <div className="admin-shell-nav-group-items">
                {grp.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.to);
                  return (
                    <NavLink
                      key={item.id}
                      to={item.to}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`admin-shell-nav-item ${active ? 'active' : ''}`}
                    >
                      <Icon size={16} className="admin-shell-nav-item-icon" />
                      <span className="admin-shell-nav-item-label">{item.label}</span>
                      {active && (
                        <motion.div
                          layoutId="adminNavIndicator"
                          className="admin-shell-nav-active-bar"
                          transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                        />
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Sidebar Footer with Account Switcher & Sign Out */}
        <div className="admin-shell-sidebar-footer">
          <NavLink to="/app" className="admin-shell-user-mode-link" title="Open Consumer Verification Portal">
            <ScanLine size={14} />
            <span>Open Consumer Portal</span>
          </NavLink>

          <div className="admin-shell-admin-profile">
            <div className="admin-shell-admin-avatar">
              {user?.name ? user.name.charAt(0).toUpperCase() : 'A'}
            </div>
            <div className="admin-shell-admin-meta">
              <span className="admin-shell-admin-name">{user?.name || 'Administrator'}</span>
              <span className="admin-shell-admin-badge">SYSTEM ADMIN</span>
            </div>
            <button
              onClick={handleLogout}
              className="admin-shell-signout-btn"
              title="Sign Out of Admin Console"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Viewport */}
      <div className="admin-shell-main-wrap">
        {/* Top Operational Header */}
        <header className="admin-shell-topbar">
          <div className="admin-shell-topbar-left">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="admin-shell-mobile-hamburger"
              aria-label="Open navigation menu"
            >
              <Menu size={20} />
            </button>

            <div className="admin-shell-breadcrumb">
              <span className="admin-shell-breadcrumb-root">MEDVERIFY / ADMIN</span>
              <ChevronRight size={14} className="admin-shell-breadcrumb-sep" />
              <span className="admin-shell-breadcrumb-current">OPERATIONAL CONSOLE</span>
            </div>
          </div>

          {/* Quick Metrics Ticker */}
          <div className="admin-shell-topbar-center">
            <div className="admin-shell-ticker-item">
              <span className="admin-shell-ticker-label">TOTAL SCANS:</span>
              <span className="admin-shell-ticker-value">{analytics?.total_verifications ?? 0}</span>
            </div>
            <div className="admin-shell-ticker-sep">|</div>
            <div className="admin-shell-ticker-item">
              <span className="admin-shell-ticker-label">VERIFIED RATE:</span>
              <span className="admin-shell-ticker-value verified">
                {analytics?.total_verifications
                  ? `${Math.round(((analytics?.status_breakdown?.VERIFIED || 0) / analytics.total_verifications) * 100)}%`
                  : '100%'}
              </span>
            </div>
            <div className="admin-shell-ticker-sep">|</div>
            <div className="admin-shell-ticker-item">
              <span className="admin-shell-ticker-label">ANOMALIES:</span>
              <span className="admin-shell-ticker-value anomaly">
                {(analytics?.status_breakdown?.SUSPICIOUS || 0) + (analytics?.status_breakdown?.NOT_FOUND || 0)}
              </span>
            </div>
          </div>

          {/* Search / Command Palette & User Actions */}
          <div className="admin-shell-topbar-right">
            <button
              onClick={() => setIsCommandPaletteOpen(true)}
              className="admin-shell-command-trigger"
            >
              <Search size={14} />
              <span>Search operations...</span>
              <kbd>Ctrl K</kbd>
            </button>

            <NavLink to="/app" className="admin-shell-portal-btn">
              <span>User Mode</span>
            </NavLink>
          </div>
        </header>

        {/* Dynamic Admin Route Content */}
        <main className="admin-shell-page-container">
          <Outlet />
        </main>
      </div>

      {/* Global Command Palette */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
      />
    </div>
  );
};

export default AdminShell;
