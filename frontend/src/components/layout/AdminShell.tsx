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
  Loader2,
  Sparkles,
} from 'lucide-react';
import { getStoredUser, getAnalytics, getAdminSystemHealth } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { User, AnalyticsData, SystemHealthData } from '../../types';
import CommandPalette from '../ui/CommandPalette';
import { AskMedVerifyDrawer } from '../ai/AskMedVerifyDrawer';
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
        to: '/admin/system-health',
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
  const { user: authUser, logout, isSigningOut } = useAuth();
  const [storedUser, setStoredUser] = useState<User | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [health, setHealth] = useState<SystemHealthData | null>(null);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [askMedVerifyOpen, setAskMedVerifyOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const user = authUser || storedUser;

  useEffect(() => {
    setStoredUser(getStoredUser());
    Promise.all([getAnalytics(), getAdminSystemHealth()])
      .then(([a, h]) => {
        setAnalytics(a);
        setHealth(h);
      })
      .catch((e) => console.error('Admin shell initial telemetry fetch failed:', e));
  }, []);

  const handleLogout = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (isSigningOut) return;
    try {
      console.log('[MedVerify Admin] Signing out administrator...');
      await logout();
      navigate('/login', { replace: true });
    } catch (err: any) {
      console.error('[MedVerify Admin] Sign out error:', err);
      alert(`Sign out failed: ${err?.message || 'Please check your connection and try again.'}`);
    }
  };

  const isActive = (to: string) => {
    if (to === '/admin') {
      return location.pathname === '/admin' || location.pathname === '/admin/';
    }
    return location.pathname.startsWith(to);
  };

  const getSectionTitle = () => {
    const path = location.pathname;
    if (path === '/admin' || path === '/admin/') return 'Platform Overview';
    if (path.startsWith('/admin/scanner')) return 'Forensic Scanner';
    if (path.startsWith('/admin/audit')) return 'Global Audit Trail';
    if (path.startsWith('/admin/registry')) return 'Product Catalog';
    if (path.startsWith('/admin/users')) return 'User Management';
    if (path.startsWith('/admin/system')) return 'System Health';
    if (path.startsWith('/admin/specs')) return 'Engine Specs';
    if (path.startsWith('/admin/result')) return 'Forensic Certificate';
    return 'Operations Console';
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
              <span className="admin-shell-brand-role">OPERATIONS CONSOLE</span>
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

        {/* Live Engine Status Card */}
        <div className="admin-shell-engine-status-card">
          <div className="admin-shell-status-indicator">
            <span className="admin-shell-status-dot" />
            <span className="admin-shell-status-label">Operational Engine</span>
          </div>
          <div className="admin-shell-status-sub">
            <span>Latency: {health?.components?.database?.latency_ms ?? 20}ms</span>
            <span className="admin-shell-status-sep">·</span>
            <span>{analytics?.active_medicines ?? 10} Active Formulas</span>
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
          <NavLink to="/verify" className="admin-shell-user-mode-link" title="Open Consumer Verification Portal">
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
              type="button"
              onClick={handleLogout}
              disabled={isSigningOut}
              className="admin-shell-signout-btn"
              title={isSigningOut ? 'Signing out...' : 'Sign Out of Admin Console'}
              aria-label="Sign out"
              style={{
                opacity: isSigningOut ? 0.6 : 1,
                cursor: isSigningOut ? 'not-allowed' : 'pointer',
              }}
            >
              {isSigningOut ? <Loader2 size={15} className="animate-spin" /> : <LogOut size={15} />}
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          className="admin-shell-mobile-backdrop"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

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
              <ChevronRight size={13} className="admin-shell-breadcrumb-sep" />
              <span className="admin-shell-breadcrumb-current">{getSectionTitle().toUpperCase()}</span>
            </div>
          </div>

          {/* Search / Command Palette & User Actions */}
          <div className="admin-shell-topbar-right">
            <button
              type="button"
              onClick={() => setIsCommandPaletteOpen(true)}
              className="admin-shell-command-trigger"
              aria-label="Search operations"
            >
              <Search size={14} />
              <span>Search operations...</span>
              <kbd>Ctrl K</kbd>
            </button>

            <button
              type="button"
              onClick={() => setAskMedVerifyOpen(true)}
              className="admin-shell-portal-btn"
              title="Open Gemini Conversational Assistant"
            >
              <Sparkles size={14} style={{ color: '#d97706' }} />
              <span>AI Assistant</span>
            </button>

            <NavLink
              to="/verify"
              className="admin-shell-portal-btn admin-shell-portal-btn--primary"
              title="Open Consumer Verification Portal"
            >
              <ScanLine size={14} />
              <span>Open Consumer Portal</span>
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

      {/* MedVerify Google Gemini Conversational Assistant */}
      <AskMedVerifyDrawer
        isOpen={askMedVerifyOpen}
        onClose={() => setAskMedVerifyOpen(false)}
      />
    </div>
  );
};

export default AdminShell;
