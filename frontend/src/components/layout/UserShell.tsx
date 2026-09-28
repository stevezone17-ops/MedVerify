import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from '../../router';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield,
  ScanLine,
  Package,
  History as HistoryIcon,
  HelpCircle,
  User as UserIcon,
  LogOut,
  Menu,
  X,
  ExternalLink,
  CheckCircle2,
  Lock,
  Sparkles,
} from 'lucide-react';
import { getStoredUser, logout } from '../../api/client';
import type { User } from '../../types';
import { AskMedVerifyDrawer } from '../ai/AskMedVerifyDrawer';

interface NavItem {
  id: string;
  label: string;
  to: string;
  icon: React.ComponentType<any>;
}

const USER_NAV_ITEMS: NavItem[] = [
  {
    id: 'verify',
    label: 'VERIFY MEDICINE',
    to: '/verify',
    icon: ScanLine,
  },
  {
    id: 'activity',
    label: 'MY ACTIVITY',
    to: '/activity',
    icon: HistoryIcon,
  },
  {
    id: 'cabinet',
    label: 'MY MEDICINES',
    to: '/cabinet',
    icon: Package,
  },
  {
    id: 'how-it-works',
    label: 'HOW IT WORKS',
    to: '/how-it-works',
    icon: HelpCircle,
  },
];

export const UserShell: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [askMedVerifyOpen, setAskMedVerifyOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (to: string) => {
    if (to === '/verify') {
      return (
        location.pathname === '/verify' ||
        location.pathname.startsWith('/verify/') ||
        location.pathname === '/app' ||
        location.pathname === '/app/scanner'
      );
    }
    if (to === '/activity') {
      return location.pathname === '/activity' || location.pathname === '/app/history';
    }
    if (to === '/cabinet') {
      return location.pathname === '/cabinet' || location.pathname === '/app/cabinet';
    }
    if (to === '/how-it-works') {
      return location.pathname === '/how-it-works' || location.pathname === '/app/how-it-works';
    }
    return location.pathname.startsWith(to);
  };

  return (
    <div className="user-shell-root">
      {/* Top Navigation Bar */}
      <header className="user-shell-header">
        <div className="user-shell-header-content">
          <div className="user-shell-brand-group">
            <NavLink to="/verify" className="user-shell-logo-link">
              <div className="user-shell-logo-mark">
                <Shield size={20} className="user-shell-logo-icon" />
              </div>
              <div className="user-shell-logo-text">
                <span className="user-shell-logo-title">MedVerify</span>
                <span className="user-shell-logo-subtitle">Verify your medicine with confidence</span>
              </div>
            </NavLink>

            <div className="user-shell-trust-badge">
              <CheckCircle2 size={12} className="user-shell-trust-icon" />
              <span>Consumer Verification Portal</span>
            </div>
          </div>

          {/* Desktop Nav Links */}
          <nav className="user-shell-desktop-nav" aria-label="Main User Navigation">
            {USER_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.to);
              return (
                <NavLink
                  key={item.id}
                  to={item.to}
                  className={`user-shell-nav-link ${active ? 'active' : ''}`}
                >
                  <Icon size={16} className="user-shell-nav-icon" />
                  <span>{item.label}</span>
                  {active && (
                    <motion.div
                      layoutId="userNavIndicator"
                      className="user-shell-nav-indicator"
                      transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                    />
                  )}
                </NavLink>
              );
            })}
          </nav>

          {/* Right Action Items: Scan Medicine, Ask AI, User Profile & Logout */}
          <div className="user-shell-actions">
            <NavLink
              to="/verify/scan"
              className="btn btn-primary btn-sm user-shell-scan-btn"
              title="Launch Camera Scanner"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              <ScanLine size={15} />
              <span>Scan Medicine</span>
            </NavLink>

            <button
              onClick={() => setAskMedVerifyOpen(true)}
              className="user-shell-ai-btn"
              title="Ask MedVerify AI Assistant"
            >
              <Sparkles size={14} className="text-amber-400" />
              <span>Ask AI</span>
            </button>

            {user?.role === 'admin' && (
              <NavLink to="/admin" className="user-shell-admin-switch-btn" title="Switch to Admin Command Center">
                <Lock size={13} />
                <span>Admin Console</span>
              </NavLink>
            )}

            <NavLink to="/profile" className="user-shell-user-pill">
              <div className="user-shell-avatar">
                {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
              </div>
              <div className="user-shell-user-info">
                <span className="user-shell-user-name">{user?.name || 'Verified User'}</span>
                <span className="user-shell-user-role">Personal Account</span>
              </div>
            </NavLink>


            <button
              onClick={handleLogout}
              className="user-shell-logout-btn"
              title="Sign Out of MedVerify"
              aria-label="Sign out"
            >
              <LogOut size={16} />
              <span className="user-shell-logout-text">Sign Out</span>
            </button>

            {/* Mobile Hamburger Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="user-shell-mobile-toggle"
              aria-label="Toggle mobile menu"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Dropdown */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="user-shell-mobile-menu"
            >
              <div className="user-shell-mobile-nav-list">
                {USER_NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.to);
                  return (
                    <NavLink
                      key={item.id}
                      to={item.to}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`user-shell-mobile-nav-link ${active ? 'active' : ''}`}
                    >
                      <Icon size={18} />
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}

                <div className="user-shell-mobile-divider" />

                <NavLink
                  to="/profile"
                  onClick={() => setMobileMenuOpen(false)}
                  className="user-shell-mobile-nav-link"
                >
                  <UserIcon size={18} />
                  <span>My Profile</span>
                </NavLink>

                {user?.role === 'admin' && (
                  <NavLink
                    to="/admin"
                    onClick={() => setMobileMenuOpen(false)}
                    className="user-shell-mobile-nav-link admin-link"
                  >
                    <Lock size={18} />
                    <span>Open Admin Console</span>
                  </NavLink>
                )}

                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleLogout();
                  }}
                  className="user-shell-mobile-logout"
                >
                  <LogOut size={18} />
                  <span>Sign Out</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Main Page Area */}
      <main className="user-shell-main-content">
        <Outlet />
      </main>

      {/* Simple, Professional Footer */}
      <footer className="user-shell-footer">
        <div className="user-shell-footer-content">
          <div className="user-shell-footer-left">
            <span className="user-shell-footer-brand">MedVerify Consumer Trust System</span>
            <span className="user-shell-footer-sep">·</span>
            <span>GS1 Healthcare Standard Compliant</span>
          </div>
          <div className="user-shell-footer-right">
            <span>Official Pharmaceutical Verification Infrastructure</span>
          </div>
        </div>
      </footer>

      {/* Floating Ask MedVerify AI Button */}
      <motion.button
        onClick={() => setAskMedVerifyOpen(true)}
        className="floating-ai-trigger"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        title="Ask MedVerify AI Assistant"
        aria-label="Open Ask MedVerify Assistant"
      >
        <Sparkles size={18} className="text-amber-400" />
        <span className="floating-ai-text">Ask MedVerify</span>
      </motion.button>

      {/* Ask MedVerify Slide-over Assistant */}
      <AskMedVerifyDrawer
        isOpen={askMedVerifyOpen}
        onClose={() => setAskMedVerifyOpen(false)}
      />
    </div>
  );
};

export default UserShell;
